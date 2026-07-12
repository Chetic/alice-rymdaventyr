// Vattenmånen Europa: under isen hos sjöjungfrun Melinda.
// Pussel: korallmelodin (härma Melindas sång) och kistan med luftballonger.

import { VH, GRAV, PAL, TAU, rand, clamp, lerp, dist } from '../config.js';
import { view, makeCanvas, Parallax, PS, txt, glow, QY, rr, drawGem } from '../render.js';
import { setScheme, IN, NO_IN } from '../input.js';
import { M, addToWorld, addStatic, addSensor, removeBody, drawWorld, CAT } from '../world.js';
import { SAVE, setFlag, flag, advanceTo, addCoins } from '../save.js';
import { AUD, MELINDA_NOTES } from '../audio.js';
import { HUD } from '../hud.js';
import { drawGirl, drawMermaid, WHO } from '../chars.js';
import { drawRocket, drawActionBubble } from '../props.js';
import { SceneBase, PuzzleBase, makeWalker, bindWalkerSprite, NAV } from './base.js';

const W = 5000;
const FLOOR = 1010;
const ICE_Y = 130;
const ROCKET_X = 320;
const CHEST_X = 2250;
const GAP_X = 2250;          // hål i isen rakt ovanför kistan
const MELINDA_X = 3600;
const CORALS_X = [3150, 3400, 3650, 3900, 4150];
const CORAL_COLORS = ['#ff4d6d', '#ff9e40', '#ffd24a', '#59d666', '#3fb8ff'];

class EuropaScene extends SceneBase {
  constructor() {
    super('europa');
    this.song = 'europa';
    this.gravity = GRAV.europa;
  }

  enter() {
    this.baseEnter();
    setScheme('swim');

    addStatic(W / 2, FLOOR + 60, W + 400, 120);
    addStatic(-40, VH / 2, 80, VH * 2);
    addStatic(W + 40, VH / 2, 80, VH * 2);
    // istak med hål ovanför kistan
    addStatic(GAP_X - 1300, ICE_Y, 2600 - 260, 90);
    addStatic(GAP_X + 1500, ICE_Y, 2600, 90);

    // Alice simmar
    this.walker = makeWalker(ROCKET_X + 150, 800, { r: 36 });
    this.walker.body.frictionAir = 0.05;
    const w = this.walker;
    const self = this;
    bindWalkerSprite(w, function (ctx, x, y, a, t) {
      // bubblan
      glow(ctx, x, y - 20, 90, '#bfe8ff', 0.16);
      ctx.strokeStyle = 'rgba(200,240,255,0.5)';
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(x, y - 22, 74, 0, TAU); ctx.stroke();
      drawGirl(ctx, x, y + 36, t, WHO.aliceSuit, { mode: 'float', face: w.face, ph: w.ph });
    }, 6);

    this.met = flag('metMelinda');
    this.compass = flag('compass');
    this.chestDone = flag('chestDone');

    // kistan + ballonger
    this.balloons = 0;
    this.chest = null;
    if (!this.chestDone) {
      this.chest = M.Bodies.rectangle(CHEST_X, FLOOR - 60, 130, 92, {
        density: 0.004, frictionAir: 0.03, friction: 0.4, restitution: 0, sleepThreshold: Infinity,
        collisionFilter: { category: CAT.PROP, mask: CAT.TERRAIN | CAT.PLAYER }
      });
      addToWorld(this.chest);
    }
    this.pzChest = new PuzzleBase('Prova med precis TRE ballonger — lagom lyft! 🎈');
    this.pzChest.simplify = function () { HUD.toast('Tre ballonger är lagom! 3️⃣🎈'); };

    // korallmelodin
    this.mel = {
      state: this.compass ? 'done' : 'idle',   // idle | listen | repeat | done
      seq: [], input: 0, round: 0, playT: 0, playIdx: -1, glow: [0, 0, 0, 0, 0]
    };
    this.pzMel = new PuzzleBase('Titta vilken korall som LYSER och tryck i samma ordning! 🎵');
    this.pzMel.simplify = function () { self.melSlow = true; };
    this.melSlow = false;

    // fiskar och bubblor (dekor)
    this.fish = [];
    for (let i = 0; i < 6; i++) {
      this.fish.push({ x: rand(400, W - 400), y: rand(300, 900), dir: Math.random() < 0.5 ? -1 : 1, spd: rand(40, 90), ph: rand(0, TAU), col: ['#ffd24a', '#ff9e40', '#c95cff', '#59d666'][i % 4] });
    }
    this.bubbles = [];
    for (let i = 0; i < 24; i++) {
      this.bubbles.push({ x: rand(0, W), y: rand(200, FLOOR), r: rand(3, 10), spd: rand(30, 80), ph: rand(0, TAU) });
    }

    this.coinRow(900, 700, 3, 80, 'silver');
    this.coinRow(1500, 400, 3, 80, 'silver');
    this.addCoin(2700, 500, 'gold');
    this.coinRow(4500, 700, 2, 80, 'silver');

    this.par = new Parallax();
    this.par.add(0.0, 2048, VH, drawWaterBg);
    this.par.add(0.12, 2048, 400, drawFarReef, { y: 700 });

    HUD.objective(this.compass ? 'Tillbaka till raketen! 🚀' : 'Simma till Melinda! 🧜‍♀️');
    if (!this.met) {
      this.after(0.8, function () {
        HUD.dialog([{ who: 'alice', text: 'Jag simmar under isen! Bubblorna kittlas! 🫧' }]);
      });
    }
    AUD.loop('water', true, 0.06);
  }

  exit() {
    AUD.loop('water', false);
  }

  update(dt) {
    this.tick(dt);
    const inp = HUD.blocked() ? NO_IN : IN;
    const w = this.walker;
    const b = w.body;

    // simfysik: flytkraft + styrfart
    M.Body.applyForce(b, b.position, { x: 0, y: -b.mass * this.gravity * 0.001 * 0.92 });
    const ax = inp.ax * 0.0016, ay = (inp.down ? 1 : 0) * 0.0014 - (inp.up ? 1 : 0) * 0.0016;
    M.Body.applyForce(b, b.position, { x: b.mass * ax, y: b.mass * ay });
    if (inp.ax > 0.1) w.face = 1;
    else if (inp.ax < -0.1) w.face = -1;
    w.ph += dt * 3;
    const spd = Math.sqrt(b.velocity.x * b.velocity.x + b.velocity.y * b.velocity.y);
    if (spd > 8) M.Body.setVelocity(b, { x: b.velocity.x * 8 / spd, y: b.velocity.y * 8 / spd });
    if (Math.random() < dt * 3) {
      PS.spawn('splash', b.position.x + rand(-20, 20), b.position.y - 60, { color: 'rgba(200,240,255,0.8)', vx: rand(-10, 10), vy: -60, life: 1.2, size: 5 });
    }
    const p = b.position;
    this.updateCoins(dt, p.x, p.y);

    // möt Melinda
    if (!this.met && p.x > MELINDA_X - 500) {
      this.met = true;
      setFlag('metMelinda');
      const self = this;
      HUD.dialog([
        { who: 'melinda', text: 'Hej lilla simmare! Jag är Melinda! Välkommen till min korallträdgård! 🐚' },
        { who: 'melinda', text: 'Din pappa lämnade en pärlkompass hos mig — den visar vägen till honom!' },
        { who: 'melinda', text: 'Men först: sjung med mig! Korallerna lyser — tryck på dem i SAMMA ordning! 🎵' },
        { who: 'alice', text: 'Jag älskar sånglekar! Kör!' }
      ], function () {
        HUD.objective('Härma korallsången! 🎵');
        self.startMelody(3);
      });
    }

    // kistan + ballonger
    if (this.chest && !this.chestDone) {
      const lift = this.balloons * 0.42;
      M.Body.applyForce(this.chest, this.chest.position, { x: 0, y: -this.chest.mass * this.gravity * 0.001 * lift });
      capChest(this.chest);
      const cy = this.chest.position.y;
      if (cy < ICE_Y + 180) {
        if (this.balloons >= 4 || this.chest.velocity.y < -5) {
          // för snabbt — spikarna spräcker ballongerna
          if (Math.abs(this.chest.position.x - GAP_X) > 110 || this.balloons >= 4) {
            this.balloons = 0;
            this.pzChest.fail();
            AUD.sfx('pop');
            PS.burst('splash', this.chest.position.x, cy, 14, { color: '#cfe8ff', speed: 240 });
            HUD.toast('POP! Ballongerna sprack… 🎈');
          }
        }
        if (this.balloons === 3 && Math.abs(this.chest.position.x - GAP_X) < 130 && cy < ICE_Y + 150) {
          // perfekt — kistan dockar i hålet!
          this.chestDone = true;
          setFlag('chestDone');
          M.Body.setStatic(this.chest, true);
          M.Body.setPosition(this.chest, { x: GAP_X, y: ICE_Y + 110 });
          this.pzChest.solve();
          HUD.toast('Skattkistan är uppe! 💎');
          for (let i = 0; i < 3; i++) this.addCoin(GAP_X - 60 + i * 60, ICE_Y + 220, i === 1 ? 'gold' : 'silver');
          SAVE.gems += 1;
          PS.burst('star', GAP_X, ICE_Y + 160, 16, { color: PAL.gold, speed: 260 });
        }
      }
    }

    // melodispel
    this.stepMelody(dt);

    // interaktion (pump + raket)
    this.near = null;
    if (!HUD.blocked()) {
      if (this.chest && !this.chestDone && dist(p.x, p.y, this.chest.position.x, this.chest.position.y) < 220) {
        this.near = { kind: 'pump', x: this.chest.position.x, y: this.chest.position.y - 130 };
      } else if (Math.abs(p.x - ROCKET_X) < 180) {
        this.near = { kind: 'rocket', x: ROCKET_X, y: 620 };
      }
      if (inp.actionEdge && this.near) {
        if (this.near.kind === 'pump') this.addBalloon();
        else this.leave();
      }
    }

    // dekor
    for (let i = 0; i < this.fish.length; i++) {
      const f = this.fish[i];
      f.x += f.dir * f.spd * dt;
      if (f.x < 200) f.dir = 1;
      if (f.x > W - 200) f.dir = -1;
    }
    for (let i = 0; i < this.bubbles.length; i++) {
      const bu = this.bubbles[i];
      bu.y -= bu.spd * dt;
      if (bu.y < ICE_Y + 80) { bu.y = FLOOR - 10; bu.x = rand(0, W); }
    }

    this.cam.clampTo(0, 0, W, VH + 60);
    this.cam.follow(p.x, p.y - 60, 0.09);
    this.cam.update(dt);
  }

  addBalloon() {
    if (this.balloons >= 4) return;
    this.balloons++;
    AUD.sfx('pop');
    PS.burst('splash', this.chest.position.x, this.chest.position.y - 60, 6, { color: '#cfe8ff', speed: 120 });
    if (this.balloons === 4) HUD.toast('Fyra?! Det är nog för många… 🎈🎈🎈🎈');
  }

  startMelody(len) {
    const m = this.mel;
    m.state = 'listen';
    m.seq = [];
    for (let i = 0; i < len; i++) {
      let n = Math.floor(Math.random() * 5);
      if (i > 0 && n === m.seq[i - 1]) n = (n + 1) % 5;   // undvik dubbletter i rad
      m.seq.push(n);
    }
    m.playT = 0.8;
    m.playIdx = -1;
    m.input = 0;
  }

  stepMelody(dt) {
    const m = this.mel;
    for (let i = 0; i < 5; i++) if (m.glow[i] > 0) m.glow[i] -= dt * 2.2;
    if (m.state === 'listen') {
      m.playT -= dt;
      if (m.playT <= 0) {
        m.playIdx++;
        if (m.playIdx >= m.seq.length) {
          m.state = 'repeat';
          m.input = 0;
          HUD.toast('Din tur! 🎵');
        } else {
          const n = m.seq[m.playIdx];
          m.glow[n] = 1;
          AUD.note(MELINDA_NOTES[n], 0.55, 'harp', 0.95);
          PS.burst('note', CORALS_X[n], 800, 2, { color: CORAL_COLORS[n], speed: 60 });
          m.playT = this.melSlow ? 1.1 : 0.75;
        }
      }
    }
  }

  tapCoral(i) {
    const m = this.mel;
    if (m.state !== 'repeat') return;
    m.glow[i] = 1;
    AUD.note(MELINDA_NOTES[i], 0.5, 'harp', 0.95);
    PS.burst('note', CORALS_X[i], 800, 2, { color: CORAL_COLORS[i], speed: 60 });
    if (i === m.seq[m.input]) {
      m.input++;
      if (m.input >= m.seq.length) {
        m.round++;
        if (m.round >= 3) {
          m.state = 'done';
          this.compass = true;
          setFlag('compass');
          this.pzMel.solve();
          const self = this;
          this.after(0.8, function () {
            HUD.dialog([
              { who: 'melinda', text: 'VILKEN röst du har! Havet sjunger med dig, Alice! 🌊' },
              { who: 'melinda', text: 'Här är pärlkompassen — den pekar alltid mot din pappa! 🧭' },
              { who: 'alice', text: 'Tack Melinda! Nu är han nära, jag känner det!' }
            ], function () {
              HUD.toast('🧭 Pärlkompassen!');
              HUD.objective('Tillbaka till raketen! 🚀');
            });
          });
        } else {
          AUD.sfx('fanfare');
          HUD.toast('Rätt! Nu en längre! ⭐');
          this.startMelody(3 + m.round);
        }
      }
    } else {
      this.pzMel.fail();
      HUD.toast('Nästan! Lyssna igen… 👂');
      this.startMelody(this.mel.seq.length);
    }
  }

  onTap(x, y) {
    if (HUD.blocked()) return;
    const wx = x - this.cam.ox, wy = y - this.cam.oy;
    // koraller
    if (this.mel.state === 'repeat') {
      for (let i = 0; i < 5; i++) {
        if (dist(wx, wy, CORALS_X[i], FLOOR - 120) < 110) { this.tapCoral(i); return; }
      }
    }
    // ballonger poppas med tryck
    if (this.chest && !this.chestDone && this.balloons > 0) {
      if (dist(wx, wy, this.chest.position.x, this.chest.position.y - 150) < 130) {
        this.balloons--;
        AUD.sfx('pop');
        return;
      }
    }
  }

  leave() {
    if (!this.compass) {
      HUD.dialog([{ who: 'alice', text: 'Melinda har något åt mig — jag måste sjunga klart först! 🎵' }]);
      return;
    }
    advanceTo('travel_saturn');
    HUD.dialog([{ who: 'alice', text: 'Vidare till Saturnus regnbågsringar — och enhörningen Stella! 🦄' }], function () {
      NAV.go('travel_saturn');
    });
  }

  draw(ctx, alpha, t) {
    this.par.draw(ctx, this.cam.x, this.cam.y * 0.1, QY.layersMax());
    this.cam.begin(ctx);

    // ljusstrålar genom isen
    ctx.save();
    ctx.globalAlpha = 0.1;
    ctx.fillStyle = '#bfe8ff';
    for (let i = 0; i < 5; i++) {
      const lx = 500 + i * 950 + Math.sin(t * 0.4 + i) * 60;
      ctx.beginPath();
      ctx.moveTo(lx, ICE_Y + 40);
      ctx.lineTo(lx + 240, ICE_Y + 40);
      ctx.lineTo(lx + 420, FLOOR);
      ctx.lineTo(lx + 60, FLOOR);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();

    // istak
    drawIceCeiling(ctx, this.cam, t);

    // havsbotten
    drawSeabed(ctx, this.cam, t);

    // raket på en klippavsats
    ctx.fillStyle = '#3a4a5e';
    rr(ctx, ROCKET_X - 170, FLOOR - 40, 340, 40, 10);
    ctx.fill();
    drawRocket(ctx, ROCKET_X, FLOOR - 160, 0, t, { alice: false, flame: 0, scale: 1 });

    // koraller (melodins knappar)
    for (let i = 0; i < 5; i++) {
      drawCoral(ctx, CORALS_X[i], FLOOR - 6, CORAL_COLORS[i], t, this.mel.glow[i], i);
    }

    // Melinda
    drawMermaid(ctx, MELINDA_X, FLOOR - 210, t, { s: 1.15, face: this.walker.pos().x < MELINDA_X ? -1 : 1 });

    // kistan + ballonger
    if (this.chest) this.drawChest(ctx, t);

    // fiskar
    for (let i = 0; i < this.fish.length; i++) {
      const f = this.fish[i];
      drawFish(ctx, f.x, f.y + Math.sin(t * 2 + f.ph) * 14, f.dir, f.col, t);
    }

    // bubblor
    ctx.save();
    ctx.strokeStyle = 'rgba(200,240,255,0.4)';
    ctx.lineWidth = 2;
    for (let i = 0; i < this.bubbles.length; i++) {
      const bu = this.bubbles[i];
      if (!this.cam.visible(bu.x, bu.y, 60)) continue;
      ctx.beginPath();
      ctx.arc(bu.x + Math.sin(t * 2 + bu.ph) * 10, bu.y, bu.r, 0, TAU);
      ctx.stroke();
    }
    ctx.restore();

    drawWorld(ctx, alpha, t);

    if (this.near && !HUD.blocked()) drawActionBubble(ctx, this.near.x, this.near.y, t);

    this.drawCoins(ctx, t);
    PS.draw(ctx);
    this.cam.end(ctx);

    // blå ton över allt
    ctx.fillStyle = 'rgba(30,90,140,0.10)';
    ctx.fillRect(0, 0, view.w, VH);
  }

  drawChest(ctx, t) {
    const c = this.chest.position;
    const a = this.chest.angle;
    // ballonger
    for (let i = 0; i < this.balloons; i++) {
      const bx = c.x - 45 + i * 30;
      const by = c.y - 130 - (i % 2) * 26 + Math.sin(t * 2 + i) * 8;
      ctx.strokeStyle = 'rgba(255,255,255,0.6)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(c.x - 30 + i * 20, c.y - 40);
      ctx.lineTo(bx, by + 34);
      ctx.stroke();
      const col = ['#ff6bcb', '#ffd24a', '#59d666', '#3fb8ff'][i];
      glow(ctx, bx, by, 44, col, 0.25);
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.ellipse(bx, by, 24, 30, 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.beginPath();
      ctx.ellipse(bx - 8, by - 10, 6, 9, 0.3, 0, TAU);
      ctx.fill();
    }
    // kista
    ctx.save();
    ctx.translate(c.x, c.y);
    ctx.rotate(a);
    const g = ctx.createLinearGradient(0, -46, 0, 46);
    g.addColorStop(0, '#a86a32');
    g.addColorStop(1, '#6a4a2b');
    ctx.fillStyle = g;
    rr(ctx, -65, -46, 130, 92, 12);
    ctx.fill();
    ctx.strokeStyle = PAL.gold2;
    ctx.lineWidth = 5;
    ctx.stroke();
    ctx.strokeStyle = PAL.gold;
    ctx.lineWidth = 6;
    ctx.beginPath(); ctx.moveTo(-65, -6); ctx.lineTo(65, -6); ctx.stroke();
    ctx.fillStyle = PAL.gold;
    ctx.beginPath(); ctx.arc(0, 0, 12, 0, TAU); ctx.fill();
    ctx.restore();
    if (this.chestDone) {
      glow(ctx, c.x, c.y + 60, 80, PAL.gold, 0.3 + 0.1 * Math.sin(t * 3));
    }
  }
}

function capChest(chest) {
  const v = chest.velocity;
  const s = Math.sqrt(v.x * v.x + v.y * v.y);
  if (s > 9) M.Body.setVelocity(chest, { x: v.x * 9 / s, y: v.y * 9 / s });
}

function drawCoral(ctx, x, y, color, t, glowK, idx) {
  const g = Math.max(0, glowK);
  if (g > 0) glow(ctx, x, y - 90, 130, color, 0.5 * g);
  ctx.save();
  ctx.translate(x, y);
  const sway = Math.sin(t * 1.6 + idx * 1.3) * 0.05;
  ctx.rotate(sway);
  ctx.fillStyle = color;
  // korallgrenar
  for (let br = -1; br <= 1; br++) {
    ctx.save();
    ctx.rotate(br * 0.4);
    rr(ctx, -12, -120, 24, 120, 12);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(0, -124, 20 + (br === 0 ? 8 : 0), 0, TAU);
    ctx.fill();
    ctx.restore();
  }
  ctx.globalAlpha = 0.4 + 0.6 * g;
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(0, -128, 12 + g * 8, 0, TAU);
  ctx.fill();
  ctx.restore();
  // not-symbol
  txt(ctx, '♪', x, y - 180, { size: 30, color: color, alpha: 0.5 + 0.5 * g });
}

function drawFish(ctx, x, y, dir, color, t) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(dir, 1);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.ellipse(0, 0, 26, 14, 0, 0, TAU);
  ctx.fill();
  // stjärtfena
  const flap = Math.sin(t * 8) * 6;
  ctx.beginPath();
  ctx.moveTo(-22, 0);
  ctx.lineTo(-40, -10 + flap);
  ctx.lineTo(-40, 10 + flap);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.beginPath(); ctx.arc(12, -3, 4, 0, TAU); ctx.fill();
  ctx.fillStyle = '#222';
  ctx.beginPath(); ctx.arc(13, -3, 2, 0, TAU); ctx.fill();
  ctx.restore();
}

function drawIceCeiling(ctx, cam, t) {
  const x0 = Math.max(0, cam.x - view.w / 2 - 60);
  const x1 = Math.min(W + 200, cam.x + view.w / 2 + 60);
  const g = ctx.createLinearGradient(0, ICE_Y - 60, 0, ICE_Y + 80);
  g.addColorStop(0, '#e8f6ff');
  g.addColorStop(1, '#9ecbe8');
  ctx.fillStyle = g;
  // två sektioner med hål vid GAP_X
  const holes = [[GAP_X - 130, GAP_X + 130]];
  let cur = x0;
  ctx.beginPath();
  for (let x = x0; x <= x1; x += 30) {
    const inHole = x > holes[0][0] && x < holes[0][1];
    if (!inHole) {
      ctx.rect(x, ICE_Y - 55, 30, 100 + Math.sin(x * 0.02) * 18);
    }
  }
  ctx.fill();
  // istappar/spikar vid hålets kanter
  ctx.fillStyle = '#cfe8f8';
  for (let side = -1; side <= 1; side += 2) {
    const ex = GAP_X + side * 150;
    ctx.beginPath();
    ctx.moveTo(ex - 18, ICE_Y + 40);
    ctx.lineTo(ex, ICE_Y + 110);
    ctx.lineTo(ex + 18, ICE_Y + 40);
    ctx.closePath();
    ctx.fill();
  }
}

function drawSeabed(ctx, cam, t) {
  const x0 = Math.max(0, cam.x - view.w / 2 - 60);
  const x1 = Math.min(W + 200, cam.x + view.w / 2 + 60);
  const g = ctx.createLinearGradient(0, FLOOR - 20, 0, FLOOR + 130);
  g.addColorStop(0, '#c9b88a');
  g.addColorStop(1, '#7a6a4a');
  ctx.fillStyle = g;
  ctx.fillRect(x0, FLOOR - 10, x1 - x0, 150);
  // sjögräs + snäckor
  for (let x = Math.floor(x0 / 160) * 160; x < x1; x += 160) {
    const r = Math.abs(Math.sin(x * 12.9898) * 43758.5453) % 1;
    if (r > 0.35) {
      ctx.strokeStyle = 'rgba(60,160,110,0.8)';
      ctx.lineWidth = 6;
      for (let s2 = 0; s2 < 3; s2++) {
        ctx.beginPath();
        ctx.moveTo(x + s2 * 12, FLOOR);
        ctx.quadraticCurveTo(x + s2 * 12 + Math.sin(t * 1.5 + x + s2) * 14, FLOOR - 50 - r * 40, x + s2 * 12 + Math.sin(t * 1.5 + x + s2 + 1) * 20, FLOOR - 90 - r * 60);
        ctx.stroke();
      }
    } else if (r > 0.2) {
      ctx.fillStyle = '#ffd9ec';
      ctx.beginPath();
      ctx.arc(x + 60, FLOOR - 8, 12, Math.PI, 0);
      ctx.fill();
    }
  }
}

function drawWaterBg(c, w, h) {
  const g = c.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#0e2a4a');
  g.addColorStop(0.5, '#123a5e');
  g.addColorStop(1, '#0a1e33');
  c.fillStyle = g;
  c.fillRect(0, 0, w, h);
}

function drawFarReef(c, w, h) {
  c.fillStyle = 'rgba(20,60,90,0.7)';
  c.beginPath();
  c.moveTo(0, h);
  for (let x = 0; x <= w; x += 20) {
    c.lineTo(x, 160 - 100 * Math.abs(Math.sin(x * Math.PI * 3 / w)) - 30 * Math.sin(x * TAU * 8 / w));
  }
  c.lineTo(w, h);
  c.closePath();
  c.fill();
}

export const europaScene = new EuropaScene();
