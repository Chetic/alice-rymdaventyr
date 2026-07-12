// Input: pekskärm (stora knappar), tangentbord och pekare/drag.
// Scener läser IN-state; kant-flaggor (Edge) gäller en frame och nollas i endFrame().

import { PAL, TAU } from './config.js';
import { view, toView, rr, txt } from './render.js';

// Nollad input — skickas till spelaren när dialog/paus blockerar
export const NO_IN = {
  ax: 0, up: false, down: false,
  jump: false, jumpEdge: false,
  action: false, actionEdge: false,
  thrust: false, rotL: false, rotR: false
};

export const IN = {
  ax: 0,                 // -1..1 vänster/höger
  up: false, down: false,
  jump: false, jumpEdge: false,
  action: false, actionEdge: false,
  thrust: false,
  rotL: false, rotR: false,
  pauseEdge: false,
  taps: [],              // [{x,y}] i vy-koordinater, denna frame (ej på knappar)
  pointer: { down: false, x: 0, y: 0, id: -1 }
};

const keys = {};
let buttons = [];        // aktiva skärmknappar
let scheme = 'none';
let schemeOpts = {};

const KEYMAP = {
  ArrowLeft: 'left', a: 'left', A: 'left',
  ArrowRight: 'right', d: 'right', D: 'right',
  ArrowUp: 'up', w: 'up', W: 'up',
  ArrowDown: 'down', s: 'down', S: 'down',
  ' ': 'jump', z: 'jump', Z: 'jump',
  x: 'action', X: 'action', e: 'action', E: 'action', Enter: 'action'
};

function keyState(name) { return !!keys[name]; }

function recompute() {
  const left = keyState('left') || btnHeld('left');
  const right = keyState('right') || btnHeld('right');
  IN.ax = (right ? 1 : 0) - (left ? 1 : 0);
  IN.up = keyState('up') || btnHeld('up');
  IN.down = keyState('down') || btnHeld('down');
  setWithEdge('jump', keyState('jump') || keyState('up') && scheme === 'walk' || btnHeld('jump'));
  setWithEdge('action', keyState('action') || btnHeld('action'));
  IN.thrust = keyState('jump') || keyState('up') || btnHeld('thrust');
  IN.rotL = keyState('left') || btnHeld('rotL');
  IN.rotR = keyState('right') || btnHeld('rotR');
}

function setWithEdge(name, val) {
  if (val && !IN[name]) IN[name + 'Edge'] = true;
  IN[name] = val;
}

function btnHeld(act) {
  for (let i = 0; i < buttons.length; i++) {
    if (buttons[i].act === act && buttons[i].pid !== -1) return true;
  }
  return false;
}

export function initInput(canvas) {
  window.addEventListener('keydown', function (e) {
    const act = KEYMAP[e.key];
    if (act) { keys[act] = true; recompute(); e.preventDefault(); }
    if (e.key === 'Escape' || e.key === 'p' || e.key === 'P') IN.pauseEdge = true;
  });
  window.addEventListener('keyup', function (e) {
    const act = KEYMAP[e.key];
    if (act) { keys[act] = false; recompute(); }
  });

  canvas.addEventListener('pointerdown', function (e) {
    e.preventDefault();
    const p = toView(e.clientX, e.clientY);
    // knapp?
    for (let i = 0; i < buttons.length; i++) {
      const b = buttons[i];
      const dx = p.x - b.x, dy = p.y - b.y;
      if (dx * dx + dy * dy < b.r * b.r * 1.35) {   // generös träffyta
        b.pid = e.pointerId;
        recompute();
        return;
      }
    }
    IN.taps.push({ x: p.x, y: p.y });
    if (IN.pointer.id === -1) {
      IN.pointer.down = true;
      IN.pointer.x = p.x; IN.pointer.y = p.y;
      IN.pointer.id = e.pointerId;
    }
  });
  canvas.addEventListener('pointermove', function (e) {
    if (e.pointerId === IN.pointer.id) {
      const p = toView(e.clientX, e.clientY);
      IN.pointer.x = p.x; IN.pointer.y = p.y;
    }
  });
  function release(e) {
    for (let i = 0; i < buttons.length; i++) {
      if (buttons[i].pid === e.pointerId) buttons[i].pid = -1;
    }
    if (e.pointerId === IN.pointer.id) {
      IN.pointer.down = false;
      IN.pointer.id = -1;
    }
    recompute();
  }
  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', release);
  canvas.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  // stoppa dubbeltryck-zoom/gester på äldre Chromium
  canvas.addEventListener('touchstart', function (e) { e.preventDefault(); }, { passive: false });
  canvas.addEventListener('touchmove', function (e) { e.preventDefault(); }, { passive: false });
}

export function setScheme(name, opts) {
  scheme = name;
  schemeOpts = opts || {};
  buttons = [];
  const R = 86, m = 56;
  function add(act, icon, x, y, r) {
    buttons.push({ act: act, icon: icon, x: x, y: y, r: r || R, pid: -1 });
  }
  // positioner räknas om varje frame i layout() (vy-bredden kan ändras)
  if (name === 'walk') {
    add('left', 'arrowL', 0, 0);
    add('right', 'arrowR', 0, 0);
    add('jump', 'arrowU', 0, 0);
    if (schemeOpts.action) add('action', 'hand', 0, 0);
  } else if (name === 'plane') {
    add('up', 'arrowU', 0, 0);
    add('down', 'arrowD', 0, 0);
    add('thrust', 'fire', 0, 0);
  } else if (name === 'rocket') {
    add('rotL', 'turnL', 0, 0);
    add('rotR', 'turnR', 0, 0);
    add('thrust', 'fire', 0, 0);
  }
  layout();
}

function layout() {
  const R = 86, m = 60;
  const bx = m + R, by = VHval() - m - R;
  for (let i = 0; i < buttons.length; i++) {
    const b = buttons[i];
    if (b.act === 'left' || b.act === 'rotL') { b.x = bx; b.y = by; }
    if (b.act === 'right' || b.act === 'rotR') { b.x = bx + R * 2 + 34; b.y = by; }
    if (b.act === 'up') { b.x = bx; b.y = by - R * 2 - 34; }
    if (b.act === 'down') { b.x = bx; b.y = by; }
    if (b.act === 'jump') { b.x = view.w - m - R; b.y = by; }
    if (b.act === 'action') { b.x = view.w - m - R * 3 - 40; b.y = by; }
    if (b.act === 'thrust') { b.x = view.w - m - R; b.y = by; }
  }
}

function VHval() { return 1080; }

export function hasScheme() { return scheme !== 'none' && buttons.length > 0; }

export function drawControls(ctx, t) {
  if (!buttons.length) return;
  layout();
  for (let i = 0; i < buttons.length; i++) {
    const b = buttons[i];
    const held = b.pid !== -1;
    ctx.save();
    ctx.translate(b.x, b.y);
    if (held) ctx.scale(0.92, 0.92);
    ctx.globalAlpha = held ? 0.95 : 0.62;
    ctx.beginPath(); ctx.arc(0, 0, b.r, 0, TAU);
    ctx.fillStyle = held ? 'rgba(64,28,110,0.95)' : 'rgba(30,14,58,0.78)';
    ctx.fill();
    ctx.lineWidth = 5;
    ctx.strokeStyle = held ? PAL.gold : 'rgba(255,210,74,0.75)';
    ctx.stroke();
    ctx.globalAlpha = 1;
    drawIcon(ctx, b.icon, b.r);
    ctx.restore();
  }
}

function drawIcon(ctx, icon, r) {
  ctx.fillStyle = '#fff';
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 10;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const s = r * 0.42;
  if (icon === 'arrowL' || icon === 'arrowR' || icon === 'arrowU' || icon === 'arrowD') {
    ctx.save();
    if (icon === 'arrowR') ctx.rotate(Math.PI);
    if (icon === 'arrowU') ctx.rotate(Math.PI / 2);
    if (icon === 'arrowD') ctx.rotate(-Math.PI / 2);
    ctx.beginPath();
    ctx.moveTo(s * 0.7, -s);
    ctx.lineTo(-s * 0.5, 0);
    ctx.lineTo(s * 0.7, s);
    ctx.stroke();
    ctx.restore();
  } else if (icon === 'fire') {
    ctx.font = Math.round(r * 0.9) + 'px sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('🔥', 0, 6);
  } else if (icon === 'hand') {
    ctx.font = Math.round(r * 0.85) + 'px sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('✋', 0, 4);
  } else if (icon === 'turnL' || icon === 'turnR') {
    ctx.save();
    if (icon === 'turnR') ctx.scale(-1, 1);
    ctx.beginPath();
    ctx.arc(0, 0, s, -Math.PI * 0.15, Math.PI * 1.05);
    ctx.stroke();
    ctx.beginPath();
    const ax = Math.cos(-Math.PI * 0.15) * s, ay = Math.sin(-Math.PI * 0.15) * s;
    ctx.moveTo(ax - 16, ay - 20);
    ctx.lineTo(ax + 10, ay - 2);
    ctx.lineTo(ax - 22, ay + 10);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
}

// clearEdges=false när frame:en inte körde något fysiksteg (höga Hz-skärmar) —
// annars tappas tryck som kom mellan stegen.
export function endFrame(clearEdges) {
  if (clearEdges !== false) {
    IN.jumpEdge = false;
    IN.actionEdge = false;
  }
  IN.pauseEdge = false;
  IN.taps.length = 0;
}
