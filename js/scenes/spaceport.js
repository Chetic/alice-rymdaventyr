// Rymdbasen: tre pussel bygger raketen — pappas sifferkod, kristallsortering
// till bränsletankarna och pendelkranen som sätter noskonen. Sen: UPPSKJUTNING!

import { VH, GRAV, PAL, RAINBOW, TAU, rand, clamp, lerp, dist } from '../config.js';
import { view, makeCanvas, Parallax, PS, txt, glow, QY, rr, drawGem, starPath } from '../render.js';
import { setScheme, IN, NO_IN } from '../input.js';
import { M, addToWorld, addStatic, addSensor, removeBody, removeFromWorld, drawWorld, CAT } from '../world.js';
import { SAVE, setFlag, flag, advanceTo } from '../save.js';
import { AUD } from '../audio.js';
import { HUD } from '../hud.js';
import { drawGirl, WHO } from '../chars.js';
import { drawPlane, drawRocket, drawActionBubble } from '../props.js';
import { SceneBase, PuzzleBase, makeWalker, bindWalkerSprite, NAV } from './base.js';

const W = 4700;
const GROUND = 1000;
const PANEL_X = 1350;
const TANKS_X = [2280, 2520, 2760];
const CHUTE_X = 2520;
const PAD_X = 3900;
const CRANE_ANCHOR = { x: PAD_X, y: 150 };
const CODE_ANSWER = [7, 2, 5];
const CODE_TEXT = ['3+4', '8-6', '1+4'];
const CRYSTAL_COLORS = ['#ff6bcb', '#39d7d0', '#ffd24a'];
const CRYSTAL_NAMES = ['ROSA', 'BLÅGRÖN', 'GULD'];

class SpaceportScene extends SceneBase {
  constructor() {
    super('spaceport');
    this.song = 'spaceport';
    this.gravity = GRAV.earth;
  }

  enter() {
    this.baseEnter();
    setScheme('walk', { action: true });

    addStatic(W / 2, GROUND + 60, W + 400, 120);
    addStatic(-40, VH / 2, 80, VH * 2);
    addStatic(W + 40, VH / 2, 80, VH * 2);

    this.done = { code: flag('spCode'), fuel: flag('spFuel'), cone: flag('spCone') };
    this.launching = false;
    this.launchT = 0;
    this.rocketY = 0;
    this.flame = 0;

    // Alice
    this.walker = makeWalker(320, 930);
    const w = this.walker;
    bindWalkerSprite(w, function (ctx, x, y, a, t) {
      drawGirl(ctx, x, y + 34, t, WHO.alice, { mode: w.mode, face: w.face, ph: w.ph });
    }, 6);

    // --- kod-pusslet ---
    this.dials = [0, 0, 0];
    this.dialTaps = 0;
    this.pzCode = new PuzzleBase('Räkna på fingrarna! Tre plus fyra blir… 🖐️➕');
    const self = this;
    this.pzCode.simplify = function () { self.showCodeGhost = true; };
    this.showCodeGhost = false;

    // --- kristall-pusslet ---
    this.tankCount = this.done.fuel ? [4, 4, 4] : [0, 0, 0];
    this.crystals = [];        // {body, colorIdx}
    this.funnelTarget = 1;
    this.funnelX = CHUTE_X;
    this.spawnT = 1;
    this.tankFlash = [0, 0, 0];
    this.pzFuel = new PuzzleBase('Titta på kristallens färg — tryck på tanken med SAMMA färg!');
    this.pzFuel.simplify = function () { self.autoSort = true; HUD.toast('Tratten hjälper dig nu! 💜'); };
    this.autoSort = false;

    // --- kran-pusslet ---
    this.coneState = this.done.cone ? 'done' : 'hanging';
    this.pzCone = new PuzzleBase('Släpp noskonen precis när den svänger ÖVER raketen!');
    this.pzCone.simplify = function () { self.slowSwing = true; };
    this.slowSwing = false;
    if (!this.done.cone) this.buildCrane();

    // sensor för noskonens träff på raketen
    this.rocketTopY = 800;
    if (!this.done.cone) {
      addSensor(PAD_X, this.rocketTopY, 130, 26, function (other) {
        if (self.coneState === 'falling' && other === self.coneBody) self.coneHit();
      });
    }

    // mynt
    this.coinRow(700, 930, 3, 70, 'silver');
    this.coinRow(1800, 930, 2, 70, 'silver');
    this.addCoin(3200, 900, 'gold');
    this.coinRow(4350, 930, 2, 70, 'silver');

    // bakgrund
    this.par = new Parallax();
    this.par.add(0.04, 2048, VH, drawDuskSky);
    this.par.add(0.2, 2048, 560, drawGantries, { y: 470 });

    this.updateObjective();
    if (!this.done.code && !this.done.fuel && !this.done.cone) {
      this.after(0.7, function () {
        HUD.dialog([
          { who: 'alice', text: 'Raketen är i tre bitar! Pappas lapp säger: koden, bränslet och noskonen.' },
          { who: 'alice', text: 'Jag fixar det här. Rymden, vänta på mig! 💪' }
        ]);
      });
    }
  }

  buildCrane() {
    // pendel med kedja + boll, noskonen hänger under
    const segs = 4, segLen = 72;
    this.pend = [];
    this.pendC = [];
    let prev = null;
    for (let i = 0; i < segs; i++) {
      const link = M.Bodies.circle(CRANE_ANCHOR.x, CRANE_ANCHOR.y + segLen * (i + 1), 7, {
        density: 0.002, frictionAir: 0.004, sleepThreshold: Infinity,
        collisionFilter: { category: CAT.DECOR, mask: 0 }
      });
      this.pend.push(link);
      addToWorld(link);
      const c = M.Constraint.create(i === 0
        ? { pointA: { x: CRANE_ANCHOR.x, y: CRANE_ANCHOR.y }, bodyB: link, length: segLen, stiffness: 0.95, damping: 0.01 }
        : { bodyA: prev, bodyB: link, length: segLen, stiffness: 0.95, damping: 0.01 });
      this.pendC.push(c);
      addToWorld(c);
      prev = link;
    }
    this.coneBody = M.Bodies.circle(CRANE_ANCHOR.x, CRANE_ANCHOR.y + segLen * (segs + 1), 34, {
      density: 0.004, frictionAir: 0.001, restitution: 0.35, sleepThreshold: Infinity,
      collisionFilter: { category: CAT.PROP, mask: CAT.TERRAIN | CAT.SENSOR }
    });
    addToWorld(this.coneBody);
    this.coneC = M.Constraint.create({ bodyA: prev, bodyB: this.coneBody, length: segLen, stiffness: 0.95, damping: 0.01 });
    addToWorld(this.coneC);
    // startknuff
    M.Body.setVelocity(this.coneBody, { x: 9, y: 0 });
    this.coneState = 'hanging';
  }

  coneHit() {
    const dx = Math.abs(this.coneBody.position.x - PAD_X);
    if (dx < 78) {
      this.coneState = 'done';
      this.done.cone = true;
      setFlag('spCone');
      removeBody(this.coneBody);
      for (let i = 0; i < this.pend.length; i++) removeBody(this.pend[i]);
      for (let i = 0; i < this.pendC.length; i++) removeFromWorld(this.pendC[i]);
      if (this.coneC) removeFromWorld(this.coneC);
      AUD.sfx('bigwin');
      PS.burst('star', PAD_X, this.rocketTopY - 40, 18, { color: PAL.gold, speed: 300 });
      this.cam.shake(6, 0.4);
      HUD.toast('Noskonen sitter! 🚀');
      this.pzCone.solve();
      this.updateObjective();
    } else {
      this.coneMiss();
    }
  }

  coneMiss() {
    if (this.coneState !== 'falling') return;
    this.coneState = 'failed';
    this.pzCone.fail();
    AUD.sfx('thump');
    const self = this;
    this.after(1.2, function () {
      if (self.coneState !== 'failed') return;
      // häng tillbaka konen
      M.Body.setPosition(self.coneBody, { x: CRANE_ANCHOR.x, y: CRANE_ANCHOR.y + 72 * 5 });
      M.Body.setVelocity(self.coneBody, { x: self.slowSwing ? 6 : 9, y: 0 });
      self.coneBody.frictionAir = 0.001;
      self.coneC = M.Constraint.create({ bodyA: self.pend[self.pend.length - 1], bodyB: self.coneBody, length: 72, stiffness: 0.95, damping: 0.01 });
      addToWorld(self.coneC);
      self.coneState = 'hanging';
    });
  }

  releaseCone() {
    if (this.coneState !== 'hanging') return;
    removeFromWorld(this.coneC);
    this.coneC = null;
    this.coneState = 'falling';
    // dämpa sidofarten så att konen faller nästan rakt ner (annars driver den långt)
    M.Body.setVelocity(this.coneBody, { x: this.coneBody.velocity.x * 0.25, y: this.coneBody.velocity.y });
    this.coneBody.frictionAir = 0.03;
    AUD.sfx('whoosh');
    const self = this;
    // om konen missar allt (studsar på marken)
    this.after(2.5, function () { if (self.coneState === 'falling') self.coneMiss(); });
  }

  updateObjective() {
    const parts = [];
    if (!this.done.code) parts.push('koden 🔢');
    if (!this.done.fuel) parts.push('bränslet 💎');
    if (!this.done.cone) parts.push('noskonen 🚀');
    if (parts.length === 0) HUD.objective('Tryck på startknappen! 🔴');
    else HUD.objective('Bygg raketen: ' + parts.join(' • '));
  }

  allDone() { return this.done.code && this.done.fuel && this.done.cone; }

  update(dt) {
    this.tick(dt);
    const inp = HUD.blocked() || this.launching ? NO_IN : IN;
    const w = this.walker;
    w.update(dt, inp);
    const p = w.pos();
    this.updateCoins(dt, p.x, p.y);

    // kamera
    this.cam.clampTo(0, -400, W, VH + 40);
    this.cam.follow(p.x, p.y - 160 - (this.launching ? 200 : 0), 0.1);
    this.cam.update(dt);

    // --- pendeln: pumpa gungningen ---
    if (this.coneState === 'hanging' && this.coneBody) {
      const b = this.coneBody;
      const amp = Math.abs(b.position.x - CRANE_ANCHOR.x);
      const targetAmp = this.slowSwing ? 200 : 300;
      if (amp < targetAmp && Math.abs(b.position.x - CRANE_ANCHOR.x) < 60) {
        const dir = b.velocity.x >= 0 ? 1 : -1;
        M.Body.applyForce(b, b.position, { x: dir * b.mass * 0.0016, y: 0 });
      }
    }

    // --- kristaller ---
    const nearFuel = p.x > 2000 && p.x < 3040;
    if (!this.done.fuel && nearFuel && !this.launching) {
      this.spawnT -= dt;
      if (this.spawnT <= 0 && this.crystals.length < 3) {
        this.spawnT = this.autoSort ? 2.2 : 1.9;
        // välj färg bland dem som fortfarande behövs
        const need = [];
        for (let i = 0; i < 3; i++) if (this.tankCount[i] < 4) need.push(i);
        const colorIdx = need[Math.floor(Math.random() * need.length)];
        const body = M.Bodies.circle(CHUTE_X + rand(-8, 8), 330, 24, {
          density: 0.001, frictionAir: 0.045, restitution: 0.2,
          collisionFilter: { category: CAT.PROP, mask: CAT.TERRAIN }
        });
        addToWorld(body);
        this.crystals.push({ body: body, colorIdx: colorIdx });
        if (this.autoSort) this.funnelTarget = colorIdx;
      }
    }
    // styr kristaller mot tratten och räkna träffar
    this.funnelX = lerp(this.funnelX, TANKS_X[this.funnelTarget], 1 - Math.exp(-8 * dt));
    for (let i = this.crystals.length - 1; i >= 0; i--) {
      const c = this.crystals[i];
      const b = c.body;
      if (b.position.y > 560 && b.position.y < 760) {
        const nx = lerp(b.position.x, this.funnelX, 1 - Math.exp(-6 * dt));
        M.Body.setPosition(b, { x: nx, y: b.position.y });
      }
      if (b.position.y > 880) {
        // vilken tank?
        let tank = -1;
        for (let ti = 0; ti < 3; ti++) if (Math.abs(b.position.x - TANKS_X[ti]) < 90) tank = ti;
        removeBody(b);
        this.crystals.splice(i, 1);
        if (tank === c.colorIdx && this.tankCount[tank] < 4) {
          this.tankCount[tank]++;
          AUD.sfx('gem');
          PS.burst('sparkle', TANKS_X[tank], 900, 8, { color: CRYSTAL_COLORS[tank], speed: 150 });
          let full = true;
          for (let ti = 0; ti < 3; ti++) if (this.tankCount[ti] < 4) full = false;
          if (full) {
            this.done.fuel = true;
            setFlag('spFuel');
            this.pzFuel.solve();
            HUD.toast('Tankarna är fulla! 💎');
            this.updateObjective();
          }
        } else {
          AUD.sfx('crack');
          PS.burst('chunk', b.position.x, 900, 10, { color: CRYSTAL_COLORS[c.colorIdx], speed: 220, g: 500 });
          if (tank >= 0) this.tankFlash[tank] = 0.7;
          this.pzFuel.fail();
        }
      }
    }
    for (let i = 0; i < 3; i++) if (this.tankFlash[i] > 0) this.tankFlash[i] -= dt;

    // --- interaktion ---
    this.near = null;
    if (!this.launching && !HUD.blocked()) {
      if (this.coneState === 'hanging' && p.x > PAD_X - 500 && p.x < PAD_X + 400) {
        this.near = { kind: 'crane', x: PAD_X - 240, y: 700 };
      } else if (this.allDone() && Math.abs(p.x - (PAD_X - 320)) < 160) {
        this.near = { kind: 'launch', x: PAD_X - 320, y: 760 };
      }
      if (inp.actionEdge && this.near) {
        if (this.near.kind === 'crane') this.releaseCone();
        else if (this.near.kind === 'launch') this.startLaunch();
      }
    }

    // --- uppskjutning ---
    if (this.launching) {
      this.launchT += dt;
      const t = this.launchT;
      if (t > 2.8) {
        this.flame = Math.min(1, this.flame + dt * 1.2);
        this.cam.shake(5, 0.2);
        if (t > 3.6) this.rocketY += (t - 3.6) * (t - 3.6) * 260 * dt * 8;
        if (Math.random() < 0.7) {
          PS.spawn('smoke', PAD_X + rand(-80, 80), 980, { color: '#d8d0e0', vx: rand(-160, 160), vy: rand(-40, -10), size: rand(14, 26), life: 1.4 });
        }
      }
      if (this.rocketY > 1500 && !this.wentAway) {
        this.wentAway = true;
        advanceTo('travel_moon');
        NAV.go('travel_moon');
      }
    }
  }

  startLaunch() {
    if (this.launching) return;
    this.launching = true;
    this.launchT = 0;
    this.wentAway = false;
    this.walker.spr.hidden = true;   // Alice kliver ombord
    PS.burst('sparkle', PAD_X - 60, 900, 16, { color: '#fff', speed: 200 });
    AUD.sfx('unlock');
    const self = this;
    this.after(0.4, function () { HUD.toast('3…'); AUD.sfx('click'); });
    this.after(1.2, function () { HUD.toast('2…'); AUD.sfx('click'); });
    this.after(2.0, function () { HUD.toast('1…'); AUD.sfx('click'); });
    this.after(2.8, function () { HUD.toast('UPPSKJUTNING! 🚀'); AUD.sfx('bigwin'); });
  }

  onTap(x, y) {
    if (HUD.blocked() || this.launching) return;
    const wx = x - this.cam.ox, wy = y - this.cam.oy;
    const p = this.walker.pos();

    // koddialer
    if (!this.done.code && Math.abs(p.x - PANEL_X) < 420) {
      for (let i = 0; i < 3; i++) {
        const dx = PANEL_X - 160 + i * 160;
        if (Math.abs(wx - dx) < 70 && Math.abs(wy - 810) < 90) {
          this.dials[i] = (this.dials[i] + 1) % 10;
          this.dialTaps++;
          AUD.sfx('click');
          if (this.dialTaps === 14) this.pzCode.fail(true);
          if (this.dialTaps === 26) { this.pzCode.fail(true); this.pzCode.fail(true); this.pzCode.fail(true); }
          if (this.dials[0] === CODE_ANSWER[0] && this.dials[1] === CODE_ANSWER[1] && this.dials[2] === CODE_ANSWER[2]) {
            this.done.code = true;
            setFlag('spCode');
            this.pzCode.solve();
            HUD.toast('Koden stämmer! 🔓');
            PS.burst('star', PANEL_X, 640, 14, { color: PAL.gold, speed: 240 });
            this.updateObjective();
          }
          return;
        }
      }
    }
    // tankval
    if (!this.done.fuel && !this.autoSort) {
      for (let i = 0; i < 3; i++) {
        if (Math.abs(wx - TANKS_X[i]) < 110 && wy > 700 && wy < 1000) {
          this.funnelTarget = i;
          AUD.sfx('pop');
          return;
        }
      }
    }
    // kran + startknapp via tryck
    if (this.near && this.near.kind === 'crane' && wx > PAD_X - 500 && wx < PAD_X + 400 && wy < 800) {
      this.releaseCone();
    } else if (this.near && this.near.kind === 'launch' && Math.abs(wx - (PAD_X - 320)) < 120 && Math.abs(wy - 840) < 120) {
      this.startLaunch();
    }
  }

  draw(ctx, alpha, t) {
    this.par.draw(ctx, this.cam.x, this.cam.y * 0.2, QY.layersMax());
    this.cam.begin(ctx);

    // mark: betong + sand
    const x0 = Math.max(0, this.cam.x - view.w / 2 - 60);
    const x1 = Math.min(W + 200, this.cam.x + view.w / 2 + 60);
    ctx.fillStyle = '#c9a86a';
    ctx.fillRect(x0, GROUND, x1 - x0, 140);
    ctx.fillStyle = '#8f8a96';
    ctx.fillRect(Math.max(x0, 1000), GROUND - 6, Math.min(x1, 4400) - Math.max(x0, 1000), 30);

    // parkerat flygplan
    drawPlane(ctx, 380, GROUND - 36, 0, t, { spin: 0, alice: false });

    // --- kodpanelen ---
    drawCodeShack(ctx, t, this.dials, this.done.code, this.showCodeGhost);

    // --- kristallstationen ---
    drawFuelStation(ctx, t, this);

    // --- kran + raket ---
    drawCraneTower(ctx, t, this);
    const rocketDrawY = GROUND - 130 - this.rocketY;
    drawRocket(ctx, PAD_X, rocketDrawY, 0, t, {
      cone: this.done.cone, alice: this.launching, flame: this.flame, scale: 1.5
    });
    // startkonsol
    if (this.allDone() && !this.wentAway) {
      const bx = PAD_X - 320, by = GROUND - 80;
      ctx.fillStyle = '#3a3f52';
      rr(ctx, bx - 50, by - 60, 100, 120, 12);
      ctx.fill();
      const pulse = 1 + Math.sin(t * 5) * 0.12;
      glow(ctx, bx, by - 20, 60 * pulse, '#ff4040', 0.5);
      ctx.fillStyle = this.launching ? '#7a2020' : '#ff3030';
      ctx.beginPath();
      ctx.arc(bx, by - 20, 26 * (this.launching ? 0.92 : pulse), 0, TAU);
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 3;
      ctx.stroke();
      txt(ctx, 'START', bx, by + 38, { size: 22, bold: true, color: '#ffd24a' });
    }

    drawWorld(ctx, alpha, t);

    // noskonen (ritas ovanpå sin fysikcirkel)
    if (this.coneBody && this.coneState !== 'done') {
      const b = this.coneBody;
      drawConeShape(ctx, b.position.x, b.position.y, b.angle, this.coneState === 'hanging' ? Math.sin(t) * 0.04 : 0);
      // släpp-fönster efter några missar
      if (this.pzCone.attempts >= 3 && this.coneState === 'hanging') {
        const inWin = Math.abs(b.position.x - PAD_X) < 62;
        ctx.save();
        ctx.globalAlpha = inWin ? 0.85 : 0.25;
        ctx.strokeStyle = inWin ? '#59d666' : '#ffffff';
        ctx.lineWidth = 6;
        ctx.setLineDash([14, 10]);
        ctx.strokeRect(PAD_X - 70, this.rocketTopY - 380, 140, 360);
        ctx.setLineDash([]);
        if (inWin) txt(ctx, 'SLÄPP NU!', PAD_X, this.rocketTopY - 400, { size: 34, bold: true, color: '#59d666', stroke: 'rgba(0,40,0,0.7)', strokeW: 6 });
        ctx.restore();
      }
    }

    if (this.near && !HUD.blocked()) drawActionBubble(ctx, this.near.x, this.near.y, t);

    this.drawCoins(ctx, t);
    PS.draw(ctx);
    this.cam.end(ctx);

    // countdown-text i mitten
    if (this.launching && this.launchT < 2.8) {
      const n = this.launchT < 1.2 ? '3' : this.launchT < 2.0 ? '2' : '1';
      txt(ctx, n, view.w / 2, VH * 0.4, { size: 220, bold: true, color: '#fff', stroke: 'rgba(80,20,100,0.8)', strokeW: 18, alpha: 0.9 });
    }
  }
}

function drawConeShape(ctx, x, y, angle, wob) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle + wob);
  const cg = ctx.createLinearGradient(-30, -30, 30, 30);
  cg.addColorStop(0, '#ff9ed9');
  cg.addColorStop(1, '#e84f9e');
  ctx.fillStyle = cg;
  ctx.beginPath();
  ctx.moveTo(-36, 26);
  ctx.quadraticCurveTo(-20, -30, 0, -40);
  ctx.quadraticCurveTo(20, -30, 36, 26);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#a82e74';
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.fillStyle = '#ffd24a';
  starPath(ctx, 0, -6, 11, 5, 5, -Math.PI / 2);
  ctx.fill();
  ctx.restore();
}

function drawCodeShack(ctx, t, dials, done, ghost) {
  const x = PANEL_X;
  // bod
  ctx.fillStyle = '#5a5f74';
  rr(ctx, x - 260, 520, 520, 480, 18);
  ctx.fill();
  ctx.strokeStyle = '#3a3f52';
  ctx.lineWidth = 5;
  ctx.stroke();
  txt(ctx, '🔢 KONTROLLRUM', x, 562, { size: 30, bold: true, color: '#ffd24a' });
  txt(ctx, 'Pappas kod 💜', x, 606, { size: 22, color: '#b9a8d8' });
  // varje tal på en egen lapp RAKT OVANFÖR sin ratt
  for (let i = 0; i < 3; i++) {
    const dx = x - 160 + i * 160;
    const ok = done;
    // lapp med talet
    ctx.save();
    ctx.translate(dx, 662);
    ctx.rotate((i - 1) * 0.02);
    ctx.fillStyle = '#fff8e8';
    rr(ctx, -64, -32, 128, 64, 10);
    ctx.fill();
    ctx.strokeStyle = '#d0c0a0';
    ctx.lineWidth = 2;
    ctx.stroke();
    txt(ctx, CODE_TEXT[i], 0, 1, { size: 36, bold: true, color: '#6a4a8a' });
    ctx.restore();
    // pil ner till ratten
    txt(ctx, '▼', dx, 716, { size: 24, color: '#ffd24a', alpha: ok ? 0.4 : 0.6 + 0.3 * Math.sin(t * 4 + i) });
    // ratt
    rr(ctx, dx - 55, 810 - 70, 110, 140, 16);
    ctx.fillStyle = ok ? '#2a5e3a' : '#20242f';
    ctx.fill();
    ctx.strokeStyle = ok ? '#59d666' : '#ffd24a';
    ctx.lineWidth = 4;
    ctx.stroke();
    txt(ctx, String(dials[i]), dx, 810, { size: 72, bold: true, color: ok ? '#a8ffb8' : '#fff' });
    if (!ok && ghost) {
      txt(ctx, String(CODE_ANSWER[i]), dx + 38, 762, { size: 24, color: '#59d666', alpha: 0.5 });
    }
  }
  if (done) txt(ctx, 'UPPLÅST ✅', x, 946, { size: 30, bold: true, color: '#59d666' });
}

function drawFuelStation(ctx, t, sc) {
  // ränna uppifrån
  ctx.fillStyle = '#6a7284';
  rr(ctx, CHUTE_X - 60, 180, 120, 150, 14);
  ctx.fill();
  ctx.fillStyle = '#4a5262';
  ctx.beginPath();
  ctx.moveTo(CHUTE_X - 60, 330);
  ctx.lineTo(CHUTE_X + 60, 330);
  ctx.lineTo(CHUTE_X + 26, 400);
  ctx.lineTo(CHUTE_X - 26, 400);
  ctx.closePath();
  ctx.fill();
  txt(ctx, '💎 KRISTALLER', CHUTE_X, 150, { size: 26, bold: true, color: '#c9f0ff' });

  // tratt (följer valet)
  const fx = sc.funnelX;
  ctx.save();
  ctx.globalAlpha = 0.9;
  const fg = ctx.createLinearGradient(fx - 70, 600, fx + 70, 600);
  for (let i = 0; i < RAINBOW.length; i++) fg.addColorStop(i / 6, RAINBOW[i]);
  ctx.fillStyle = fg;
  ctx.beginPath();
  ctx.moveTo(fx - 78, 600);
  ctx.lineTo(fx + 78, 600);
  ctx.lineTo(fx + 26, 668);
  ctx.lineTo(fx - 26, 668);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.restore();

  // tankar
  for (let i = 0; i < 3; i++) {
    const txp = TANKS_X[i];
    const col = CRYSTAL_COLORS[i];
    const flash = sc.tankFlash[i] > 0;
    ctx.save();
    if (flash) ctx.globalAlpha = 0.6 + 0.4 * Math.sin(t * 30);
    // glas
    ctx.fillStyle = 'rgba(200,230,255,0.25)';
    rr(ctx, txp - 80, 760, 160, 240, 18);
    ctx.fill();
    ctx.strokeStyle = flash ? '#ff4040' : col;
    ctx.lineWidth = 5;
    ctx.stroke();
    // lock i färgen
    ctx.fillStyle = col;
    rr(ctx, txp - 88, 736, 176, 28, 10);
    ctx.fill();
    // innehåll: staplade kristaller
    for (let n = 0; n < sc.tankCount[i]; n++) {
      drawGem(ctx, txp - 40 + (n % 2) * 80, 962 - Math.floor(n / 2) * 68 - 20, 26, col, t + n);
    }
    txt(ctx, sc.tankCount[i] + '/4', txp, 1030, { size: 26, bold: true, color: col });
    ctx.restore();
  }

  // fallande kristaller
  for (let i = 0; i < sc.crystals.length; i++) {
    const c = sc.crystals[i];
    drawGem(ctx, c.body.position.x, c.body.position.y, 26, CRYSTAL_COLORS[c.colorIdx], t + i);
    glow(ctx, c.body.position.x, c.body.position.y, 44, CRYSTAL_COLORS[c.colorIdx], 0.3);
  }
}

function drawCraneTower(ctx, t, sc) {
  // torn bredvid plattan
  ctx.strokeStyle = '#8a5a2b';
  ctx.fillStyle = '#a86a32';
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.moveTo(PAD_X + 290, GROUND);
  ctx.lineTo(PAD_X + 250, 130);
  ctx.lineTo(PAD_X - 40, 130);
  ctx.stroke();
  // kryssträvor
  ctx.lineWidth = 4;
  for (let y = GROUND - 80; y > 200; y -= 120) {
    ctx.beginPath();
    ctx.moveTo(PAD_X + 300 - (GROUND - y) * 0.046, y);
    ctx.lineTo(PAD_X + 240 - (GROUND - y) * 0.046, y - 60);
    ctx.stroke();
  }
  // upphängningspunkt
  ctx.fillStyle = '#5a3f28';
  ctx.beginPath();
  ctx.arc(CRANE_ANCHOR.x, CRANE_ANCHOR.y, 12, 0, TAU);
  ctx.fill();
  // kedjan
  if (sc.coneBody && sc.coneState === 'hanging') {
    ctx.strokeStyle = '#c8ccd8';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(CRANE_ANCHOR.x, CRANE_ANCHOR.y);
    for (let i = 0; i < sc.pend.length; i++) {
      ctx.lineTo(sc.pend[i].position.x, sc.pend[i].position.y);
    }
    ctx.lineTo(sc.coneBody.position.x, sc.coneBody.position.y - 30);
    ctx.stroke();
  }
  // launchpad-fundament
  ctx.fillStyle = '#6a7284';
  rr(ctx, PAD_X - 150, GROUND - 26, 300, 26, 8);
  ctx.fill();
}

function drawDuskSky(c, w, h) {
  const g = c.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#251448');
  g.addColorStop(0.45, '#4a2a72');
  g.addColorStop(0.75, '#a8527e');
  g.addColorStop(1, '#ff9d78');
  c.fillStyle = g;
  c.fillRect(0, 0, w, h);
  c.fillStyle = 'rgba(255,255,255,0.75)';
  for (let i = 0; i < 130; i++) {
    c.beginPath();
    c.arc(Math.random() * w, Math.random() * h * 0.55, Math.random() * 1.6 + 0.4, 0, TAU);
    c.fill();
  }
  // månen har gått upp — dit ska vi!
  const mg = c.createRadialGradient(1650, 210, 20, 1650, 210, 90);
  mg.addColorStop(0, '#fff8d8');
  mg.addColorStop(1, '#e8d89a');
  c.fillStyle = mg;
  c.beginPath(); c.arc(1650, 210, 74, 0, TAU); c.fill();
}

function drawGantries(c, w, h) {
  c.fillStyle = 'rgba(30,20,50,0.85)';
  // silhuetter av master och byggnader (periodiskt)
  for (let i = 0; i < 6; i++) {
    const x = 100 + i * 340;
    const hh = 160 + (i % 3) * 90;
    c.fillRect(x, h - hh, 26, hh);
    c.fillRect(x - 30, h - hh + 40, 86, 12);
    if (i % 2 === 0) {
      c.beginPath();
      c.arc(x + 13, h - hh - 8, 6, 0, TAU);
      c.fill();
    }
  }
  c.fillRect(0, h - 60, w, 60);
}

export const spaceportScene = new SpaceportScene();
