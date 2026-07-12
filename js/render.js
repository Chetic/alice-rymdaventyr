// Rendering: vy-anpassning (letterbox), kamera, parallax, partikelpool,
// kvalitetsskalning och rithjälpare. Allt i virtuella koordinater (höjd 1080).

import { VH, VW_MIN, VW_MAX, TAU, PAL, clamp, lerp, rand } from './config.js';

export const view = { w: 1920, h: VH, scale: 1, offX: 0, offY: 0, dpr: 1, cssW: 0, cssH: 0 };

export function fitCanvas(canvas) {
  const cssW = window.innerWidth, cssH = window.innerHeight;
  const dpr = Math.min(1.5, window.devicePixelRatio || 1);
  canvas.width = Math.round(cssW * dpr);
  canvas.height = Math.round(cssH * dpr);
  canvas.style.width = cssW + 'px';
  canvas.style.height = cssH + 'px';
  let scale = canvas.height / VH;
  let rawW = canvas.width / scale;
  if (rawW < VW_MIN) {            // väldigt smal skärm → skala efter bredd, band uppe/nere
    scale = canvas.width / VW_MIN;
    view.w = VW_MIN;
  } else {
    view.w = Math.min(rawW, VW_MAX);
  }
  view.scale = scale;
  view.offX = (canvas.width - view.w * scale) / 2;
  view.offY = (canvas.height - VH * scale) / 2;
  view.dpr = dpr;
  view.cssW = cssW; view.cssH = cssH;
}

export function beginFrame(ctx, canvas) {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.setTransform(view.scale, 0, 0, view.scale, view.offX, view.offY);
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, view.w, VH);
  ctx.clip();
}

export function endFrame(ctx) {
  ctx.restore();
}

export function toView(clientX, clientY) {
  return {
    x: (clientX * view.dpr - view.offX) / view.scale,
    y: (clientY * view.dpr - view.offY) / view.scale
  };
}

// ---------------- Kamera ----------------
export class Camera {
  constructor() {
    this.x = 0; this.y = 0;
    this.ox = 0; this.oy = 0;
    this.shakeT = 0; this.shakeDur = 0; this.shakeMag = 0;
    this.bounds = null; // {x1,y1,x2,y2}
  }
  jumpTo(x, y) { this.x = x; this.y = y; this.update(0); }
  follow(x, y, k) {
    const f = k === undefined ? 0.12 : k;
    this.x = lerp(this.x, x, f);
    this.y = lerp(this.y, y, f);
  }
  clampTo(x1, y1, x2, y2) { this.bounds = { x1: x1, y1: y1, x2: x2, y2: y2 }; }
  shake(mag, dur) { this.shakeMag = mag; this.shakeDur = dur; this.shakeT = dur; }
  update(dt) {
    if (this.bounds) {
      const b = this.bounds;
      const hw = view.w / 2, hh = VH / 2;
      this.x = (b.x2 - b.x1 <= view.w) ? (b.x1 + b.x2) / 2 : clamp(this.x, b.x1 + hw, b.x2 - hw);
      this.y = (b.y2 - b.y1 <= VH) ? (b.y1 + b.y2) / 2 : clamp(this.y, b.y1 + hh, b.y2 - hh);
    }
    let sx = 0, sy = 0;
    if (this.shakeT > 0) {
      this.shakeT -= dt;
      const p = this.shakeT / this.shakeDur;
      sx = (Math.random() * 2 - 1) * this.shakeMag * p;
      sy = (Math.random() * 2 - 1) * this.shakeMag * p;
    }
    this.ox = Math.round(view.w / 2 - this.x + sx);
    this.oy = Math.round(VH / 2 - this.y + sy);
  }
  begin(ctx) { ctx.save(); ctx.translate(this.ox, this.oy); }
  end(ctx) { ctx.restore(); }
  toScreen(wx, wy) { return { x: wx + this.ox, y: wy + this.oy }; }
  visible(wx, wy, margin) {
    const m = margin === undefined ? 200 : margin;
    const sx = wx + this.ox, sy = wy + this.oy;
    return sx > -m && sx < view.w + m && sy > -m && sy < VH + m;
  }
}

export function makeCanvas(w, h, drawFn) {
  const cv = document.createElement('canvas');
  cv.width = Math.max(1, Math.round(w));
  cv.height = Math.max(1, Math.round(h));
  const c = cv.getContext('2d');
  if (drawFn) drawFn(c, cv.width, cv.height);
  return cv;
}

// ---------------- Parallax ----------------
export class Parallax {
  constructor() { this.layers = []; }
  add(factor, w, h, drawFn, opts) {
    const o = opts || {};
    this.layers.push({
      cv: makeCanvas(w, h, drawFn),
      factor: factor,
      fy: o.fy === undefined ? factor * 0.4 : o.fy,
      y: o.y === undefined ? 0 : o.y,
      alpha: o.alpha === undefined ? 1 : o.alpha
    });
  }
  draw(ctx, camX, camY, maxLayers) {
    const n = maxLayers === undefined ? this.layers.length : Math.min(maxLayers, this.layers.length);
    for (let i = 0; i < n; i++) {
      const L = this.layers[i];
      const w = L.cv.width;
      let ox = (-camX * L.factor) % w;
      if (ox > 0) ox -= w;
      const oy = L.y - camY * L.fy;
      if (L.alpha < 1) ctx.globalAlpha = L.alpha;
      for (let x = ox; x < view.w; x += w) ctx.drawImage(L.cv, Math.round(x), Math.round(oy));
      if (L.alpha < 1) ctx.globalAlpha = 1;
    }
  }
}

// ---------------- Kvalitetsskalning ----------------
export const QY = {
  tier: 2, _acc: 0, _n: 0, _good: 0,
  frame: function (dtMs) {
    this._acc += dtMs; this._n++;
    if (this._n >= 120) {
      const avg = this._acc / this._n;
      if (avg > 22 && this.tier > 0) { this.tier--; this._good = 0; }
      else if (avg < 14) {
        this._good++;
        if (this._good >= 5 && this.tier < 2) { this.tier++; this._good = 0; }
      } else this._good = 0;
      this._acc = 0; this._n = 0;
    }
  },
  particleCap: function () { return [140, 320, 700][this.tier]; },
  layersMax: function () { return [2, 3, 4][this.tier]; }
};

// ---------------- Partiklar (poolade — inga allokeringar i loopen) ----------------
const P_CAP = 700;
const pool = [];
for (let i = 0; i < P_CAP; i++) {
  pool.push({ on: false, type: 0, x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 1, size: 6, color: '#fff', rot: 0, vr: 0, g: 0, a: 0, b: 0 });
}
let pCursor = 0, pLive = 0;

const PTYPES = { sparkle: 1, flame: 2, smoke: 3, confetti: 4, heart: 5, star: 6, splash: 7, dust: 8, chunk: 9, note: 10, snowpuff: 11 };

export const PS = {
  clear: function () { for (let i = 0; i < P_CAP; i++) pool[i].on = false; pLive = 0; },
  count: function () { return pLive; },
  spawn: function (type, x, y, o) {
    if (pLive >= QY.particleCap()) return null;
    const opts = o || {};
    let p = null;
    for (let i = 0; i < P_CAP; i++) {
      const c = pool[(pCursor + i) % P_CAP];
      if (!c.on) { p = c; pCursor = (pCursor + i + 1) % P_CAP; break; }
    }
    if (!p) return null;
    p.on = true; pLive++;
    p.type = PTYPES[type] || 1;
    p.x = x; p.y = y;
    p.vx = opts.vx === undefined ? rand(-60, 60) : opts.vx;
    p.vy = opts.vy === undefined ? rand(-120, -30) : opts.vy;
    p.max = opts.life === undefined ? rand(0.5, 1.1) : opts.life;
    p.life = p.max;
    p.size = opts.size === undefined ? rand(4, 9) : opts.size;
    p.color = opts.color || '#fff';
    p.rot = opts.rot === undefined ? rand(0, TAU) : opts.rot;
    p.vr = opts.vr === undefined ? rand(-4, 4) : opts.vr;
    p.g = opts.g === undefined ? 0 : opts.g;
    p.a = opts.a === undefined ? 0 : opts.a;
    p.b = opts.b === undefined ? 0 : opts.b;
    return p;
  },
  burst: function (type, x, y, n, o) {
    for (let i = 0; i < n; i++) {
      const ang = rand(0, TAU), sp = rand(40, (o && o.speed) || 220);
      this.spawn(type, x, y, Object.assign({}, o, { vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp - 40 }));
    }
  },
  update: function (dt) {
    for (let i = 0; i < P_CAP; i++) {
      const p = pool[i];
      if (!p.on) continue;
      p.life -= dt;
      if (p.life <= 0) { p.on = false; pLive--; continue; }
      p.vy += p.g * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.vr * dt;
      if (p.type === PTYPES.confetti) { p.vx *= 0.995; p.x += Math.sin(p.rot * 2 + p.life * 6) * 40 * dt; }
      if (p.type === PTYPES.flame || p.type === PTYPES.smoke) { p.vx *= 0.96; p.vy *= 0.96; }
      if (p.type === PTYPES.splash) { p.vx *= 0.99; }
    }
  },
  draw: function (ctx) {
    ctx.save();
    for (let i = 0; i < P_CAP; i++) {
      const p = pool[i];
      if (!p.on) continue;
      const k = p.life / p.max;
      const t = p.type;
      if (t === PTYPES.sparkle) {
        ctx.globalAlpha = k * (0.6 + 0.4 * Math.sin(p.life * 25 + p.rot));
        ctx.fillStyle = p.color;
        starPath(ctx, p.x, p.y, p.size * k, p.size * k * 0.42, 4, p.rot);
        ctx.fill();
      } else if (t === PTYPES.flame) {
        ctx.globalAlpha = k * 0.85;
        ctx.fillStyle = k > 0.55 ? '#fff3b0' : (k > 0.28 ? '#ffb347' : '#ff5a3c');
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (0.5 + k), 0, TAU); ctx.fill();
      } else if (t === PTYPES.smoke) {
        ctx.globalAlpha = k * 0.3;
        ctx.fillStyle = p.color;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (1.6 - k), 0, TAU); ctx.fill();
      } else if (t === PTYPES.confetti) {
        ctx.globalAlpha = Math.min(1, k * 2);
        ctx.fillStyle = p.color;
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
        ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
        ctx.restore();
      } else if (t === PTYPES.heart) {
        ctx.globalAlpha = k;
        ctx.fillStyle = p.color;
        heartPath(ctx, p.x, p.y, p.size * (0.8 + 0.4 * (1 - k)));
        ctx.fill();
      } else if (t === PTYPES.star) {
        ctx.globalAlpha = k;
        ctx.fillStyle = p.color;
        starPath(ctx, p.x, p.y, p.size, p.size * 0.5, 5, p.rot);
        ctx.fill();
      } else if (t === PTYPES.splash) {
        ctx.globalAlpha = k * 0.8;
        ctx.fillStyle = p.color;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size * 0.5, 0, TAU); ctx.fill();
      } else if (t === PTYPES.dust || t === PTYPES.snowpuff) {
        ctx.globalAlpha = k * 0.5;
        ctx.fillStyle = p.color;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (1.2 - k * 0.5), 0, TAU); ctx.fill();
      } else if (t === PTYPES.chunk) {
        ctx.globalAlpha = Math.min(1, k * 1.5);
        ctx.fillStyle = p.color;
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
        ctx.restore();
      } else if (t === PTYPES.note) {
        ctx.globalAlpha = k;
        ctx.fillStyle = p.color;
        ctx.font = 'bold ' + Math.round(p.size * 3) + 'px "Trebuchet MS", sans-serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(p.b === 1 ? '♫' : '♪', p.x, p.y);
      }
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  }
};

// ---------------- Rithjälpare ----------------
export function rr(ctx, x, y, w, h, r) {
  const q = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + q, y);
  ctx.arcTo(x + w, y, x + w, y + h, q);
  ctx.arcTo(x + w, y + h, x, y + h, q);
  ctx.arcTo(x, y + h, x, y, q);
  ctx.arcTo(x, y, x + w, y, q);
  ctx.closePath();
}

export function starPath(ctx, x, y, r1, r2, n, rot) {
  const rot0 = rot === undefined ? -Math.PI / 2 : rot;
  ctx.beginPath();
  for (let i = 0; i < n * 2; i++) {
    const r = (i % 2 === 0) ? r1 : r2;
    const a = rot0 + (i / (n * 2)) * TAU;
    if (i === 0) ctx.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
    else ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
  }
  ctx.closePath();
}

export function heartPath(ctx, x, y, s) {
  ctx.beginPath();
  ctx.moveTo(x, y + s * 0.32);
  ctx.bezierCurveTo(x, y - s * 0.28, x - s, y - s * 0.28, x - s * 0.5, y - s * 0.62);
  // spegelvänt: rita med två kurvor från toppen
  ctx.moveTo(x, y + s * 0.9);
  ctx.bezierCurveTo(x - s * 1.1, y + s * 0.15, x - s * 0.62, y - s * 0.75, x, y - s * 0.18);
  ctx.bezierCurveTo(x + s * 0.62, y - s * 0.75, x + s * 1.1, y + s * 0.15, x, y + s * 0.9);
  ctx.closePath();
}

// Glöd-cache: en mjuk vit boll per färg, tonad en gång
const glowCache = {};
function glowSprite(color) {
  let cv = glowCache[color];
  if (cv) return cv;
  cv = makeCanvas(64, 64, function (c) {
    const g = c.createRadialGradient(32, 32, 2, 32, 32, 32);
    g.addColorStop(0, color);
    g.addColorStop(0.4, color);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    c.globalAlpha = 1;
    c.fillStyle = g;
    c.fillRect(0, 0, 64, 64);
  });
  glowCache[color] = cv;
  return cv;
}

export function glow(ctx, x, y, r, color, alpha) {
  ctx.globalAlpha = alpha === undefined ? 0.5 : alpha;
  ctx.drawImage(glowSprite(color), x - r, y - r, r * 2, r * 2);
  ctx.globalAlpha = 1;
}

export function drawCoin(ctx, x, y, r, kind, t) {
  const gold = kind !== 'silver';
  const c1 = gold ? PAL.gold : PAL.silver;
  const c2 = gold ? PAL.gold2 : PAL.silver2;
  const c3 = gold ? PAL.goldDark : PAL.silverDark;
  const wob = Math.abs(Math.cos((t || 0) * 2.2 + x * 0.01)); // "snurr" (skalning i x)
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(0.35 + 0.65 * wob, 1);
  const g = ctx.createLinearGradient(0, -r, 0, r);
  g.addColorStop(0, c1); g.addColorStop(1, c2);
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fill();
  ctx.strokeStyle = c3; ctx.lineWidth = Math.max(2, r * 0.14);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = Math.max(1.5, r * 0.08);
  ctx.beginPath(); ctx.arc(0, 0, r * 0.68, 0, TAU); ctx.stroke();
  ctx.fillStyle = c3;
  starPath(ctx, 0, 0, r * 0.42, r * 0.2, 5, -Math.PI / 2);
  ctx.fill();
  ctx.restore();
  // glans
  ctx.save();
  ctx.globalAlpha = 0.35 + 0.2 * Math.sin((t || 0) * 3 + y * 0.02);
  ctx.fillStyle = '#fff';
  ctx.beginPath(); ctx.arc(x - r * 0.35, y - r * 0.4, r * 0.16, 0, TAU); ctx.fill();
  ctx.restore();
}

export function drawGem(ctx, x, y, r, color, t) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(Math.sin((t || 0) * 1.4 + x) * 0.08);
  ctx.beginPath();
  ctx.moveTo(0, -r);
  ctx.lineTo(r * 0.82, -r * 0.25);
  ctx.lineTo(r * 0.5, r);
  ctx.lineTo(-r * 0.5, r);
  ctx.lineTo(-r * 0.82, -r * 0.25);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.7)';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.globalAlpha = 0.55;
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.moveTo(0, -r * 0.86);
  ctx.lineTo(r * 0.35, -r * 0.2);
  ctx.lineTo(-r * 0.28, -r * 0.05);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

export function txt(ctx, s, x, y, o) {
  const op = o || {};
  const size = op.size || 30;
  ctx.save();
  ctx.font = (op.bold ? 'bold ' : '') + size + 'px "Trebuchet MS", Verdana, sans-serif';
  ctx.textAlign = op.align || 'center';
  ctx.textBaseline = op.baseline || 'middle';
  if (op.alpha !== undefined) ctx.globalAlpha = op.alpha;
  if (op.shadow) {
    ctx.shadowColor = 'rgba(0,0,0,0.55)';
    ctx.shadowBlur = size * 0.18;
    ctx.shadowOffsetY = size * 0.07;
  }
  if (op.stroke) {
    ctx.strokeStyle = op.stroke;
    ctx.lineWidth = op.strokeW || Math.max(3, size * 0.16);
    ctx.lineJoin = 'round';
    ctx.strokeText(s, x, y);
  }
  ctx.fillStyle = op.color || '#fff';
  ctx.fillText(s, x, y);
  ctx.restore();
}

// Rubrik med regnbågsgradient och guldkant
export function rainbowText(ctx, s, x, y, size, colors) {
  ctx.save();
  ctx.font = 'bold ' + size + 'px "Trebuchet MS", Verdana, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const w = ctx.measureText(s).width;
  const g = ctx.createLinearGradient(x - w / 2, 0, x + w / 2, 0);
  const cs = colors || ['#ff4d6d', '#ff9e40', '#ffd24a', '#59d666', '#3fb8ff', '#c95cff'];
  for (let i = 0; i < cs.length; i++) g.addColorStop(i / (cs.length - 1), cs[i]);
  ctx.lineJoin = 'round';
  ctx.strokeStyle = 'rgba(40,10,60,0.9)';
  ctx.lineWidth = size * 0.18;
  ctx.strokeText(s, x, y);
  ctx.fillStyle = g;
  ctx.fillText(s, x, y);
  ctx.restore();
}

export function panel(ctx, x, y, w, h, o) {
  const op = o || {};
  ctx.save();
  if (op.shadow !== false) {
    ctx.shadowColor = 'rgba(0,0,0,0.4)';
    ctx.shadowBlur = 18;
    ctx.shadowOffsetY = 6;
  }
  rr(ctx, x, y, w, h, op.r === undefined ? 26 : op.r);
  ctx.fillStyle = op.bg || PAL.uiBg;
  ctx.fill();
  ctx.shadowColor = 'rgba(0,0,0,0)';
  ctx.strokeStyle = op.edge || PAL.uiEdge;
  ctx.lineWidth = op.edgeW === undefined ? 3 : op.edgeW;
  ctx.stroke();
  ctx.restore();
}
