// Rekvisita: flygplan, kugghjul, guldlådor, nyckel, brevlåda, interaktions-bubbla.
// Delas av flera scener.

import { TAU, PAL, RAINBOW } from './config.js';
import { rr, starPath, heartPath } from './render.js';

// Alices rosa flygplan (sidovy, nos åt höger)
export function drawPlane(ctx, x, y, angle, t, opts) {
  const o = opts || {};
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle || 0);

  // vinge bakom kroppen
  ctx.fillStyle = '#e84f9e';
  rr(ctx, -34, -8, 86, 22, 11);
  ctx.fill();

  // kropp
  const g = ctx.createLinearGradient(0, -34, 0, 30);
  g.addColorStop(0, '#ff9ed9');
  g.addColorStop(0.5, '#ff6bcb');
  g.addColorStop(1, '#d63f96');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(-78, -14);
  ctx.quadraticCurveTo(-40, -30, 20, -28);
  ctx.quadraticCurveTo(66, -24, 84, -6);
  ctx.quadraticCurveTo(88, 4, 82, 10);
  ctx.quadraticCurveTo(40, 22, -50, 16);
  ctx.quadraticCurveTo(-74, 12, -78, -14);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#a82e74';
  ctx.lineWidth = 3;
  ctx.stroke();

  // guldrand
  ctx.strokeStyle = PAL.gold;
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(-70, 2);
  ctx.quadraticCurveTo(0, 10, 78, 0);
  ctx.stroke();

  // stjärt
  ctx.fillStyle = '#ff6bcb';
  ctx.beginPath();
  ctx.moveTo(-58, -12);
  ctx.lineTo(-84, -46);
  ctx.quadraticCurveTo(-92, -50, -90, -38);
  ctx.lineTo(-76, -8);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#a82e74';
  ctx.lineWidth = 2.5;
  ctx.stroke();
  // stjärna på stjärten
  ctx.fillStyle = PAL.gold;
  starPath(ctx, -80, -36, 9, 4, 5, 0);
  ctx.fill();

  // cockpit med Alice
  if (o.alice !== false) {
    ctx.fillStyle = 'rgba(160,220,255,0.5)';
    ctx.beginPath();
    ctx.arc(8, -26, 20, Math.PI, 0);
    ctx.fill();
    // Alices huvud
    ctx.fillStyle = '#ffdbc4';
    ctx.beginPath(); ctx.arc(8, -28, 13, 0, TAU); ctx.fill();
    ctx.fillStyle = '#8a5a2b';
    ctx.beginPath();
    ctx.arc(8, -32, 13, Math.PI * 0.9, Math.PI * 2.1);
    ctx.fill();
    // öga + leende
    ctx.fillStyle = '#2b1a2e';
    ctx.beginPath(); ctx.arc(13, -28, 2, 0, TAU); ctx.fill();
    ctx.strokeStyle = '#8c3a55';
    ctx.lineWidth = 1.8;
    ctx.beginPath(); ctx.arc(11, -24, 4, 0.2, Math.PI - 0.6); ctx.stroke();
    // halsduk som fladdrar
    if (o.scarf !== false) {
      for (let i = 0; i < 3; i++) {
        ctx.strokeStyle = RAINBOW[i * 2];
        ctx.lineWidth = 4 - i * 0.7;
        ctx.beginPath();
        ctx.moveTo(0, -18);
        const fl = Math.sin(t * 10 + i) * 8;
        ctx.quadraticCurveTo(-26, -20 + fl * 0.4, -46, -14 + fl);
        ctx.stroke();
      }
    }
  }

  // hjärta målat på nosen
  ctx.fillStyle = '#fff';
  heartPath(ctx, 44, -8, 9);
  ctx.fill();

  // propeller (snurr-oskärpa)
  const spin = o.spin === undefined ? 1 : o.spin;
  ctx.save();
  ctx.translate(88, -2);
  if (spin > 0.05) {
    ctx.rotate(t * 40 * spin);
    ctx.fillStyle = 'rgba(230,230,240,0.55)';
    for (let i = 0; i < 3; i++) {
      ctx.rotate(TAU / 3);
      ctx.beginPath();
      ctx.ellipse(0, -22, 5.5, 24, 0, 0, TAU);
      ctx.fill();
    }
  } else {
    ctx.fillStyle = '#d8d8e2';
    ctx.beginPath(); ctx.ellipse(0, -24, 6, 25, 0, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.ellipse(0, 24, 6, 25, 0, 0, TAU); ctx.fill();
  }
  ctx.fillStyle = PAL.gold;
  ctx.beginPath(); ctx.arc(0, 0, 8, 0, TAU); ctx.fill();
  ctx.restore();

  // hjul
  if (o.wheels !== false) {
    for (let i = 0; i < 2; i++) {
      const wx = -30 + i * 55;
      ctx.strokeStyle = '#7a5a2a';
      ctx.lineWidth = 5;
      ctx.beginPath(); ctx.moveTo(wx, 14); ctx.lineTo(wx, 30); ctx.stroke();
      ctx.fillStyle = '#332a3a';
      ctx.beginPath(); ctx.arc(wx, 34, 11, 0, TAU); ctx.fill();
      ctx.fillStyle = PAL.gold;
      ctx.beginPath(); ctx.arc(wx, 34, 4, 0, TAU); ctx.fill();
    }
  }
  ctx.restore();
}

export function drawGear(ctx, x, y, r, ang, placed) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(ang || 0);
  const teeth = Math.max(7, Math.round(r / 5.4));
  const g = ctx.createRadialGradient(-r * 0.3, -r * 0.3, r * 0.2, 0, 0, r * 1.2);
  if (placed) {
    g.addColorStop(0, '#ffe9a8');
    g.addColorStop(1, PAL.gold2);
  } else {
    g.addColorStop(0, '#d9dde8');
    g.addColorStop(1, '#8f97a8');
  }
  ctx.fillStyle = g;
  ctx.beginPath();
  for (let i = 0; i < teeth; i++) {
    const a0 = (i / teeth) * TAU;
    const a1 = ((i + 0.42) / teeth) * TAU;
    const a2 = ((i + 0.5) / teeth) * TAU;
    const a3 = ((i + 0.92) / teeth) * TAU;
    const R = r * 1.22;
    ctx.lineTo(Math.cos(a0) * r, Math.sin(a0) * r);
    ctx.lineTo(Math.cos(a0) * R, Math.sin(a0) * R);
    ctx.lineTo(Math.cos(a1) * R, Math.sin(a1) * R);
    ctx.lineTo(Math.cos(a2) * r, Math.sin(a2) * r);
    ctx.lineTo(Math.cos(a3) * r, Math.sin(a3) * r);
  }
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = placed ? PAL.goldDark : '#5a6272';
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.fillStyle = 'rgba(30,20,40,0.85)';
  ctx.beginPath(); ctx.arc(0, 0, r * 0.32, 0, TAU); ctx.fill();
  ctx.strokeStyle = placed ? PAL.goldDark : '#5a6272';
  ctx.beginPath(); ctx.arc(0, 0, r * 0.62, 0, TAU); ctx.stroke();
  ctx.restore();
}

export function drawCrate(ctx, x, y, angle, size) {
  const s = size / 2;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  const g = ctx.createLinearGradient(-s, -s, s, s);
  g.addColorStop(0, '#ffe08a');
  g.addColorStop(0.5, PAL.gold);
  g.addColorStop(1, PAL.gold2);
  ctx.fillStyle = g;
  rr(ctx, -s, -s, size, size, 10);
  ctx.fill();
  ctx.strokeStyle = PAL.goldDark;
  ctx.lineWidth = 4;
  ctx.stroke();
  ctx.strokeStyle = 'rgba(169,123,22,0.55)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(-s + 12, -s + 4); ctx.lineTo(-s + 12, s - 4);
  ctx.moveTo(s - 12, -s + 4); ctx.lineTo(s - 12, s - 4);
  ctx.stroke();
  ctx.fillStyle = PAL.goldDark;
  starPath(ctx, 0, 0, s * 0.42, s * 0.19, 5, -Math.PI / 2);
  ctx.fill();
  // nitar
  ctx.fillStyle = '#b8871f';
  const c = s - 9;
  const pts = [[-c, -c], [c, -c], [-c, c], [c, c]];
  for (let i = 0; i < 4; i++) {
    ctx.beginPath(); ctx.arc(pts[i][0], pts[i][1], 3.4, 0, TAU); ctx.fill();
  }
  ctx.restore();
}

export function drawKey(ctx, x, y, t) {
  ctx.save();
  ctx.translate(x, y + Math.sin(t * 2.5) * 6);
  ctx.rotate(Math.sin(t * 1.8) * 0.12);
  ctx.strokeStyle = PAL.gold;
  ctx.fillStyle = PAL.gold;
  ctx.lineWidth = 7;
  ctx.lineCap = 'round';
  ctx.beginPath(); ctx.arc(0, -14, 12, 0, TAU); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(0, -2); ctx.lineTo(0, 26); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(0, 14); ctx.lineTo(10, 14); ctx.moveTo(0, 24); ctx.lineTo(13, 24); ctx.stroke();
  ctx.restore();
}

export function drawMailbox(ctx, x, y, t, hasLetter) {
  ctx.save();
  ctx.translate(x, y);
  // stolpe
  ctx.fillStyle = '#7a5a3a';
  ctx.fillRect(-6, -46, 12, 66);
  // låda
  const g = ctx.createLinearGradient(0, -86, 0, -46);
  g.addColorStop(0, '#ff8fd0');
  g.addColorStop(1, '#e84f9e');
  ctx.fillStyle = g;
  rr(ctx, -34, -88, 68, 44, 14);
  ctx.fill();
  ctx.strokeStyle = '#a82e74';
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.fillStyle = '#fff';
  heartPath(ctx, 0, -66, 8);
  ctx.fill();
  if (hasLetter) {
    // flagga upp + kuvert som sticker ut
    ctx.save();
    ctx.rotate(Math.sin(t * 3) * 0.05);
    ctx.fillStyle = PAL.gold;
    ctx.fillRect(30, -108, 6, 26);
    starPath(ctx, 33, -114, 10, 4.5, 5, 0);
    ctx.fill();
    ctx.restore();
    ctx.fillStyle = '#fff';
    ctx.save();
    ctx.translate(0, -92 + Math.sin(t * 2.2) * 3);
    ctx.rotate(-0.12);
    ctx.fillRect(-20, -14, 40, 26);
    ctx.strokeStyle = '#d0a8c0';
    ctx.lineWidth = 2;
    ctx.strokeRect(-20, -14, 40, 26);
    ctx.beginPath();
    ctx.moveTo(-20, -14); ctx.lineTo(0, 0); ctx.lineTo(20, -14);
    ctx.stroke();
    ctx.restore();
  }
  ctx.restore();
}

// pulserande "tryck här"-bubbla över interaktiva saker
export function drawActionBubble(ctx, x, y, t) {
  const p = 1 + Math.sin(t * 5) * 0.08;
  ctx.save();
  ctx.translate(x, y - Math.abs(Math.sin(t * 3)) * 6);
  ctx.scale(p, p);
  ctx.fillStyle = 'rgba(255,255,255,0.95)';
  ctx.beginPath();
  ctx.arc(0, 0, 26, 0, TAU);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(-8, 22); ctx.lineTo(0, 36); ctx.lineTo(8, 22);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = PAL.hotpink;
  ctx.lineWidth = 3.5;
  ctx.beginPath();
  ctx.arc(0, 0, 26, 0, TAU);
  ctx.stroke();
  ctx.font = '26px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('✋', 0, 2);
  ctx.restore();
}
