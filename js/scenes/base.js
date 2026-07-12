// Delad scengrund: SceneBase (kamera, mynt, timers), PuzzleBase (försök/tips/förenkling)
// och makeWalker — plattformsstyrning som återanvänds på alla planeter.

import { TAU, dist, lerp, clamp } from '../config.js';
import { Camera, PS, drawCoin, glow } from '../render.js';
import { initWorld, CAT, M, addSprite } from '../world.js';
import { addCoins } from '../save.js';
import { AUD } from '../audio.js';
import { HUD } from '../hud.js';

// main.js kopplar in scenbyten här (undviker cirkulära importer)
export const NAV = { go: null };

export class SceneBase {
  constructor(name) {
    this.name = name;
    this.song = null;
    this.gravity = 1;
    this.cam = new Camera();
    this.coins = [];
    this.timers = [];
    this.t = 0;
  }

  baseEnter() {
    initWorld(this.gravity);
    PS.clear();
    this.cam = new Camera();
    this.coins = [];
    this.timers = [];
    this.t = 0;
  }

  enter(params) { this.baseEnter(); }
  exit() {}
  update(dt) {}
  draw(ctx, alpha, t) {}
  onTap(x, y) {}
  restart() { if (NAV.go) NAV.go(this.name); }

  after(sec, fn) { this.timers.push({ t: sec, fn: fn }); }
  tick(dt) {
    this.t += dt;
    for (let i = this.timers.length - 1; i >= 0; i--) {
      this.timers[i].t -= dt;
      if (this.timers[i].t <= 0) {
        const fn = this.timers[i].fn;
        this.timers.splice(i, 1);
        fn();
      }
    }
  }

  // ---- Mynt: svävande, magnetdras till Alice, plockas med klirr ----
  addCoin(x, y, kind) {
    this.coins.push({ x: x, y: y, fx: x, fy: y, kind: kind || 'gold', taken: false, ph: Math.random() * TAU });
  }
  coinRow(x, y, n, gap, kind) {
    for (let i = 0; i < n; i++) this.addCoin(x + i * gap, y, kind);
  }
  updateCoins(dt, px, py) {
    for (let i = 0; i < this.coins.length; i++) {
      const c = this.coins[i];
      if (c.taken) continue;
      const d = dist(c.fx, c.fy, px, py);
      if (d < 48) {
        c.taken = true;
        addCoins(c.kind, 1);
        AUD.sfx(c.kind === 'gold' ? 'coinG' : 'coinS');
        PS.burst('sparkle', c.fx, c.fy, 7, { color: c.kind === 'gold' ? '#ffe28a' : '#f0f6ff', speed: 160 });
        HUD.bumpCoins();
      } else if (d < 170) {
        const k = 1 - Math.exp(-9 * dt);
        c.fx = lerp(c.fx, px, k);
        c.fy = lerp(c.fy, py, k);
      } else {
        c.fx = c.x;
        c.fy = c.y + Math.sin(this.t * 2.4 + c.ph) * 7;
      }
    }
  }
  drawCoins(ctx, t) {
    for (let i = 0; i < this.coins.length; i++) {
      const c = this.coins[i];
      if (c.taken) continue;
      if (!this.cam.visible(c.fx, c.fy, 120)) continue;
      glow(ctx, c.fx, c.fy, 40, c.kind === 'gold' ? '#ffd24a' : '#dfe6f0', 0.25);
      drawCoin(ctx, c.fx, c.fy, 21, c.kind, t + c.ph);
    }
  }
  coinsLeft() {
    let n = 0;
    for (let i = 0; i < this.coins.length; i++) if (!this.coins[i].taken) n++;
    return n;
  }
}

// ---- Pussel med snäll svårighetstrappa ----
export class PuzzleBase {
  constructor(hintText) {
    this.state = 'active';
    this.attempts = 0;
    this.hintText = hintText || '';
    this.easy = false;
    this.onSolved = null;
  }
  fail(quiet) {
    if (this.state === 'solved') return;
    this.attempts++;
    if (!quiet) AUD.sfx('wrong');
    if (this.attempts === 3 && this.hintText) HUD.hint(this.hintText);
    if (this.attempts >= 6 && !this.easy) { this.easy = true; this.simplify(); }
  }
  simplify() {}
  solve() {
    if (this.state === 'solved') return;
    this.state = 'solved';
    AUD.sfx('fanfare');
    if (this.onSolved) this.onSolved();
  }
  get solved() { return this.state === 'solved'; }
}

// ---- Plattformsstyrning (Alice till fots) ----
export function makeWalker(x, y, opts) {
  const o = opts || {};
  const r = o.r === undefined ? 34 : o.r;
  const body = M.Bodies.circle(x, y, r, {
    density: 0.0016,
    friction: o.friction === undefined ? 0.09 : o.friction,
    frictionStatic: 0.4,
    frictionAir: 0.012,
    restitution: 0,
    collisionFilter: { category: CAT.PLAYER, mask: CAT.TERRAIN | CAT.PROP | CAT.SENSOR },
    label: 'alice'
  });
  M.Body.setInertia(body, Infinity);

  const w = {
    body: body,
    r: r,
    face: 1,
    mode: 'stand',
    ph: 0,
    time: 0,
    groundedUntil: -1,
    speed: o.speed === undefined ? 6.4 : o.speed,       // px/steg
    jumpV: o.jumpV === undefined ? 13.5 : o.jumpV,
    ice: !!o.ice,
    frozenUntil: -1,
    spr: null
  };

  body.plugin.onTouch = function (other, pair) {
    const cat = other.collisionFilter.category;
    if (!(cat & (CAT.TERRAIN | CAT.PROP))) return;
    const col = pair.collision;
    const sup = col.supports && col.supports.length ? col.supports[0] : null;
    if (sup && Math.abs(col.normal.x) < 0.75 && sup.y > body.position.y + r * 0.4) {
      w.groundedUntil = w.time + 0.12;   // coyote-fönster
    }
  };

  w.grounded = function () { return w.time <= w.groundedUntil; };

  w.update = function (dt, input) {
    w.time += dt;
    if (w.time < w.frozenUntil) { w.mode = 'stand'; return; }
    const v = body.velocity;
    const target = input.ax * w.speed;
    const grounded = w.grounded();
    let mix;
    if (w.ice) mix = grounded ? 0.045 : 0.03;            // halka: långsam styrning
    else mix = grounded ? 0.3 : 0.12;
    let nvx = lerp(v.x, target, mix);
    if (!w.ice && input.ax === 0 && grounded) nvx *= 0.72;
    M.Body.setVelocity(body, { x: nvx, y: Math.min(v.y, 30) });

    if (input.jumpEdge && grounded) {
      M.Body.setVelocity(body, { x: nvx, y: -w.jumpV });
      w.groundedUntil = -1;
      AUD.sfx('jump');
      PS.burst('dust', body.position.x, body.position.y + r, 5, { color: '#cbb8e8', speed: 90 });
    }

    if (input.ax > 0.1) w.face = 1;
    else if (input.ax < -0.1) w.face = -1;

    if (!grounded) w.mode = 'jump';
    else if (Math.abs(nvx) > 1.2) { w.mode = 'walk'; w.ph += Math.abs(nvx) * dt * 1.6; }
    else w.mode = 'stand';
  };

  w.freeze = function (sec) { w.frozenUntil = w.time + sec; };
  w.pos = function () { return body.position; };

  return w;
}

// Registrera walkern som sprite med en ritfunktion (från chars.js)
export function bindWalkerSprite(w, drawFn, z) {
  w.spr = addSprite(w.body, drawFn, z === undefined ? 5 : z);
  return w.spr;
}
