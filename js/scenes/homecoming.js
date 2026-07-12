// Hemresan: Alice och pappa flyger hem tillsammans — inga faror, bara
// hjärtstjärnor, vinkande vänner och jorden som växer i rutan.

import { VH, PAL, RAINBOW, TAU, rand, clamp, lerp, dist } from '../config.js';
import { view, makeCanvas, Parallax, PS, txt, glow, QY, heartPath } from '../render.js';
import { setScheme, IN, NO_IN } from '../input.js';
import { M, addToWorld, CAT } from '../world.js';
import { SAVE, advanceTo } from '../save.js';
import { AUD } from '../audio.js';
import { HUD } from '../hud.js';
import { drawGirl, drawMermaid, drawUnicorn, WHO } from '../chars.js';
import { drawRocket } from '../props.js';
import { SceneBase, NAV } from './base.js';
import { drawPlanetIcon } from './travel.js';

const LEN = 15600;
const CAMEOS = [
  { x: 3000, id: 'moon', who: 'draculaura', text: 'Hej då Draculaura! 🦇' },
  { x: 5800, id: 'asteroid', who: 'nastya', text: 'Hej då Nastya! 🎀' },
  { x: 8600, id: 'europa', who: 'melinda', text: 'Hej då Melinda! 🧜‍♀️' },
  { x: 11400, id: 'saturn', who: 'stella', text: 'Hej då Stella! 🦄' }
];

class HomecomingScene extends SceneBase {
  constructor() {
    super('homecoming');
    this.song = 'reunion';
    this.gravity = 0;
  }

  enter() {
    this.baseEnter();
    setScheme('plane');
    this.rocket = M.Bodies.rectangle(300, 540, 64, 170, {
      frictionAir: 0.02, sleepThreshold: Infinity,
      collisionFilter: { category: CAT.PLAYER, mask: 0 }
    });
    addToWorld(this.rocket);
    M.Body.setAngle(this.rocket, Math.PI / 2);
    this.done = false;
    this.cameoShown = [false, false, false, false];

    // hjärtstjärnor längs vägen
    this.hearts = [];
    for (let i = 0; i < 26; i++) {
      const hx = 1200 + i * 520 + rand(-100, 100);
      this.hearts.push({ x: hx, y: 300 + Math.sin(i * 0.9) * 260 + rand(-60, 60), taken: false, ph: rand(0, TAU) });
    }

    this.par = new Parallax();
    this.par.add(0.0, 2048, VH, function (c, w, h) {
      const g = c.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, '#0b0518');
      g.addColorStop(0.6, '#241a44');
      g.addColorStop(1, '#0b0518');
      c.fillStyle = g;
      c.fillRect(0, 0, w, h);
    });
    this.par.add(0.1, 2048, VH, function (c, w, h) { starsLayer(c, w, h, 100, 1.5); });
    this.par.add(0.3, 2048, VH, function (c, w, h) { starsLayer(c, w, h, 60, 2.6); });

    HUD.objective('Hem till jorden — tillsammans! 🌍💜');
    HUD.dialog([
      { who: 'papa', text: 'Håll i dig, andrepilot Alice! Kurs: HEM! 🌍' },
      { who: 'alice', text: 'Genom regnbågskometens svans, pappa! Den glittrar!' }
    ]);
  }

  update(dt) {
    this.tick(dt);
    const inp = HUD.blocked() ? NO_IN : IN;
    const b = this.rocket;
    const p = b.position;

    // autopilot framåt, upp/ner styr höjden
    const vy = (inp.up ? -5 : 0) + (inp.down ? 5 : 0);
    const boost = inp.thrust ? 3 : 0;
    M.Body.setVelocity(b, { x: 8.6 + boost, y: lerp(b.velocity.y, vy, 0.12) });
    if (p.y < 150) M.Body.setPosition(b, { x: p.x, y: 150 });
    if (p.y > 930) M.Body.setPosition(b, { x: p.x, y: 930 });
    M.Body.setAngle(b, Math.PI / 2 + b.velocity.y * 0.02);

    // regnbågssvans!
    if (Math.random() < 0.9) {
      const ci = Math.floor(Math.random() * 7);
      PS.spawn('sparkle', p.x - 90, p.y + rand(-26, 26), {
        color: RAINBOW[ci], vx: -260 + rand(-40, 40), vy: rand(-30, 30), life: 0.8, size: rand(5, 9)
      });
    }

    // hjärtstjärnor (magnetiska — ingen kan missas helt)
    for (let i = 0; i < this.hearts.length; i++) {
      const h = this.hearts[i];
      if (h.taken) continue;
      const d = dist(h.x, h.y, p.x, p.y);
      if (d < 300) {
        h.x = lerp(h.x, p.x, 1 - Math.exp(-4 * dt));
        h.y = lerp(h.y, p.y, 1 - Math.exp(-4 * dt));
      }
      if (d < 70) {
        h.taken = true;
        AUD.sfx('coinG');
        PS.burst('heart', h.x, h.y, 6, { color: '#ff6bcb', speed: 160 });
      }
    }

    // vänner vinkar
    for (let i = 0; i < CAMEOS.length; i++) {
      if (!this.cameoShown[i] && p.x > CAMEOS[i].x - 900) {
        this.cameoShown[i] = true;
        HUD.toast(CAMEOS[i].text);
        AUD.sfx('magic');
      }
    }

    // framme!
    if (p.x > LEN - 900 && !this.done) {
      this.done = true;
      advanceTo('party');
      const self = this;
      this.after(1.6, function () { NAV.go('party'); });
    }

    this.cam.clampTo(0, 0, LEN + 600, VH);
    this.cam.follow(p.x + 300, p.y, 0.08);
    this.cam.update(dt);
  }

  draw(ctx, alpha, t) {
    this.par.draw(ctx, this.cam.x, 0, QY.layersMax());
    this.cam.begin(ctx);

    // vänner på sina planeter
    for (let i = 0; i < CAMEOS.length; i++) {
      const c = CAMEOS[i];
      const py = 260 + (i % 2) * 420;
      drawPlanetIcon(ctx, c.id, c.x, py, 200, t);
      const wy = py - 130;
      if (c.who === 'melinda') {
        // i en glasbubbla!
        ctx.fillStyle = 'rgba(160,220,255,0.25)';
        ctx.beginPath(); ctx.arc(c.x, wy - 30, 90, 0, TAU); ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.6)';
        ctx.lineWidth = 3;
        ctx.stroke();
        drawMermaid(ctx, c.x, wy + 40, t, { s: 0.62 });
      } else if (c.who === 'stella') {
        drawUnicorn(ctx, c.x, wy + 46, t, { s: 0.62, mode: 'stand' });
      } else {
        drawGirl(ctx, c.x, wy + 40, t, WHO[c.who], { s: 0.85, mode: 'wave' });
      }
      if (this.cameoShown[i] && Math.random() < 0.1) {
        PS.spawn('heart', c.x + rand(-60, 60), wy - 60, { color: '#ff9ed9', vy: -60, life: 1, size: 8 });
      }
    }

    // jorden växer där framme
    const k = clamp((this.cam.x - (LEN - 5200)) / 4000, 0, 1);
    if (k > 0) {
      const ex = this.cam.x + view.w / 2 - 240 - k * 120;
      const es = 80 + k * 480;
      glow(ctx, ex, 420, es * 1.4, '#7ec8ff', 0.25);
      drawPlanetIcon(ctx, 'earth', ex, 420, es, t);
    }

    // hjärtstjärnor
    for (let i = 0; i < this.hearts.length; i++) {
      const h = this.hearts[i];
      if (h.taken || !this.cam.visible(h.x, h.y, 120)) continue;
      const bob = Math.sin(t * 2.4 + h.ph) * 8;
      glow(ctx, h.x, h.y + bob, 40, '#ff9ed9', 0.3);
      ctx.fillStyle = '#ff6bcb';
      heartPath(ctx, h.x, h.y + bob, 16);
      ctx.fill();
    }

    // raketen — med TVÅ i fönstret
    const b = this.rocket;
    drawRocket(ctx, b.position.x, b.position.y, b.angle, t, { alice: true, flame: 0.7, scale: 0.95 });
    // pappas ansikte i ett extra fönster
    ctx.save();
    ctx.translate(b.position.x, b.position.y);
    ctx.rotate(b.angle);
    ctx.fillStyle = '#ffd24a';
    ctx.beginPath(); ctx.arc(0, 52, 19, 0, TAU); ctx.fill();
    ctx.fillStyle = '#bfe8ff';
    ctx.beginPath(); ctx.arc(0, 52, 14, 0, TAU); ctx.fill();
    ctx.save();
    ctx.beginPath(); ctx.arc(0, 52, 14, 0, TAU); ctx.clip();
    ctx.fillStyle = '#f2c9a8';
    ctx.beginPath(); ctx.arc(0, 55, 11, 0, TAU); ctx.fill();
    ctx.fillStyle = '#5a4632';
    ctx.beginPath(); ctx.arc(0, 49, 11, Math.PI, 0); ctx.fill();
    ctx.fillStyle = '#2b1a2e';
    ctx.beginPath(); ctx.arc(-4, 55, 1.6, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(4, 55, 1.6, 0, TAU); ctx.fill();
    ctx.restore();
    ctx.restore();

    PS.draw(ctx);
    this.cam.end(ctx);
  }
}

function starsLayer(c, w, h, n, size) {
  for (let i = 0; i < n; i++) {
    c.globalAlpha = 0.3 + Math.random() * 0.7;
    c.fillStyle = '#fff';
    c.beginPath();
    c.arc(Math.random() * w, Math.random() * h, Math.random() * size + 0.4, 0, TAU);
    c.fill();
  }
  c.globalAlpha = 1;
}

export const homecomingScene = new HomecomingScene();
