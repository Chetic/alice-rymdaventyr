// Konstanter, palett, text och små matte-hjälpare.
// VIKTIGT: hela kodbasen hålls ES2018-kompatibel (Tesla ~Chromium 79):
// inga ?. ?? ||= .at() replaceAll, inga klassfält, ingen OffscreenCanvas.

export const VH = 1080;            // virtuell höjd — allt ritas i denna skala
export const VW_MIN = 1200;
export const VW_MAX = 2400;
export const STEP = 1000 / 60;     // fast fysik-tidssteg (ms)
export const TAU = Math.PI * 2;

// Gravitation per plats (Matter gravity.y-skala, jorden = 1)
export const GRAV = {
  earth: 1.0,
  moon: 0.17,
  asteroid: 0.06,
  europa: 0.13,
  saturn: 0.4,
  neptune: 1.15,
  space: 0
};

// Regnbågens sju färger — Alices favoriter
export const RAINBOW = ['#ff4d6d', '#ff9e40', '#ffd24a', '#59d666', '#3fb8ff', '#7b6bff', '#c95cff'];

export const PAL = {
  night1: '#0b0518', night2: '#1a0f3a', night3: '#2a1a5e',
  gold: '#ffd24a', gold2: '#ffb42a', goldDark: '#a97b16', goldGlow: '#fff0b3',
  silver: '#e8eef7', silver2: '#b8c4d6', silverDark: '#7e8ca0',
  pink: '#ff6bcb', hotpink: '#ff3fa4', rosa2: '#ffb3e2',
  purple: '#8a5cff', teal: '#39d7d0', sky: '#7ec8ff',
  white: '#ffffff', ink: '#2b1a3a',
  uiBg: 'rgba(24,10,48,0.82)', uiEdge: '#ffd24a'
};

// Vanliga UI-texter (scenspecifik text bor i respektive scen)
export const TXT = {
  start: 'Starta äventyret',
  cont: 'Fortsätt',
  freeplay: 'Fri flygning',
  install: 'Installera appen 📲',
  music: 'Musik',
  sfx: 'Ljud',
  pause: 'Paus',
  resume: 'Spela vidare',
  restart: 'Börja om delen',
  toTitle: 'Till startsidan',
  newGame: 'Nytt äventyr',
  hint: 'Tips!',
  coins: 'mynt',
  ok: 'OK!',
  next: 'Nästa'
};

// URL-parametrar: ?scene=moon&debug=1
function parseQuery() {
  const q = { scene: '', debug: false };
  try {
    const s = window.location.search.substring(1).split('&');
    for (let i = 0; i < s.length; i++) {
      const kv = s[i].split('=');
      if (kv[0] === 'scene') q.scene = decodeURIComponent(kv[1] || '');
      if (kv[0] === 'debug') q.debug = kv[1] === '1';
    }
  } catch (e) { /* ok */ }
  return q;
}
export const QUERY = parseQuery();

// ---- Matte-hjälpare ----
export function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
export function lerp(a, b, t) { return a + (b - a) * t; }
export function lerpAng(a, b, t) {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return a + d * t;
}
export function rand(a, b) { return a + Math.random() * (b - a); }
export function randi(a, b) { return Math.floor(rand(a, b + 1)); }
export function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
export function easeOut(t) { const u = 1 - t; return 1 - u * u * u; }
export function easeInOut(t) { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; }
export function dist(x1, y1, x2, y2) { const dx = x2 - x1, dy = y2 - y1; return Math.sqrt(dx * dx + dy * dy); }
