// Titelscen: stjärnhimmel med regnbåge, Alice som vinkar, Stella, fladdermöss
// runt månen och stora barnvänliga knappar.

import { VH, PAL, RAINBOW, TXT, TAU, rand } from '../config.js';
import { view, makeCanvas, txt, rainbowText, rr, drawCoin, glow, PS, starPath } from '../render.js';
import { setScheme } from '../input.js';
import { SAVE, hasSave, resetSave } from '../save.js';
import { AUD } from '../audio.js';
import { drawGirl, drawUnicorn, WHO } from '../chars.js';
import { SceneBase, NAV } from './base.js';

const BGW = 2400;

class TitleScene extends SceneBase {
  constructor() {
    super('title');
    this.song = 'title';
    this.gravity = 0;
    this.bg = null;
    this.stars = [];
    this.btns = [];
    this.shoot = null;
    this.shootTimer = 3;
  }

  enter() {
    this.baseEnter();
    setScheme('none');
    this.stars = [];
    for (let i = 0; i < 130; i++) {
      this.stars.push({ x: rand(0, BGW), y: rand(0, 640), r: rand(1, 3.2), ph: rand(0, TAU), sp: rand(1.5, 4) });
    }
    this.bg = makeCanvas(BGW, VH, drawTitleBg);
    this.shoot = null;
    this.shootTimer = 2.5;
  }

  update(dt) {
    this.tick(dt);
    this.shootTimer -= dt;
    if (this.shootTimer <= 0 && !this.shoot) {
      this.shoot = { x: rand(300, BGW - 500), y: rand(60, 260), vx: -rand(500, 800), vy: rand(140, 240), life: 1 };
      this.shootTimer = rand(4, 8);
    }
    if (this.shoot) {
      this.shoot.x += this.shoot.vx * dt;
      this.shoot.y += this.shoot.vy * dt;
      this.shoot.life -= dt * 0.9;
      if (this.shoot.life <= 0) this.shoot = null;
    }
  }

  onTap(x, y) {
    for (let i = 0; i < this.btns.length; i++) {
      const b = this.btns[i];
      if (x > b.x && x < b.x + b.w && y > b.y && y < b.y + b.h) {
        AUD.init();
        AUD.sfx('click');
        if (b.id === 'start') NAV.go('home');
        else if (b.id === 'cont') NAV.go(SAVE.progress);
        else if (b.id === 'new') { resetSave(); NAV.go('home'); }
        else if (b.id === 'free') NAV.go('flight');   // fri flygtur bland ringarna!
        else if (b.id === 'install' && window.__installPrompt) {
          const p = window.__installPrompt;
          window.__installPrompt = null;
          try { p.prompt(); } catch (e) {}
        }
        return;
      }
    }
  }

  draw(ctx, alpha, t) {
    const ox = (view.w - BGW) / 2;
    ctx.drawImage(this.bg, ox, 0);

    // tindrande stjärnor
    ctx.save();
    ctx.fillStyle = '#fff';
    for (let i = 0; i < this.stars.length; i++) {
      const s = this.stars[i];
      ctx.globalAlpha = 0.25 + 0.75 * (0.5 + 0.5 * Math.sin(t * s.sp + s.ph));
      ctx.beginPath();
      ctx.arc(ox + s.x, s.y, s.r, 0, TAU);
      ctx.fill();
    }
    ctx.restore();

    // stjärnfall
    if (this.shoot) {
      const sh = this.shoot;
      ctx.save();
      ctx.globalAlpha = Math.max(0, sh.life);
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(ox + sh.x, sh.y);
      ctx.lineTo(ox + sh.x - sh.vx * 0.16, sh.y - sh.vy * 0.16);
      ctx.stroke();
      ctx.restore();
    }

    // fladdermöss runt månen (Draculaura-teaser)
    for (let i = 0; i < 3; i++) {
      const a = t * (0.5 + i * 0.13) + i * 2.1;
      const bx = ox + 430 + Math.cos(a) * (150 + i * 26);
      const by = 205 + Math.sin(a) * (66 + i * 12);
      drawBat(ctx, bx, by, t * 9 + i, 0.8 + i * 0.12);
    }

    // Stella på vänstra kullen
    drawUnicorn(ctx, ox + 460, 926, t, { s: 0.92, face: 1, mode: 'stand' });
    if (Math.random() < 0.06) {
      PS.spawn('sparkle', ox + 460 + rand(-70, 80), 880 + rand(-60, 20), { color: '#fff0b3', vy: -30, life: 0.9 });
    }

    // Alice vinkar på högra kullen
    drawGirl(ctx, ox + 1815, 962, t, WHO.alice, { s: 1.6, face: -1, mode: 'wave' });

    // svävande mynt
    for (let i = 0; i < 5; i++) {
      const cx = ox + 700 + i * 220;
      const cy = 700 + Math.sin(t * 1.7 + i * 1.4) * 16;
      glow(ctx, cx, cy, 42, i % 2 === 0 ? PAL.gold : PAL.silver, 0.22);
      drawCoin(ctx, cx, cy, 20, i % 2 === 0 ? 'gold' : 'silver', t + i);
    }

    PS.draw(ctx);

    // titel
    const cx = view.w / 2;
    txt(ctx, '✨ Ett rymdäventyr ✨', cx, 172, { size: 40, color: '#e8dcff', shadow: true });
    rainbowText(ctx, 'ALICE', cx, 285, 150);
    txt(ctx, 'och den kallaste planeten', cx, 398, { size: 56, bold: true, color: '#fff', stroke: 'rgba(60,20,90,0.9)', strokeW: 9, shadow: true });

    // knappar
    this.btns = [];
    const saved = hasSave() && SAVE.progress !== 'home';
    let y = 560;
    if (saved) {
      this.addBtn(ctx, 'cont', '▶  ' + TXT.cont, cx, y, 560, 108, PAL.hotpink, t); y += 136;
      this.addBtn(ctx, 'new', '✨  ' + TXT.newGame, cx, y, 460, 88, PAL.purple, t); y += 116;
    } else {
      this.addBtn(ctx, 'start', '▶  ' + TXT.start, cx, y, 620, 116, PAL.hotpink, t); y += 148;
    }
    if (SAVE.finished) {
      this.addBtn(ctx, 'free', '🚀  ' + TXT.freeplay, cx, y, 460, 88, '#2e8fd6', t); y += 116;
    }
    if (window.__installPrompt) {
      this.addBtn(ctx, 'install', TXT.install, cx, y, 460, 84, '#3aa76d', t); y += 112;
    }

    txt(ctx, 'Ett spel av Alice & Pappa 💜', cx, VH - 34, { size: 26, color: '#b9a8d8' });
  }

  addBtn(ctx, id, label, cx, y, w, h, color, t) {
    const x = cx - w / 2;
    const pulse = id === 'start' || id === 'cont' ? 1 + Math.sin(t * 3) * 0.015 : 1;
    ctx.save();
    ctx.translate(cx, y + h / 2);
    ctx.scale(pulse, pulse);
    ctx.shadowColor = 'rgba(0,0,0,0.45)';
    ctx.shadowBlur = 16;
    ctx.shadowOffsetY = 6;
    rr(ctx, -w / 2, -h / 2, w, h, h / 2);
    const g = ctx.createLinearGradient(0, -h / 2, 0, h / 2);
    g.addColorStop(0, lighten(color));
    g.addColorStop(1, color);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.shadowColor = 'rgba(0,0,0,0)';
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.lineWidth = 4;
    ctx.stroke();
    ctx.restore();
    txt(ctx, label, cx, y + h / 2, { size: h * 0.42, bold: true, color: '#fff', stroke: 'rgba(40,10,50,0.55)', strokeW: 6 });
    this.btns.push({ id: id, x: x, y: y, w: w, h: h });
  }
}

function lighten(hex) {
  const r = Math.min(255, parseInt(hex.substr(1, 2), 16) + 55);
  const g = Math.min(255, parseInt(hex.substr(3, 2), 16) + 55);
  const b = Math.min(255, parseInt(hex.substr(5, 2), 16) + 55);
  return 'rgb(' + r + ',' + g + ',' + b + ')';
}

function drawBat(ctx, x, y, wingT, s) {
  const flap = Math.sin(wingT) * 0.7;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  ctx.fillStyle = '#2a1735';
  for (let side = -1; side <= 1; side += 2) {
    ctx.save();
    ctx.scale(side, 1);
    ctx.rotate(-flap * 0.5);
    ctx.beginPath();
    ctx.moveTo(3, 0);
    ctx.quadraticCurveTo(16, -12, 26, -4);
    ctx.quadraticCurveTo(20, 2, 22, 8);
    ctx.quadraticCurveTo(12, 4, 3, 8);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
  ctx.beginPath();
  ctx.arc(0, 0, 6, 0, TAU);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(-5, -4); ctx.lineTo(-7, -11); ctx.lineTo(-2, -6);
  ctx.moveTo(5, -4); ctx.lineTo(7, -11); ctx.lineTo(2, -6);
  ctx.fill();
  ctx.restore();
}

function drawTitleBg(c, W, H) {
  // natthimmel
  const sky = c.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, '#0b0518');
  sky.addColorStop(0.45, '#1a0f3a');
  sky.addColorStop(0.75, '#3a1f66');
  sky.addColorStop(1, '#6e3a8e');
  c.fillStyle = sky;
  c.fillRect(0, 0, W, H);

  // nebulosor
  nebula(c, 1700, 200, 340, 'rgba(201,92,255,0.16)');
  nebula(c, 600, 420, 300, 'rgba(255,107,203,0.13)');
  nebula(c, 1200, 120, 260, 'rgba(57,215,208,0.10)');

  // små statiska stjärnor
  c.fillStyle = 'rgba(255,255,255,0.5)';
  for (let i = 0; i < 220; i++) {
    c.beginPath();
    c.arc(Math.random() * W, Math.random() * H * 0.72, Math.random() * 1.4 + 0.4, 0, TAU);
    c.fill();
  }

  // månen med kratrar
  const mg = c.createRadialGradient(430, 205, 30, 430, 205, 110);
  mg.addColorStop(0, '#fff8d8');
  mg.addColorStop(1, '#e8d89a');
  c.fillStyle = mg;
  c.beginPath(); c.arc(430, 205, 105, 0, TAU); c.fill();
  c.fillStyle = 'rgba(190,170,110,0.5)';
  crater(c, 395, 175, 21); crater(c, 470, 240, 15); crater(c, 455, 160, 11); crater(c, 400, 250, 13);
  const halo = c.createRadialGradient(430, 205, 105, 430, 205, 190);
  halo.addColorStop(0, 'rgba(255,244,200,0.35)');
  halo.addColorStop(1, 'rgba(255,244,200,0)');
  c.fillStyle = halo;
  c.beginPath(); c.arc(430, 205, 190, 0, TAU); c.fill();

  // Saturnus och Neptunus i fjärran (dit resan går!)
  c.save();
  c.translate(1980, 240);
  c.rotate(-0.3);
  c.fillStyle = '#e8c88a';
  c.beginPath(); c.ellipse(0, 0, 46, 40, 0, 0, TAU); c.fill();
  c.strokeStyle = 'rgba(255,220,150,0.85)';
  c.lineWidth = 7;
  c.beginPath(); c.ellipse(0, 0, 82, 24, 0, 0, TAU); c.stroke();
  c.restore();
  const ng = c.createRadialGradient(2160, 130, 4, 2160, 130, 26);
  ng.addColorStop(0, '#9ed6ff');
  ng.addColorStop(1, '#2e6fd6');
  c.fillStyle = ng;
  c.beginPath(); c.arc(2160, 130, 24, 0, TAU); c.fill();

  // regnbåge
  c.save();
  c.globalAlpha = 0.65;
  c.lineCap = 'round';
  for (let i = 0; i < RAINBOW.length; i++) {
    c.strokeStyle = RAINBOW[i];
    c.lineWidth = 26;
    c.beginPath();
    c.arc(W / 2, 1580, 1010 - i * 26, Math.PI * 1.13, Math.PI * 1.87);
    c.stroke();
  }
  c.restore();

  // kullar
  hill(c, W, H, 880, '#241448', 1.35);
  hill(c, W, H, 950, '#2f1a5c', 1);

  // gräs-glitter och blommor på främre kullen
  for (let i = 0; i < 60; i++) {
    const fx = Math.random() * W;
    const fy = 990 + Math.random() * 80;
    if (i % 3 === 0) {
      c.fillStyle = ['#ff6bcb', '#ffd24a', '#7ec8ff', '#fff'][i % 4];
      flower(c, fx, fy, 5.5);
    } else {
      c.fillStyle = 'rgba(255,255,255,0.22)';
      c.beginPath(); c.arc(fx, fy, 1.6, 0, TAU); c.fill();
    }
  }

  function nebula(cc, x, y, r, col) {
    const g = cc.createRadialGradient(x, y, r * 0.1, x, y, r);
    g.addColorStop(0, col);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    cc.fillStyle = g;
    cc.beginPath(); cc.arc(x, y, r, 0, TAU); cc.fill();
  }
  function crater(cc, x, y, r) {
    cc.beginPath(); cc.arc(x, y, r, 0, TAU); cc.fill();
  }
  function hill(cc, w, h, top, col, freq) {
    cc.fillStyle = col;
    cc.beginPath();
    cc.moveTo(0, h);
    for (let x = 0; x <= w; x += 20) {
      cc.lineTo(x, top + Math.sin(x * 0.002 * freq * TAU) * 55 + Math.sin(x * 0.0007 * TAU) * 30);
    }
    cc.lineTo(w, h);
    cc.closePath();
    cc.fill();
  }
  function flower(cc, x, y, r) {
    for (let p = 0; p < 5; p++) {
      const a = (p / 5) * TAU;
      cc.beginPath();
      cc.arc(x + Math.cos(a) * r, y + Math.sin(a) * r, r * 0.62, 0, TAU);
      cc.fill();
    }
    const old = cc.fillStyle;
    cc.fillStyle = '#ffd24a';
    cc.beginPath(); cc.arc(x, y, r * 0.55, 0, TAU); cc.fill();
    cc.fillStyle = old;
  }
}

export const titleScene = new TitleScene();
