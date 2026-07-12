// Tunt lager ovanpå Matter.js: motor-livscykel, sprites med render-interpolation,
// kollisionskategorier och constraint-recept. Matter laddas som klassiskt skript (window.Matter).

import { lerp, lerpAng } from './config.js';

const M = window.Matter;

export const CAT = {
  PLAYER: 0x0002,
  TERRAIN: 0x0004,
  PROP: 0x0008,
  COIN: 0x0010,
  SENSOR: 0x0020,
  DECOR: 0x0040
};

let engine = null;
let sprites = [];

export function engineRef() { return engine; }
export function worldRef() { return engine ? engine.world : null; }

export function initWorld(gravityY) {
  if (engine) resetWorld();
  engine = M.Engine.create({ enableSleeping: true });
  engine.gravity.y = gravityY === undefined ? 1 : gravityY;
  engine.positionIterations = 6;
  engine.velocityIterations = 4;

  // Kollisions-dispatch via body.plugin.onHit / onTouch
  M.Events.on(engine, 'collisionStart', function (e) {
    const pairs = e.pairs;
    for (let i = 0; i < pairs.length; i++) {
      const a = pairs[i].bodyA, b = pairs[i].bodyB;
      if (a.plugin && a.plugin.onHit) a.plugin.onHit(b, pairs[i]);
      if (b.plugin && b.plugin.onHit) b.plugin.onHit(a, pairs[i]);
    }
  });
  M.Events.on(engine, 'collisionActive', function (e) {
    const pairs = e.pairs;
    for (let i = 0; i < pairs.length; i++) {
      const a = pairs[i].bodyA, b = pairs[i].bodyB;
      if (a.plugin && a.plugin.onTouch) a.plugin.onTouch(b, pairs[i]);
      if (b.plugin && b.plugin.onTouch) b.plugin.onTouch(a, pairs[i]);
    }
  });
  return engine;
}

export function resetWorld() {
  if (!engine) return;
  M.Events.off(engine);
  M.Composite.clear(engine.world, false, true);
  M.Engine.clear(engine);
  engine = null;
  sprites = [];
}

export function setGravity(y, x) {
  if (!engine) return;
  engine.gravity.y = y;
  engine.gravity.x = x === undefined ? 0 : x;
}

export function stepWorld(dtMs) {
  if (!engine) return;
  for (let i = 0; i < sprites.length; i++) {
    const s = sprites[i];
    s.prev.x = s.body.position.x;
    s.prev.y = s.body.position.y;
    s.prev.a = s.body.angle;
  }
  M.Engine.update(engine, dtMs);
}

// ---- Kroppar ----
function baseOpts(opts, category, mask) {
  const o = Object.assign({}, opts || {});
  const cf = o.collisionFilter || {};
  o.collisionFilter = {
    category: cf.category === undefined ? category : cf.category,
    mask: cf.mask === undefined ? (mask === undefined ? 0xFFFF : mask) : cf.mask,
    group: cf.group === undefined ? 0 : cf.group
  };
  return o;
}

export function addStatic(x, y, w, h, opts) {
  const o = baseOpts(opts, CAT.TERRAIN);
  o.isStatic = true;
  const b = M.Bodies.rectangle(x, y, w, h, o);
  M.Composite.add(engine.world, b);
  return b;
}

export function addBox(x, y, w, h, opts) {
  const b = M.Bodies.rectangle(x, y, w, h, baseOpts(opts, CAT.PROP));
  M.Composite.add(engine.world, b);
  return b;
}

export function addCircle(x, y, r, opts) {
  const b = M.Bodies.circle(x, y, r, baseOpts(opts, CAT.PROP));
  M.Composite.add(engine.world, b);
  return b;
}

export function addSensor(x, y, w, h, onHit, opts) {
  const o = baseOpts(opts, CAT.SENSOR);
  o.isStatic = true;
  o.isSensor = true;
  const b = M.Bodies.rectangle(x, y, w, h, o);
  if (onHit) b.plugin.onHit = onHit;
  M.Composite.add(engine.world, b);
  return b;
}

export function addToWorld(x) { M.Composite.add(engine.world, x); return x; }

export function removeBody(b) {
  if (!engine || !b) return;
  M.Composite.remove(engine.world, b);
  for (let i = sprites.length - 1; i >= 0; i--) {
    if (sprites[i].body === b) sprites.splice(i, 1);
  }
}

export function removeFromWorld(x) { if (engine && x) M.Composite.remove(engine.world, x); }

// ---- Sprites (kropp + ritfunktion, interpolerad) ----
export function addSprite(body, drawFn, z) {
  const rec = {
    body: body,
    draw: drawFn,
    z: z === undefined ? 0 : z,
    hidden: false,
    prev: { x: body.position.x, y: body.position.y, a: body.angle }
  };
  sprites.push(rec);
  sprites.sort(function (a, b) { return a.z - b.z; });
  return rec;
}

export function drawWorld(ctx, alpha, t) {
  for (let i = 0; i < sprites.length; i++) {
    const s = sprites[i];
    if (s.hidden) continue;
    const b = s.body;
    const x = lerp(s.prev.x, b.position.x, alpha);
    const y = lerp(s.prev.y, b.position.y, alpha);
    const a = lerpAng(s.prev.a, b.angle, alpha);
    s.draw(ctx, x, y, a, t, s);
  }
}

// ---- Constraints ----
export function pinTo(body, x, y, opts) {
  const o = opts || {};
  const c = M.Constraint.create({
    pointA: { x: x, y: y },
    bodyB: body,
    pointB: o.pointB || { x: 0, y: 0 },
    length: o.length === undefined ? 0 : o.length,
    stiffness: o.stiffness === undefined ? 1 : o.stiffness,
    damping: o.damping === undefined ? 0 : o.damping
  });
  M.Composite.add(engine.world, c);
  return c;
}

export function linkBodies(a, b, opts) {
  const o = opts || {};
  const c = M.Constraint.create({
    bodyA: a,
    pointA: o.pointA || { x: 0, y: 0 },
    bodyB: b,
    pointB: o.pointB || { x: 0, y: 0 },
    length: o.length === undefined ? 0 : o.length,
    stiffness: o.stiffness === undefined ? 0.9 : o.stiffness,
    damping: o.damping === undefined ? 0.02 : o.damping
  });
  M.Composite.add(engine.world, c);
  return c;
}

// Pendel: ankarpunkt → kedjelänkar → tung kula. Returnerar {links, ball, constraints}
export function makePendulum(x, y, segments, segLen, ballR, ballOpts) {
  const links = [];
  const constraints = [];
  let prev = null;
  for (let i = 0; i < segments; i++) {
    const ly = y + segLen * (i + 0.5);
    const link = M.Bodies.circle(x, ly, 6, baseOpts({ density: 0.002, frictionAir: 0.01 }, CAT.DECOR, CAT.TERRAIN));
    links.push(link);
    if (i === 0) {
      constraints.push(M.Constraint.create({ pointA: { x: x, y: y }, bodyB: link, length: segLen * 0.5, stiffness: 0.95, damping: 0.02 }));
    } else {
      constraints.push(M.Constraint.create({ bodyA: prev, bodyB: link, length: segLen, stiffness: 0.95, damping: 0.02 }));
    }
    prev = link;
  }
  const ball = M.Bodies.circle(x, y + segLen * segments + ballR, ballR, baseOpts(Object.assign({ density: 0.01, frictionAir: 0.002 }, ballOpts || {}), CAT.PROP));
  constraints.push(M.Constraint.create({ bodyA: prev, bodyB: ball, length: segLen + ballR * 0.5, stiffness: 0.95, damping: 0.02 }));
  M.Composite.add(engine.world, links);
  M.Composite.add(engine.world, ball);
  M.Composite.add(engine.world, constraints);
  return { links: links, ball: ball, constraints: constraints };
}

export function setVel(body, vx, vy) { M.Body.setVelocity(body, { x: vx, y: vy }); }
export function setPos(body, x, y) { M.Body.setPosition(body, { x: x, y: y }); }
export function setAng(body, a) { M.Body.setAngle(body, a); }
export function setAngVel(body, w) { M.Body.setAngularVelocity(body, w); }
export function applyForce(body, fx, fy) {
  M.Body.applyForce(body, body.position, { x: fx, y: fy });
}
export function speedOf(body) {
  const v = body.velocity;
  return Math.sqrt(v.x * v.x + v.y * v.y);
}

// Fartbegränsning mot tunnling (kallas i scenens update för snabba kroppar)
export function capSpeed(body, max) {
  const v = body.velocity;
  const s = Math.sqrt(v.x * v.x + v.y * v.y);
  if (s > max) M.Body.setVelocity(body, { x: v.x * max / s, y: v.y * max / s });
}

export { M };
