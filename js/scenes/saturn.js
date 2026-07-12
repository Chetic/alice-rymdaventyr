// Saturnus ringar: regnbågsvägen. Bygg klart regnbågsbron (dra bitarna till
// rätt färgplats) och rid sedan enhörningen Stella över gapen!

import { VH, GRAV, PAL, RAINBOW, TAU, rand, clamp, lerp, dist, easeOut } from '../config.js';
import { view, makeCanvas, Parallax, PS, txt, glow, QY, rr, drawGem, starPath } from '../render.js';
import { setScheme, IN, NO_IN } from '../input.js';
import { M, addToWorld, addStatic, drawWorld, CAT } from '../world.js';
import { SAVE, setFlag, flag, advanceTo, persist } from '../save.js';
import { AUD } from '../audio.js';
import { HUD } from '../hud.js';
import { drawGirl, drawUnicorn, WHO } from '../chars.js';
import { drawRocket, drawActionBubble } from '../props.js';
import { SceneBase, PuzzleBase, makeWalker, bindWalkerSprite, NAV } from './base.js';

const W = 5800;
const GROUND = 1000;
const ROCKET_X = 350;
const STELLA_X = 950;
const GAP = { x0: 2600, x1: 3460 };
const SHRINE_X = 5350;
const SEGMENTS = [
  [-200, 1960], [2110, GAP.x0], [GAP.x1, 4260], [4410, 6000]
];

class SaturnScene extends SceneBase {
  constructor() {
    super('saturn');
    this.song = 'saturn';
    this.gravity = GRAV.saturn;
  }

  enter() {
    this.baseEnter();
    setScheme('walk', { action: true });

    for (let i = 0; i < SEGMENTS.length; i++) {
      const s = SEGMENTS[i];
      addStatic((s[0] + s[1]) / 2, GROUND + 60, s[1] - s[0], 120);
    }
    addStatic(-40, VH / 2, 80, VH * 2);
    addStatic(W + 40, VH / 2, 80, VH * 2);

    this.walker = makeWalker(ROCKET_X + 150, 930, { jumpV: 13.5, speed: 6.6 });
    const w = this.walker;
    const self = this;
    this.mounted = false;
    bindWalkerSprite(w, function (ctx, x, y, a, t) {
      if (self.mounted) {
        drawUnicorn(ctx, x, y + 36, t, { s: 1, face: w.face, mode: Math.abs(w.body.velocity.x) > 1.5 ? 'gallop' : 'stand', ph: w.ph * 1.4 });
        drawGirl(ctx, x - w.face * 6, y - 58, t, WHO.aliceSuit, { s: 0.82, face: w.face, mode: 'sit' });
      } else {
        drawGirl(ctx, x, y + 34, t, WHO.aliceSuit, { mode: w.mode, face: w.face, ph: w.ph });
      }
    }, 6);
    this.lastSafeX = ROCKET_X + 150;

    this.met = flag('metStella');
    this.bridgeDone = flag('rainbowBridge');
    this.hasFuel = flag('rainbowFuel');

    // bro-bitar och platser
    this.slots = [];
    for (let i = 0; i < 7; i++) {
      const k = i / 6;
      this.slots.push({
        x: GAP.x0 + 70 + k * (GAP.x1 - GAP.x0 - 140),
        y: 965 - Math.sin(k * Math.PI) * 120,
        color: i, taken: this.bridgeDone
      });
    }
    this.pieces = [];
    if (!this.bridgeDone) {
      for (let i = 0; i < 7; i++) {
        this.pieces.push({
          color: i,
          x: 1150 + (i % 4) * 330 + (i > 3 ? 160 : 0),
          y: 900 - Math.floor(i / 4) * 0 - (i % 2) * 26,
          hx: 0, hy: 0, state: 'ground', wob: 0
        });
        this.pieces[i].hx = this.pieces[i].x;
        this.pieces[i].hy = this.pieces[i].y;
      }
    }
    this.dragPiece = -1;
    this.pzBridge = new PuzzleBase('Samma färg som pricken! Röd längst till vänster… 🌈');
    this.pzBridge.simplify = function () { self.showArrows = true; };
    this.showArrows = false;
    if (this.bridgeDone) this.addBridgePhysics();

    // ädelstenar över bron + på vägen
    this.gems = [];
    if (!flag('satGems')) {
      for (let i = 0; i < 5; i++) {
        const k = i / 4;
        this.gems.push({ x: GAP.x0 + 100 + k * (GAP.x1 - GAP.x0 - 200), y: 800 - Math.sin(k * Math.PI) * 140, taken: false, color: RAINBOW[i + 1] });
      }
    }

    this.coinRow(1300, 900, 3, 80, 'silver');
    this.coinRow(3700, 900, 3, 80, 'silver');
    this.addCoin(4800, 880, 'gold');

    this.par = new Parallax();
    this.par.add(0.0, 2048, VH, drawSaturnSky);
    this.par.add(0.1, 2048, 300, drawFarRings, { y: 620 });

    HUD.objective(this.hasFuel ? 'Tillbaka till raketen! 🚀' : (this.bridgeDone ? 'Hämta Regnbågsbränslet! ✨' : 'Hitta Stella på regnbågsvägen! 🦄'));
    AUD.loop('wind', false);
  }

  addBridgePhysics() {
    for (let i = 0; i < 7; i++) {
      const s = this.slots[i];
      addStatic(s.x, s.y + 26, 150, 26);
    }
  }

  update(dt) {
    this.tick(dt);
    const inp = HUD.blocked() ? NO_IN : IN;
    const w = this.walker;
    if (this.mounted) { w.speed = 9.2; w.jumpV = 17; }
    else { w.speed = 6.6; w.jumpV = 13.5; }
    w.update(dt, inp);
    const p = w.pos();
    this.updateCoins(dt, p.x, p.y);

    if (w.grounded() && p.y < 1050) this.lastSafeX = p.x;

    // trillat ner? — snällt: upp igen
    if (p.y > VH + 250) {
      M.Body.setPosition(w.body, { x: clamp(this.lastSafeX, 200, W - 200), y: 900 });
      M.Body.setVelocity(w.body, { x: 0, y: 0 });
      HUD.toast('Hoppsan! Upp igen ✨');
      AUD.sfx('whoosh');
      PS.burst('sparkle', p.x, 900, 10, { color: '#fff', speed: 200 });
    }

    // möt Stella
    if (!this.met && p.x > STELLA_X - 320) {
      this.met = true;
      setFlag('metStella');
      HUD.dialog([
        { who: 'stella', text: 'Välkommen till regnbågsvägen! Jag är Stella! 🦄✨' },
        { who: 'stella', text: 'Rymdvinden blåste sönder vår regnbågsbro — bitarna ligger utspridda!' },
        { who: 'stella', text: 'Lägg tillbaka dem i regnbågens ordning, så bär jag dig över på ryggen sen!' },
        { who: 'alice', text: 'Röd, orange, gul, grön… precis som en riktig regnbåge! 🌈' }
      ], function () {
        HUD.objective('Bygg regnbågsbron! 🌈');
      });
    }

    // gnistor från Stella
    if (Math.random() < dt * 6) {
      PS.spawn('sparkle', (this.mounted ? p.x : STELLA_X) + rand(-80, 80), (this.mounted ? p.y : 920) + rand(-80, 10), { color: '#fff0b3', vy: -40, life: 0.8, size: 5 });
    }

    // bit-wobble (fel plats)
    for (let i = 0; i < this.pieces.length; i++) {
      const pc = this.pieces[i];
      if (pc.wob > 0) {
        pc.wob -= dt;
        pc.x = lerp(pc.x, pc.hx, 1 - Math.exp(-4 * dt));
        pc.y = lerp(pc.y, pc.hy, 1 - Math.exp(-4 * dt));
      }
    }

    // ädelstenar
    for (let i = 0; i < this.gems.length; i++) {
      const gm = this.gems[i];
      if (!gm.taken && dist(gm.x, gm.y, p.x, p.y) < 80) {
        gm.taken = true;
        SAVE.gems += 1;
        AUD.sfx('gem');
        PS.burst('star', gm.x, gm.y, 10, { color: gm.color, speed: 220 });
        let all = true;
        for (let j = 0; j < this.gems.length; j++) if (!this.gems[j].taken) all = false;
        if (all) { setFlag('satGems'); HUD.toast('Alla ädelstenar! 💎'); }
      }
    }

    // interaktion
    this.near = null;
    if (!HUD.blocked()) {
      if (this.bridgeDone && dist(p.x, p.y, this.mounted ? -9999 : STELLA_X, 940) < 220) {
        this.near = { kind: 'mount', x: STELLA_X, y: 700 };
      } else if (!this.hasFuel && this.bridgeDone && Math.abs(p.x - SHRINE_X) < 170) {
        this.near = { kind: 'shrine', x: SHRINE_X, y: 620 };
      } else if (Math.abs(p.x - ROCKET_X) < 170) {
        this.near = { kind: 'rocket', x: ROCKET_X, y: 640 };
      }
      if (inp.actionEdge) {
        if (this.near && this.near.kind === 'shrine') {
          this.hasFuel = true;
          setFlag('rainbowFuel');
          AUD.sfx('bigwin');
          HUD.toast('✨ REGNBÅGSBRÄNSLE! ✨');
          PS.burst('star', SHRINE_X, 700, 22, { color: PAL.gold, speed: 320 });
          HUD.objective('Tillbaka till raketen! 🚀');
        } else if (this.near && this.near.kind === 'rocket') {
          this.leave();
        } else if (this.near && this.near.kind === 'mount') {
          this.mounted = true;
          AUD.sfx('magic');
          HUD.toast('Håll i manen! 🦄');
        } else if (this.mounted) {
          this.mounted = false;
          AUD.sfx('pop');
        }
      }
    }

    // Stella följer inte — hon står kvar tills man rider
    this.cam.clampTo(0, -200, W, VH + 300);
    this.cam.follow(p.x, p.y - 160, 0.1);
    this.cam.update(dt);
  }

  onTap(x, y) {
    if (HUD.blocked() || this.bridgeDone) return;
    const wx = x - this.cam.ox, wy = y - this.cam.oy;
    if (this.dragPiece < 0) {
      for (let i = 0; i < this.pieces.length; i++) {
        const pc = this.pieces[i];
        if (pc.state === 'ground' && dist(wx, wy, pc.x, pc.y) < 90) {
          this.dragPiece = i;
          AUD.sfx('pop');
          return;
        }
      }
    }
  }

  updateDragPiece() {
    if (this.dragPiece < 0) return;
    const pc = this.pieces[this.dragPiece];
    const pt = IN.pointer;
    if (pt.down) {
      pc.x = pt.x - this.cam.ox;
      pc.y = pt.y - this.cam.oy;
    } else {
      // släppt: rätt plats?
      let placed = false;
      for (let s = 0; s < this.slots.length; s++) {
        const slot = this.slots[s];
        if (!slot.taken && dist(pc.x, pc.y, slot.x, slot.y) < 85) {
          if (slot.color === pc.color) {
            slot.taken = true;
            pc.state = 'placed';
            pc.x = slot.x; pc.y = slot.y;
            AUD.sfx('ring', { n: pc.color + 1 });
            PS.burst('sparkle', slot.x, slot.y, 10, { color: RAINBOW[pc.color], speed: 180 });
            placed = true;
            let all = true;
            for (let i = 0; i < this.slots.length; i++) if (!this.slots[i].taken) all = false;
            if (all) this.finishBridge();
          } else {
            pc.wob = 1.2;
            this.pzBridge.fail();
            HUD.toast('Fel färg här — titta på pricken! 🌈');
          }
          break;
        }
      }
      if (!placed && pc.state === 'ground' && pc.wob <= 0) {
        // släppt i luften → glid tillbaka
        pc.wob = 1.0;
      }
      this.dragPiece = -1;
    }
  }

  finishBridge() {
    this.bridgeDone = true;
    setFlag('rainbowBridge');
    this.addBridgePhysics();
    this.pzBridge.solve();
    AUD.sfx('bigwin');
    this.cam.shake(6, 0.5);
    for (let i = 0; i < 7; i++) {
      PS.burst('star', this.slots[i].x, this.slots[i].y, 8, { color: RAINBOW[i], speed: 240 });
    }
    const self = this;
    this.after(1.2, function () {
      HUD.dialog([
        { who: 'stella', text: 'REGNBÅGSBRON LYSER IGEN! Du är fantastisk, Alice! 🌈' },
        { who: 'stella', text: 'Hoppla upp på min rygg — och ta regnbågsbränslet där borta till raketen!' }
      ], function () {
        HUD.objective('Rid över bron — hämta bränslet! ✨');
      });
    });
  }

  leave() {
    if (!this.hasFuel) {
      HUD.dialog([{ who: 'alice', text: 'Raketen behöver Regnbågsbränslet för sista biten till Neptunus! ✨' }]);
      return;
    }
    advanceTo('travel_neptune');
    HUD.dialog([
      { who: 'alice', text: 'Sista stoppet: NEPTUNUS. Nu kommer jag, pappa! 💜' }
    ], function () {
      NAV.go('travel_neptune');
    });
  }

  draw(ctx, alpha, t) {
    this.updateDragPiece();
    this.par.draw(ctx, this.cam.x, this.cam.y * 0.1, QY.layersMax());
    this.cam.begin(ctx);

    // ringvägen
    drawRingRoad(ctx, this.cam, t);

    // raket + platta
    ctx.fillStyle = '#3a3f52';
    rr(ctx, ROCKET_X - 160, GROUND - 22, 320, 22, 8);
    ctx.fill();
    drawRocket(ctx, ROCKET_X, GROUND - 125, 0, t, { alice: false, flame: 0, scale: 1 });

    // bro-platser (prickar) och lagda bitar
    for (let i = 0; i < this.slots.length; i++) {
      const s = this.slots[i];
      if (!s.taken) {
        glow(ctx, s.x, s.y, 44, RAINBOW[s.color], 0.3 + 0.15 * Math.sin(t * 3 + i));
        ctx.fillStyle = RAINBOW[s.color];
        ctx.globalAlpha = 0.55;
        ctx.beginPath();
        ctx.arc(s.x, s.y, 20, 0, TAU);
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.setLineDash([10, 8]);
        ctx.strokeStyle = 'rgba(255,255,255,0.5)';
        ctx.lineWidth = 3;
        rr(ctx, s.x - 72, s.y - 20, 144, 40, 18);
        ctx.stroke();
        ctx.setLineDash([]);
      } else {
        drawBridgePiece(ctx, s.x, s.y, s.color, t, true);
      }
    }
    // lösa bitar
    for (let i = 0; i < this.pieces.length; i++) {
      const pc = this.pieces[i];
      if (pc.state === 'ground') {
        const shake = pc.wob > 0 ? Math.sin(t * 40) * 6 * pc.wob : 0;
        drawBridgePiece(ctx, pc.x + shake, pc.y, pc.color, t, false);
      }
    }

    // skimmer på färdig bro
    if (this.bridgeDone && Math.random() < 0.3) {
      const k = Math.random();
      const bx = GAP.x0 + 70 + k * (GAP.x1 - GAP.x0 - 140);
      PS.spawn('sparkle', bx, 960 - Math.sin(k * Math.PI) * 120, { color: RAINBOW[Math.floor(k * 6.99)], vy: -30, life: 0.7, size: 5 });
    }

    // ädelstenar
    for (let i = 0; i < this.gems.length; i++) {
      const gm = this.gems[i];
      if (gm.taken) continue;
      glow(ctx, gm.x, gm.y, 44, gm.color, 0.3);
      drawGem(ctx, gm.x, gm.y + Math.sin(t * 2 + i) * 8, 24, gm.color, t);
    }

    // helgedomen med regnbågsbränslet
    drawShrine(ctx, SHRINE_X, GROUND, t, this.hasFuel);

    // Stella (när vi inte rider)
    if (!this.mounted) {
      drawUnicorn(ctx, STELLA_X, GROUND - 2, t, { s: 1.05, face: this.walker.pos().x < STELLA_X ? -1 : 1, mode: 'stand' });
    }

    drawWorld(ctx, alpha, t);

    if (this.near && !HUD.blocked()) drawActionBubble(ctx, this.near.x, this.near.y, t);

    this.drawCoins(ctx, t);
    PS.draw(ctx);
    this.cam.end(ctx);
  }
}

function drawBridgePiece(ctx, x, y, colorIdx, t, locked) {
  ctx.save();
  ctx.translate(x, y);
  if (!locked) ctx.rotate(Math.sin(t * 1.8 + colorIdx) * 0.06);
  glow(ctx, 0, 0, 60, RAINBOW[colorIdx], locked ? 0.25 : 0.4);
  const g = ctx.createLinearGradient(0, -18, 0, 18);
  g.addColorStop(0, '#ffffff');
  g.addColorStop(0.25, RAINBOW[colorIdx]);
  g.addColorStop(1, RAINBOW[colorIdx]);
  ctx.fillStyle = g;
  rr(ctx, -70, -18, 140, 36, 16);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.8)';
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.restore();
}

function drawShrine(ctx, x, groundY, t, taken) {
  // piedestal
  ctx.fillStyle = '#cbb8e8';
  rr(ctx, x - 70, groundY - 150, 140, 150, 12);
  ctx.fill();
  ctx.fillStyle = '#a893d0';
  rr(ctx, x - 90, groundY - 30, 180, 30, 8);
  ctx.fill();
  if (!taken) {
    const bob = Math.sin(t * 2) * 10;
    glow(ctx, x, groundY - 230 + bob, 110, '#fff', 0.35);
    for (let i = 0; i < 7; i++) {
      ctx.save();
      ctx.translate(x, groundY - 230 + bob);
      ctx.rotate(t * 0.8 + i * TAU / 7);
      ctx.fillStyle = RAINBOW[i];
      ctx.globalAlpha = 0.85;
      ctx.beginPath();
      ctx.ellipse(34, 0, 14, 7, 0, 0, TAU);
      ctx.fill();
      ctx.restore();
    }
    drawGem(ctx, x, groundY - 230 + bob, 34, '#fff', t);
  }
  txt(ctx, taken ? '✨' : 'REGNBÅGSBRÄNSLE', x, groundY - 320, { size: 24, bold: true, color: '#e8dcff', alpha: 0.8 });
}

function drawRingRoad(ctx, cam, t) {
  const x0 = Math.max(-200, cam.x - view.w / 2 - 60);
  const x1 = Math.min(W + 200, cam.x + view.w / 2 + 60);
  for (let s = 0; s < SEGMENTS.length; s++) {
    const seg = SEGMENTS[s];
    const a = Math.max(x0, seg[0]), b = Math.min(x1, seg[1]);
    if (a >= b) continue;
    const g = ctx.createLinearGradient(0, GROUND, 0, GROUND + 130);
    g.addColorStop(0, '#ffe8c0');
    g.addColorStop(1, '#b8905a');
    ctx.fillStyle = g;
    ctx.fillRect(a, GROUND - 8, b - a, 148);
    // glitter i ringen
    for (let x = Math.floor(a / 90) * 90; x < b; x += 90) {
      const r = Math.abs(Math.sin(x * 12.9898) * 43758.5453) % 1;
      ctx.fillStyle = 'rgba(255,255,255,' + (0.25 + 0.55 * (0.5 + 0.5 * Math.sin(t * 3 + x))) + ')';
      starPath(ctx, x + r * 60, GROUND + 26 + r * 70, 4 + r * 4, 2, 4, r * 3);
      ctx.fill();
    }
    // kant-glöd
    ctx.fillStyle = 'rgba(255,230,180,0.5)';
    ctx.fillRect(a, GROUND - 12, b - a, 6);
  }
}

function drawSaturnSky(c, w, h) {
  const g = c.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#120826');
  g.addColorStop(0.7, '#2c1c3e');
  g.addColorStop(1, '#1a0f2e');
  c.fillStyle = g;
  c.fillRect(0, 0, w, h);
  c.fillStyle = '#fff';
  for (let i = 0; i < 170; i++) {
    c.globalAlpha = 0.3 + Math.random() * 0.7;
    c.beginPath();
    c.arc(Math.random() * w, Math.random() * h * 0.85, Math.random() * 1.7 + 0.4, 0, TAU);
    c.fill();
  }
  c.globalAlpha = 1;
  // Saturnus själv, enorm
  c.save();
  c.translate(560, 330);
  c.rotate(-0.18);
  const pg = c.createRadialGradient(-60, -60, 40, 0, 0, 230);
  pg.addColorStop(0, '#ffe8c0');
  pg.addColorStop(1, '#c8955a');
  c.fillStyle = pg;
  c.beginPath();
  c.arc(0, 0, 210, 0, TAU);
  c.fill();
  // band
  c.globalAlpha = 0.3;
  c.strokeStyle = '#a87840';
  for (let i = 0; i < 5; i++) {
    c.lineWidth = 10 + i * 3;
    c.beginPath();
    c.ellipse(0, -60 + i * 34, 200 - i * 6, 26, 0, 0, TAU);
    c.stroke();
  }
  c.globalAlpha = 1;
  c.restore();
}

function drawFarRings(c, w, h) {
  // andra ringband i fjärran
  for (let i = 0; i < 4; i++) {
    c.strokeStyle = ['rgba(255,220,170,0.30)', 'rgba(201,92,255,0.22)', 'rgba(126,200,255,0.20)', 'rgba(255,158,217,0.20)'][i];
    c.lineWidth = 22 - i * 4;
    c.beginPath();
    c.moveTo(0, 130 + i * 44);
    c.quadraticCurveTo(w / 2, 90 + i * 44 + 40, w, 130 + i * 44);
    c.stroke();
  }
}

export const saturnScene = new SaturnScene();
