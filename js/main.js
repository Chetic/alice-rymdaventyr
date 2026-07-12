// Boot, spelloop (fast tidssteg + interpolation), scenbyten med fade
// och PWA-registrering. Nya scener registreras i SCENES nedan.

import { STEP, VH, QUERY, clamp } from './config.js';
import { fitCanvas, beginFrame, endFrame, view, PS, QY } from './render.js';
import { initInput, IN, endFrame as inputEnd } from './input.js';
import { stepWorld, engineRef } from './world.js';
import { SAVE, loadSave } from './save.js';
import { AUD } from './audio.js';
import { HUD } from './hud.js';
import { NAV } from './scenes/base.js';
import { titleScene } from './scenes/title.js';
import { homeScene } from './scenes/home.js';
import { flightScene } from './scenes/flight.js';
import { spaceportScene } from './scenes/spaceport.js';
import { travelMoon, travelAsteroid, travelEuropa, travelSaturn, travelNeptune } from './scenes/travel.js';

const SCENES = {
  title: titleScene,
  home: homeScene,
  flight: flightScene,
  spaceport: spaceportScene,
  travel_moon: travelMoon,
  travel_asteroid: travelAsteroid,
  travel_europa: travelEuropa,
  travel_saturn: travelSaturn,
  travel_neptune: travelNeptune
};

let canvas, ctx;
let current = null;
let pendingScene = null;
let fade = { k: 1, phase: 'in' };   // startar svart → tonar in
let last = 0, acc = 0;

function switchTo(name, params) {
  if (!SCENES[name]) {
    HUD.toast('Byggs fortfarande! 🚧');
    return;
  }
  pendingScene = { name: name, params: params };
  if (fade.phase !== 'out') fade.phase = 'out';
}

function doSwitch() {
  const p = pendingScene;
  pendingScene = null;
  if (current && current.exit) current.exit();
  current = SCENES[p.name];
  HUD.reset(p.name);
  current.enter(p.params);
  if (current.song) AUD.playSong(current.song);
  acc = 0;
}

function loop(ts) {
  const dtMs = clamp(ts - last, 0, 100);
  last = ts;
  const dt = dtMs / 1000;
  const t = ts / 1000;
  QY.frame(dtMs);

  // fade-statusmaskin
  if (fade.phase === 'out') {
    fade.k = Math.min(1, fade.k + dt * 3.2);
    if (fade.k >= 1 && pendingScene) {
      doSwitch();
      fade.phase = 'in';
    }
  } else if (fade.phase === 'in') {
    fade.k = Math.max(0, fade.k - dt * 2.6);
    if (fade.k <= 0) fade.phase = 'none';
  }

  HUD.update(dt);

  // tryck: HUD först, sedan scenen
  for (let i = 0; i < IN.taps.length; i++) {
    const tap = IN.taps[i];
    if (!HUD.consumeTap(tap.x, tap.y) && current && fade.phase === 'none') {
      current.onTap(tap.x, tap.y);
    }
  }

  // fast tidssteg
  let alpha = 1;
  let ranSteps = 0;
  if (current && !HUD.paused()) {
    acc += dtMs;
    while (acc >= STEP && ranSteps < 5) {
      current.update(STEP / 1000);
      stepWorld(STEP);
      PS.update(STEP / 1000);
      acc -= STEP;
      ranSteps++;
    }
    if (acc > STEP * 5) acc = 0;
    alpha = engineRef() ? acc / STEP : 1;
  }

  // rita
  beginFrame(ctx, canvas);
  if (current) current.draw(ctx, alpha, t);
  HUD.draw(ctx, t);
  if (fade.k > 0.001) {
    ctx.fillStyle = 'rgba(6,2,14,' + fade.k.toFixed(3) + ')';
    ctx.fillRect(0, 0, view.w, VH);
  }
  endFrame(ctx);

  inputEnd(ranSteps > 0 || HUD.blocked());
  window.requestAnimationFrame(loop);
}

function boot() {
  canvas = document.getElementById('game');
  ctx = canvas.getContext('2d', { alpha: false });
  fitCanvas(canvas);
  window.addEventListener('resize', function () { fitCanvas(canvas); });
  window.addEventListener('orientationchange', function () {
    window.setTimeout(function () { fitCanvas(canvas); }, 200);
  });

  initInput(canvas);
  loadSave();
  NAV.go = switchTo;

  // ljudmotorn väcks av första trycket (autoplay-policy)
  canvas.addEventListener('pointerdown', function () { AUD.init(); }, { once: true });

  // vänligt felmeddelande + felsökningshjälp
  window.onerror = function (msg, src, line) {
    try {
      const el = document.getElementById('err');
      const em = document.getElementById('errmsg');
      if (el && el.hasAttribute('hidden')) {
        em.textContent = msg + ' (' + (src || '').split('/').pop() + ':' + line + ')';
        el.removeAttribute('hidden');
      }
    } catch (e) {}
  };

  // PWA: installknapp + service worker (inte under lokal utveckling)
  window.__installPrompt = null;
  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();
    window.__installPrompt = e;
  });
  const host = window.location.hostname;
  const isLocal = host === 'localhost' || host === '127.0.0.1' || window.location.protocol === 'file:';
  if (!isLocal && 'serviceWorker' in navigator) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('./sw.js').catch(function () {});
    });
  }

  // startscen (ev. via ?scene=X)
  const startScene = QUERY.scene && SCENES[QUERY.scene] ? QUERY.scene : 'title';
  pendingScene = { name: startScene, params: null };
  doSwitch();
  fade.phase = 'in';
  fade.k = 1;

  if (QUERY.debug) {
    window.__game = {
      go: switchTo,
      SAVE: SAVE,
      AUD: AUD,
      HUD: HUD,
      QY: QY,
      view: view,
      scenes: SCENES,
      engine: engineRef,
      scene: function () { return current ? current.name : ''; },
      current: function () { return current; },
      // testkrokar: simulerade tryck/drag i vy-koordinater
      tap: function (x, y) { IN.taps.push({ x: x, y: y }); },
      drag: function (x, y, down) {
        IN.pointer.x = x; IN.pointer.y = y;
        IN.pointer.down = !!down;
        IN.pointer.id = down ? 999 : -1;
      },
      press: function (name, val) { IN[name] = val === undefined ? true : val; if (val !== false && (name === 'jump' || name === 'action')) IN[name + 'Edge'] = true; }
    };
  }

  window.requestAnimationFrame(function (ts) {
    last = ts;
    window.requestAnimationFrame(loop);
  });
}

if (window.__oldBrowser) {
  // gammal webbläsare — index.html visar redan info-rutan
} else if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
