// Uppläsning (TTS) för alla dialoger, tips och meddelanden — Alice kan inte
// läsa ännu! Web Speech API med svensk röst. Varje karaktär får egen tonhöjd
// och eget tempo, och utropstecken/pauser färgar känslan. Robotiga röster
// (eSpeak m.fl.) väljs bort om något bättre finns.

import { SAVE, persist } from './save.js';

const CHAR_VOICE = {
  alice: { pitch: 1.35, rate: 1.05 },      // pigg sjuåring
  papa: { pitch: 0.72, rate: 0.96 },       // varm pappa-bas
  draculaura: { pitch: 1.25, rate: 1.0 },  // sött spöklik
  nastya: { pitch: 1.45, rate: 1.1 },      // bubblig
  melinda: { pitch: 1.1, rate: 0.88 },     // lugn som havet
  stella: { pitch: 1.2, rate: 1.02 },      // sagolik
  narrator: { pitch: 1.05, rate: 1.0 }
};

let voice = null;
let searched = false;

function pickVoice() {
  if (!window.speechSynthesis) return null;
  const vs = window.speechSynthesis.getVoices();
  if (!vs || vs.length === 0) return null;
  let best = null, bestScore = -999;
  for (let i = 0; i < vs.length; i++) {
    const v = vs[i];
    const lang = (v.lang || '').toLowerCase();
    if (lang.indexOf('sv') !== 0) continue;
    let s = 0;
    if (/google/i.test(v.name)) s += 50;         // Googles svenska är naturlig
    if (/natural|premium|enhanced|siri/i.test(v.name)) s += 40;
    if (/espeak|compact|robot/i.test(v.name)) s -= 80;  // robotröster: nej tack
    if (!v.localService) s += 5;
    if (s > bestScore) { bestScore = s; best = v; }
  }
  return best;
}

function clean(text) {
  let x = String(text);
  x = x.replace(/(\d)\s*\/\s*(\d)/g, '$1 av $2');   // "3/12" → "3 av 12"
  x = x.replace(/•/g, ' och ');
  try {
    x = x.replace(/\p{Extended_Pictographic}/gu, '');
  } catch (e) { /* äldre motor utan property escapes — läs som det är */ }
  x = x.replace(/[♪♫★⭐✨🌈→←↺↻▲▼—]/g, ' ');
  x = x.replace(/\s+/g, ' ').trim();
  return x;
}

export const TTS = {
  init: function () {
    if (!window.speechSynthesis) return;
    voice = pickVoice();
    const self = this;
    try {
      window.speechSynthesis.addEventListener('voiceschanged', function () {
        voice = pickVoice();
      });
    } catch (e) { /* ok */ }
  },

  available: function () { return !!voice; },

  setOn: function (b) {
    SAVE.tts = !!b;
    persist();
    if (!b) this.stop();
  },

  // who: karaktärsnamn (alice/papa/…) eller 'narrator'.
  // opts.queue: köa efter pågående tal i stället för att ersätta det.
  say: function (text, who, opts) {
    if (!window.speechSynthesis || !SAVE.tts) return;
    if (!voice) { voice = pickVoice(); if (!voice) return; }
    const o = opts || {};
    const spoken = clean(text);
    if (!spoken) return;
    if (!o.queue) {
      try { window.speechSynthesis.cancel(); } catch (e) {}
    }
    const u = new window.SpeechSynthesisUtterance(spoken);
    u.voice = voice;
    u.lang = voice.lang || 'sv-SE';
    const cv = CHAR_VOICE[who] || CHAR_VOICE.narrator;
    let pitch = cv.pitch;
    let rate = cv.rate;
    // känslouttryck: utrop höjer, pauser saktar, frågor lyfter
    const bangs = (text.match(/!/g) || []).length;
    pitch += Math.min(2, bangs) * 0.06;
    rate += Math.min(2, bangs) * 0.025;
    if (text.indexOf('…') >= 0) rate -= 0.07;
    if (/\?\s*$/.test(spoken)) pitch += 0.05;
    u.pitch = Math.max(0.5, Math.min(2, pitch));
    u.rate = Math.max(0.7, Math.min(1.45, rate));
    u.volume = 1;
    try { window.speechSynthesis.speak(u); } catch (e) {}
  },

  stop: function () {
    if (!window.speechSynthesis) return;
    try { window.speechSynthesis.cancel(); } catch (e) {}
  }
};
