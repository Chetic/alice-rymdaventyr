// Karaktärer: parametrisk "chibi"-rigg med gångcykler, blink, svajande hår,
// plus sjöjungfrun Melinda och enhörningen Stella. All grafik ritas i kod.

import { TAU, RAINBOW, PAL } from './config.js';
import { starPath, heartPath } from './render.js';

// ---------- Karaktärskonfigurationer ----------
export const WHO = {
  alice: {
    name: 'Alice',
    skin: '#ffdbc4', cheek: '#ffab9e',
    hairC: '#8a5a2b', hairS: '#b57f43', style: 'ponytail', acc: 'scrunchie', accC: '#ff4d6d',
    eyeC: '#4a7fd6',
    outfit: { type: 'dress', c1: '#ff6bcb', c2: '#ff3fa4', trim: 'rainbow', star: true },
    theme: '#ff6bcb'
  },
  aliceSuit: {
    name: 'Alice',
    skin: '#ffdbc4', cheek: '#ffab9e',
    hairC: '#8a5a2b', hairS: '#b57f43', style: 'ponytail', acc: 'scrunchie', accC: '#ff4d6d',
    eyeC: '#4a7fd6',
    outfit: { type: 'suit', c1: '#f4f0ff', c2: '#ff6bcb', trim: 'gold' },
    helmet: true,
    theme: '#ff6bcb'
  },
  aliceWarm: {
    name: 'Alice',
    skin: '#ffdbc4', cheek: '#ff8f80',
    hairC: '#8a5a2b', hairS: '#b57f43', style: 'ponytail', acc: 'scrunchie', accC: '#ffd24a',
    eyeC: '#4a7fd6',
    outfit: { type: 'parka', c1: '#ff6bcb', c2: '#c93f8e', trim: 'gold' },
    hoodFur: true,
    theme: '#ff9ed9'
  },
  draculaura: {
    name: 'Draculaura',
    skin: '#fbe9f7', cheek: '#ff9ed9',
    hairC: '#241a2e', hairS: '#ff3fa4', style: 'pigtails', acc: 'none', accC: '#ff3fa4',
    eyeC: '#ff5fb8',
    outfit: { type: 'dress', c1: '#3a2547', c2: '#ff3fa4', trim: 'pink' },
    fangs: true, wings: true, heartCheek: true,
    theme: '#c95cff'
  },
  nastya: {
    name: 'Nastya',
    skin: '#ffe2cd', cheek: '#ffb3a0',
    hairC: '#f7d774', hairS: '#ffefad', style: 'bun', acc: 'bow', accC: '#ff4d6d',
    eyeC: '#58a8e8',
    outfit: { type: 'dress', c1: '#ff4d6d', c2: '#ffffff', trim: 'white', apron: true },
    theme: '#ffd24a'
  },
  papa: {
    name: 'Pappa',
    skin: '#f2c9a8', cheek: '#e8a888',
    hairC: '#5a4632', hairS: '#7a6248', style: 'short', acc: 'none', accC: '#fff',
    eyeC: '#5a7a4a',
    outfit: { type: 'parka', c1: '#ff8c3a', c2: '#c9601e', trim: 'gold' },
    glasses: true, beard: true, adult: true, hoodFur: true,
    theme: '#ff8c3a'
  }
};

function capsule(ctx, x1, y1, x2, y2, w, color) {
  ctx.strokeStyle = color;
  ctx.lineWidth = w;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}

// ---------- Flickor / Pappa ----------
// pose: {s, face, mode, ph, look:{x,y}, mouth:'smile'|'open'|'o'|'sad', talk?}
export function drawGirl(ctx, x, y, t, cfg, pose) {
  const p = pose || {};
  const s = (p.s === undefined ? 1 : p.s) * (cfg.adult ? 1.22 : 1);
  const face = p.face === undefined ? 1 : p.face;
  const mode = p.mode || 'stand';
  const ph = p.ph || 0;

  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s * face, s);

  // hopp/dans-gupp
  let bob = 0;
  if (mode === 'walk') bob = Math.abs(Math.sin(ph)) * -4;
  if (mode === 'dance') bob = Math.abs(Math.sin(t * 6)) * -9;
  if (mode === 'stand') bob = Math.sin(t * 1.8) * -1.6;
  ctx.translate(0, bob);

  const hipY = -62, shY = -96, headY = -128, headR = 34;
  const legW = 13, armW = 10;
  const sk = cfg.skin;

  // benvinklar
  let lA = 0, rA = 0, tuck = 0;
  if (mode === 'walk') { lA = Math.sin(ph) * 0.6; rA = -Math.sin(ph) * 0.6; }
  if (mode === 'jump' || mode === 'float') { lA = -0.35; rA = 0.45; tuck = mode === 'jump' ? 10 : 4; }
  if (mode === 'dance') { lA = Math.sin(t * 6) * 0.3; rA = -Math.sin(t * 6) * 0.3; }
  if (mode === 'sit') { lA = 1.15; rA = 1.3; }
  if (mode === 'float') { lA = 0.25 + Math.sin(t * 2.2) * 0.18; rA = -0.15 + Math.sin(t * 2.2 + 1) * 0.18; }

  // vingar (Draculaura) bakom allt
  if (cfg.wings) {
    const flap = Math.sin(t * 5) * 0.35 - 0.2;
    ctx.save();
    ctx.translate(0, shY + 8);
    for (let side = -1; side <= 1; side += 2) {
      ctx.save();
      ctx.scale(side, 1);
      ctx.rotate(flap * (side === 1 ? 1 : 1) - 0.15);
      ctx.fillStyle = '#41284f';
      ctx.beginPath();
      ctx.moveTo(8, 0);
      ctx.quadraticCurveTo(52, -34, 62, -6);
      ctx.quadraticCurveTo(50, -2, 48, 10);
      ctx.quadraticCurveTo(38, 4, 32, 16);
      ctx.quadraticCurveTo(22, 8, 8, 14);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#2a1735';
      ctx.lineWidth = 2.5;
      ctx.stroke();
      ctx.restore();
    }
    ctx.restore();
  }

  // bakhår
  drawBackHair(ctx, cfg, t, headY, headR, ph, mode);

  // bortre arm + ben
  const farArm = armPose(mode, t, ph, false, p);
  capsule(ctx, -10, shY, -10 + farArm.x, shY + farArm.y, armW, dark(sk, 0.92));
  capsule(ctx, -9, hipY, -9 + Math.sin(lA) * 26, hipY + Math.cos(lA) * (30 - tuck), legW, dark(sk, 0.93));
  shoe(ctx, -9 + Math.sin(lA) * 26, hipY + Math.cos(lA) * (30 - tuck) + 4, cfg, true);

  // kropp/klänning
  drawOutfit(ctx, cfg, t, hipY, shY, mode);

  // närmre ben
  capsule(ctx, 9, hipY, 9 + Math.sin(rA) * 26, hipY + Math.cos(rA) * (30 - tuck), legW, sk);
  shoe(ctx, 9 + Math.sin(rA) * 26, hipY + Math.cos(rA) * (30 - tuck) + 4, cfg, false);

  // huvud
  ctx.fillStyle = sk;
  ctx.beginPath();
  ctx.arc(0, headY, headR, 0, TAU);
  ctx.fill();
  // öra
  ctx.beginPath();
  ctx.arc(-headR + 3, headY + 4, 7, 0, TAU);
  ctx.fill();

  drawFace(ctx, cfg, t, headY, headR, p);
  drawFrontHair(ctx, cfg, t, headY, headR, ph, mode);

  // hjälm (rymddräkt)
  if (cfg.helmet) {
    ctx.beginPath();
    ctx.arc(2, headY - 2, headR + 12, 0, TAU);
    ctx.fillStyle = 'rgba(190,230,255,0.22)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.75)';
    ctx.lineWidth = 3.5;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(-10, headY - 16, 10, 0, TAU);
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.fill();
  }

  // närmre arm (framför kroppen)
  const nearArm = armPose(mode, t, ph, true, p);
  capsule(ctx, 10, shY, 10 + nearArm.x, shY + nearArm.y, armW, sk);
  // hand
  ctx.fillStyle = sk;
  ctx.beginPath();
  ctx.arc(10 + nearArm.x, shY + nearArm.y, 6.5, 0, TAU);
  ctx.fill();

  ctx.restore();
}

function armPose(mode, t, ph, near, p) {
  if (p && p.arms === 'up') return { x: near ? 14 : -14, y: -34 };
  if (p && p.arms === 'hug') return { x: near ? 26 : 22, y: 6 };
  if (mode === 'wave' && near) return { x: 20, y: -30 + Math.sin(t * 7) * 6 };
  if (mode === 'walk') { const a = Math.sin(ph + (near ? Math.PI : 0)) * 0.55; return { x: Math.sin(a) * 24, y: Math.cos(a) * 26 }; }
  if (mode === 'jump') return { x: near ? 18 : -16, y: -18 };
  if (mode === 'dance') { const a = Math.sin(t * 6 + (near ? 0 : Math.PI)); return { x: (near ? 16 : -14), y: -20 - a * 14 }; }
  if (mode === 'float') return { x: near ? 20 : -18, y: -6 + Math.sin(t * 2.4) * 5 };
  return { x: near ? 6 : -6, y: 26 };
}

function shoe(ctx, x, y, cfg, far) {
  ctx.fillStyle = far ? '#d8cfe8' : '#ffffff';
  ctx.beginPath();
  ctx.ellipse(x + 3, y + 3, 11, 7, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = far ? '#b9aed6' : PAL.gold;
  ctx.fillRect(x - 4, y - 1, 12, 3);
}

function drawOutfit(ctx, cfg, t, hipY, shY, mode) {
  const o = cfg.outfit;
  if (o.type === 'dress') {
    const g = ctx.createLinearGradient(0, shY, 0, hipY + 16);
    g.addColorStop(0, o.c1);
    g.addColorStop(1, o.c2);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(-16, shY - 4);
    ctx.lineTo(16, shY - 4);
    ctx.quadraticCurveTo(24, hipY - 6, 30, hipY + 14);
    ctx.quadraticCurveTo(0, hipY + 24, -30, hipY + 14);
    ctx.quadraticCurveTo(-24, hipY - 6, -16, shY - 4);
    ctx.closePath();
    ctx.fill();
    // fåll
    if (o.trim === 'rainbow') {
      for (let i = 0; i < 5; i++) {
        ctx.strokeStyle = RAINBOW[i + 1];
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(-29 + i, hipY + 13 - i * 3.2);
        ctx.quadraticCurveTo(0, hipY + 23 - i * 3.2, 29 - i, hipY + 13 - i * 3.2);
        ctx.stroke();
      }
    } else {
      ctx.strokeStyle = o.trim === 'pink' ? '#ff9ed9' : '#ffffff';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(-29, hipY + 13);
      ctx.quadraticCurveTo(0, hipY + 23, 29, hipY + 13);
      ctx.stroke();
    }
    if (o.star) {
      ctx.fillStyle = PAL.gold;
      starPath(ctx, 0, shY + 18, 9, 4.2, 5, -Math.PI / 2);
      ctx.fill();
    }
    if (o.apron) {
      ctx.fillStyle = 'rgba(255,255,255,0.92)';
      ctx.beginPath();
      ctx.moveTo(-12, shY + 8);
      ctx.lineTo(12, shY + 8);
      ctx.lineTo(20, hipY + 12);
      ctx.quadraticCurveTo(0, hipY + 19, -20, hipY + 12);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = PAL.gold;
      ctx.beginPath();
      ctx.arc(0, hipY - 10, 6, 0, TAU);
      ctx.fill(); // guldmynt-logga
    }
  } else if (o.type === 'suit' || o.type === 'parka') {
    ctx.fillStyle = o.c1;
    const w = o.type === 'parka' ? 26 : 22;
    ctx.beginPath();
    ctx.moveTo(-w + 4, shY - 6);
    ctx.lineTo(w - 4, shY - 6);
    ctx.quadraticCurveTo(w + 2, hipY - 10, w - 2, hipY + 12);
    ctx.quadraticCurveTo(0, hipY + 20, -w + 2, hipY + 12);
    ctx.quadraticCurveTo(-w - 2, hipY - 10, -w + 4, shY - 6);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = o.c2;
    ctx.lineWidth = 3.5;
    ctx.stroke();
    // dragkedja + bälte
    ctx.strokeStyle = o.trim === 'gold' ? PAL.gold : '#fff';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, shY - 2);
    ctx.lineTo(0, hipY + 8);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-w + 2, hipY - 4);
    ctx.lineTo(w - 2, hipY - 4);
    ctx.stroke();
    if (cfg.hoodFur) {
      ctx.fillStyle = '#fff';
      for (let i = -3; i <= 3; i++) {
        ctx.beginPath();
        ctx.arc(i * 7, shY - 8 + Math.abs(i) * 1.4, 5.5, 0, TAU);
        ctx.fill();
      }
    }
  }
}

function drawFace(ctx, cfg, t, headY, headR, p) {
  const blink = ((t + (cfg.blinkOff || 0)) % 3.8) < 0.12;
  const look = (p && p.look) || { x: 0, y: 0 };
  const eyeY = headY - 2, eyeDX = 13;
  for (let side = -1; side <= 1; side += 2) {
    const ex = side * eyeDX + 2;
    if (blink) {
      ctx.strokeStyle = '#4a3040';
      ctx.lineWidth = 2.6;
      ctx.beginPath();
      ctx.moveTo(ex - 6, eyeY + 2);
      ctx.quadraticCurveTo(ex, eyeY + 5, ex + 6, eyeY + 2);
      ctx.stroke();
    } else {
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.ellipse(ex, eyeY, 7.5, 9.5, 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = cfg.eyeC;
      ctx.beginPath();
      ctx.arc(ex + look.x * 3 + 1, eyeY + look.y * 3 + 1, 5, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#221626';
      ctx.beginPath();
      ctx.arc(ex + look.x * 3 + 1, eyeY + look.y * 3 + 1, 2.6, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(ex + look.x * 3 - 1, eyeY + look.y * 3 - 2, 1.7, 0, TAU);
      ctx.fill();
      // fransar
      ctx.strokeStyle = '#4a3040';
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.moveTo(ex - 7, eyeY - 7);
      ctx.quadraticCurveTo(ex, eyeY - 11, ex + 7, eyeY - 7);
      ctx.stroke();
    }
  }
  // kinder
  ctx.fillStyle = cfg.cheek;
  ctx.globalAlpha = 0.55;
  ctx.beginPath(); ctx.ellipse(-15, headY + 11, 6.5, 4.5, 0, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.ellipse(19, headY + 11, 6.5, 4.5, 0, 0, TAU); ctx.fill();
  ctx.globalAlpha = 1;
  if (cfg.heartCheek) {
    ctx.fillStyle = '#ff3fa4';
    heartPath(ctx, 19, headY + 10, 5);
    ctx.fill();
  }
  // mun
  const mouth = (p && p.mouth) || 'smile';
  const talking = p && p.talk ? (Math.sin(t * 14) > 0) : false;
  ctx.strokeStyle = '#8c3a55';
  ctx.fillStyle = '#a84a66';
  ctx.lineWidth = 2.8;
  const mY = headY + 16;
  if (mouth === 'open' || talking) {
    ctx.beginPath();
    ctx.ellipse(2, mY + 2, 6.5, 8, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#ff8fa8';
    ctx.beginPath();
    ctx.ellipse(2, mY + 5, 4, 3.4, 0, 0, TAU);
    ctx.fill();
  } else if (mouth === 'o') {
    ctx.beginPath();
    ctx.arc(2, mY + 2, 4.5, 0, TAU);
    ctx.fill();
  } else if (mouth === 'sad') {
    ctx.beginPath();
    ctx.moveTo(-6, mY + 5);
    ctx.quadraticCurveTo(2, mY - 1, 10, mY + 5);
    ctx.stroke();
  } else {
    ctx.beginPath();
    ctx.moveTo(-7, mY);
    ctx.quadraticCurveTo(2, mY + 7, 11, mY);
    ctx.stroke();
  }
  if (cfg.fangs && mouth !== 'o') {
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.moveTo(-4, mY + 2); ctx.lineTo(-2, mY + 8); ctx.lineTo(0, mY + 2); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(4, mY + 2); ctx.lineTo(6, mY + 8); ctx.lineTo(8, mY + 2); ctx.closePath(); ctx.fill();
  }
  if (cfg.glasses) {
    ctx.strokeStyle = '#3a2a1a';
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(-11, eyeY, 10, 0, TAU); ctx.stroke();
    ctx.beginPath(); ctx.arc(15, eyeY, 10, 0, TAU); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-1, eyeY); ctx.lineTo(5, eyeY); ctx.stroke();
  }
  if (cfg.beard) {
    ctx.fillStyle = cfg.hairC;
    ctx.beginPath();
    ctx.moveTo(-20, headY + 8);
    ctx.quadraticCurveTo(0, headY + 46, 22, headY + 8);
    ctx.quadraticCurveTo(10, headY + 24, 2, headY + 23);
    ctx.quadraticCurveTo(-8, headY + 24, -20, headY + 8);
    ctx.closePath();
    ctx.fill();
  }
}

function dark(hex, f) {
  // enkel mörkning av #rrggbb
  const r = Math.round(parseInt(hex.substr(1, 2), 16) * f);
  const g = Math.round(parseInt(hex.substr(3, 2), 16) * f);
  const b = Math.round(parseInt(hex.substr(5, 2), 16) * f);
  return 'rgb(' + r + ',' + g + ',' + b + ')';
}

function drawBackHair(ctx, cfg, t, headY, headR, ph, mode) {
  const sway = Math.sin(t * 2.6 + ph) * 4 + (mode === 'walk' ? Math.sin(ph) * 3 : 0);
  ctx.fillStyle = cfg.hairC;
  if (cfg.style === 'ponytail') {
    // hästsvans som svajar
    ctx.save();
    ctx.translate(-headR + 6, headY - 14);
    ctx.rotate(-0.5 + sway * 0.04);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(-26 - sway, 26, -18 - sway * 1.6, 62);
    ctx.quadraticCurveTo(-12 - sway, 70, -4 - sway * 0.5, 62);
    ctx.quadraticCurveTo(-12, 30, 6, 6);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = cfg.hairS;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(-4, 8);
    ctx.quadraticCurveTo(-18 - sway, 32, -12 - sway * 1.4, 58);
    ctx.stroke();
    ctx.restore();
  } else if (cfg.style === 'pigtails') {
    for (let side = -1; side <= 1; side += 2) {
      ctx.save();
      ctx.translate(side * (headR - 2), headY - 12);
      ctx.rotate(side * (0.35 + sway * 0.03));
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.quadraticCurveTo(side * 18, 30, side * 8 + sway * 0.4, 66);
      ctx.quadraticCurveTo(side * -2, 70, side * -8, 60);
      ctx.quadraticCurveTo(side * -6, 26, 0, 0);
      ctx.closePath();
      ctx.fill();
      // rosa slinga
      ctx.strokeStyle = cfg.hairS;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(side * 2, 10);
      ctx.quadraticCurveTo(side * 12, 34, side * 4 + sway * 0.4, 60);
      ctx.stroke();
      // tofsband
      ctx.fillStyle = '#ff3fa4';
      ctx.beginPath(); ctx.arc(0, 4, 5, 0, TAU); ctx.fill();
      ctx.fillStyle = cfg.hairC;
      ctx.restore();
    }
  } else if (cfg.style === 'long') {
    ctx.beginPath();
    ctx.moveTo(-headR, headY - 8);
    ctx.quadraticCurveTo(-headR - 10 - sway, headY + 40, -headR + 4 - sway, headY + 78);
    ctx.quadraticCurveTo(0, headY + 88, headR - 4 + sway, headY + 78);
    ctx.quadraticCurveTo(headR + 10 + sway, headY + 40, headR, headY - 8);
    ctx.closePath();
    ctx.fill();
  } else if (cfg.style === 'bun') {
    ctx.beginPath();
    ctx.arc(0, headY - headR + 2, 15, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = cfg.hairS;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, headY - headR + 2, 10, 0.4, 2.6);
    ctx.stroke();
  }
}

function drawFrontHair(ctx, cfg, t, headY, headR, ph, mode) {
  ctx.fillStyle = cfg.hairC;
  // lugg
  ctx.beginPath();
  ctx.moveTo(-headR - 2, headY + 2);
  ctx.quadraticCurveTo(-headR - 4, headY - headR - 6, 0, headY - headR - 4);
  ctx.quadraticCurveTo(headR + 6, headY - headR - 6, headR + 2, headY + 4);
  ctx.quadraticCurveTo(headR - 6, headY - 10, headR - 14, headY - 16);
  ctx.quadraticCurveTo(6, headY - 26, -6, headY - 14);
  ctx.quadraticCurveTo(-16, headY - 4, -headR + 6, headY + 6);
  ctx.closePath();
  ctx.fill();
  // glansslinga
  ctx.strokeStyle = cfg.hairS;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(-14, headY - headR + 6);
  ctx.quadraticCurveTo(2, headY - headR + 2, 16, headY - headR + 10);
  ctx.stroke();
  // accessoar
  if (cfg.acc === 'bow') {
    ctx.fillStyle = cfg.accC;
    heartPath(ctx, -16, headY - headR + 4, 7);
    ctx.fill();
    heartPath(ctx, -4, headY - headR + 2, 7);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(-10, headY - headR + 5, 3.5, 0, TAU);
    ctx.fill();
  } else if (cfg.acc === 'scrunchie') {
    ctx.fillStyle = cfg.accC;
    ctx.beginPath();
    ctx.arc(-headR + 6, headY - 14, 6, 0, TAU);
    ctx.fill();
  }
}

// ---------- Sjöjungfrun Melinda ----------
export function drawMermaid(ctx, x, y, t, pose) {
  const p = pose || {};
  const s = p.s === undefined ? 1 : p.s;
  const face = p.face === undefined ? 1 : p.face;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s * face, s);
  const sway = Math.sin(t * 2.2) * 8;
  ctx.translate(0, Math.sin(t * 1.7) * 5);

  // stjärt
  const g = ctx.createLinearGradient(0, -60, 0, 70);
  g.addColorStop(0, '#39d7d0');
  g.addColorStop(1, '#1e8fa8');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(-16, -58);
  ctx.quadraticCurveTo(-24, -10, -8 + sway * 0.4, 30);
  ctx.quadraticCurveTo(0 + sway, 52, 8 + sway, 62);
  ctx.quadraticCurveTo(14 + sway, 50, 10 + sway * 0.5, 28);
  ctx.quadraticCurveTo(22, -12, 16, -58);
  ctx.closePath();
  ctx.fill();
  // fena
  ctx.fillStyle = '#5ce8de';
  ctx.beginPath();
  ctx.moveTo(8 + sway, 58);
  ctx.quadraticCurveTo(-18 + sway, 74, -22 + sway, 92);
  ctx.quadraticCurveTo(2 + sway, 84, 10 + sway, 72);
  ctx.quadraticCurveTo(20 + sway, 86, 38 + sway, 90);
  ctx.quadraticCurveTo(30 + sway, 70, 12 + sway, 58);
  ctx.closePath();
  ctx.fill();
  // fjäll
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = 2;
  for (let row = 0; row < 5; row++) {
    for (let i = -1; i <= 1; i++) {
      ctx.beginPath();
      ctx.arc(i * 9 + (row % 2) * 4 + sway * row * 0.08, -40 + row * 16, 6, 0.15, Math.PI - 0.15);
      ctx.stroke();
    }
  }

  // överkropp
  ctx.fillStyle = '#ffd9c4';
  ctx.beginPath();
  ctx.moveTo(-15, -58);
  ctx.quadraticCurveTo(-17, -92, -12, -100);
  ctx.lineTo(12, -100);
  ctx.quadraticCurveTo(17, -92, 15, -58);
  ctx.closePath();
  ctx.fill();
  // armar
  capsule(ctx, -12, -94, -30, -66 + Math.sin(t * 2.5) * 6, 9, '#ffd9c4');
  capsule(ctx, 12, -94, 30, -70 + Math.sin(t * 2.5 + 1) * 6, 9, '#ffd9c4');
  // snäcktopp
  ctx.fillStyle = '#c95cff';
  ctx.beginPath(); ctx.arc(-8, -84, 9, 0, Math.PI); ctx.fill();
  ctx.beginPath(); ctx.arc(8, -84, 9, 0, Math.PI); ctx.fill();

  // huvud
  const headY = -128, headR = 30;
  ctx.fillStyle = '#ffd9c4';
  ctx.beginPath(); ctx.arc(0, headY, headR, 0, TAU); ctx.fill();

  // långt rött hår som flödar i vattnet
  ctx.fillStyle = '#d64a2e';
  ctx.beginPath();
  ctx.moveTo(-headR, headY - 6);
  ctx.quadraticCurveTo(-headR - 16 - sway, headY + 50, -headR + 2 - sway * 1.4, headY + 118);
  ctx.quadraticCurveTo(-6, headY + 128, 2, headY + 116);
  ctx.quadraticCurveTo(-14, headY + 60, -10, headY + 16);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(headR, headY - 6);
  ctx.quadraticCurveTo(headR + 14 + sway, headY + 44, headR - 4 + sway * 1.3, headY + 100);
  ctx.quadraticCurveTo(10, headY + 112, 6, headY + 98);
  ctx.quadraticCurveTo(18, headY + 52, 10, headY + 14);
  ctx.closePath();
  ctx.fill();
  // lugg
  ctx.beginPath();
  ctx.moveTo(-headR - 2, headY + 4);
  ctx.quadraticCurveTo(-headR, headY - headR - 4, 2, headY - headR - 2);
  ctx.quadraticCurveTo(headR + 4, headY - headR - 2, headR + 2, headY + 6);
  ctx.quadraticCurveTo(headR - 8, headY - 12, headR - 16, headY - 18);
  ctx.quadraticCurveTo(0, headY - 26, -10, headY - 14);
  ctx.quadraticCurveTo(-18, headY - 4, -headR + 4, headY + 8);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#ff7a52';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(-12, headY - headR + 8);
  ctx.quadraticCurveTo(4, headY - headR + 4, 16, headY - headR + 12);
  ctx.stroke();

  // ansikte
  const blink = (t % 4.1) < 0.12;
  for (let side = -1; side <= 1; side += 2) {
    const ex = side * 11 + 1, ey = headY;
    if (blink) {
      ctx.strokeStyle = '#5a2a3a';
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.moveTo(ex - 5, ey + 2);
      ctx.quadraticCurveTo(ex, ey + 5, ex + 5, ey + 2);
      ctx.stroke();
    } else {
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.ellipse(ex, ey, 6.5, 8.5, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = '#2ea88a';
      ctx.beginPath(); ctx.arc(ex + 1, ey + 1, 4.4, 0, TAU); ctx.fill();
      ctx.fillStyle = '#1a2626';
      ctx.beginPath(); ctx.arc(ex + 1, ey + 1, 2.2, 0, TAU); ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(ex - 1, ey - 2, 1.5, 0, TAU); ctx.fill();
    }
  }
  ctx.fillStyle = '#ff9e8a';
  ctx.globalAlpha = 0.5;
  ctx.beginPath(); ctx.ellipse(-13, headY + 10, 5.5, 4, 0, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.ellipse(15, headY + 10, 5.5, 4, 0, 0, TAU); ctx.fill();
  ctx.globalAlpha = 1;
  ctx.strokeStyle = '#8c3a55';
  ctx.lineWidth = 2.6;
  ctx.beginPath();
  ctx.moveTo(-6, headY + 14);
  ctx.quadraticCurveTo(1, headY + 20, 9, headY + 14);
  ctx.stroke();
  // sjöstjärna i håret
  ctx.fillStyle = PAL.gold;
  starPath(ctx, headR - 6, headY - headR + 10, 8, 3.6, 5, 0.3);
  ctx.fill();

  ctx.restore();
}

// ---------- Enhörningen Stella ----------
export function drawUnicorn(ctx, x, y, t, pose) {
  const p = pose || {};
  const s = p.s === undefined ? 1 : p.s;
  const face = p.face === undefined ? 1 : p.face;
  const mode = p.mode || 'stand';
  const ph = p.ph || 0;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s * face, s);

  const bob = mode === 'gallop' ? Math.abs(Math.sin(ph)) * -8 : Math.sin(t * 1.6) * -2;
  ctx.translate(0, bob);
  const bodyY = -58;

  // svans (regnbåge)
  for (let i = 0; i < 5; i++) {
    ctx.strokeStyle = RAINBOW[i + 1];
    ctx.lineWidth = 6 - i * 0.6;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-52, bodyY - 6);
    const swx = Math.sin(t * 2.8 + i * 0.6) * 10;
    ctx.quadraticCurveTo(-78 - i * 3 + swx, bodyY + 8 + i * 4, -70 - i * 4 + swx, bodyY + 44 + i * 5);
    ctx.stroke();
  }

  // ben (galopp-par)
  const legs = [
    { x: -38, phOff: 0 }, { x: -26, phOff: Math.PI * 0.9, far: true },
    { x: 26, phOff: Math.PI }, { x: 38, phOff: Math.PI * 0.1, far: true }
  ];
  for (let i = 0; i < legs.length; i++) {
    const L = legs[i];
    let a = 0;
    if (mode === 'gallop' || mode === 'walk') a = Math.sin(ph + L.phOff) * (mode === 'gallop' ? 0.7 : 0.4);
    if (mode === 'rear') a = L.x > 0 ? -1 : 0.25;
    const kx = L.x + Math.sin(a) * 22;
    const ky = bodyY + 28 + Math.cos(a) * 28;
    capsule(ctx, L.x, bodyY + 20, kx, ky, 12, L.far ? '#e2dcf2' : '#f7f4ff');
    ctx.fillStyle = PAL.gold;
    ctx.beginPath();
    ctx.ellipse(kx, ky + 4, 8, 6, 0, 0, TAU);
    ctx.fill();
  }

  // kropp
  const g = ctx.createLinearGradient(0, bodyY - 34, 0, bodyY + 30);
  g.addColorStop(0, '#ffffff');
  g.addColorStop(1, '#e8e2f6');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(0, bodyY, 58, 34, 0, 0, TAU);
  ctx.fill();

  // hals + huvud
  const headX = 46, headYY = bodyY - 52;
  ctx.beginPath();
  ctx.moveTo(26, bodyY - 22);
  ctx.quadraticCurveTo(36, headYY + 10, headX - 4, headYY + 2);
  ctx.lineTo(headX + 16, headYY + 22);
  ctx.quadraticCurveTo(40, bodyY - 2, 30, bodyY + 6);
  ctx.closePath();
  ctx.fill();
  // huvud
  ctx.beginPath();
  ctx.ellipse(headX + 8, headYY, 24, 19, -0.25, 0, TAU);
  ctx.fill();
  // nos
  ctx.fillStyle = '#f0e8ff';
  ctx.beginPath();
  ctx.ellipse(headX + 28, headYY + 6, 11, 9, -0.2, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#c9b8e0';
  ctx.beginPath(); ctx.arc(headX + 31, headYY + 5, 1.8, 0, TAU); ctx.fill();
  // öra
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.moveTo(headX - 4, headYY - 14);
  ctx.lineTo(headX + 2, headYY - 30);
  ctx.lineTo(headX + 10, headYY - 14);
  ctx.closePath();
  ctx.fill();
  // öga med fransar
  const blink = (t % 4.4) < 0.13;
  if (blink) {
    ctx.strokeStyle = '#4a3050';
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(headX - 2, headYY - 2);
    ctx.quadraticCurveTo(headX + 4, headYY + 1, headX + 10, headYY - 2);
    ctx.stroke();
  } else {
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.ellipse(headX + 4, headYY - 2, 6, 7.5, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#7b4dff';
    ctx.beginPath(); ctx.arc(headX + 5, headYY - 1, 4.2, 0, TAU); ctx.fill();
    ctx.fillStyle = '#221626';
    ctx.beginPath(); ctx.arc(headX + 5, headYY - 1, 2, 0, TAU); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(headX + 3.4, headYY - 3, 1.4, 0, TAU); ctx.fill();
    ctx.strokeStyle = '#4a3050';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(headX - 3, headYY - 8);
    ctx.quadraticCurveTo(headX + 4, headYY - 12, headX + 11, headYY - 8);
    ctx.stroke();
  }

  // horn (guld med spiral)
  ctx.save();
  ctx.translate(headX + 4, headYY - 16);
  ctx.rotate(-0.5);
  const hg = ctx.createLinearGradient(0, -34, 0, 0);
  hg.addColorStop(0, '#fff0b3');
  hg.addColorStop(1, PAL.gold2);
  ctx.fillStyle = hg;
  ctx.beginPath();
  ctx.moveTo(-5, 0);
  ctx.lineTo(0, -36);
  ctx.lineTo(5, 0);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = PAL.goldDark;
  ctx.lineWidth = 1.6;
  for (let i = 1; i <= 3; i++) {
    ctx.beginPath();
    ctx.moveTo(-5 + i * 1.3, -i * 8 + 2);
    ctx.lineTo(5 - i * 1.1, -i * 8 - 3);
    ctx.stroke();
  }
  ctx.restore();

  // man (regnbåge, flödande)
  for (let i = 0; i < 6; i++) {
    ctx.strokeStyle = RAINBOW[i];
    ctx.lineWidth = 5.5 - i * 0.5;
    ctx.lineCap = 'round';
    const swx = Math.sin(t * 3 + i * 0.7) * 6;
    ctx.beginPath();
    ctx.moveTo(headX - 2 - i * 2, headYY - 12 + i * 2);
    ctx.quadraticCurveTo(18 - i * 2 + swx, headYY + 6 + i * 5, 6 - i * 3 + swx, bodyY - 20 + i * 6);
    ctx.stroke();
  }

  ctx.restore();
}

// ---------- Porträtt (dialogrutor) ----------
export function drawPortrait(ctx, who, x, y, size, t, opts) {
  const o = opts || {};
  const cfg = WHO[who];
  const theme = cfg ? cfg.theme : (who === 'melinda' ? '#39d7d0' : who === 'stella' ? '#c95cff' : '#8a5cff');
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, size / 2, 0, TAU);
  const g = ctx.createRadialGradient(x, y - size * 0.2, size * 0.1, x, y, size / 2);
  g.addColorStop(0, '#fff');
  g.addColorStop(1, theme);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.clip();
  const cs = size / 190;
  if (who === 'melinda') {
    drawMermaid(ctx, x, y + size * 0.92, t, { s: cs * 1.1 });
  } else if (who === 'stella') {
    drawUnicorn(ctx, x - size * 0.16, y + size * 0.62, t, { s: cs * 1.15 });
  } else if (cfg) {
    drawGirl(ctx, x, y + size * 0.78, t, cfg, { s: cs * (cfg.adult ? 0.82 : 1), mode: 'stand', mouth: o.talk ? 'open' : 'smile', talk: o.talk });
  }
  ctx.restore();
  ctx.beginPath();
  ctx.arc(x, y, size / 2, 0, TAU);
  ctx.strokeStyle = theme;
  ctx.lineWidth = 5;
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.8)';
  ctx.lineWidth = 2;
  ctx.stroke();
}
