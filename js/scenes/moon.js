// Månen: låg gravitation, studsmattor i kratrarna och Draculauras fladdermusslott.
// Pussel: vrid speglarna så månstrålen träffar alla tre kristallfladdermössen.

import { VH, GRAV, PAL, TAU, rand, clamp, lerp, dist } from '../config.js';
import { view, makeCanvas, Parallax, PS, txt, glow, QY, rr, starPath } from '../render.js';
import { setScheme, IN, NO_IN } from '../input.js';
import { addStatic, drawWorld } from '../world.js';
import { SAVE, setFlag, flag, advanceTo } from '../save.js';
import { AUD } from '../audio.js';
import { HUD } from '../hud.js';
import { drawGirl, WHO } from '../chars.js';
import { drawRocket, drawActionBubble } from '../props.js';
import { SceneBase, PuzzleBase, makeWalker, bindWalkerSprite, NAV } from './base.js';
import { drawPlanetIcon } from './travel.js';

const W = 5600;
const GROUND = 1000;
const BEAM_SRC = { x: 5210, y: 300 };
const MIRRORS = [
  { x: 4660, y: 300, sol: -45 },
  { x: 4660, y: 700, sol: -45 },
  { x: 4180, y: 700, sol: 45 }
];
const PERCHES = [
  { x: 4660, y: 500 },
  { x: 4420, y: 700 },
  { x: 4180, y: 500 }
];
const TRAMPS = [900, 1500, 2100];
const DRACULAURA_X = 3650;
const ROCKET_X = 350;

class MoonScene extends SceneBase {
  constructor() {
    super('moon');
    this.song = 'moon';
    this.gravity = GRAV.moon;
  }

  enter() {
    this.baseEnter();
    setScheme('walk', { action: true });

    addStatic(W / 2, GROUND + 60, W + 400, 120);
    addStatic(-40, VH / 2, 80, VH * 2);
    addStatic(W + 40, VH / 2, 80, VH * 2);
    // små plattformar upp mot mynt
    addStatic(1780, 640, 240, 26);
    addStatic(2450, 500, 240, 26);

    this.walker = makeWalker(ROCKET_X + 150, 930, { jumpV: 7, speed: 6 });
    const w = this.walker;
    bindWalkerSprite(w, function (ctx, x, y, a, t) {
      drawGirl(ctx, x, y + 34, t, WHO.aliceSuit, { mode: w.mode, face: w.face, ph: w.ph });
    }, 6);

    this.solved = flag('starKey');
    this.mirrors = [];
    for (let i = 0; i < MIRRORS.length; i++) {
      this.mirrors.push({ x: MIRRORS[i].x, y: MIRRORS[i].y, ang: this.solved ? MIRRORS[i].sol : [0, 90, 0][i], spin: 0 });
    }
    this.beamSegs = [];
    this.lit = [false, false, false];
    this.pz = new PuzzleBase('Vrid spegeln så strålen studsar vidare — som en blinkande stig! ✨');
    const self = this;
    this.pz.simplify = function () { self.showGhost = true; HUD.toast('Speglarna visar rätt läge — svagt! 👻'); };
    this.showGhost = false;
    this.met = flag('metDraculaura');
    this.gateT = this.solved ? 1 : 0;
    this.batsHome = [];

    // mynt: studsmatteparken + plattformar
    this.coinRow(880, 520, 3, 80, 'silver');
    this.coinRow(1460, 380, 3, 80, 'silver');
    this.addCoin(2100, 300, 'gold');
    this.coinRow(1790, 560, 2, 90, 'silver');
    this.addCoin(2480, 420, 'gold');
    this.coinRow(3000, 900, 3, 70, 'silver');

    this.par = new Parallax();
    this.par.add(0.0, 2048, VH, drawMoonSky);
    this.par.add(0.15, 2048, 500, drawMoonHills, { y: 430 });

    this.castle = makeCanvas(1500, 900, drawCastle);

    HUD.objective(this.solved ? 'Tillbaka till raketen! 🚀' : 'Hitta Draculaura vid slottet! 🦇');
    if (!this.met) {
      this.after(0.8, function () {
        HUD.dialog([{ who: 'alice', text: 'Wow, jag studsar SÅ högt här! Och där borta — ett slott med fladdermöss! 🦇' }]);
      });
    }
  }

  update(dt) {
    this.tick(dt);
    const inp = HUD.blocked() ? NO_IN : IN;
    const w = this.walker;
    w.update(dt, inp);
    const p = w.pos();
    this.updateCoins(dt, p.x, p.y);

    // studsmattor
    for (let i = 0; i < TRAMPS.length; i++) {
      const tx = TRAMPS[i];
      if (Math.abs(p.x - tx) < 90 && p.y > GROUND - 90 && w.body.velocity.y > 1.5) {
        window.Matter.Body.setVelocity(w.body, { x: w.body.velocity.x, y: -14 });
        AUD.sfx('pop');
        PS.burst('sparkle', tx, GROUND - 40, 8, { color: '#c95cff', speed: 180 });
      }
    }

    // möt Draculaura
    if (!this.met && p.x > DRACULAURA_X - 260) {
      this.met = true;
      setFlag('metDraculaura');
      const self = this;
      HUD.dialog([
        { who: 'draculaura', text: 'Hejsan! Jag är Draculaura! Åh, din rymddräkt är ju ROSA — den älskar jag! 💕' },
        { who: 'draculaura', text: 'Månstrålen till slottet har trasslat sig, så mina fladdermöss hittar inte hem… 🦇' },
        { who: 'draculaura', text: 'Kan du vrida speglarna så strålen träffar alla TRE kristallfladdermössen?' },
        { who: 'alice', text: 'Klart jag kan — speglar är som pussel! ✨' }
      ], function () {
        HUD.objective('Träffa 3 kristallfladdermöss med strålen! ✨');
      });
    }

    // interaktion: speglar + raket (speglarna sitter högt — närhet räknas i sidled)
    this.near = null;
    if (!this.solved && this.met) {
      let bestI = -1, bestD = 240;
      for (let i = 0; i < this.mirrors.length; i++) {
        const d = Math.abs(p.x - this.mirrors[i].x);
        if (d < bestD) { bestD = d; bestI = i; }
      }
      if (bestI >= 0) {
        this.near = { kind: 'mirror', i: bestI, x: this.mirrors[bestI].x, y: this.mirrors[bestI].y - 110 };
      }
    }
    if (!this.near && Math.abs(p.x - ROCKET_X) < 170) {
      this.near = { kind: 'rocket', x: ROCKET_X, y: 640 };
    }
    if (inp.actionEdge && this.near && !HUD.blocked()) {
      if (this.near.kind === 'mirror') HUD.toast('Tryck PÅ spegeln du vill vrida! 👆');
      else if (this.near.kind === 'rocket') this.leave();
    }

    // spegel-animation
    for (let i = 0; i < this.mirrors.length; i++) {
      if (this.mirrors[i].spin > 0) this.mirrors[i].spin -= dt * 4;
    }

    this.computeBeam();

    // porten öppnas + fladdermössen flyger hem
    if (this.solved && this.gateT < 1) {
      this.gateT = Math.min(1, this.gateT + dt * 0.4);
    }
    for (let i = this.batsHome.length - 1; i >= 0; i--) {
      const b = this.batsHome[i];
      b.t += dt;
      b.x = lerp(b.x, 4890, 1 - Math.exp(-1.2 * dt));
      b.y = lerp(b.y, 640, 1 - Math.exp(-1.2 * dt)) + Math.sin(b.t * 7 + i) * 14;
      if (dist(b.x, b.y, 4890, 640) < 40) this.batsHome.splice(i, 1);
    }

    this.cam.clampTo(0, -200, W, VH + 40);
    this.cam.follow(p.x, p.y - 160, 0.1);
    this.cam.update(dt);
  }

  turnMirror(i) {
    const m = this.mirrors[i];
    m.ang = (m.ang + 45) % 360;
    if (m.ang > 180) m.ang -= 360;
    m.spin = 1;
    AUD.sfx('click');
    this.pz.attempts++;
    if (this.pz.attempts === 9 && this.pz.hintText) HUD.hint(this.pz.hintText);
    if (this.pz.attempts === 18 && !this.pz.easy) { this.pz.easy = true; this.pz.simplify(); }
  }

  onTap(x, y) {
    if (HUD.blocked() || this.solved) return;
    const wx = x - this.cam.ox, wy = y - this.cam.oy;
    // tryck direkt på en spegel för att vrida den — inget avståndskrav
    for (let i = 0; i < this.mirrors.length; i++) {
      const m = this.mirrors[i];
      if (dist(wx, wy, m.x, m.y) < 115) {
        this.turnMirror(i);
        return;
      }
    }
  }

  computeBeam() {
    this.beamSegs.length = 0;
    const newLit = [false, false, false];
    let ox = BEAM_SRC.x, oy = BEAM_SRC.y;
    let dx = -1, dy = 0;
    let lastMirror = -1;
    for (let bounce = 0; bounce < 5; bounce++) {
      let bestT = 1e9, bestI = -1, bestIx = 0, bestIy = 0;
      for (let i = 0; i < this.mirrors.length; i++) {
        if (i === lastMirror) continue;
        const m = this.mirrors[i];
        const a = m.ang * Math.PI / 180;
        const mdx = Math.cos(a), mdy = Math.sin(a);
        const L = 80;
        const x1 = m.x - mdx * L, y1 = m.y - mdy * L;
        const x2 = m.x + mdx * L, y2 = m.y + mdy * L;
        // ray/segment-skärning
        const rxs = dx * (y2 - y1) - dy * (x2 - x1);
        if (Math.abs(rxs) < 1e-6) continue;
        const t = ((x1 - ox) * (y2 - y1) - (y1 - oy) * (x2 - x1)) / rxs;
        const u = ((x1 - ox) * dy - (y1 - oy) * dx) / rxs;
        if (t > 4 && u >= 0 && u <= 1 && t < bestT) {
          bestT = t; bestI = i;
          bestIx = ox + dx * t; bestIy = oy + dy * t;
        }
      }
      const ex = bestI >= 0 ? bestIx : ox + dx * 850;
      const ey = bestI >= 0 ? bestIy : oy + dy * 850;
      this.beamSegs.push({ x1: ox, y1: oy, x2: ex, y2: ey });
      // fladdermöss nära strålen?
      for (let pi = 0; pi < PERCHES.length; pi++) {
        if (segDist(PERCHES[pi].x, PERCHES[pi].y, ox, oy, ex, ey) < 42) newLit[pi] = true;
      }
      if (bestI < 0) break;
      const m = this.mirrors[bestI];
      const a = m.ang * Math.PI / 180;
      const mdx = Math.cos(a), mdy = Math.sin(a);
      const dot = dx * mdx + dy * mdy;
      dx = 2 * dot * mdx - dx;
      dy = 2 * dot * mdy - dy;
      ox = ex + dx * 3; oy = ey + dy * 3;
      lastMirror = bestI;
    }
    // pling när en ny tänds
    for (let i = 0; i < 3; i++) {
      if (newLit[i] && !this.lit[i]) {
        AUD.sfx('ring', { n: i * 3 + 2 });
        PS.burst('star', PERCHES[i].x, PERCHES[i].y, 8, { color: '#c95cff', speed: 160 });
      }
    }
    this.lit = newLit;
    if (!this.solved && newLit[0] && newLit[1] && newLit[2]) {
      this.solved = true;
      setFlag('starKey');
      this.pz.solve();
      const self = this;
      for (let i = 0; i < 7; i++) {
        this.batsHome.push({ x: 3400 - i * 160, y: 200 + (i % 3) * 90, t: i * 0.1 });
      }
      this.after(1.4, function () {
        HUD.dialog([
          { who: 'draculaura', text: 'FLADDERMÖSSEN! De hittar hem! Tack tack TACK, Alice! 🦇💕' },
          { who: 'draculaura', text: 'Här — Stjärnnyckeln! Och hälsa Nastya på Guldasteroiden från mig!' },
          { who: 'alice', text: 'En stjärnnyckel! ⭐ Tack Draculaura! Vi ses på hemvägen!' }
        ], function () {
          HUD.toast('⭐ Stjärnnyckeln! ⭐');
          HUD.objective('Tillbaka till raketen! 🚀');
        });
      });
    }
  }

  leave() {
    if (!this.solved) {
      HUD.dialog([{ who: 'alice', text: 'Inte än — Draculaura behöver hjälp med månstrålen först! 🦇' }]);
      return;
    }
    advanceTo('travel_asteroid');
    HUD.dialog([{ who: 'alice', text: 'Nästa stopp: Guldasteroiden och Nastyas butik! 🪙' }], function () {
      NAV.go('travel_asteroid');
    });
  }

  draw(ctx, alpha, t) {
    this.par.draw(ctx, this.cam.x, this.cam.y * 0.15, QY.layersMax());
    this.cam.begin(ctx);

    // slottet
    ctx.drawImage(this.castle, 3950, GROUND - 880);

    // porten (skjuts upp när gateT ökar)
    const gh = 200 * (1 - this.gateT);
    if (gh > 4) {
      ctx.fillStyle = '#41284f';
      rr(ctx, 4830, GROUND - 200, 120, gh, 8);
      ctx.fill();
      ctx.strokeStyle = '#2a1735';
      ctx.lineWidth = 4;
      ctx.stroke();
    }

    // svävande månstensplattformar (samma lägen som fysiken!)
    drawMoonPlatform(ctx, 1780, 640, 240, t);
    drawMoonPlatform(ctx, 2450, 500, 240, t + 2);

    // marken: mångrå med kratrar
    drawMoonGround(ctx, this.cam);

    // studsmattor
    for (let i = 0; i < TRAMPS.length; i++) {
      const tx = TRAMPS[i];
      const squash = Math.abs(this.walker.pos().x - tx) < 90 && this.walker.pos().y > GROUND - 120 ? 0.7 : 1;
      ctx.fillStyle = '#8a3fd0';
      ctx.beginPath();
      ctx.ellipse(tx, GROUND - 18, 92, 34 * squash, 0, Math.PI, 0);
      ctx.fill();
      ctx.fillStyle = '#c95cff';
      ctx.beginPath();
      ctx.ellipse(tx, GROUND - 18 - 8 * squash, 78, 22 * squash, 0, Math.PI, 0);
      ctx.fill();
      ctx.fillStyle = '#5a2a8a';
      ctx.fillRect(tx - 80, GROUND - 20, 12, 20);
      ctx.fillRect(tx + 68, GROUND - 20, 12, 20);
    }

    // raketen (parkerad)
    drawRocket(ctx, ROCKET_X, GROUND - 125, 0, t, { alice: false, flame: 0, scale: 1 });
    ctx.fillStyle = '#3a3f52';
    rr(ctx, ROCKET_X - 160, GROUND - 22, 320, 22, 8);
    ctx.fill();

    // Draculaura
    drawGirl(ctx, DRACULAURA_X, GROUND - 4, t, WHO.draculaura, { mode: this.solved ? 'dance' : 'wave', face: this.walker.pos().x < DRACULAURA_X ? -1 : 1 });

    // månstrålen
    ctx.save();
    ctx.lineCap = 'round';
    for (let i = 0; i < this.beamSegs.length; i++) {
      const s = this.beamSegs[i];
      ctx.strokeStyle = 'rgba(255,240,190,0.25)';
      ctx.lineWidth = 20;
      ctx.beginPath(); ctx.moveTo(s.x1, s.y1); ctx.lineTo(s.x2, s.y2); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,250,230,0.9)';
      ctx.lineWidth = 6;
      ctx.beginPath(); ctx.moveTo(s.x1, s.y1); ctx.lineTo(s.x2, s.y2); ctx.stroke();
      if (Math.random() < 0.25) {
        const k = Math.random();
        PS.spawn('sparkle', s.x1 + (s.x2 - s.x1) * k, s.y1 + (s.y2 - s.y1) * k, { color: '#fff0c0', vx: 0, vy: -20, life: 0.5, size: 4 });
      }
    }
    ctx.restore();

    // lyktan (strålens källa)
    glow(ctx, BEAM_SRC.x, BEAM_SRC.y, 70, '#fff0c0', 0.7);
    ctx.fillStyle = '#ffe9a8';
    starPath(ctx, BEAM_SRC.x, BEAM_SRC.y, 22, 10, 5, t * 0.5);
    ctx.fill();

    // speglar
    for (let i = 0; i < this.mirrors.length; i++) {
      const m = this.mirrors[i];
      drawMirror(ctx, m, t, this.showGhost ? MIRRORS[i].sol : null);
    }

    // kristallfladdermöss
    for (let i = 0; i < PERCHES.length; i++) {
      drawCrystalBat(ctx, PERCHES[i].x, PERCHES[i].y, t, this.lit[i]);
    }

    // hemflygande fladdermöss
    for (let i = 0; i < this.batsHome.length; i++) {
      const b = this.batsHome[i];
      drawBatSmall(ctx, b.x, b.y, t * 10 + i);
    }

    drawWorld(ctx, alpha, t);

    if (this.near && !HUD.blocked()) drawActionBubble(ctx, this.near.x, this.near.y, t);

    this.drawCoins(ctx, t);
    PS.draw(ctx);
    this.cam.end(ctx);
  }
}

function segDist(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1;
  const len2 = dx * dx + dy * dy;
  if (len2 < 1e-6) return dist(px, py, x1, y1);
  let t = ((px - x1) * dx + (py - y1) * dy) / len2;
  t = clamp(t, 0, 1);
  return dist(px, py, x1 + dx * t, y1 + dy * t);
}

function drawMirror(ctx, m, t, ghostAng) {
  // stativ
  ctx.strokeStyle = '#6a7284';
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.moveTo(m.x, Math.min(m.y + 120, GROUND));
  ctx.lineTo(m.x, m.y);
  ctx.stroke();
  ctx.fillStyle = '#4a5262';
  ctx.beginPath(); ctx.arc(m.x, m.y, 12, 0, TAU); ctx.fill();
  if (ghostAng !== null && ghostAng !== undefined) {
    ctx.save();
    ctx.globalAlpha = 0.28 + 0.12 * Math.sin(t * 4);
    drawMirrorFace(ctx, m.x, m.y, ghostAng);
    ctx.restore();
  }
  drawMirrorFace(ctx, m.x, m.y, m.ang + m.spin * 12);
}

function drawMirrorFace(ctx, x, y, angDeg) {
  const a = angDeg * Math.PI / 180;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(a);
  const g = ctx.createLinearGradient(0, -10, 0, 10);
  g.addColorStop(0, '#eaf6ff');
  g.addColorStop(0.5, '#b8d8f0');
  g.addColorStop(1, '#7ea8c8');
  ctx.fillStyle = g;
  rr(ctx, -84, -9, 168, 18, 9);
  ctx.fill();
  ctx.strokeStyle = '#ffd24a';
  ctx.lineWidth = 3.5;
  ctx.stroke();
  ctx.restore();
}

function drawCrystalBat(ctx, x, y, t, lit) {
  // pinne
  ctx.strokeStyle = '#5a4a70';
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(x, y + 46);
  ctx.lineTo(x, y + 12);
  ctx.stroke();
  if (lit) glow(ctx, x, y, 66, '#c95cff', 0.55 + 0.2 * Math.sin(t * 6));
  ctx.save();
  ctx.translate(x, y + (lit ? Math.sin(t * 8) * 4 : 0));
  ctx.fillStyle = lit ? '#e8aaff' : 'rgba(120,90,150,0.65)';
  ctx.strokeStyle = lit ? '#c95cff' : '#5a4a70';
  ctx.lineWidth = 2.5;
  // vingar
  for (let side = -1; side <= 1; side += 2) {
    ctx.beginPath();
    ctx.moveTo(side * 4, 0);
    ctx.quadraticCurveTo(side * 22, -14, side * 30, -2);
    ctx.quadraticCurveTo(side * 24, 4, side * 26, 10);
    ctx.quadraticCurveTo(side * 14, 6, side * 4, 10);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.arc(0, 0, 8, 0, TAU);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function drawBatSmall(ctx, x, y, wt) {
  const flap = Math.sin(wt) * 0.6;
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = '#2a1735';
  for (let side = -1; side <= 1; side += 2) {
    ctx.save();
    ctx.scale(side, 1);
    ctx.rotate(-flap * 0.5);
    ctx.beginPath();
    ctx.moveTo(2, 0);
    ctx.quadraticCurveTo(12, -9, 20, -3);
    ctx.quadraticCurveTo(14, 2, 16, 6);
    ctx.quadraticCurveTo(8, 3, 2, 6);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
  ctx.beginPath(); ctx.arc(0, 0, 4.5, 0, TAU); ctx.fill();
  ctx.restore();
}

function drawMoonPlatform(ctx, x, y, w, t) {
  ctx.save();
  ctx.translate(x, y + 13);
  // magiskt sken under (visar att den svävar)
  glow(ctx, 0, 26, 90, '#c9a8ff', 0.22 + 0.08 * Math.sin(t * 2));
  const g = ctx.createLinearGradient(0, -16, 0, 22);
  g.addColorStop(0, '#cfc9de');
  g.addColorStop(1, '#8a84a0');
  ctx.fillStyle = g;
  rr(ctx, -w / 2, -14, w, 30, 14);
  ctx.fill();
  ctx.strokeStyle = '#6a6480';
  ctx.lineWidth = 3;
  ctx.stroke();
  // små kratrar på ytan
  ctx.fillStyle = 'rgba(90,84,110,0.55)';
  ctx.beginPath(); ctx.ellipse(-w * 0.26, -4, 16, 6, 0, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.ellipse(w * 0.18, 2, 12, 5, 0, 0, TAU); ctx.fill();
  // gnistor
  ctx.fillStyle = 'rgba(233,215,255,0.8)';
  starPath(ctx, w * 0.38, -18, 6, 2.6, 4, t);
  ctx.fill();
  ctx.restore();
}

function drawMoonGround(ctx, cam) {
  const x0 = Math.max(0, cam.x - view.w / 2 - 60);
  const x1 = Math.min(W + 200, cam.x + view.w / 2 + 60);
  const g = ctx.createLinearGradient(0, GROUND, 0, GROUND + 130);
  g.addColorStop(0, '#b8b4c8');
  g.addColorStop(1, '#787290');
  ctx.fillStyle = g;
  ctx.fillRect(x0, GROUND - 8, x1 - x0, 148);
  // kratrar (deterministiska)
  for (let x = Math.floor(x0 / 340) * 340; x < x1; x += 340) {
    const r = Math.abs(Math.sin(x * 12.9898) * 43758.5453) % 1;
    const cw = 60 + r * 90;
    ctx.fillStyle = 'rgba(90,84,110,0.6)';
    ctx.beginPath();
    ctx.ellipse(x + 120, GROUND + 26 + r * 30, cw, cw * 0.26, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = 'rgba(210,206,225,0.5)';
    ctx.beginPath();
    ctx.ellipse(x + 120, GROUND + 20 + r * 30, cw * 0.8, cw * 0.18, 0, Math.PI, 0);
    ctx.fill();
  }
}

function drawMoonSky(c, w, h) {
  const g = c.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#05020c');
  g.addColorStop(0.7, '#181030');
  g.addColorStop(1, '#241a44');
  c.fillStyle = g;
  c.fillRect(0, 0, w, h);
  c.fillStyle = '#fff';
  for (let i = 0; i < 180; i++) {
    c.globalAlpha = 0.3 + Math.random() * 0.7;
    c.beginPath();
    c.arc(Math.random() * w, Math.random() * h * 0.8, Math.random() * 1.7 + 0.4, 0, TAU);
    c.fill();
  }
  c.globalAlpha = 1;
  // jorden i skyn! 🌍
  const eg = c.createRadialGradient(1450, 230, 20, 1500, 250, 95);
  eg.addColorStop(0, '#9ed6ff');
  eg.addColorStop(1, '#1e56b0');
  c.fillStyle = eg;
  c.beginPath(); c.arc(1500, 250, 88, 0, TAU); c.fill();
  c.fillStyle = '#59b25e';
  c.beginPath(); c.ellipse(1470, 230, 34, 24, 0.4, 0, TAU); c.fill();
  c.beginPath(); c.ellipse(1535, 285, 26, 18, -0.3, 0, TAU); c.fill();
  c.fillStyle = 'rgba(255,255,255,0.7)';
  c.beginPath(); c.ellipse(1510, 210, 30, 9, 0.2, 0, TAU); c.fill();
  const halo = c.createRadialGradient(1500, 250, 88, 1500, 250, 150);
  halo.addColorStop(0, 'rgba(150,200,255,0.25)');
  halo.addColorStop(1, 'rgba(150,200,255,0)');
  c.fillStyle = halo;
  c.beginPath(); c.arc(1500, 250, 150, 0, TAU); c.fill();
}

function drawMoonHills(c, w, h) {
  c.fillStyle = 'rgba(70,64,95,0.8)';
  c.beginPath();
  c.moveTo(0, h);
  for (let x = 0; x <= w; x += 20) {
    c.lineTo(x, 200 - 120 * Math.abs(Math.sin(x * Math.PI * 2 / w)) - 40 * Math.sin(x * TAU * 5 / w));
  }
  c.lineTo(w, h);
  c.closePath();
  c.fill();
}

function drawCastle(c, w, h) {
  const baseY = h;
  // huvudbyggnad
  const g = c.createLinearGradient(0, 200, 0, baseY);
  g.addColorStop(0, '#4a2a5e');
  g.addColorStop(1, '#33203f');
  c.fillStyle = g;
  c.fillRect(700, 300, 640, baseY - 300);
  // torn
  tower(c, 760, 240, 130, baseY);
  tower(c, 1240, 200, 150, baseY);
  tower(c, 1010, 120, 120, baseY);
  // port-valv
  c.fillStyle = '#241428';
  c.beginPath();
  c.moveTo(880, baseY);
  c.lineTo(880, 740);
  c.quadraticCurveTo(940, 660, 1000, 740);
  c.lineTo(1000, baseY);
  c.closePath();
  c.fill();
  c.strokeStyle = '#ff3fa4';
  c.lineWidth = 5;
  c.stroke();
  // hjärtfönster
  c.fillStyle = '#ff9ed9';
  heartAt(c, 1070, 460, 26);
  heartAt(c, 820, 420, 18);
  c.fillStyle = 'rgba(255,158,217,0.5)';
  // små fönster som lyser
  for (let i = 0; i < 5; i++) {
    c.fillStyle = i % 2 === 0 ? '#ffd24a' : '#ff9ed9';
    c.fillRect(760 + i * 110, 560 + (i % 2) * 60, 26, 40);
  }
  function tower(cc, x, top, tw, by) {
    cc.fillStyle = '#3a2249';
    cc.fillRect(x, top, tw, by - top);
    // spetsigt tak
    cc.fillStyle = '#ff3fa4';
    cc.beginPath();
    cc.moveTo(x - 18, top);
    cc.lineTo(x + tw / 2, top - 120);
    cc.lineTo(x + tw + 18, top);
    cc.closePath();
    cc.fill();
    // fladdermus-flöjel
    cc.fillStyle = '#241428';
    cc.beginPath();
    cc.arc(x + tw / 2, top - 132, 8, 0, TAU);
    cc.fill();
    cc.beginPath();
    cc.moveTo(x + tw / 2 - 18, top - 136);
    cc.quadraticCurveTo(x + tw / 2 - 6, top - 148, x + tw / 2, top - 134);
    cc.quadraticCurveTo(x + tw / 2 + 6, top - 148, x + tw / 2 + 18, top - 136);
    cc.quadraticCurveTo(x + tw / 2 + 8, top - 128, x + tw / 2, top - 132);
    cc.quadraticCurveTo(x + tw / 2 - 8, top - 128, x + tw / 2 - 18, top - 136);
    cc.fill();
  }
  function heartAt(cc, x, y, s) {
    cc.beginPath();
    cc.moveTo(x, y + s * 0.9);
    cc.bezierCurveTo(x - s * 1.1, y + s * 0.15, x - s * 0.62, y - s * 0.75, x, y - s * 0.18);
    cc.bezierCurveTo(x + s * 0.62, y - s * 0.75, x + s * 1.1, y + s * 0.15, x, y + s * 0.9);
    cc.fill();
  }
}

export const moonScene = new MoonScene();
