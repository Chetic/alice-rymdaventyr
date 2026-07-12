// HUD: mynträknare, målrad, dialogrutor med porträtt, tips, toasts och pausmeny.
// HUD:et äger också ritandet av touch-kontrollerna (via input.drawControls).

import { PAL, TXT, VH } from './config.js';
import { view, rr, txt, panel, drawCoin, glow } from './render.js';
import { IN, drawControls } from './input.js';
import { SAVE, persist } from './save.js';
import { AUD } from './audio.js';
import { TTS } from './speech.js';
import { drawPortrait, WHO } from './chars.js';
import { NAV } from './scenes/base.js';

const NAMES = { melinda: 'Melinda', stella: 'Stella' };

function nameOf(who) {
  if (WHO[who]) return WHO[who].name;
  if (NAMES[who]) return NAMES[who];
  return who;
}

const state = {
  objective: '',
  toasts: [],           // {text, t, max}
  hintText: '', hintT: 0,
  dialog: null,         // {lines, idx, shown, cb, wrapped}
  coinBump: 0,
  paused: false,
  pauseEnabled: true,
  sceneName: '',
  uiTaps: []            // träffytor för denna frame: {id, x,y,w,h} eller cirkel {id,cx,cy,r}
};

export const HUD = {
  reset: function (sceneName) {
    state.objective = '';
    state.toasts.length = 0;
    state.hintText = ''; state.hintT = 0;
    state.dialog = null;
    state.paused = false;
    state.sceneName = sceneName || '';
    state.pauseEnabled = sceneName !== 'title';
  },

  objective: function (text) { state.objective = text; },
  toast: function (text, dur) {
    state.toasts.push({ text: text, t: 0, max: dur || 2.6 });
    TTS.say(text, 'narrator', { queue: true });
  },
  hint: function (text) {
    state.hintText = text; state.hintT = 7;
    AUD.sfx('magic');
    TTS.say(text, 'narrator', { queue: true });
  },
  bumpCoins: function () { state.coinBump = 1; },

  dialog: function (lines, cb) {
    state.dialog = { lines: lines, idx: 0, shown: 0, cb: cb || null, wrapped: null };
    AUD.sfx('pop');
    TTS.say(lines[0].text, lines[0].who);
  },
  dialogActive: function () { return !!state.dialog; },
  paused: function () { return state.paused; },
  blocked: function () { return state.paused || !!state.dialog; },

  togglePause: function () {
    if (!state.pauseEnabled) return;
    state.paused = !state.paused;
    AUD.sfx('click');
  },

  // Tar hand om ett tryck. true = trycket "åts upp" av UI:t.
  consumeTap: function (x, y) {
    // pausmeny
    if (state.paused) {
      for (let i = 0; i < state.uiTaps.length; i++) {
        const b = state.uiTaps[i];
        if (x > b.x && x < b.x + b.w && y > b.y && y < b.y + b.h) {
          this._menuAction(b.id);
          return true;
        }
      }
      return true;   // allt annat sväljs när paus är öppen
    }
    // dialog: tryck var som helst går vidare
    if (state.dialog) { this._advanceDialog(); return true; }
    // pausknapp
    const px = view.w - 74, py = 74;
    const dx = x - px, dy = y - py;
    if (state.pauseEnabled && dx * dx + dy * dy < 52 * 52) {
      this.togglePause();
      return true;
    }
    return false;
  },

  _menuAction: function (id) {
    AUD.sfx('click');
    if (id === 'resume') state.paused = false;
    else if (id === 'restart') { state.paused = false; if (NAV.go) NAV.go(state.sceneName); }
    else if (id === 'music') { AUD.setMusicOn(!SAVE.music); persist(); }
    else if (id === 'sfx') { AUD.setSfxOn(!SAVE.sfx); persist(); }
    else if (id === 'tts') { TTS.setOn(!SAVE.tts); if (SAVE.tts) TTS.say('Nu läser jag högt för dig!', 'narrator'); }
    else if (id === 'title') { state.paused = false; if (NAV.go) NAV.go('title'); }
  },

  _advanceDialog: function () {
    const d = state.dialog;
    if (!d) return;
    const line = d.lines[d.idx];
    if (d.shown < line.text.length) { d.shown = line.text.length; return; }  // visa allt direkt
    d.idx++;
    d.shown = 0;
    d.wrapped = null;
    AUD.sfx('click');
    if (d.idx >= d.lines.length) {
      const cb = d.cb;
      state.dialog = null;
      TTS.stop();
      if (cb) cb();
    } else {
      TTS.say(d.lines[d.idx].text, d.lines[d.idx].who);
    }
  },

  update: function (dt) {
    if (IN.pauseEdge) this.togglePause();
    if (state.paused) return;
    for (let i = state.toasts.length - 1; i >= 0; i--) {
      state.toasts[i].t += dt;
      if (state.toasts[i].t > state.toasts[i].max) state.toasts.splice(i, 1);
    }
    if (state.hintT > 0) state.hintT -= dt;
    if (state.coinBump > 0) state.coinBump = Math.max(0, state.coinBump - dt * 3);
    const d = state.dialog;
    if (d) {
      const line = d.lines[d.idx];
      if (d.shown < line.text.length) d.shown += dt * 34;
      if (IN.actionEdge || IN.jumpEdge) this._advanceDialog();
    }
  },

  draw: function (ctx, t) {
    state.uiTaps.length = 0;

    // ---- mynt uppe till vänster ----
    const bump = 1 + state.coinBump * 0.25;
    ctx.save();
    panel(ctx, 26, 26, 300, 74, { r: 37, edgeW: 2.5 });
    ctx.translate(0, 0);
    ctx.save();
    ctx.translate(72, 63);
    ctx.scale(bump, bump);
    drawCoin(ctx, 0, 0, 24, 'gold', t);
    ctx.restore();
    txt(ctx, '× ' + (SAVE.coins.gold || 0), 132, 63, { size: 34, bold: true, color: PAL.gold, align: 'center', stroke: 'rgba(40,20,0,0.6)', strokeW: 4 });
    ctx.save();
    ctx.translate(206, 63);
    ctx.scale(bump, bump);
    drawCoin(ctx, 0, 0, 24, 'silver', t);
    ctx.restore();
    txt(ctx, '× ' + (SAVE.coins.silver || 0), 264, 63, { size: 34, bold: true, color: PAL.silver, align: 'center', stroke: 'rgba(20,20,40,0.6)', strokeW: 4 });
    ctx.restore();

    // ---- målrad uppe i mitten ----
    if (state.objective) {
      ctx.save();
      ctx.font = 'bold 30px "Trebuchet MS", Verdana, sans-serif';
      const w = ctx.measureText(state.objective).width + 100;
      panel(ctx, view.w / 2 - w / 2, 24, w, 60, { r: 30, edgeW: 2.5 });
      txt(ctx, '⭐', view.w / 2 - w / 2 + 38, 55, { size: 30 });
      txt(ctx, state.objective, view.w / 2 + 22, 55, { size: 30, bold: true, color: '#ffe9b3' });
      ctx.restore();
    }

    // ---- pausknapp ----
    if (state.pauseEnabled) {
      const px = view.w - 74, py = 74;
      ctx.save();
      ctx.globalAlpha = 0.85;
      ctx.beginPath(); ctx.arc(px, py, 44, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(30,14,58,0.8)';
      ctx.fill();
      ctx.strokeStyle = PAL.gold; ctx.lineWidth = 3; ctx.stroke();
      ctx.fillStyle = '#fff';
      ctx.fillRect(px - 13, py - 16, 9, 32);
      ctx.fillRect(px + 5, py - 16, 9, 32);
      ctx.restore();
    }

    // ---- tipsbubbla ----
    if (state.hintT > 0 && !state.dialog) {
      const a = Math.min(1, state.hintT, (7 - state.hintT) * 3);
      ctx.save();
      ctx.globalAlpha = a;
      ctx.font = '28px "Trebuchet MS", Verdana, sans-serif';
      const tw = Math.min(900, ctx.measureText(state.hintText).width + 120);
      const hx = view.w / 2 - tw / 2, hy = VH - 330;
      panel(ctx, hx, hy, tw, 74, { r: 37, bg: 'rgba(64,40,110,0.92)', edge: '#c95cff' });
      txt(ctx, '💡 ' + state.hintText, view.w / 2, hy + 38, { size: 28, color: '#ffe9ff' });
      ctx.restore();
    }

    // ---- toasts ----
    for (let i = 0; i < state.toasts.length; i++) {
      const to = state.toasts[i];
      const k = to.t / to.max;
      const a = Math.min(1, to.t * 4, (1 - k) * 3);
      txt(ctx, to.text, view.w / 2, VH * 0.3 - k * 60, {
        size: 52, bold: true, color: '#fff', alpha: Math.max(0, a),
        stroke: 'rgba(60,20,80,0.85)', strokeW: 9, shadow: true
      });
    }

    // ---- dialogruta ----
    if (state.dialog) this._drawDialog(ctx, t);

    // ---- kontroller ----
    if (!state.paused && !state.dialog) drawControls(ctx, t);

    // ---- pausmeny ----
    if (state.paused) this._drawPause(ctx, t);
  },

  _drawDialog: function (ctx, t) {
    const d = state.dialog;
    const line = d.lines[d.idx];
    const W = Math.min(1460, view.w - 90);
    const H = 250;
    const X = view.w / 2 - W / 2, Y = VH - H - 36;
    panel(ctx, X, Y, W, H, { r: 34 });

    // porträtt
    drawPortrait(ctx, line.who, X + 130, Y + H / 2, 200, t, { talk: d.shown < line.text.length });

    // namn
    const nm = line.name || nameOf(line.who);
    const themeC = WHO[line.who] ? WHO[line.who].theme : (line.who === 'melinda' ? '#39d7d0' : line.who === 'stella' ? '#c95cff' : PAL.gold);
    txt(ctx, nm, X + 262, Y + 52, { size: 32, bold: true, color: themeC, align: 'left', stroke: 'rgba(20,8,30,0.7)', strokeW: 5 });

    // text (radbruten, bokstav för bokstav)
    if (!d.wrapped) {
      ctx.font = '32px "Trebuchet MS", Verdana, sans-serif';
      d.wrapped = wrapText(ctx, line.text, W - 330);
    }
    const shown = Math.floor(d.shown);
    let count = 0;
    for (let i = 0; i < d.wrapped.length; i++) {
      const lt = d.wrapped[i];
      const take = Math.max(0, Math.min(lt.length, shown - count));
      if (take > 0) {
        txt(ctx, lt.substring(0, take), X + 262, Y + 105 + i * 44, { size: 32, color: '#fff', align: 'left' });
      }
      count += lt.length;
    }

    // nästa-pil
    if (shown >= line.text.length) {
      const py = Y + H - 40 + Math.sin(t * 5) * 5;
      ctx.fillStyle = PAL.gold;
      ctx.beginPath();
      ctx.moveTo(X + W - 66, py - 14);
      ctx.lineTo(X + W - 36, py);
      ctx.lineTo(X + W - 66, py + 14);
      ctx.closePath();
      ctx.fill();
    }
  },

  _drawPause: function (ctx, t) {
    ctx.fillStyle = 'rgba(8,3,20,0.72)';
    ctx.fillRect(0, 0, view.w, VH);
    const W = 620, X = view.w / 2 - W / 2;
    const items = [
      { id: 'resume', label: '▶  ' + TXT.resume },
      { id: 'restart', label: '↺  ' + TXT.restart },
      { id: 'music', label: (SAVE.music ? '🎵  ' : '🔇  ') + TXT.music + ': ' + (SAVE.music ? 'PÅ' : 'AV') },
      { id: 'sfx', label: (SAVE.sfx ? '🔔  ' : '🔕  ') + TXT.sfx + ': ' + (SAVE.sfx ? 'PÅ' : 'AV') },
      { id: 'tts', label: (SAVE.tts ? '🗣️  ' : '🤐  ') + 'Uppläsning: ' + (SAVE.tts ? 'PÅ' : 'AV') },
      { id: 'title', label: '🏠  ' + TXT.toTitle }
    ];
    const IH = 96, GAP = 26;
    const totalH = items.length * IH + (items.length - 1) * GAP + 160;
    const Y0 = VH / 2 - totalH / 2;
    panel(ctx, X - 50, Y0 - 30, W + 100, totalH + 60, { r: 44 });
    txt(ctx, TXT.pause, view.w / 2, Y0 + 46, { size: 54, bold: true, color: PAL.gold, stroke: 'rgba(40,16,0,0.7)', strokeW: 7 });
    for (let i = 0; i < items.length; i++) {
      const y = Y0 + 130 + i * (IH + GAP);
      rr(ctx, X, y, W, IH, 30);
      ctx.fillStyle = 'rgba(70,40,120,0.85)';
      ctx.fill();
      ctx.strokeStyle = PAL.gold; ctx.lineWidth = 3; ctx.stroke();
      txt(ctx, items[i].label, view.w / 2, y + IH / 2, { size: 34, bold: true, color: '#fff' });
      state.uiTaps.push({ id: items[i].id, x: X, y: y, w: W, h: IH });
    }
  }
};

function wrapText(ctx, text, maxW) {
  const words = text.split(' ');
  const lines = [];
  let cur = '';
  for (let i = 0; i < words.length; i++) {
    const test = cur ? cur + ' ' + words[i] : words[i];
    if (ctx.measureText(test).width > maxW && cur) {
      lines.push(cur + ' ');
      cur = words[i];
    } else cur = test;
  }
  if (cur) lines.push(cur);
  return lines;
}
