// Procedurell musikmotor (Web Audio): lookahead-sequencer, syntinstrument,
// genererat konvolver-reverb, adaptiva lager per låt samt alla ljudeffekter.
// Ingen extern ljudfil — allt komponeras i kod.

import { SAVE } from './save.js';

let ctx = null;
let musicBus = null, sfxBus = null, wetBus = null, master = null;
let noiseBuf = null;
let current = null;          // aktiv låt
let fading = [];             // låtar på väg ut
let tickId = 0;
let pendingSong = null;
let lastLeadHz = 0;
const loops = {};            // namngivna loopljud (raket, vind, bubblor)

function midiHz(m) { return 440 * Math.pow(2, (m - 69) / 12); }

// ---------- Init (kräver användartryck) ----------
export const AUD = {
  ready: false,

  init: function () {
    if (this.ready) {
      // väck en somnad/suspenderad kontext (t.ex. efter flikbyte)
      if (ctx && ctx.state !== 'running') { try { ctx.resume(); } catch (e) {} }
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createDynamicsCompressor();
    master.threshold.value = -14;
    master.knee.value = 20;
    master.ratio.value = 5;
    master.attack.value = 0.004;
    master.release.value = 0.24;
    master.connect(ctx.destination);

    musicBus = ctx.createGain();
    musicBus.gain.value = SAVE.music ? 0.9 : 0;
    musicBus.connect(master);

    sfxBus = ctx.createGain();
    sfxBus.gain.value = SAVE.sfx ? 0.9 : 0;
    sfxBus.connect(master);

    // Reverb: genererat stereoimpulssvar med exponentiellt avtag
    const conv = ctx.createConvolver();
    const len = Math.floor(ctx.sampleRate * 1.9);
    const ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch);
      for (let i = 0; i < len; i++) {
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6);
      }
    }
    conv.buffer = ir;
    wetBus = ctx.createGain();
    wetBus.gain.value = 0.4;
    wetBus.connect(conv);
    conv.connect(musicBus);

    // brusbuffert för trummor/effekter
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const nd = noiseBuf.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;

    tickId = window.setInterval(schedTick, 30);
    this.ready = true;
    if (ctx.state !== 'running') { try { ctx.resume(); } catch (e) {} }
    if (pendingSong) { const s = pendingSong; pendingSong = null; this.playSong(s); }
  },

  state: function () { return ctx ? ctx.state : 'none'; },

  setMusicOn: function (b) {
    SAVE.music = !!b;
    if (musicBus) musicBus.gain.setTargetAtTime(b ? 0.9 : 0, ctx.currentTime, 0.1);
  },
  setSfxOn: function (b) {
    SAVE.sfx = !!b;
    if (sfxBus) sfxBus.gain.setTargetAtTime(b ? 0.9 : 0, ctx.currentTime, 0.05);
  },

  // ---------- Låtar ----------
  playSong: function (name) {
    if (!this.ready) { pendingSong = name; return; }
    if (current && current.name === name) return;
    if (current) {
      const old = current;
      old.gain.gain.setTargetAtTime(0, ctx.currentTime, 0.5);
      old.dead = ctx.currentTime + 2.5;
      fading.push(old);
    }
    current = null;
    const def = SONGS[name];
    if (!def) return;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    gain.gain.setTargetAtTime(def.gain === undefined ? 0.8 : def.gain, ctx.currentTime, 0.6);
    gain.connect(musicBus);
    const layers = {};
    for (let i = 0; i < def.layers.length; i++) {
      const L = def.layers[i];
      const lg = ctx.createGain();
      lg.gain.value = L.on === false ? 0 : (L.gain === undefined ? 0.8 : L.gain);
      lg.connect(gain);
      const wet = ctx.createGain();
      wet.gain.value = (L.wet === undefined ? 0.35 : L.wet);
      lg.connect(wet);
      wet.connect(wetBus);
      layers[L.id] = { def: L, gain: lg, target: L.gain === undefined ? 0.8 : L.gain };
    }
    current = { name: name, def: def, gain: gain, layers: layers, step: 0, nextTime: ctx.currentTime + 0.06 };
  },

  stopSong: function () {
    if (current) {
      current.gain.gain.setTargetAtTime(0, ctx.currentTime, 0.4);
      current.dead = ctx.currentTime + 2;
      fading.push(current);
      current = null;
    }
  },

  setLayer: function (id, on, fade) {
    if (!current) return;
    const L = current.layers[id];
    if (!L) return;
    L.gain.gain.setTargetAtTime(on ? L.target : 0, ctx.currentTime, fade === undefined ? 0.5 : fade);
    L.def.on = on;
  },

  songName: function () { return current ? current.name : ''; },

  // Enskild ton (används av korallpusslet m.m.)
  note: function (midi, dur, instName, vel) {
    if (!this.ready || !SAVE.sfx) return;
    const inst = INST[instName || 'box'];
    inst(ctx.currentTime + 0.01, midi, dur === undefined ? 0.5 : dur, vel === undefined ? 0.9 : vel, sfxBus);
  },

  // ---------- Loopade ljud ----------
  loop: function (name, on, gain) {
    if (!this.ready) return;
    let L = loops[name];
    if (on) {
      if (!L) {
        const src = ctx.createBufferSource();
        src.buffer = noiseBuf;
        src.loop = true;
        const filt = ctx.createBiquadFilter();
        const g = ctx.createGain();
        g.gain.value = 0;
        if (name === 'thrust') {
          filt.type = 'lowpass'; filt.frequency.value = 260; filt.Q.value = 0.6;
        } else if (name === 'wind') {
          filt.type = 'bandpass'; filt.frequency.value = 820; filt.Q.value = 0.9;
          const lfo = ctx.createOscillator();
          const lg = ctx.createGain();
          lfo.frequency.value = 0.17;
          lg.gain.value = 330;
          lfo.connect(lg); lg.connect(filt.frequency);
          lfo.start();
          L = { lfo: lfo };
        } else if (name === 'water') {
          filt.type = 'lowpass'; filt.frequency.value = 480; filt.Q.value = 0.4;
        }
        src.connect(filt); filt.connect(g); g.connect(sfxBus);
        src.start();
        loops[name] = Object.assign({ src: src, g: g, filt: filt }, L || {});
        L = loops[name];
      }
      L.g.gain.setTargetAtTime(gain === undefined ? 0.25 : gain, ctx.currentTime, 0.12);
    } else if (L) {
      L.g.gain.setTargetAtTime(0, ctx.currentTime, 0.15);
    }
  },

  // ---------- Ljudeffekter ----------
  sfx: function (name, opt) {
    if (!this.ready || !SAVE.sfx) return;
    const t = ctx.currentTime + 0.005;
    const o = opt || {};
    if (name === 'coinG') { ping(t, 88, 0.09); ping(t + 0.07, 93, 0.16); }
    else if (name === 'coinS') { ping(t, 84, 0.08); ping(t + 0.06, 88, 0.13); }
    else if (name === 'gem') { ping(t, 91, 0.1); ping(t + 0.06, 96, 0.1); ping(t + 0.12, 100, 0.2); }
    else if (name === 'jump') { blip(t, 300, 560, 0.12, 'square', 0.12); }
    else if (name === 'click') { blip(t, 700, 640, 0.05, 'triangle', 0.14); }
    else if (name === 'wrong') { blip(t, 320, 255, 0.22, 'triangle', 0.16); }
    else if (name === 'pop') { blip(t, 220, 900, 0.07, 'sine', 0.2); }
    else if (name === 'unlock') { ping(t, 76, 0.2); ping(t + 0.1, 83, 0.2); ping(t + 0.2, 88, 0.4); }
    else if (name === 'fanfare') {
      const ns = [72, 76, 79, 84];
      for (let i = 0; i < ns.length; i++) INST.bell(t + i * 0.09, ns[i], 0.5, 0.8, sfxBus);
      INST.bell(t + 0.4, 88, 1.1, 0.9, sfxBus);
    }
    else if (name === 'bigwin') {
      const ns = [60, 64, 67, 72, 76, 79, 84, 88];
      for (let i = 0; i < ns.length; i++) INST.bell(t + i * 0.07, ns[i], 0.8, 0.75, sfxBus);
    }
    else if (name === 'ring') {
      const pent = [72, 74, 76, 79, 81, 84, 86, 88, 91, 93, 96, 98];
      const idx = Math.min(pent.length - 1, o.n || 0);
      INST.bell(t, pent[idx], 0.7, 0.85, sfxBus);
    }
    else if (name === 'splash') { noiseHit(t, 900, 0.5, 0.35, 0.5); }
    else if (name === 'crash') { noiseHit(t, 400, 0.4, 0.5, 1.2); thump(t, 90, 0.4); }
    else if (name === 'thump') { thump(t, 120, 0.3); }
    else if (name === 'crack') { noiseHit(t, 2400, 0.12, 0.4, 2); }
    else if (name === 'freeze') { blip(t, 900, 320, 0.5, 'sine', 0.1); }
    else if (name === 'magic') { for (let i = 0; i < 5; i++) ping(t + i * 0.05, 84 + i * 3, 0.14); }
    else if (name === 'whoosh') { noiseHit(t, 600, 0.35, 0.2, 0.8); }
    else if (name === 'drop') { INST.drop(t, o.n === undefined ? 70 : o.n, 0.3, 0.7, sfxBus); }
  }
};

function ping(t, midi, dur) {
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = 'sine'; o.frequency.value = midiHz(midi);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.35, t + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.25);
  o.connect(g); g.connect(sfxBus);
  o.start(t); o.stop(t + dur + 0.3);
}

function blip(t, f0, f1, dur, type, vol) {
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(Math.max(40, f1), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.015);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.05);
  o.connect(g); g.connect(sfxBus);
  o.start(t); o.stop(t + dur + 0.1);
}

function noiseHit(t, freq, dur, vol, q) {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  const f = ctx.createBiquadFilter();
  f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = q;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f); f.connect(g); g.connect(sfxBus);
  src.start(t); src.stop(t + dur + 0.05);
}

function thump(t, f, vol) {
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = 'sine';
  o.frequency.setValueAtTime(f, t);
  o.frequency.exponentialRampToValueAtTime(38, t + 0.16);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
  o.connect(g); g.connect(sfxBus);
  o.start(t); o.stop(t + 0.45);
}

// ---------- Instrument ----------
const INST = {
  bell: function (t, m, dur, v, out) {
    const f = midiHz(m);
    const car = ctx.createOscillator(), mod = ctx.createOscillator();
    const mg = ctx.createGain(), g = ctx.createGain();
    car.type = 'sine'; car.frequency.value = f;
    mod.type = 'sine'; mod.frequency.value = f * 3.01;
    mg.gain.setValueAtTime(f * 1.7, t);
    mg.gain.exponentialRampToValueAtTime(f * 0.06, t + Math.min(1.1, dur + 0.5));
    mod.connect(mg); mg.connect(car.frequency);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.3 * v, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 1.2);
    car.connect(g); g.connect(out);
    car.start(t); mod.start(t);
    car.stop(t + dur + 1.3); mod.stop(t + dur + 1.3);
  },
  box: function (t, m, dur, v, out) {   // speldosa
    const f = midiHz(m + 12);
    const o1 = ctx.createOscillator(), o2 = ctx.createOscillator(), g = ctx.createGain();
    o1.type = 'triangle'; o1.frequency.value = f;
    o2.type = 'sine'; o2.frequency.value = f * 4.02;
    const g2 = ctx.createGain(); g2.gain.value = 0.12;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.26 * v, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
    o1.connect(g); o2.connect(g2); g2.connect(g); g.connect(out);
    o1.start(t); o2.start(t); o1.stop(t + 1); o2.stop(t + 0.4);
  },
  pad: function (t, m, dur, v, out) {
    const f = midiHz(m);
    const g = ctx.createGain();
    const filt = ctx.createBiquadFilter();
    filt.type = 'lowpass'; filt.frequency.value = 750; filt.Q.value = 0.4;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.085 * v, t + Math.min(0.7, dur * 0.4));
    g.gain.setValueAtTime(0.085 * v, t + dur * 0.75);
    g.gain.linearRampToValueAtTime(0.0001, t + dur + 0.8);
    const dets = [-7, 4, 11];
    for (let i = 0; i < dets.length; i++) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = f;
      o.detune.value = dets[i];
      o.connect(filt);
      o.start(t); o.stop(t + dur + 1);
    }
    filt.connect(g); g.connect(out);
  },
  strings: function (t, m, dur, v, out) {  // varmare pad, högre filter
    const f = midiHz(m);
    const g = ctx.createGain();
    const filt = ctx.createBiquadFilter();
    filt.type = 'lowpass'; filt.frequency.setValueAtTime(900, t);
    filt.frequency.linearRampToValueAtTime(1900, t + dur * 0.6);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.07 * v, t + 0.3);
    g.gain.setValueAtTime(0.07 * v, t + dur * 0.8);
    g.gain.linearRampToValueAtTime(0.0001, t + dur + 0.6);
    const dets = [-5, 5];
    for (let i = 0; i < dets.length; i++) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth'; o.frequency.value = f; o.detune.value = dets[i];
      o.connect(filt); o.start(t); o.stop(t + dur + 0.8);
    }
    filt.connect(g); g.connect(out);
  },
  pluck: function (t, m, dur, v, out) {
    const f = midiHz(m);
    const o = ctx.createOscillator(), g = ctx.createGain();
    const filt = ctx.createBiquadFilter();
    filt.type = 'lowpass';
    filt.frequency.setValueAtTime(3200, t);
    filt.frequency.exponentialRampToValueAtTime(700, t + 0.22);
    o.type = 'triangle'; o.frequency.value = f;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.3 * v, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
    o.connect(filt); filt.connect(g); g.connect(out);
    o.start(t); o.stop(t + 0.5);
  },
  harp: function (t, m, dur, v, out) {
    const f = midiHz(m);
    const o = ctx.createOscillator(), o2 = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sine'; o.frequency.value = f;
    o2.type = 'triangle'; o2.frequency.value = f * 2;
    const g2 = ctx.createGain(); g2.gain.value = 0.1;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.22 * v, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.8);
    o.connect(g); o2.connect(g2); g2.connect(g); g.connect(out);
    o.start(t); o2.start(t); o.stop(t + 0.9); o2.stop(t + 0.9);
  },
  bass: function (t, m, dur, v, out) {
    const f = midiHz(m);
    const o = ctx.createOscillator(), g = ctx.createGain();
    const filt = ctx.createBiquadFilter();
    filt.type = 'lowpass'; filt.frequency.value = 420;
    o.type = 'sine'; o.frequency.value = f;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.34 * v, t + 0.02);
    g.gain.setValueAtTime(0.3 * v, t + dur * 0.7);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.1);
    o.connect(filt); filt.connect(g); g.connect(out);
    o.start(t); o.stop(t + dur + 0.2);
  },
  marimba: function (t, m, dur, v, out) {
    const f = midiHz(m);
    const o = ctx.createOscillator(), o2 = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sine'; o.frequency.value = f;
    o2.type = 'sine'; o2.frequency.value = f * 4;
    const g2 = ctx.createGain();
    g2.gain.setValueAtTime(0.09, t);
    g2.gain.exponentialRampToValueAtTime(0.0001, t + 0.08);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.3 * v, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.32);
    o.connect(g); o2.connect(g2); g2.connect(g); g.connect(out);
    o.start(t); o2.start(t); o.stop(t + 0.4); o2.stop(t + 0.15);
  },
  lead: function (t, m, dur, v, out) {   // theremin-aktig
    const f = midiHz(m);
    const o = ctx.createOscillator(), g = ctx.createGain();
    const lfo = ctx.createOscillator(), lg = ctx.createGain();
    o.type = 'sine';
    const from = lastLeadHz > 0 ? lastLeadHz : f;
    o.frequency.setValueAtTime(from, t);
    o.frequency.exponentialRampToValueAtTime(f, t + 0.07);
    lastLeadHz = f;
    lfo.frequency.value = 5.4;
    lg.gain.setValueAtTime(0, t);
    lg.gain.linearRampToValueAtTime(f * 0.012, t + 0.35);
    lfo.connect(lg); lg.connect(o.frequency);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.16 * v, t + 0.06);
    g.gain.setValueAtTime(0.16 * v, t + dur * 0.8);
    g.gain.linearRampToValueAtTime(0.0001, t + dur + 0.2);
    o.connect(g); g.connect(out);
    o.start(t); lfo.start(t);
    o.stop(t + dur + 0.3); lfo.stop(t + dur + 0.3);
  },
  drop: function (t, m, dur, v, out) {   // vattendroppe
    const f = midiHz(m);
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(f * 1.7, t);
    o.frequency.exponentialRampToValueAtTime(f, t + 0.09);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.22 * v, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
    o.connect(g); g.connect(out);
    o.start(t); o.stop(t + 0.35);
  },
  kick: function (t, m, dur, v, out) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(150, t);
    o.frequency.exponentialRampToValueAtTime(44, t + 0.11);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.5 * v, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
    o.connect(g); g.connect(out);
    o.start(t); o.stop(t + 0.3);
  },
  hat: function (t, m, dur, v, out) {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    src.playbackRate.value = 1.6;
    const f = ctx.createBiquadFilter();
    f.type = 'highpass'; f.frequency.value = 7200;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.12 * v, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
    src.connect(f); f.connect(g); g.connect(out);
    src.start(t); src.stop(t + 0.08);
  },
  snare: function (t, m, dur, v, out) {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass'; f.frequency.value = 1900; f.Q.value = 0.8;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.24 * v, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.13);
    src.connect(f); f.connect(g); g.connect(out);
    src.start(t); src.stop(t + 0.2);
    const o = ctx.createOscillator(), g2 = ctx.createGain();
    o.type = 'sine'; o.frequency.value = 195;
    g2.gain.setValueAtTime(0.12 * v, t);
    g2.gain.exponentialRampToValueAtTime(0.0001, t + 0.08);
    o.connect(g2); g2.connect(out);
    o.start(t); o.stop(t + 0.1);
  }
};

// ---------- Sequencer ----------
function schedTick() {
  if (!ctx) return;
  // städa uttonade låtar
  for (let i = fading.length - 1; i >= 0; i--) {
    if (ctx.currentTime > fading[i].dead) {
      try { fading[i].gain.disconnect(); } catch (e) {}
      fading.splice(i, 1);
    }
  }
  if (!current || !SAVE.music) {
    if (current) current.nextTime = Math.max(current.nextTime, ctx.currentTime + 0.05);
    return;
  }
  const def = current.def;
  const stepDur = 60 / def.bpm / 4;
  let guard = 0;
  while (current.nextTime < ctx.currentTime + 0.15 && guard < 48) {
    scheduleStep(current, current.step, current.nextTime, stepDur);
    current.step++;
    current.nextTime += stepDur;
    guard++;
  }
}

function scheduleStep(song, absStep, t, stepDur) {
  const def = song.def;
  const sib = absStep % def.steps;
  const bar = Math.floor(absStep / def.steps) % def.prog.length;
  const chord = def.prog[bar];
  for (const id in song.layers) {
    const L = song.layers[id];
    if (L.def.on === false && L.gain.gain.value < 0.01) continue;
    const notes = L.def.pat(sib, bar, chord, def, absStep);
    if (!notes) continue;
    for (let i = 0; i < notes.length; i++) {
      const n = notes[i];
      const inst = INST[n.i || L.def.inst];
      if (!inst) continue;
      inst(t, n.n, (n.d === undefined ? 1 : n.d) * stepDur, n.v === undefined ? 0.8 : n.v, L.gain);
    }
  }
}

// ---------- Musikteori-hjälpare ----------
const CHORD_T = { M: [0, 4, 7], m: [0, 3, 7], 7: [0, 4, 7, 10], m7: [0, 3, 7, 10], M7: [0, 4, 7, 11], sus: [0, 5, 7], M6: [0, 4, 7, 9] };
function ch(root, type) {
  const iv = CHORD_T[type || 'M'];
  const ns = [];
  for (let i = 0; i < iv.length; i++) ns.push(root + iv[i]);
  return { r: root, n: ns };
}

// Mönsterfabriker: returnerar pat(stepInBar, bar, chord, def, absStep) → [{n,d,v,i}]
function pArp(rate, oct, dir) {
  return function (s, bar, c, def) {
    if (s % rate !== 0) return null;
    const idx = ((s / rate) + bar * (def.steps / rate));
    const L = c.n.length;
    let k;
    if (dir === 'ud') {
      const period = L * 2 - 2;
      const m = idx % period;
      k = m < L ? m : period - m;
    } else k = idx % L;
    return [{ n: c.n[k] + 12 * (oct || 0) }];
  };
}
function pBass(stepsArr, oct) {
  return function (s, bar, c) {
    for (let i = 0; i < stepsArr.length; i++) {
      if (s === stepsArr[i]) {
        const fifth = i % 2 === 1;
        return [{ n: c.r + (fifth ? 7 : 0) + 12 * (oct === undefined ? -1 : oct), d: 3, v: 0.9 }];
      }
    }
    return null;
  };
}
function pPad(oct, everyBars) {
  return function (s, bar, c, def) {
    if (s !== 0) return null;
    if (everyBars && bar % everyBars !== 0) return null;
    const out = [];
    for (let i = 0; i < c.n.length; i++) out.push({ n: c.n[i] + 12 * (oct || 0), d: def.steps * (everyBars || 1), v: 0.8 });
    return out;
  };
}
function pComp(stepsArr, oct, v) {
  return function (s, bar, c) {
    if (stepsArr.indexOf(s) === -1) return null;
    const out = [];
    for (let i = 0; i < c.n.length; i++) out.push({ n: c.n[i] + 12 * (oct || 0), d: 1, v: v || 0.55 });
    return out;
  };
}
function pDrum(map) {
  return function (s) {
    const d = map[s];
    if (!d) return null;
    const out = [];
    for (let i = 0; i < d.length; i++) out.push({ n: 60, i: d[i], v: 1 });
    return out;
  };
}
function pMel(events, loopSteps, inst, oct, v) {
  const table = {};
  for (let i = 0; i < events.length; i++) {
    const e = events[i];
    if (!table[e[0]]) table[e[0]] = [];
    table[e[0]].push({ n: e[1] + 12 * (oct || 0), d: e[2] === undefined ? 2 : e[2], v: e[3] === undefined ? (v || 0.85) : e[3], i: inst });
  }
  return function (s, bar, c, def, absStep) {
    return table[absStep % loopSteps] || null;
  };
}
function pTwinkle(prob, oct) {
  return function (s, bar, c) {
    if (Math.random() > prob) return null;
    const n = c.n[Math.floor(Math.random() * c.n.length)];
    return [{ n: n + 12 * (oct || 2), d: 2, v: 0.4 }];
  };
}

// ---------- Huvudtemat (Alice-temat) — återkommer i titel, återförening och fest ----------
// 4 takter à 16 steg i C-dur: C  G  Am  F
const THEME = [
  [0, 76, 3], [4, 79, 3], [8, 84, 6],
  [16, 83, 2], [20, 79, 3], [24, 81, 6],
  [32, 81, 3], [36, 84, 3], [40, 88, 4], [44, 86, 3],
  [48, 84, 3], [52, 81, 2], [56, 79, 6]
];
// Speldosevariant i a-moll (titeln, vals 12 steg/takt): Am F C G ×2
const TITLE_MEL = [
  [0, 81, 3], [4, 84, 2], [6, 86, 2], [8, 88, 4],
  [12, 89, 4], [16, 88, 2], [18, 86, 2], [20, 84, 4],
  [24, 84, 3], [28, 83, 2], [30, 81, 2], [32, 79, 4],
  [36, 83, 4], [40, 86, 4], [44, 88, 4],
  [48, 81, 3], [52, 84, 2], [54, 86, 2], [56, 88, 4],
  [60, 89, 4], [64, 91, 2], [66, 89, 2], [68, 88, 4],
  [72, 84, 3], [76, 88, 2], [78, 86, 2], [80, 84, 4],
  [84, 81, 8]
];
// Draculauras måntema (vals i a-moll, theremin)
const MOON_MEL = [
  [0, 69, 4], [4, 72, 4], [8, 76, 4],
  [12, 75, 6], [18, 76, 4],
  [24, 77, 4], [28, 76, 4], [32, 72, 4],
  [36, 71, 8],
  [48, 69, 4], [52, 72, 4], [56, 76, 4],
  [60, 81, 6], [66, 80, 4],
  [72, 81, 4], [76, 77, 4], [80, 76, 4],
  [84, 74, 6], [90, 69, 4]
];
// Melindas sång (Europa) — pentatonisk fras, samma toner som korallpusslet
export const MELINDA_NOTES = [65, 69, 72, 74, 77];
const EUROPA_MEL = [
  [0, 77, 4], [6, 74, 3], [10, 72, 3],
  [16, 69, 4], [22, 72, 3], [26, 74, 4],
  [32, 77, 4], [38, 81, 4], [42, 79, 3],
  [48, 77, 6], [56, 74, 4]
];

// ---------- Låtdefinitioner ----------
const SONGS = {
  title: {
    bpm: 92, steps: 12, gain: 0.75,
    prog: [ch(57, 'm'), ch(53, 'M'), ch(60, 'M'), ch(55, 'M'), ch(57, 'm'), ch(53, 'M'), ch(60, 'M'), ch(55, 'M')],
    layers: [
      { id: 'mel', inst: 'box', pat: pMel(TITLE_MEL, 96, 'box'), gain: 0.95, wet: 0.55 },
      { id: 'harp', inst: 'harp', pat: pArp(2, 0, 'ud'), gain: 0.4, wet: 0.5 },
      { id: 'pad', inst: 'pad', pat: pPad(0), gain: 0.55 },
      { id: 'bass', inst: 'bass', pat: pBass([0], -1), gain: 0.7 }
    ]
  },
  home: {
    bpm: 96, steps: 16, gain: 0.7,
    prog: [ch(60, 'M'), ch(53, 'M'), ch(57, 'm'), ch(55, 'M')],
    layers: [
      { id: 'pluck', inst: 'pluck', pat: pArp(2, 0, 'ud'), gain: 0.55, wet: 0.3 },
      { id: 'mar', inst: 'marimba', pat: pComp([4, 12], 0, 0.4), gain: 0.5 },
      { id: 'bass', inst: 'bass', pat: pBass([0, 8], -1), gain: 0.7 },
      { id: 'hat', inst: 'hat', pat: pDrum({ 4: ['hat'], 12: ['hat'] }), gain: 0.35 }
    ]
  },
  flight: {
    bpm: 122, steps: 16, gain: 0.78,
    prog: [ch(60, 'M'), ch(55, 'M'), ch(57, 'm7'), ch(53, 'M7')],
    layers: [
      { id: 'bass', inst: 'bass', pat: pBass([0, 4, 8, 12], -1), gain: 0.75 },
      { id: 'drum', inst: 'kick', pat: pDrum({ 0: ['kick'], 8: ['kick'] }), gain: 0.8 },
      { id: 'l1', inst: 'pluck', pat: pArp(2, 0), gain: 0.55, on: false },
      { id: 'l2', inst: 'marimba', pat: pComp([2, 6, 10, 14], 0, 0.45), gain: 0.5, on: false },
      { id: 'l3', inst: 'hat', pat: pDrum({ 2: ['hat'], 6: ['hat'], 10: ['hat'], 14: ['hat'], 8: ['snare'] }), gain: 0.55, on: false },
      { id: 'l4', inst: 'bell', pat: pMel(THEME, 64, 'bell', 0, 0.7), gain: 0.7, on: false, wet: 0.5 }
    ]
  },
  spaceport: {
    bpm: 108, steps: 16, gain: 0.68,
    prog: [ch(62, 'm'), ch(55, 'M'), ch(60, 'M'), ch(57, '7')],
    layers: [
      { id: 'mar', inst: 'marimba', pat: pArp(2, 0, 'ud'), gain: 0.6 },
      { id: 'tick', inst: 'hat', pat: pDrum({ 0: ['hat'], 4: ['hat'], 8: ['hat'], 12: ['hat'] }), gain: 0.4 },
      { id: 'bass', inst: 'bass', pat: pBass([0, 6, 8, 14], -1), gain: 0.7 },
      { id: 'blip', inst: 'pluck', pat: pTwinkle(0.08, 1), gain: 0.4 }
    ]
  },
  space: {
    bpm: 60, steps: 16, gain: 0.7,
    prog: [ch(60, 'M7'), ch(62, 'M'), ch(60, 'M7'), ch(67, 'M')],
    layers: [
      { id: 'pad', inst: 'pad', pat: pPad(0, 2), gain: 0.8, wet: 0.6 },
      { id: 'bell', inst: 'bell', pat: pArp(8, 1), gain: 0.5, wet: 0.7 },
      { id: 'bass', inst: 'bass', pat: pBass([0], -2), gain: 0.6 },
      { id: 'tw', inst: 'bell', pat: pTwinkle(0.05, 2), gain: 0.35, wet: 0.8 }
    ]
  },
  moon: {
    bpm: 86, steps: 12, gain: 0.72,
    prog: [ch(57, 'm'), ch(57, 'm'), ch(52, '7'), ch(52, '7'), ch(62, 'm'), ch(64, '7'), ch(57, 'm'), ch(57, 'm')],
    layers: [
      { id: 'lead', inst: 'lead', pat: pMel(MOON_MEL, 96, 'lead', 0, 0.8), gain: 0.75, wet: 0.6 },
      { id: 'oom', inst: 'bass', pat: pBass([0], -1), gain: 0.7 },
      { id: 'pah', inst: 'pluck', pat: pComp([4, 8], 0, 0.35), gain: 0.5 },
      { id: 'bell', inst: 'bell', pat: pTwinkle(0.04, 1), gain: 0.3, wet: 0.7 }
    ]
  },
  asteroid: {
    bpm: 112, steps: 16, gain: 0.72,
    prog: [ch(55, 'M'), ch(60, 'M'), ch(55, 'M'), ch(62, '7')],
    layers: [
      { id: 'mel', inst: 'pluck', pat: pArp(2, 1, 'ud'), gain: 0.55 },
      { id: 'oom', inst: 'bass', pat: pBass([0, 8], -1), gain: 0.75 },
      { id: 'pah', inst: 'marimba', pat: pComp([4, 12], 0, 0.5), gain: 0.55 },
      { id: 'hat', inst: 'hat', pat: pDrum({ 2: ['hat'], 6: ['hat'], 10: ['hat'], 14: ['hat'] }), gain: 0.4 },
      { id: 'coin', inst: 'bell', pat: pTwinkle(0.06, 2), gain: 0.4, wet: 0.6 }
    ]
  },
  europa: {
    bpm: 72, steps: 16, gain: 0.7,
    prog: [ch(53, 'M'), ch(60, 'M'), ch(62, 'm'), ch(58, 'M')],
    layers: [
      { id: 'mel', inst: 'harp', pat: pMel(EUROPA_MEL, 64, 'harp', 0, 0.8), gain: 0.8, wet: 0.6 },
      { id: 'pad', inst: 'pad', pat: pPad(-1), gain: 0.65, wet: 0.5 },
      { id: 'harp', inst: 'harp', pat: pArp(4, 0), gain: 0.45, wet: 0.5 },
      { id: 'drop', inst: 'drop', pat: pTwinkle(0.07, 1), gain: 0.5, wet: 0.6 },
      { id: 'bass', inst: 'bass', pat: pBass([0], -1), gain: 0.6 }
    ]
  },
  saturn: {
    bpm: 100, steps: 12, gain: 0.72,
    prog: [ch(60, 'M'), ch(57, 'm'), ch(53, 'M'), ch(55, 'M')],
    layers: [
      { id: 'harp', inst: 'harp', pat: pArp(1, 0, 'ud'), gain: 0.5, wet: 0.55 },
      { id: 'box', inst: 'box', pat: pComp([0], 1, 0.4), gain: 0.5, wet: 0.6 },
      { id: 'bell', inst: 'bell', pat: pTwinkle(0.05, 1), gain: 0.35, wet: 0.7 },
      { id: 'bass', inst: 'bass', pat: pBass([0, 6], -1), gain: 0.6 }
    ]
  },
  neptune: {
    bpm: 66, steps: 16, gain: 0.72,
    prog: [ch(57, 'm'), ch(52, 'm'), ch(53, 'M7'), ch(52, 'm')],
    layers: [
      { id: 'ice', inst: 'bell', pat: pArp(8, 1), gain: 0.45, wet: 0.75 },
      { id: 'pad', inst: 'pad', pat: pPad(-1, 2), gain: 0.7, wet: 0.5 },
      { id: 'bass', inst: 'bass', pat: pBass([0, 12], -2), gain: 0.6 },
      { id: 'tw', inst: 'box', pat: pTwinkle(0.04, 2), gain: 0.3, wet: 0.8 },
      { id: 'warm', inst: 'box', pat: pMel(THEME, 64, 'box', 0, 0.6), gain: 0.7, on: false, wet: 0.6 }
    ]
  },
  reunion: {
    bpm: 76, steps: 16, gain: 0.8,
    prog: [ch(60, 'M'), ch(55, 'M'), ch(57, 'm'), ch(53, 'M')],
    layers: [
      { id: 'mel', inst: 'box', pat: pMel(THEME, 64, 'box', 0, 0.9), gain: 0.9, wet: 0.6 },
      { id: 'str', inst: 'strings', pat: pPad(0), gain: 0.7, wet: 0.5 },
      { id: 'harp', inst: 'harp', pat: pArp(2, 0, 'ud'), gain: 0.45, wet: 0.5 },
      { id: 'bass', inst: 'bass', pat: pBass([0, 8], -1), gain: 0.7 },
      { id: 'bell', inst: 'bell', pat: pMel(THEME, 64, 'bell', 1, 0.35), gain: 0.5, on: false, wet: 0.7 }
    ]
  },
  party: {
    bpm: 128, steps: 16, gain: 0.8,
    prog: [ch(60, 'M'), ch(53, 'M'), ch(55, 'M'), ch(60, 'M')],
    layers: [
      { id: 'mel', inst: 'bell', pat: pMel(THEME, 64, 'bell', 0, 0.85), gain: 0.8, wet: 0.4 },
      { id: 'kit', inst: 'kick', pat: pDrum({ 0: ['kick'], 4: ['kick', 'hat'], 8: ['kick', 'snare'], 12: ['kick', 'hat'], 2: ['hat'], 6: ['hat'], 10: ['hat'], 14: ['hat'] }), gain: 0.8 },
      { id: 'bass', inst: 'bass', pat: pBass([0, 4, 8, 12], -1), gain: 0.8 },
      { id: 'mar', inst: 'marimba', pat: pComp([2, 6, 10, 14], 0, 0.5), gain: 0.55 },
      { id: 'tw', inst: 'bell', pat: pTwinkle(0.1, 2), gain: 0.45, wet: 0.6 }
    ]
  }
};
