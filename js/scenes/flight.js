// Flygturen: sidscrollande flygfysik i soluppgång — genom 12 regnbågsringar
// som tänder musiklager, över ängar, berg och öken till rymdbasens landningsbana.

import { VH, GRAV, PAL, RAINBOW, TAU, rand, clamp, lerp, dist } from '../config.js';
import { view, makeCanvas, Parallax, PS, txt, glow, QY } from '../render.js';
import { setScheme, IN, NO_IN } from '../input.js';
import { M, addToWorld, CAT } from '../world.js';
import { SAVE, advanceTo, persist } from '../save.js';
import { AUD } from '../audio.js';
import { HUD } from '../hud.js';
import { drawPlane } from '../props.js';
import { SceneBase, NAV } from './base.js';

const LEN = 14200;
const RUNWAY = { x0: 12750, x1: 13900, y: 950 };

// markens höjd (mjuk blandning mellan regioner)
function smooth(t) { return t < 0 ? 0 : t > 1 ? 1 : t * t * (3 - 2 * t); }
function groundY(x) {
  const meadow = 950 - 24 * Math.sin(x / 310) - 10 * Math.sin(x / 97);
  const hills = 900 - 110 * Math.sin(x / 270) - 30 * Math.sin(x / 83);
  const peaks = 700 - 210 * Math.sin((x - 6200) / 360) - 60 * Math.sin(x / 130);
  const desert = 950 - 14 * Math.sin(x / 210);
  const flat = RUNWAY.y;
  let y = meadow;
  y = lerp(y, hills, smooth((x - 2600) / 500));
  y = lerp(y, peaks, smooth((x - 5600) / 600));
  y = lerp(y, desert, smooth((x - 9200) / 600));
  y = lerp(y, flat, smooth((x - 12450) / 300));
  return Math.max(430, y);
}

class FlightScene extends SceneBase {
  constructor() {
    super('flight');
    this.song = 'flight';
    this.gravity = 0;         // planet styrs kinematiskt
    this.plane = null;
    this.pitch = 0;
    this.speed = 0;
    this.state = 'takeoff';   // takeoff | fly | landed
    this.stateT = 0;
    this.rings = [];
    this.ringsHit = 0;
    this.par = null;
    this.landDialogShown = false;
  }

  enter() {
    this.baseEnter();
    setScheme('plane');
    this.state = 'takeoff';
    this.stateT = 0;
    this.pitch = 0;
    this.speed = 4;
    this.ringsHit = 0;
    this.landDialogShown = false;
    this.doneDialog = false;

    this.plane = M.Bodies.rectangle(260, groundY(260) - 46, 150, 50, {
      frictionAir: 0, collisionFilter: { category: CAT.PLAYER, mask: 0 }
    });
    addToWorld(this.plane);

    // 12 ringar längs vägen
    this.rings = [];
    const rx = [1500, 2300, 3100, 3900, 4700, 5600, 6500, 7300, 8100, 9000, 10200, 11400];
    for (let i = 0; i < rx.length; i++) {
      const x = rx[i];
      let y;
      if (i % 3 === 0) y = groundY(x) - 190;            // låga
      else if (i % 3 === 1) y = groundY(x) - 360;       // mitten
      else y = Math.max(260, groundY(x) - 520);         // höga
      this.rings.push({ x: x, y: y, hit: false, ph: rand(0, TAU) });
    }

    // mynt i båge-formationer
    const arcs = [1900, 3500, 5100, 7700, 9600, 10800, 12000];
    for (let a = 0; a < arcs.length; a++) {
      const ax = arcs[a];
      for (let i = 0; i < 6; i++) {
        const t = i / 5;
        const cy = groundY(ax + i * 90) - 260 - Math.sin(t * Math.PI) * 130;
        this.addCoin(ax + i * 90, cy, (a % 3 === 2 && i === 3) ? 'gold' : 'silver');
      }
    }

    // parallax-himmel
    this.par = new Parallax();
    this.par.add(0.03, 2048, VH, drawFlightSky);
    this.par.add(0.14, 2048, 620, drawFarPeaks, { y: 300 });
    this.par.add(0.32, 2048, 300, drawCloudBand, { y: 180, alpha: 0.85 });

    HUD.objective('Flyg genom ringarna! 🌈 0/12');
    HUD.dialog([
      { who: 'alice', text: 'Wiiii! Upp-pilen stiger, ner-pilen dyker — och elden ger fart! 🔥' },
      { who: 'alice', text: 'Jag ska flyga genom ALLA regnbågsringar! 🌈' }
    ]);
  }

  exit() {
    AUD.loop('thrust', false);
  }

  update(dt) {
    this.tick(dt);
    const inp = HUD.blocked() ? NO_IN : IN;
    const b = this.plane;
    const p = b.position;

    if (this.state === 'takeoff') {
      this.stateT += dt;
      this.speed = lerp(this.speed, 10, dt * 0.9);
      let vy = 0;
      if (this.stateT > 1.1) vy = -5.5;
      M.Body.setVelocity(b, { x: this.speed, y: vy });
      M.Body.setAngle(b, vy < 0 ? -0.16 : 0);
      if (vy < 0) PS.spawn('dust', p.x - 70, p.y + 26, { color: '#cfe8d8', vy: 10, life: 0.4 });
      if (p.y < groundY(p.x) - 260) { this.state = 'fly'; }
    } else if (this.state === 'fly') {
      // pitch och fart
      const targetPitch = inp.up ? -0.44 : (inp.down ? 0.42 : -0.02);
      this.pitch = lerp(this.pitch, targetPitch, 1 - Math.exp(-5 * dt));
      const boost = inp.thrust ? 5.2 : 0;
      this.speed = lerp(this.speed, 8.6 + boost, 1 - Math.exp(-1.6 * dt));
      AUD.loop('thrust', inp.thrust, 0.2);
      if (inp.thrust && Math.random() < 0.5) {
        PS.spawn('flame', p.x - 82, p.y + 6, { vx: -this.speed * 40, vy: rand(-20, 20), size: rand(5, 9), life: 0.35 });
      }

      const inWind = p.x > 6300 && p.x < 7100;
      const vy = Math.sin(this.pitch) * this.speed * 1.25 + 0.6 + (inWind ? -2.4 : 0);
      M.Body.setVelocity(b, { x: this.speed * Math.cos(this.pitch * 0.5), y: vy });
      M.Body.setAngle(b, this.pitch * 0.75);

      // tak och mark
      if (p.y < 130) M.Body.setPosition(b, { x: p.x, y: 130 });
      const gy = groundY(p.x);
      if (p.y > gy - 40) {
        if (p.x > RUNWAY.x0 && p.x < RUNWAY.x1) {
          // landningsförsök
          if (b.velocity.y < 5.6) {
            this.state = 'landed';
            this.stateT = 0;
            M.Body.setPosition(b, { x: p.x, y: gy - 40 });
            M.Body.setAngle(b, 0);
            AUD.loop('thrust', false);
            AUD.sfx('fanfare');
            if (this.ringsHit >= 12) { AUD.sfx('bigwin'); HUD.toast('⭐ ALLA ringar! Guldstjärna! ⭐'); }
          } else {
            M.Body.setPosition(b, { x: p.x, y: gy - 42 });
            M.Body.setVelocity(b, { x: this.speed * 0.7, y: -5 });
            this.cam.shake(8, 0.4);
            AUD.sfx('thump');
            HUD.toast('Sakta ner! Glid nedåt försiktigt… ⬇️');
          }
        } else {
          // studs mot marken — snällt
          M.Body.setPosition(b, { x: p.x, y: gy - 42 });
          M.Body.setVelocity(b, { x: this.speed * 0.85, y: -6.5 });
          this.pitch = -0.2;
          this.cam.shake(7, 0.35);
          AUD.sfx('thump');
          PS.burst('dust', p.x, gy - 10, 10, { color: '#d8c8a8', speed: 160 });
        }
      }

      // ringar
      for (let i = 0; i < this.rings.length; i++) {
        const r = this.rings[i];
        if (!r.hit && Math.abs(p.x - r.x) < 46 && Math.abs(p.y - r.y) < 120) {
          r.hit = true;
          this.ringsHit++;
          SAVE.rings = Math.max(SAVE.rings, this.ringsHit);
          persist();
          AUD.sfx('ring', { n: this.ringsHit });
          PS.burst('star', r.x, r.y, 14, { color: RAINBOW[i % 7], speed: 260 });
          PS.burst('sparkle', r.x, r.y, 10, { color: '#fff', speed: 180 });
          HUD.objective('Flyg genom ringarna! 🌈 ' + this.ringsHit + '/12');
          if (this.ringsHit === 3) AUD.setLayer('l1', true);
          if (this.ringsHit === 6) AUD.setLayer('l2', true);
          if (this.ringsHit === 9) AUD.setLayer('l3', true);
          if (this.ringsHit === 12) AUD.setLayer('l4', true);
          if (this.ringsHit === 12) HUD.toast('ALLA RINGAR! 🌟');
        }
      }

      // uppvind i bergen (synliggörs med stigande streck)
      if (inWind && Math.random() < 0.35) {
        PS.spawn('dust', p.x + rand(-300, 300), p.y + rand(80, 320), { color: '#cfe8ff', vy: -260, vx: 0, life: 0.7, size: 3 });
      }

      // nära banan → mål-text
      if (p.x > RUNWAY.x0 - 900 && !this.landDialogShown) {
        this.landDialogShown = true;
        HUD.objective('Landa mjukt på banan! ⬇️');
      }

      // flög förbi banan
      if (p.x > LEN) {
        M.Body.setPosition(b, { x: RUNWAY.x0 - 1600, y: 520 });
        HUD.toast('Nytt försök — sikta på banan! 🛬');
      }
    } else if (this.state === 'landed') {
      this.stateT += dt;
      this.speed = Math.max(0, this.speed - dt * 5);
      M.Body.setVelocity(b, { x: this.speed, y: 0 });
      if (Math.abs(this.speed) < 0.2 && this.stateT > 1.2 && !this.doneDialog) {
        this.doneDialog = true;
        advanceTo('spaceport');
        HUD.dialog([
          { who: 'alice', text: 'Perfekt landning! Och DÄR står raketen! 🚀' },
          { who: 'alice', text: 'Fast… den är i bitar. Dags att bygga ihop den!' }
        ], function () { NAV.go('spaceport'); });
      }
    }

    this.updateCoins(dt, p.x, p.y);
    this.cam.clampTo(0, 60, LEN + 400, VH + 60);
    this.cam.follow(p.x + 300, p.y - 40, 0.1);
    this.cam.update(dt);
  }

  draw(ctx, alpha, t) {
    this.par.draw(ctx, this.cam.x, this.cam.y * 0.2, QY.layersMax());
    this.cam.begin(ctx);

    // marken med regionsfärger
    drawTerrain(ctx, this.cam, t);

    // banan
    drawRunway(ctx, t);

    // rymdbasen vid horisonten (raket i fjärran)
    drawBase(ctx, t);

    // ringar
    for (let i = 0; i < this.rings.length; i++) {
      const r = this.rings[i];
      if (!this.cam.visible(r.x, r.y, 260)) continue;
      drawRing(ctx, r, t, i);
    }

    this.drawCoins(ctx, t);

    // uppvind-strecken ritas av partiklarna; planet:
    const b = this.plane;
    const px = lerp(b.positionPrev ? b.positionPrev.x : b.position.x, b.position.x, alpha);
    const py = lerp(b.positionPrev ? b.positionPrev.y : b.position.y, b.position.y, alpha);
    drawPlane(ctx, px, py, b.angle, t, { spin: this.speed / 12, wheels: this.state !== 'fly' });

    PS.draw(ctx);
    this.cam.end(ctx);
  }
}

function drawRing(ctx, r, t, i) {
  const pulse = 1 + Math.sin(t * 3 + r.ph) * 0.05;
  ctx.save();
  ctx.translate(r.x, r.y);
  ctx.scale(pulse, pulse);
  if (r.hit) ctx.globalAlpha = 0.25;
  for (let c = 0; c < 7; c++) {
    ctx.strokeStyle = RAINBOW[c];
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.ellipse(0, 0, 26 + c * 4.4, 96 + c * 5.5, 0, 0, TAU);
    ctx.stroke();
  }
  ctx.restore();
  if (!r.hit) glow(ctx, r.x, r.y, 150, '#fff', 0.09 + 0.05 * Math.sin(t * 3 + r.ph));
}

function regionColor(x) {
  // gräs → berg → öken
  if (x < 5600) return { top: '#59b25e', deep: '#3f7a46' };
  if (x < 9400) {
    const k = smooth((x - 5600) / 800);
    return { top: mix('#59b25e', '#9a9aa8', k), deep: mix('#3f7a46', '#5a5a68', k) };
  }
  const k = smooth((x - 9400) / 600);
  return { top: mix('#9a9aa8', '#e8c87a', k), deep: mix('#5a5a68', '#b89050', k) };
}
function mix(a, b, k) {
  const pa = [parseInt(a.substr(1, 2), 16), parseInt(a.substr(3, 2), 16), parseInt(a.substr(5, 2), 16)];
  const pb = [parseInt(b.substr(1, 2), 16), parseInt(b.substr(3, 2), 16), parseInt(b.substr(5, 2), 16)];
  const c = [];
  for (let i = 0; i < 3; i++) c.push(Math.round(pa[i] + (pb[i] - pa[i]) * k));
  return 'rgb(' + c[0] + ',' + c[1] + ',' + c[2] + ')';
}

function drawTerrain(ctx, cam, t) {
  const x0 = Math.max(0, cam.x - view.w / 2 - 60);
  const x1 = Math.min(LEN + 400, cam.x + view.w / 2 + 60);
  // fyll i segment om 480px så gradienten hinner skifta
  for (let sx = Math.floor(x0 / 480) * 480; sx < x1; sx += 480) {
    const col = regionColor(sx + 240);
    const g = ctx.createLinearGradient(0, 500, 0, VH + 100);
    g.addColorStop(0, col.top);
    g.addColorStop(1, col.deep);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(sx, VH + 120);
    for (let x = sx; x <= sx + 480 + 24; x += 24) ctx.lineTo(x, groundY(x));
    ctx.lineTo(sx + 504, VH + 120);
    ctx.closePath();
    ctx.fill();
  }
  // snötoppar i bergen + dekor
  for (let x = Math.floor(x0 / 240) * 240; x < x1; x += 240) {
    const gy = groundY(x);
    const r = Math.abs(Math.sin(x * 12.9898) * 43758.5453) % 1;
    if (x > 5800 && x < 9400 && gy < 640) {
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.beginPath();
      ctx.moveTo(x - 60, groundY(x - 60));
      ctx.quadraticCurveTo(x, gy - 26, x + 60, groundY(x + 60));
      ctx.closePath();
      ctx.fill();
    } else if (x < 5400 && r > 0.45) {
      // träd
      ctx.fillStyle = '#6a4a2b';
      ctx.fillRect(x - 6, gy - 56, 12, 56);
      ctx.fillStyle = r > 0.7 ? '#4a9a52' : '#59b25e';
      ctx.beginPath();
      ctx.arc(x, gy - 78, 34, 0, TAU);
      ctx.arc(x - 24, gy - 58, 26, 0, TAU);
      ctx.arc(x + 24, gy - 58, 26, 0, TAU);
      ctx.fill();
    } else if (x > 9500 && x < 12500 && r > 0.55) {
      // kaktus
      ctx.fillStyle = '#3f9147';
      ctx.fillRect(x - 8, gy - 70, 16, 70);
      ctx.fillRect(x - 30, gy - 52, 14, 12);
      ctx.fillRect(x - 30, gy - 52, 12, 30);
      ctx.fillRect(x + 16, gy - 62, 14, 12);
      ctx.fillRect(x + 18, gy - 62, 12, 24);
    }
  }
}

function drawRunway(ctx, t) {
  ctx.fillStyle = '#4a4a56';
  ctx.fillRect(RUNWAY.x0, RUNWAY.y - 6, RUNWAY.x1 - RUNWAY.x0, 60);
  ctx.fillStyle = '#fff';
  for (let x = RUNWAY.x0 + 40; x < RUNWAY.x1 - 40; x += 130) {
    ctx.fillRect(x, RUNWAY.y + 18, 66, 8);
  }
  // landningsljus
  for (let x = RUNWAY.x0; x < RUNWAY.x1; x += 230) {
    const on = Math.sin(t * 6 + x) > 0;
    ctx.fillStyle = on ? '#ffd24a' : '#7a6a2a';
    ctx.beginPath();
    ctx.arc(x, RUNWAY.y - 12, 6, 0, TAU);
    ctx.fill();
  }
  txt(ctx, '🛬 RYMDBASEN', RUNWAY.x0 + 300, RUNWAY.y - 90, { size: 40, bold: true, color: '#fff', stroke: 'rgba(40,20,60,0.8)', strokeW: 7 });
}

function drawBase(ctx, t) {
  const bx = 13500, by = RUNWAY.y;
  // liten raket i fjärran + byggnad
  ctx.fillStyle = '#8f97a8';
  ctx.fillRect(bx - 160, by - 120, 240, 120);
  ctx.fillStyle = '#aeb6c8';
  ctx.beginPath();
  ctx.moveTo(bx - 180, by - 120);
  ctx.quadraticCurveTo(bx - 40, by - 200, bx + 100, by - 120);
  ctx.closePath();
  ctx.fill();
  // raketsiluett
  ctx.fillStyle = '#d8dde8';
  ctx.beginPath();
  ctx.moveTo(bx + 190, by);
  ctx.lineTo(bx + 190, by - 150);
  ctx.quadraticCurveTo(bx + 210, by - 210, bx + 230, by - 150);
  ctx.lineTo(bx + 230, by);
  ctx.closePath();
  ctx.fill();
}

function drawFlightSky(c, w, h) {
  const g = c.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#6ab8ff');
  g.addColorStop(0.45, '#a8d0ff');
  g.addColorStop(0.7, '#ffd9a8');
  g.addColorStop(1, '#ffb385');
  c.fillStyle = g;
  c.fillRect(0, 0, w, h);
  const sg = c.createRadialGradient(520, 260, 30, 520, 260, 220);
  sg.addColorStop(0, 'rgba(255,250,225,1)');
  sg.addColorStop(0.4, 'rgba(255,230,150,0.8)');
  sg.addColorStop(1, 'rgba(255,220,120,0)');
  c.fillStyle = sg;
  c.beginPath(); c.arc(520, 260, 220, 0, TAU); c.fill();
  c.fillStyle = '#fff8dd';
  c.beginPath(); c.arc(520, 260, 70, 0, TAU); c.fill();
}

function drawFarPeaks(c, w, h) {
  // periodiska frekvenser → sömlös tiling
  function peakY(x) {
    return 300 - 170 * Math.abs(Math.sin(x * Math.PI * 3 / w)) - 60 * Math.sin(x * TAU * 7 / w);
  }
  c.fillStyle = 'rgba(140,150,190,0.55)';
  c.beginPath();
  c.moveTo(0, h);
  for (let x = 0; x <= w; x += 18) c.lineTo(x, peakY(x));
  c.lineTo(w, h);
  c.closePath();
  c.fill();
  // snöiga toppar
  c.fillStyle = 'rgba(255,255,255,0.5)';
  for (let x = 0; x <= w; x += 18) {
    const y = peakY(x);
    if (y < 170) { c.beginPath(); c.arc(x, y + 8, 9, 0, TAU); c.fill(); }
  }
}

function drawCloudBand(c, w, h) {
  c.fillStyle = 'rgba(255,255,255,0.9)';
  for (let i = 0; i < 7; i++) {
    const x = (i / 7) * w + 60, y = 60 + (i % 3) * 70, s = 0.8 + (i % 4) * 0.25;
    c.beginPath();
    c.arc(x, y, 40 * s, 0, TAU);
    c.arc(x + 46 * s, y - 16 * s, 32 * s, 0, TAU);
    c.arc(x + 92 * s, y, 36 * s, 0, TAU);
    c.arc(x + 46 * s, y + 18 * s, 34 * s, 0, TAU);
    c.fill();
  }
}

export const flightScene = new FlightScene();
