// Rymdfärden: karta över solsystemet → fri raketflygning (rotera + thrust)
// genom asteroidfält → mjuklandning på målet. En instans per resa.

import { VH, GRAV, PAL, RAINBOW, TAU, rand, clamp, lerp, dist } from '../config.js';
import { view, makeCanvas, Parallax, PS, txt, glow, QY, rr, starPath } from '../render.js';
import { setScheme, IN, NO_IN } from '../input.js';
import { M, addToWorld, setGravity, CAT } from '../world.js';
import { SAVE, advanceTo, flag } from '../save.js';
import { AUD } from '../audio.js';
import { HUD } from '../hud.js';
import { drawRocket } from '../props.js';
import { SceneBase, NAV } from './base.js';

const LEN = 9200;

const STOPS = ['earth', 'moon', 'asteroid', 'europa', 'saturn', 'neptune'];
const MAP_POS = {
  earth: { x: 380, y: 700 }, moon: { x: 620, y: 400 },
  asteroid: { x: 920, y: 640 }, europa: { x: 1180, y: 380 },
  saturn: { x: 1460, y: 660 }, neptune: { x: 1760, y: 320 }
};
const CFG = {
  moon: {
    name: 'Månen', emoji: '🌙', from: 'earth', grav: GRAV.moon, next: 'moon',
    tint: '#241a44', ground: ['#c8c4d4', '#8a8698'],
    intro: 'Först: Månen! Där bor Draculaura i sitt fladdermus-slott! 🦇'
  },
  asteroid: {
    name: 'Guldasteroiden', emoji: '⭐', from: 'moon', grav: GRAV.asteroid, next: 'asteroid',
    tint: '#2a1c34', ground: ['#e8c87a', '#a8842a'],
    intro: 'Nu till Guldasteroiden — Nastya har en rymdbutik där! 🪙'
  },
  europa: {
    name: 'Vattenmånen Europa', emoji: '💧', from: 'asteroid', grav: GRAV.europa, next: 'europa',
    tint: '#122240', ground: ['#cfe8ff', '#6aa8d8'],
    intro: 'Vattenmånen Europa! Under isen simmar sjöjungfrun Melinda! 🧜‍♀️'
  },
  saturn: {
    name: 'Saturnus ringar', emoji: '🪐', from: 'europa', grav: GRAV.saturn, next: 'saturn',
    tint: '#2c1c3e', ground: ['#ffe0b3', '#c89a5a'],
    intro: 'Saturnus ringar — som en regnbågsväg i rymden! Där bor enhörningen Stella! 🦄'
  },
  neptune: {
    name: 'Neptunus', emoji: '❄️', from: 'saturn', grav: GRAV.neptune, next: 'neptune',
    tint: '#0c1634', ground: ['#9ecbff', '#3a6ac8'],
    intro: 'Neptunus — den kallaste planeten. Håll ut pappa, jag kommer! 💜'
  }
};

class TravelScene extends SceneBase {
  constructor(target) {
    super('travel_' + target);
    this.song = 'space';
    this.gravity = 0;
    this.cfg = CFG[target];
    this.target = target;
  }

  enter() {
    this.baseEnter();
    this.phase = 'map';
    this.mapT = 0;
    this.goBtn = null;
    setScheme('none');
    HUD.objective('Karta: nästa stopp — ' + this.cfg.name + ' ' + this.cfg.emoji);

    // stjärnhimmel byggs för flygfasen
    this.par = new Parallax();
    const tint = this.cfg.tint;
    this.par.add(0.0, 2048, VH, function (c, w, h) { drawSpaceBg(c, w, h, tint); });
    this.par.add(0.12, 2048, VH, function (c, w, h) { drawStars(c, w, h, 90, 1.6); });
    this.par.add(0.3, 2048, VH, function (c, w, h) { drawStars(c, w, h, 55, 2.6); });

    this.rocket = null;
    this.landed = false;
    this.bounces = 0;
  }

  startFly() {
    this.phase = 'fly';
    setScheme('rocket');
    setGravity(0);
    this.rocket = M.Bodies.rectangle(400, 540, 64, 170, {
      density: 0.001, frictionAir: 0.012, sleepThreshold: Infinity,
      collisionFilter: { category: CAT.PLAYER, mask: CAT.TERRAIN }
    });
    addToWorld(this.rocket);
    M.Body.setAngle(this.rocket, Math.PI / 2 * 0); // näsan uppåt; vi roterar till höger direkt
    M.Body.setAngle(this.rocket, 0.9);

    // asteroider (kinematiska — endast visuella kollisioner)
    this.rocks = [];
    const beltDense = this.target === 'asteroid';
    const n = beltDense ? 16 : 9;
    for (let i = 0; i < n; i++) {
      this.rocks.push({
        x: 2200 + (i / n) * (LEN - 3800) + rand(-300, 300),
        y: rand(80, 1000),
        r: rand(34, 78),
        vx: rand(-24, 24), vy: rand(-18, 18),
        rot: rand(0, TAU), vr: rand(-0.6, 0.6),
        bumpT: 0, seed: Math.random() * 100
      });
    }

    // stjärnmynt i banor
    for (let a = 0; a < 5; a++) {
      const ax = 1400 + a * 1500;
      const ay = 200 + (a % 3) * 280;
      for (let i = 0; i < 5; i++) {
        this.addCoin(ax + i * 100, ay + Math.sin(i / 4 * Math.PI) * 90, (a === 2 && i === 2) ? 'gold' : 'silver');
      }
    }

    HUD.objective('→ ' + this.cfg.name + ' ' + this.cfg.emoji + '  0%');
    if (!flag('trav_' + this.target)) {
      HUD.dialog([{ who: 'alice', text: this.cfg.intro }]);
      // markera intro som visad utan att spara-fila i onödan
      SAVE.flags['trav_' + this.target] = true;
    }
  }

  update(dt) {
    this.tick(dt);
    if (this.phase === 'map') {
      this.mapT += dt;
      return;
    }

    const inp = HUD.blocked() ? NO_IN : IN;
    const b = this.rocket;
    const p = b.position;

    // styrning
    let av = 0;
    if (inp.rotL) av -= 2.4;
    if (inp.rotR) av += 2.4;
    M.Body.setAngularVelocity(b, av !== 0 ? av * 0.016 * 60 * 0.028 : b.angularVelocity * 0.9);
    if (inp.thrust) {
      const fx = Math.sin(b.angle) * b.mass * 0.0035;
      const fy = -Math.cos(b.angle) * b.mass * 0.0035;
      M.Body.applyForce(b, p, { x: fx, y: fy });
      AUD.loop('thrust', true, 0.22);
      const bx = p.x - Math.sin(b.angle) * 100;
      const by = p.y + Math.cos(b.angle) * 100;
      PS.spawn('flame', bx, by, { vx: Math.sin(b.angle) * -240 + rand(-40, 40), vy: Math.cos(b.angle) * 240 + rand(-40, 40), size: rand(6, 11), life: 0.4 });
    } else {
      AUD.loop('thrust', false);
    }

    // fartgräns + mjuka väggar
    const spd = Math.sqrt(b.velocity.x * b.velocity.x + b.velocity.y * b.velocity.y);
    if (spd > 15) M.Body.setVelocity(b, { x: b.velocity.x * 15 / spd, y: b.velocity.y * 15 / spd });
    if (this.phase === 'fly') {
      if (p.y < 60) M.Body.applyForce(b, p, { x: 0, y: b.mass * 0.002 });
      if (p.y > 1020) M.Body.applyForce(b, p, { x: 0, y: -b.mass * 0.002 });
      if (p.x < 120) M.Body.applyForce(b, p, { x: b.mass * 0.002, y: 0 });
    }

    // asteroider
    if (this.rocks) {
      for (let i = 0; i < this.rocks.length; i++) {
        const rk = this.rocks[i];
        rk.x += rk.vx * dt;
        rk.y += rk.vy * dt;
        rk.rot += rk.vr * dt;
        if (rk.y < 40 || rk.y > 1040) rk.vy = -rk.vy;
        if (rk.bumpT > 0) rk.bumpT -= dt;
        const d = dist(p.x, p.y, rk.x, rk.y);
        if (d < rk.r + 70 && rk.bumpT <= 0) {
          rk.bumpT = 0.8;
          // knuffa isär — snällt, ingen skada
          const nx = (p.x - rk.x) / d, ny = (p.y - rk.y) / d;
          M.Body.setVelocity(b, { x: b.velocity.x * 0.3 + nx * 7, y: b.velocity.y * 0.3 + ny * 7 });
          this.cam.shake(9, 0.4);
          AUD.sfx('thump');
          PS.burst('chunk', (p.x + rk.x) / 2, (p.y + rk.y) / 2, 7, { color: '#8a8296', speed: 200 });
        }
      }
    }

    this.updateCoins(dt, p.x, p.y);

    // progress + landningsfas
    if (this.phase === 'fly') {
      const prog = clamp(Math.round(p.x / (LEN - 1400) * 100), 0, 100);
      HUD.objective('→ ' + this.cfg.name + ' ' + this.cfg.emoji + '  ' + prog + '%');
      if (p.x > LEN - 1400) {
        this.phase = 'land';
        setGravity(this.cfg.grav);
        HUD.objective('Landa mjukt på plattan! 🛬');
        HUD.toast(this.cfg.name + '! Sakta ner… ⬇️');
      }
    } else if (this.phase === 'land') {
      // marken finns bara i landningszonen
      const gy = 940;
      if (p.y > gy - 95) {
        const onPad = Math.abs(p.x - (LEN - 400)) < 220;
        const soft = b.velocity.y < 5 && Math.abs(b.velocity.x) < 3.4 && Math.abs(normAng(b.angle)) < 0.5;
        if (onPad && soft && !this.landed) {
          this.landed = true;
          M.Body.setPosition(b, { x: p.x, y: gy - 95 });
          M.Body.setVelocity(b, { x: 0, y: 0 });
          M.Body.setAngle(b, 0);
          M.Body.setStatic(b, true);
          AUD.loop('thrust', false);
          AUD.sfx('fanfare');
          PS.burst('star', p.x, gy - 40, 16, { color: PAL.gold, speed: 260 });
          const self = this;
          this.after(1.1, function () {
            advanceTo(self.cfg.next);
            NAV.go(self.cfg.next);
          });
        } else if (!this.landed) {
          // studs + pedagogiskt tips
          M.Body.setPosition(b, { x: p.x, y: gy - 100 });
          M.Body.setVelocity(b, { x: b.velocity.x * 0.5, y: -Math.abs(b.velocity.y) * 0.45 - 2 });
          this.bounces++;
          this.cam.shake(10, 0.4);
          AUD.sfx('thump');
          if (!onPad) HUD.toast('Sikta på plattan med flaggan! 🚩');
          else if (Math.abs(normAng(b.angle)) >= 0.5) HUD.toast('Håll raketen RAK — pilknapparna! ↺↻');
          else HUD.toast('För fort! Bromsa med elden under dig 🔥');
          if (this.bounces === 4) HUD.hint('Elden bromsar fallet: peka raketen uppåt och tryck 🔥 i korta puffar!');
        }
      }
      if (p.x > LEN + 200) M.Body.setPosition(b, { x: LEN + 200, y: p.y });
    }

    // kamera
    this.cam.clampTo(0, -100, LEN + 500, VH + 100);
    this.cam.follow(p.x + 200, p.y, 0.08);
    this.cam.update(dt);
  }

  onTap(x, y) {
    if (this.phase === 'map' && this.goBtn) {
      const bconst = this.goBtn;
      if (x > bconst.x && x < bconst.x + bconst.w && y > bconst.y && y < bconst.y + bconst.h) {
        AUD.sfx('click');
        this.startFly();
      }
    }
  }

  exit() {
    AUD.loop('thrust', false);
  }

  draw(ctx, alpha, t) {
    if (this.phase === 'map') {
      this.drawMap(ctx, t);
      return;
    }

    this.par.draw(ctx, this.cam.x, this.cam.y * 0.15, QY.layersMax());
    this.cam.begin(ctx);

    // målet växer i fjärran
    this.drawDestination(ctx, t);

    // asteroider
    if (this.rocks) {
      for (let i = 0; i < this.rocks.length; i++) {
        const rk = this.rocks[i];
        if (!this.cam.visible(rk.x, rk.y, 160)) continue;
        drawRock(ctx, rk, t);
      }
    }

    this.drawCoins(ctx, t);

    // raketen
    const b = this.rocket;
    drawRocket(ctx, b.position.x, b.position.y, b.angle, t, {
      alice: true, flame: (IN.thrust && !HUD.blocked() && !this.landed) ? 1 : 0, scale: 0.9
    });

    PS.draw(ctx);
    this.cam.end(ctx);
  }

  drawDestination(ctx, t) {
    const cfg = this.cfg;
    const px = LEN - 400;
    if (this.phase === 'land' || this.cam.x > LEN - 2600) {
      // planetens yta: stor båge + platta
      const R = 4200;
      ctx.fillStyle = cfg.ground[1];
      ctx.beginPath();
      ctx.arc(px, 940 + R - 60, R, 0, TAU);
      ctx.fill();
      const g = ctx.createLinearGradient(0, 800, 0, 1100);
      g.addColorStop(0, cfg.ground[0]);
      g.addColorStop(1, cfg.ground[1]);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(px, 940 + R - 40, R, Math.PI * 1.42, Math.PI * 1.58);
      ctx.lineTo(px + 2100, 1300);
      ctx.lineTo(px - 2100, 1300);
      ctx.closePath();
      ctx.fill();
      // yt-detaljer
      if (this.target === 'moon' || this.target === 'asteroid') {
        ctx.fillStyle = 'rgba(0,0,0,0.15)';
        for (let i = -3; i <= 3; i++) {
          ctx.beginPath();
          ctx.ellipse(px + i * 300 + 80, 985 + Math.abs(i) * 12, 46, 15, 0, 0, TAU);
          ctx.fill();
        }
      }
      // landningsplatta med flagga
      ctx.fillStyle = '#3a3f52';
      rr(ctx, px - 220, 930, 440, 26, 10);
      ctx.fill();
      ctx.strokeStyle = PAL.gold;
      ctx.lineWidth = 3;
      ctx.stroke();
      for (let i = 0; i < 4; i++) {
        const on = (Math.floor(t * 3) + i) % 4 === 0;
        ctx.fillStyle = on ? '#ffd24a' : '#6a5a20';
        ctx.beginPath();
        ctx.arc(px - 160 + i * 110, 928, 7, 0, TAU);
        ctx.fill();
      }
      ctx.strokeStyle = '#c8ccd8';
      ctx.lineWidth = 5;
      ctx.beginPath(); ctx.moveTo(px + 260, 930); ctx.lineTo(px + 260, 800); ctx.stroke();
      ctx.fillStyle = '#ff4d6d';
      ctx.beginPath();
      ctx.moveTo(px + 260, 800);
      ctx.lineTo(px + 340, 822);
      ctx.lineTo(px + 260, 844);
      ctx.closePath();
      ctx.fill();
    } else {
      // liten version i fjärran som växer med närhet
      const k = clamp((this.cam.x - (LEN - 5600)) / 3000, 0, 1);
      const size = 60 + k * 300;
      const sx = this.cam.x + view.w / 2 - 200 - k * 60;
      drawPlanetIcon(ctx, this.target, sx, 300, size, t);
    }
  }

  drawMap(ctx, t) {
    // bakgrund
    const g = ctx.createLinearGradient(0, 0, 0, VH);
    g.addColorStop(0, '#0b0518');
    g.addColorStop(1, '#1c1040');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, view.w, VH);
    // stjärnor
    for (let i = 0; i < 90; i++) {
      const sx = (i * 397.3) % 1900, sy = (i * 211.7) % 900;
      ctx.globalAlpha = 0.3 + 0.5 * (0.5 + 0.5 * Math.sin(t * 2 + i));
      ctx.fillStyle = '#fff';
      ctx.fillRect((view.w - 1920) / 2 + sx, 60 + sy, 2.4, 2.4);
    }
    ctx.globalAlpha = 1;

    const ox = (view.w - 1920) / 2;
    txt(ctx, '🗺️ RYMDKARTAN', view.w / 2, 170, { size: 56, bold: true, color: PAL.gold, stroke: 'rgba(40,16,0,0.7)', strokeW: 8 });

    // solen
    glow(ctx, ox + 120, 540, 190, '#ffd24a', 0.5);
    ctx.fillStyle = '#ffe9a8';
    ctx.beginPath(); ctx.arc(ox + 120, 540, 95, 0, TAU); ctx.fill();

    // rutt
    const idx = STOPS.indexOf(this.target);
    ctx.setLineDash([16, 14]);
    ctx.lineDashOffset = -t * 40;
    for (let i = 0; i < STOPS.length - 1; i++) {
      const a = MAP_POS[STOPS[i]], b2 = MAP_POS[STOPS[i + 1]];
      const done = i < idx - 1 + 1 && i + 1 <= idx;
      ctx.strokeStyle = i + 1 < idx ? 'rgba(89,214,102,0.7)' : (i + 1 === idx ? PAL.gold : 'rgba(255,255,255,0.2)');
      ctx.lineWidth = i + 1 === idx ? 7 : 4;
      ctx.beginPath();
      ctx.moveTo(ox + a.x, a.y);
      ctx.quadraticCurveTo(ox + (a.x + b2.x) / 2, (a.y + b2.y) / 2 - 90, ox + b2.x, b2.y);
      ctx.stroke();
    }
    ctx.setLineDash([]);

    // stopp
    for (let i = 0; i < STOPS.length; i++) {
      const id = STOPS[i];
      const p = MAP_POS[id];
      const isTarget = id === this.target;
      const passed = i < idx;
      drawPlanetIcon(ctx, id, ox + p.x, p.y, id === 'earth' ? 90 : 76, t);
      if (isTarget) {
        const pr = 70 + Math.sin(t * 4) * 10;
        ctx.strokeStyle = PAL.gold;
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.arc(ox + p.x, p.y, pr, 0, TAU);
        ctx.stroke();
        txt(ctx, CFG[id] ? CFG[id].name : 'Jorden', ox + p.x, p.y + 110, { size: 32, bold: true, color: PAL.gold, stroke: 'rgba(30,10,40,0.8)', strokeW: 6 });
      } else if (passed) {
        txt(ctx, '⭐', ox + p.x + 40, p.y - 44, { size: 34 });
      }
    }

    // raket-ikon vid startpunkten som guppar
    const from = MAP_POS[this.cfg.from];
    drawRocket(ctx, ox + from.x - 60, from.y - 70 + Math.sin(t * 2.4) * 8, 0.5, t, { alice: true, scale: 0.42, flame: 0.3 });

    // ÅK-knapp
    const bw = 460, bh = 116;
    const bx = view.w / 2 - bw / 2, by = VH - 190;
    const pulse = 1 + Math.sin(t * 3.2) * 0.02;
    ctx.save();
    ctx.translate(view.w / 2, by + bh / 2);
    ctx.scale(pulse, pulse);
    rr(ctx, -bw / 2, -bh / 2, bw, bh, bh / 2);
    const bg = ctx.createLinearGradient(0, -bh / 2, 0, bh / 2);
    bg.addColorStop(0, '#ff8fd0');
    bg.addColorStop(1, PAL.hotpink);
    ctx.fillStyle = bg;
    ctx.shadowColor = 'rgba(0,0,0,0.5)';
    ctx.shadowBlur = 20;
    ctx.fill();
    ctx.shadowColor = 'rgba(0,0,0,0)';
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 4;
    ctx.stroke();
    ctx.restore();
    txt(ctx, 'ÅK! 🚀', view.w / 2, by + bh / 2, { size: 52, bold: true, color: '#fff', stroke: 'rgba(120,20,80,0.6)', strokeW: 7 });
    this.goBtn = { x: bx, y: by, w: bw, h: bh };
  }
}

function normAng(a) {
  let x = a % TAU;
  if (x > Math.PI) x -= TAU;
  if (x < -Math.PI) x += TAU;
  return x;
}

export function drawPlanetIcon(ctx, id, x, y, size, t) {
  const r = size / 2;
  ctx.save();
  if (id === 'earth') {
    const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, r * 0.2, x, y, r);
    g.addColorStop(0, '#7ec8ff');
    g.addColorStop(1, '#2e6fd6');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
    ctx.fillStyle = '#59b25e';
    ctx.beginPath();
    ctx.ellipse(x - r * 0.3, y - r * 0.2, r * 0.42, r * 0.3, 0.4, 0, TAU);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(x + r * 0.35, y + r * 0.3, r * 0.3, r * 0.22, -0.3, 0, TAU);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.beginPath();
    ctx.ellipse(x + r * 0.1, y - r * 0.45, r * 0.36, r * 0.12, 0.2, 0, TAU);
    ctx.fill();
  } else if (id === 'moon') {
    const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, r * 0.2, x, y, r);
    g.addColorStop(0, '#f0ecd8');
    g.addColorStop(1, '#b8b49a');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(120,110,80,0.4)';
    ctx.beginPath(); ctx.arc(x - r * 0.3, y - r * 0.15, r * 0.2, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(x + r * 0.25, y + r * 0.3, r * 0.14, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(x + r * 0.2, y - r * 0.35, r * 0.1, 0, TAU); ctx.fill();
  } else if (id === 'asteroid') {
    ctx.translate(x, y);
    ctx.rotate(Math.sin(t * 0.8) * 0.1);
    const g = ctx.createLinearGradient(-r, -r, r, r);
    g.addColorStop(0, '#ffe08a');
    g.addColorStop(1, '#b8871f');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(-r, -r * 0.3);
    ctx.lineTo(-r * 0.4, -r);
    ctx.lineTo(r * 0.5, -r * 0.8);
    ctx.lineTo(r, -r * 0.1);
    ctx.lineTo(r * 0.6, r * 0.7);
    ctx.lineTo(-r * 0.2, r);
    ctx.lineTo(-r * 0.9, r * 0.5);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#ffd24a';
    starPath(ctx, 0, 0, r * 0.4, r * 0.18, 5, -Math.PI / 2);
    ctx.fill();
  } else if (id === 'europa') {
    const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, r * 0.2, x, y, r);
    g.addColorStop(0, '#e8f6ff');
    g.addColorStop(1, '#6aa8d8');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
    ctx.strokeStyle = 'rgba(180,80,60,0.5)';
    ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(x - r * 0.8, y - r * 0.2); ctx.quadraticCurveTo(x, y + r * 0.3, x + r * 0.85, y - r * 0.1); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x - r * 0.6, y + r * 0.5); ctx.quadraticCurveTo(x + r * 0.2, y + r * 0.1, x + r * 0.7, y + r * 0.55); ctx.stroke();
  } else if (id === 'saturn') {
    ctx.translate(x, y);
    ctx.rotate(-0.28);
    const g = ctx.createRadialGradient(-r * 0.3, -r * 0.3, r * 0.2, 0, 0, r);
    g.addColorStop(0, '#ffe8c0');
    g.addColorStop(1, '#d8a860');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(0, 0, r * 0.82, 0, TAU); ctx.fill();
    for (let i = 0; i < 5; i++) {
      ctx.strokeStyle = RAINBOW[i + 1];
      ctx.lineWidth = 4;
      ctx.globalAlpha = 0.85;
      ctx.beginPath();
      ctx.ellipse(0, 0, r * 1.35 + i * 5, r * 0.4 + i * 2, 0, 0, TAU);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  } else if (id === 'neptune') {
    const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, r * 0.2, x, y, r);
    g.addColorStop(0, '#9ed6ff');
    g.addColorStop(1, '#2246b8');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.ellipse(x, y - r * 0.2, r * 0.7, r * 0.2, 0.1, 0, TAU);
    ctx.stroke();
    txt(ctx, '❄', x + r * 0.9, y - r * 0.9, { size: r * 0.6 });
  }
  ctx.restore();
}

function drawRock(ctx, rk, t) {
  ctx.save();
  ctx.translate(rk.x, rk.y);
  ctx.rotate(rk.rot);
  if (rk.bumpT > 0) ctx.translate(rand(-3, 3), rand(-3, 3));
  const g = ctx.createLinearGradient(-rk.r, -rk.r, rk.r, rk.r);
  g.addColorStop(0, '#a8a2b4');
  g.addColorStop(1, '#5a5468');
  ctx.fillStyle = g;
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU;
    const rr2 = rk.r * (0.75 + 0.25 * Math.sin(rk.seed + i * 2.7));
    if (i === 0) ctx.moveTo(Math.cos(a) * rr2, Math.sin(a) * rr2);
    else ctx.lineTo(Math.cos(a) * rr2, Math.sin(a) * rr2);
  }
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = 'rgba(0,0,0,0.2)';
  ctx.beginPath(); ctx.arc(-rk.r * 0.25, rk.r * 0.1, rk.r * 0.2, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.arc(rk.r * 0.3, -rk.r * 0.25, rk.r * 0.13, 0, TAU); ctx.fill();
  ctx.restore();
}

function drawSpaceBg(c, w, h, tint) {
  const g = c.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#05020c');
  g.addColorStop(0.6, tint);
  g.addColorStop(1, '#05020c');
  c.fillStyle = g;
  c.fillRect(0, 0, w, h);
  // nebulosa-moln
  for (let i = 0; i < 4; i++) {
    const x = (i * 550 + 200) % w, y = 150 + (i * 260) % 700, r = 200 + i * 40;
    const ng = c.createRadialGradient(x, y, 20, x, y, r);
    ng.addColorStop(0, 'rgba(201,92,255,0.08)');
    ng.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = ng;
    c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill();
  }
}

function drawStars(c, w, h, n, size) {
  c.fillStyle = '#fff';
  for (let i = 0; i < n; i++) {
    const x = Math.random() * w, y = Math.random() * h;
    c.globalAlpha = 0.3 + Math.random() * 0.7;
    c.beginPath();
    c.arc(x, y, Math.random() * size + 0.4, 0, TAU);
    c.fill();
  }
  c.globalAlpha = 1;
}

export const travelMoon = new TravelScene('moon');
export const travelAsteroid = new TravelScene('asteroid');
export const travelEuropa = new TravelScene('europa');
export const travelSaturn = new TravelScene('saturn');
export const travelNeptune = new TravelScene('neptune');
