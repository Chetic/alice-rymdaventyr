// Sparning i localStorage — autosparas vid checkpoints och scenbyten.

const KEY = 'alice7-save-v1';

// Berättelsens ordning; progress = nästa del att spela
export const ORDER = [
  'home', 'flight', 'spaceport',
  'travel_moon', 'moon',
  'travel_asteroid', 'asteroid',
  'travel_europa', 'europa',
  'travel_saturn', 'saturn',
  'travel_neptune', 'neptune',
  'homecoming', 'party'
];

function defaults() {
  return {
    v: 1,
    progress: 'home',       // nästa story-scen
    coins: { gold: 0, silver: 0 },
    rings: 0,               // regnbågsringar i flygturen
    gems: 0,                // ädelstenar
    flags: {},              // planeUnlocked, rocketBuilt, starKey, suit, compass, rainbowFuel, foundPapa
    music: true,
    sfx: true,
    finished: false
  };
}

export const SAVE = defaults();

export function loadSave() {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return false;
    const d = JSON.parse(raw);
    if (!d || d.v !== 1) return false;
    const base = defaults();
    for (const k in base) {
      if (Object.prototype.hasOwnProperty.call(d, k)) SAVE[k] = d[k];
      else SAVE[k] = base[k];
    }
    if (!SAVE.coins) SAVE.coins = { gold: 0, silver: 0 };
    if (!SAVE.flags) SAVE.flags = {};
    return true;
  } catch (e) { return false; }
}

export function persist() {
  try { window.localStorage.setItem(KEY, JSON.stringify(SAVE)); } catch (e) { /* fullt/privat läge — ok */ }
}

export function resetSave() {
  const d = defaults();
  for (const k in d) SAVE[k] = d[k];
  persist();
}

export function hasSave() {
  try { return !!window.localStorage.getItem(KEY); } catch (e) { return false; }
}

// Flytta fram berättelsen (aldrig bakåt)
export function advanceTo(sceneId) {
  const cur = ORDER.indexOf(SAVE.progress);
  const nxt = ORDER.indexOf(sceneId);
  if (nxt > cur) SAVE.progress = sceneId;
  persist();
}

export function addCoins(kind, n) {
  SAVE.coins[kind] = (SAVE.coins[kind] || 0) + n;
  persist();
}

export function coinTotal() {
  return (SAVE.coins.gold || 0) * 10 + (SAVE.coins.silver || 0) * 5;
}

// Dra av exakt antal mynt (gold, silver) — returnerar false om det inte går
export function spendCoins(gold, silver) {
  if ((SAVE.coins.gold || 0) < gold || (SAVE.coins.silver || 0) < silver) return false;
  SAVE.coins.gold -= gold;
  SAVE.coins.silver -= silver;
  persist();
  return true;
}

export function setFlag(name, val) {
  SAVE.flags[name] = val === undefined ? true : val;
  persist();
}

export function flag(name) { return !!SAVE.flags[name]; }
