// Hemkomstfesten: kalas i trädgården med ALLA vänner, tårta, konfetti,
// fyrverkerier och eftertexter. VÄLKOMNA HEM!

import { VH, PAL, RAINBOW, TAU, rand, clamp, lerp } from '../config.js';
import { view, makeCanvas, PS, txt, glow, QY, rr, rainbowText, heartPath, starPath } from '../render.js';
import { setScheme } from '../input.js';
import { SAVE, persist, advanceTo } from '../save.js';
import { AUD } from '../audio.js';
import { HUD } from '../hud.js';
import { drawGirl, drawMermaid, drawUnicorn, WHO } from '../chars.js';
import { SceneBase, NAV } from './base.js';

const GROUND = 940;

class PartyScene extends SceneBase {
  constructor() {
    super('party');
    this.song = 'party';
    this.gravity = 0;
  }

  enter() {
    this.baseEnter();
    setScheme('none');
    advanceTo('party');
    SAVE.finished = true;
    persist();
    this.bg = makeCanvas(2400, VH, drawGarden);
    this.confT = 0;
    this.fwT = 1.2;
    this.creditT = 0;
    this.btn = null;
    HUD.objective('');
    const self = this;
    this.after(1.4, function () {
      HUD.dialog([
        { who: 'papa', text: 'Hemma! Och titta vilka som väntar i trädgården…' },
        { who: 'alice', text: 'ALLA MINA VÄNNER! Det här är bästa dagen NÅGONSIN! 🎉' }
      ]);
    });
  }

  update(dt) {
    this.tick(dt);
    // konfettiregn
    this.confT -= dt;
    if (this.confT <= 0) {
      this.confT = 0.25;
      for (let i = 0; i < 4; i++) {
        PS.spawn('confetti', rand(0, view.w), -20, {
          color: [RAINBOW[Math.floor(rand(0, 7))], PAL.gold, PAL.silver][Math.floor(rand(0, 3))],
          vx: rand(-40, 40), vy: rand(80, 180), g: 60, life: rand(3, 5), size: rand(10, 16)
        });
      }
    }
    // fyrverkerier
    this.fwT -= dt;
    if (this.fwT <= 0) {
      this.fwT = rand(1.8, 3);
      const fx = rand(view.w * 0.15, view.w * 0.85);
      const fy = rand(120, 380);
      const col = RAINBOW[Math.floor(rand(0, 7))];
      PS.burst('star', fx, fy, 22, { color: col, speed: 340 });
      PS.burst('sparkle', fx, fy, 14, { color: '#fff', speed: 240 });
      AUD.sfx('pop');
    }
    if (!HUD.dialogActive()) this.creditT += dt;
  }

  onTap(x, y) {
    if (this.btn && x > this.btn.x && x < this.btn.x + this.btn.w && y > this.btn.y && y < this.btn.y + this.btn.h) {
      AUD.sfx('click');
      NAV.go('title');
    }
  }

  draw(ctx, alpha, t) {
    const ox = (view.w - 2400) / 2;
    ctx.drawImage(this.bg, ox, 0);

    // regnbåge över allt
    ctx.save();
    ctx.globalAlpha = 0.75;
    ctx.lineCap = 'round';
    for (let i = 0; i < 7; i++) {
      ctx.strokeStyle = RAINBOW[i];
      ctx.lineWidth = 20;
      ctx.beginPath();
      ctx.arc(view.w / 2, 1500, 1180 - i * 20, Math.PI * 1.2, Math.PI * 1.8);
      ctx.stroke();
    }
    ctx.restore();

    // banderoll
    const bw = Math.min(1100, view.w - 200);
    ctx.save();
    ctx.translate(view.w / 2, 150 + Math.sin(t * 1.2) * 6);
    ctx.rotate(Math.sin(t * 0.8) * 0.015);
    rr(ctx, -bw / 2, -64, bw, 128, 30);
    const g = ctx.createLinearGradient(0, -64, 0, 64);
    g.addColorStop(0, '#ff8fd0');
    g.addColorStop(1, '#e84f9e');
    ctx.fillStyle = g;
    ctx.shadowColor = 'rgba(0,0,0,0.4)';
    ctx.shadowBlur = 16;
    ctx.fill();
    ctx.shadowColor = 'rgba(0,0,0,0)';
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 5;
    ctx.stroke();
    txt(ctx, '🎉 VÄLKOMNA HEM! 🎉', 0, 2, { size: 62, bold: true, color: '#fff', stroke: 'rgba(140,30,90,0.6)', strokeW: 8 });
    ctx.restore();

    const cx = view.w / 2;

    // tårtbord
    drawCakeTable(ctx, cx, GROUND, t);

    // Alice & pappa dansar i mitten
    drawGirl(ctx, cx - 190, GROUND, t, WHO.alice, { mode: 'dance', face: 1 });
    drawGirl(ctx, cx - 320, GROUND, t, WHO.papa, { mode: 'dance', face: 1 });

    // vännerna!
    drawGirl(ctx, cx + 210, GROUND, t, WHO.draculaura, { mode: 'dance', face: -1 });
    drawGirl(ctx, cx + 360, GROUND, t, WHO.nastya, { mode: 'dance', face: -1 });
    drawUnicorn(ctx, cx - 560, GROUND - 2, t, { s: 1, face: 1, mode: 'gallop', ph: t * 5 });
    // Melinda i sitt vattenbadkar på hjul!
    drawTub(ctx, cx + 560, GROUND, t);
    drawMermaid(ctx, cx + 560, GROUND - 120, t, { s: 0.85, face: -1 });

    // gnistor runt Stella
    if (Math.random() < 0.2) {
      PS.spawn('sparkle', cx - 560 + rand(-90, 90), GROUND - 100 + rand(-60, 60), { color: '#fff0b3', vy: -40, life: 0.8, size: 5 });
    }

    PS.draw(ctx);

    // eftertexter
    if (this.creditT > 5) {
      const lines = [
        { s: 'ALICE och den kallaste planeten', size: 54, c: PAL.gold, at: 5 },
        { s: 'Ett spel av Alice & Pappa 💜', size: 44, c: '#fff', at: 6.2 },
        { s: 'Med vännerna: Draculaura 🦇 • Nastya 🎀 • Melinda 🧜‍♀️ • Stella 🦄', size: 30, c: '#ffd9f2', at: 7.4 },
        { s: 'Musik, planeter och pussel: hemmagjorda med kärlek', size: 26, c: '#e8dcff', at: 8.6 },
        { s: '⭐ DU KLARADE HELA RYMDRESAN! ⭐', size: 40, c: '#ffe9a8', at: 9.8 }
      ];
      ctx.save();
      const panelA = clamp((this.creditT - 5) / 1, 0, 0.78);
      ctx.fillStyle = 'rgba(10,4,26,' + panelA.toFixed(2) + ')';
      rr(ctx, view.w / 2 - 700, 250, 1400, 470, 40);
      ctx.fill();
      for (let i = 0; i < lines.length; i++) {
        const L = lines[i];
        const a = clamp((this.creditT - L.at) / 0.8, 0, 1);
        if (a > 0) {
          txt(ctx, L.s, view.w / 2, 330 + i * 82, { size: L.size, bold: i < 2, color: L.c, alpha: a, shadow: true });
        }
      }
      ctx.restore();
      // hem-knapp
      if (this.creditT > 10.5) {
        const bw2 = 420, bh2 = 96;
        const bx = view.w / 2 - bw2 / 2, by = 780;
        const pulse = 1 + Math.sin(t * 3) * 0.02;
        ctx.save();
        ctx.translate(view.w / 2, by + bh2 / 2);
        ctx.scale(pulse, pulse);
        rr(ctx, -bw2 / 2, -bh2 / 2, bw2, bh2, bh2 / 2);
        ctx.fillStyle = PAL.hotpink;
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 4;
        ctx.stroke();
        ctx.restore();
        txt(ctx, '🏠 Till startsidan', view.w / 2, by + bh2 / 2, { size: 36, bold: true, color: '#fff' });
        this.btn = { x: bx, y: by, w: bw2, h: bh2 };
      }
    }
  }
}

function drawTub(ctx, x, y, t) {
  // badkar på hjul med vatten
  ctx.fillStyle = '#e8f0f8';
  ctx.beginPath();
  ctx.moveTo(x - 120, y - 130);
  ctx.quadraticCurveTo(x - 130, y - 20, x - 90, y - 10);
  ctx.lineTo(x + 90, y - 10);
  ctx.quadraticCurveTo(x + 130, y - 20, x + 120, y - 130);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#a8b8c8';
  ctx.lineWidth = 4;
  ctx.stroke();
  // vatten
  ctx.fillStyle = 'rgba(80,180,220,0.8)';
  ctx.beginPath();
  ctx.ellipse(x, y - 128, 112, 16 + Math.sin(t * 3) * 3, 0, 0, TAU);
  ctx.fill();
  // hjul
  ctx.fillStyle = '#332a3a';
  ctx.beginPath(); ctx.arc(x - 70, y, 16, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.arc(x + 70, y, 16, 0, TAU); ctx.fill();
}

function drawCakeTable(ctx, cx, gy, t) {
  const x = cx + 20, y = gy - 6;
  // bord
  ctx.fillStyle = '#8a5a2b';
  rr(ctx, x - 170, y - 120, 340, 26, 8);
  ctx.fill();
  ctx.fillRect(x - 130, y - 96, 20, 96);
  ctx.fillRect(x + 110, y - 96, 20, 96);
  // duk
  ctx.fillStyle = '#fff';
  rr(ctx, x - 170, y - 126, 340, 20, 8);
  ctx.fill();
  // tårta i tre våningar
  const ty = y - 126;
  ctx.fillStyle = '#ff9ed9';
  rr(ctx, x - 110, ty - 60, 220, 60, 12);
  ctx.fill();
  ctx.fillStyle = '#fff';
  rr(ctx, x - 80, ty - 112, 160, 56, 12);
  ctx.fill();
  ctx.fillStyle = '#ff6bcb';
  rr(ctx, x - 50, ty - 156, 100, 48, 12);
  ctx.fill();
  // glasyrdroppar
  ctx.fillStyle = '#fff';
  for (let i = 0; i < 6; i++) {
    ctx.beginPath();
    ctx.arc(x - 95 + i * 38, ty - 58, 9, 0, Math.PI);
    ctx.fill();
  }
  // jordgubbar
  for (let i = 0; i < 4; i++) {
    ctx.fillStyle = '#ff4d6d';
    ctx.beginPath();
    ctx.arc(x - 60 + i * 40, ty - 116, 8, 0, TAU);
    ctx.fill();
  }
  // hjärt-topp
  ctx.fillStyle = PAL.gold;
  heartPath(ctx, x, ty - 176, 16);
  ctx.fill();
  glow(ctx, x, ty - 176, 40, PAL.gold, 0.3 + 0.1 * Math.sin(t * 3));
}

function drawGarden(c, w, h) {
  // kvällshimmel
  const g = c.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#1a1040');
  g.addColorStop(0.5, '#4a2a72');
  g.addColorStop(0.8, '#a8527e');
  g.addColorStop(1, '#5a3f68');
  c.fillStyle = g;
  c.fillRect(0, 0, w, h);
  // stjärnor
  c.fillStyle = '#fff';
  for (let i = 0; i < 120; i++) {
    c.globalAlpha = 0.3 + Math.random() * 0.6;
    c.beginPath();
    c.arc(Math.random() * w, Math.random() * 500, Math.random() * 1.6 + 0.4, 0, TAU);
    c.fill();
  }
  c.globalAlpha = 1;
  // huset (varmt upplyst)
  c.fillStyle = '#3a2450';
  c.fillRect(150, 380, 520, 560);
  c.fillStyle = '#2a1a3e';
  c.beginPath();
  c.moveTo(100, 390);
  c.lineTo(410, 200);
  c.lineTo(720, 390);
  c.closePath();
  c.fill();
  for (let i = 0; i < 2; i++) {
    c.fillStyle = '#ffd24a';
    c.fillRect(230 + i * 220, 480, 120, 130);
    c.strokeStyle = '#2a1a3e';
    c.lineWidth = 6;
    c.strokeRect(230 + i * 220, 480, 120, 130);
    c.beginPath();
    c.moveTo(290 + i * 220, 480); c.lineTo(290 + i * 220, 610);
    c.moveTo(230 + i * 220, 545); c.lineTo(350 + i * 220, 545);
    c.stroke();
  }
  // gräsmatta
  const gg = c.createLinearGradient(0, 880, 0, h);
  gg.addColorStop(0, '#3f7a46');
  gg.addColorStop(1, '#2a5230');
  c.fillStyle = gg;
  c.fillRect(0, 940, w, h - 940);
  c.fillStyle = '#59b25e';
  c.fillRect(0, 934, w, 14);
  // ljusslingor
  for (let s = 0; s < 2; s++) {
    const y0 = 300 + s * 90;
    c.strokeStyle = 'rgba(120,90,60,0.8)';
    c.lineWidth = 3;
    c.beginPath();
    c.moveTo(700, y0);
    c.quadraticCurveTo(w / 2 + 200, y0 + 120, w - 100, y0 - 20);
    c.stroke();
    for (let i = 0; i < 14; i++) {
      const k = i / 13;
      const lx = 700 * (1 - k) * (1 - k) + (w / 2 + 200) * 2 * k * (1 - k) + (w - 100) * k * k;
      const ly = y0 * (1 - k) * (1 - k) + (y0 + 120) * 2 * k * (1 - k) + (y0 - 20) * k * k;
      c.fillStyle = [PAL.gold, '#ff6bcb', '#7ec8ff', '#59d666'][i % 4];
      c.beginPath();
      c.arc(lx, ly + 12, 7, 0, TAU);
      c.fill();
    }
  }
  // raketen parkerad i hörnet
  c.save();
  c.translate(2160, 900);
  c.scale(0.9, 0.9);
  c.fillStyle = '#cfd4e2';
  c.beginPath();
  c.moveTo(-36, 0);
  c.quadraticCurveTo(-40, -90, 0, -150);
  c.quadraticCurveTo(40, -90, 36, 0);
  c.closePath();
  c.fill();
  c.fillStyle = '#e84f9e';
  c.beginPath();
  c.moveTo(-36, -60);
  c.quadraticCurveTo(0, -180, 36, -60);
  c.quadraticCurveTo(0, -100, -36, -60);
  c.closePath();
  c.fill();
  c.restore();
  // blommor
  for (let i = 0; i < 40; i++) {
    const fx = Math.random() * w, fy = 960 + Math.random() * 100;
    c.fillStyle = ['#ff6bcb', '#ffd24a', '#7ec8ff', '#fff'][i % 4];
    for (let p = 0; p < 5; p++) {
      const a = (p / 5) * TAU;
      c.beginPath();
      c.arc(fx + Math.cos(a) * 6, fy + Math.sin(a) * 6, 4, 0, TAU);
      c.fill();
    }
    c.fillStyle = '#ffd24a';
    c.beginPath(); c.arc(fx, fy, 3.5, 0, TAU); c.fill();
  }
}

export const partyScene = new PartyScene();
