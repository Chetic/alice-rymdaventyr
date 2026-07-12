// Hemma på jorden: tutorial. Läs pappas brev, stapla guldlådor till vindsnyckeln,
// sätt kugghjulen rätt på hangardörren och kliv in i flygplanet.

import { VH, GRAV, PAL, RAINBOW, TAU, rand, dist } from '../config.js';
import { view, makeCanvas, Parallax, PS, txt, glow, QY, starPath, rr } from '../render.js';
import { setScheme, IN, NO_IN } from '../input.js';
import { addStatic, addBox, addSprite, removeBody, drawWorld } from '../world.js';
import { SAVE, setFlag, flag, advanceTo, persist } from '../save.js';
import { AUD } from '../audio.js';
import { HUD } from '../hud.js';
import { drawGirl, WHO } from '../chars.js';
import { drawPlane, drawGear, drawCrate, drawKey, drawMailbox, drawActionBubble } from '../props.js';
import { SceneBase, PuzzleBase, makeWalker, bindWalkerSprite, NAV } from './base.js';

const W = 5300;
const GROUND = 1000;
const GEAR_R = [30, 44, 58];        // liten, mellan, stor
const LEDGE = { x: 2280, y: 590, w: 330 };
const KEY_POS = { x: 2280, y: 520 };
const DOOR_X = 3640;
const PLANE_POS = { x: 4420, y: 938 };
const MAILBOX_X = 1230;

class HomeScene extends SceneBase {
  constructor() {
    super('home');
    this.song = 'home';
    this.gravity = GRAV.earth;
    this.par = null;
    this.walker = null;
    this.crates = [];
    this.gears = [];
    this.slots = [];
    this.carried = -1;
    this.doorBody = null;
    this.doorLift = 0;
    this.gearPz = null;
    this.stackTimer = 0;
    this.stage = 0;   // 0 brev, 1 nyckel, 2 kugghjul, 3 plan
    this.near = null;
    this.gearSpin = 0;
  }

  enter() {
    this.baseEnter();
    setScheme('walk', { action: true });

    // fysik: mark, väggar, hylla, dörr
    addStatic(W / 2, GROUND + 60, W + 400, 120);
    addStatic(-40, VH / 2, 80, VH * 2);
    addStatic(W + 40, VH / 2, 80, VH * 2);
    addStatic(LEDGE.x, LEDGE.y + 15, LEDGE.w, 30);

    const doorOpen = flag('hDoor');
    this.doorLift = doorOpen ? 430 : 0;
    this.doorBody = doorOpen ? null : addStatic(DOOR_X, 790, 70, 424);

    // guldlådor
    this.crates = [];
    const cratePos = [1620, 1840, 2060];
    for (let i = 0; i < 3; i++) {
      const b = addBox(cratePos[i], GROUND - 56, 110, 110, { density: 0.0022, friction: 0.5, frictionStatic: 0.7 });
      this.crates.push(b);
      addSprite(b, function (ctx, x, y, a) { drawCrate(ctx, x, y, a, 110); }, 4);
    }

    // kugghjul (storlek 2=stor, 0=liten, 1=mellan) + platser på panelen
    const placedAll = flag('hDoor');
    this.gears = [
      { size: 2, x: 2720, y: GROUND - GEAR_R[2], state: placedAll ? 'placed' : 'ground', slot: placedAll ? 2 : -1 },
      { size: 0, x: 3010, y: GROUND - GEAR_R[0], state: placedAll ? 'placed' : 'ground', slot: placedAll ? 0 : -1 },
      { size: 1, x: 3180, y: GROUND - GEAR_R[1], state: placedAll ? 'placed' : 'ground', slot: placedAll ? 1 : -1 }
    ];
    this.slots = [
      { size: 0, x: 3395, y: 866, taken: placedAll },
      { size: 1, x: 3400, y: 738, taken: placedAll },
      { size: 2, x: 3395, y: 588, taken: placedAll }
    ];
    this.carried = -1;
    this.gearSpin = 0;

    this.gearPz = new PuzzleBase('Stora kugghjulet ska på den stora pinnen! ⚙️');
    const self = this;
    this.gearPz.simplify = function () { self.showGhost = true; };
    this.showGhost = false;

    // mynt
    this.coinRow(1450, 930, 3, 70, 'silver');
    this.addCoin(2160, 520, 'gold');
    this.coinRow(2560, 930, 2, 70, 'silver');
    this.coinRow(3760, 930, 3, 70, 'silver');
    this.addCoin(4180, 900, 'gold');

    // Alice
    const startX = flag('hDoor') ? 3300 : (flag('hKey') ? 2300 : 320);
    this.walker = makeWalker(startX, 930);
    const w = this.walker;
    bindWalkerSprite(w, function (ctx, x, y, a, t) {
      drawGirl(ctx, x, y + 34, t, WHO.alice, { mode: w.mode, face: w.face, ph: w.ph });
    }, 6);

    this.stage = flag('hDoor') ? 3 : (flag('hKey') ? 2 : (flag('hLetter') ? 1 : 0));
    this.stackTimer = 0;
    this.updateObjective();

    // bakgrund: soluppgång, moln, kullar
    this.par = new Parallax();
    this.par.add(0.06, 2048, VH, drawSkyFar);
    this.par.add(0.22, 2048, 700, drawHillsFar, { y: 340 });
    this.par.add(0.45, 2048, 560, drawHillsNear, { y: 520 });

    // förrenderade byggnader
    this.housePiece = makeCanvas(760, 680, drawHousePiece);
    this.hangarPiece = makeCanvas(1750, 700, drawHangarPiece);

    if (this.stage === 0) {
      this.after(0.8, function () {
        HUD.dialog([
          { who: 'alice', text: 'Pappa? Pappa var är du? Han är inte hemma…' },
          { who: 'alice', text: 'Titta! Brevlådans flagga är uppe! 💌' }
        ]);
      });
    }
  }

  updateObjective() {
    const obj = [
      'Läs pappas brev 💌',
      'Hämta vindsnyckeln högt uppe 🔑',
      'Sätt kugghjulen på dörren ⚙️',
      'Hoppa in i flygplanet ✈️'
    ];
    HUD.objective(obj[this.stage]);
  }

  update(dt) {
    this.tick(dt);
    const inp = HUD.blocked() ? NO_IN : IN;
    const w = this.walker;
    w.update(dt, inp);
    const p = w.pos();

    this.updateCoins(dt, p.x, p.y);
    this.cam.clampTo(0, -200, W, VH + 40);
    this.cam.follow(p.x, p.y - 160, 0.1);
    this.cam.update(dt);

    // nyckeln
    if (this.stage === 1 && dist(p.x, p.y, KEY_POS.x, KEY_POS.y) < 80) {
      setFlag('hKey');
      this.stage = 2;
      this.updateObjective();
      AUD.sfx('unlock');
      HUD.toast('Vindsnyckeln! 🔑');
      PS.burst('star', KEY_POS.x, KEY_POS.y, 14, { color: PAL.gold, speed: 260 });
    }

    // tips om lådstapling
    if (this.stage === 1) {
      this.stackTimer += dt;
      if (this.stackTimer > 60) {
        HUD.hint('Knuffa guldlådorna under hyllan och stapla dem — sen hoppar du upp!');
        this.stackTimer = -999;
      }
    }

    // interaktioner
    this.near = this.findNear(p);
    if (inp.actionEdge && this.near) this.interact(this.near);

    // dörranimation
    if (flag('hDoor') && this.doorLift < 430) {
      this.doorLift += dt * 260;
      if (this.doorBody) { removeBody(this.doorBody); this.doorBody = null; }
    }
    if (this.gearSpin > 0) this.gearSpin -= dt;
  }

  findNear(p) {
    // brevlådan
    if (this.stage === 0 && Math.abs(p.x - MAILBOX_X) < 120 && p.y > 800) return { kind: 'mail', x: MAILBOX_X, y: 830 };
    // kugghjul på marken
    if (this.carried === -1) {
      for (let i = 0; i < this.gears.length; i++) {
        const g = this.gears[i];
        if (g.state === 'ground' && dist(p.x, p.y, g.x, g.y) < 110) return { kind: 'gear', i: i, x: g.x, y: g.y - GEAR_R[g.size] - 40 };
      }
    } else {
      // nära panelen: tryck på pinnen där kugghjulet ska sitta
      if (Math.abs(p.x - 3240) < 240) return { kind: 'panel', x: 3405, y: 480 };
      return { kind: 'drop', x: p.x, y: p.y - 130 };
    }
    // flygplanet
    if (this.stage === 3 && Math.abs(p.x - PLANE_POS.x) < 160 && Math.abs(p.y - PLANE_POS.y) < 200) {
      return { kind: 'plane', x: PLANE_POS.x, y: PLANE_POS.y - 130 };
    }
    return null;
  }

  interact(n) {
    const self = this;
    if (n.kind === 'mail') {
      AUD.sfx('pop');
      HUD.dialog([
        { who: 'papa', text: 'Hej älskade Alice! Jag forskar på den KALLASTE planeten — och min radio har frusit fast! ❄️' },
        { who: 'papa', text: 'Ta mitt flygplan till rymdbasen och kom och hämta mig. Jag har gömt ledtrådar på vägen! Puss! 💜' },
        { who: 'alice', text: 'Jag kommer, pappa! Först behöver jag vindsnyckeln till hangarpanelen… 🔑' }
      ], function () {
        setFlag('hLetter');
        self.stage = 1;
        self.updateObjective();
      });
    } else if (n.kind === 'gear') {
      this.carried = n.i;
      this.gears[n.i].state = 'carried';
      AUD.sfx('pop');
    } else if (n.kind === 'panel') {
      if (!flag('hKey')) {
        HUD.dialog([{ who: 'alice', text: 'Panelen är låst… Jag behöver en nyckel! 🔑' }]);
      } else {
        HUD.toast('Tryck på pinnen där kugghjulet ska sitta! 👆');
      }
    } else if (n.kind === 'drop') {
      const gear = this.gears[this.carried];
      gear.state = 'ground';
      gear.x = this.walker.pos().x + this.walker.face * 60;
      gear.y = GROUND - GEAR_R[gear.size];
      this.carried = -1;
      AUD.sfx('thump');
    } else if (n.kind === 'plane') {
      advanceTo('flight');
      const self2 = this;
      HUD.dialog([{ who: 'alice', text: 'Spänn fast säkerhetsbältet… Nu flyger vi till rymdbasen! 🌈' }], function () {
        NAV.go('flight');
      });
    }
  }

  onTap(x, y) {
    if (this.carried < 0 || HUD.blocked()) return;
    const wx = x - this.cam.ox, wy = y - this.cam.oy;
    for (let i = 0; i < this.slots.length; i++) {
      const s = this.slots[i];
      if (dist(wx, wy, s.x, s.y) < 85) {
        if (!flag('hKey')) {
          HUD.dialog([{ who: 'alice', text: 'Panelen är låst… Jag behöver en nyckel! 🔑' }]);
          return;
        }
        if (Math.abs(this.walker.pos().x - 3240) > 280) {
          HUD.toast('Gå närmare panelen!');
          return;
        }
        this.placeGear(i);
        return;
      }
    }
  }

  placeGear(slotIdx) {
    const slot = this.slots[slotIdx];
    const gear = this.gears[this.carried];
    if (slot.taken) { AUD.sfx('wrong'); return; }
    if (gear.size === slot.size) {
      gear.state = 'placed';
      gear.slot = slotIdx;
      slot.taken = true;
      this.carried = -1;
      AUD.sfx('unlock');
      PS.burst('sparkle', slot.x, slot.y, 10, { color: '#ffe9a8', speed: 200 });
      let all = true;
      for (let i = 0; i < this.gears.length; i++) if (this.gears[i].state !== 'placed') all = false;
      if (all) {
        this.gearSpin = 3;
        this.gearPz.solve();
        setFlag('hDoor');
        this.stage = 3;
        this.updateObjective();
        AUD.sfx('bigwin');
        this.cam.shake(6, 0.5);
        const self = this;
        this.after(1.2, function () {
          HUD.dialog([{ who: 'alice', text: 'WOW! Pappas rosa flygplan! Nu åker vi! ✈️🌈' }]);
        });
      }
    } else {
      // fel storlek — kugghjulet studsar av
      gear.state = 'ground';
      gear.x = slot.x - 300 + rand(-40, 40);
      gear.y = GROUND - GEAR_R[gear.size];
      this.carried = -1;
      this.gearPz.fail();
      HUD.toast('Hoppsan! Fel storlek…');
    }
  }

  draw(ctx, alpha, t) {
    // himmel
    this.par.draw(ctx, this.cam.x, this.cam.y * 0.25 + 40, QY.layersMax());

    this.cam.begin(ctx);

    // huset och hangaren
    ctx.drawImage(this.housePiece, 420, GROUND - 660);
    ctx.drawImage(this.hangarPiece, 3260, GROUND - 680);

    // hangardörr (skjuts upp)
    const doorTop = 580 - this.doorLift;
    if (this.doorLift < 425) {
      const g = ctx.createLinearGradient(0, doorTop, 0, doorTop + 420);
      g.addColorStop(0, '#8f97a8');
      g.addColorStop(1, '#6a7284');
      ctx.fillStyle = g;
      ctx.fillRect(DOOR_X - 35, doorTop, 70, 420);
      ctx.strokeStyle = '#4a5262';
      ctx.lineWidth = 3;
      for (let i = 1; i < 5; i++) {
        ctx.beginPath();
        ctx.moveTo(DOOR_X - 35, doorTop + i * 84);
        ctx.lineTo(DOOR_X + 35, doorTop + i * 84);
        ctx.stroke();
      }
    }

    // panel med kugghjulsplatser
    rr(ctx, 3330, 520, 150, 440, 18);
    ctx.fillStyle = '#3a3f52';
    ctx.fill();
    ctx.strokeStyle = flag('hKey') ? PAL.gold : '#20242f';
    ctx.lineWidth = 4;
    ctx.stroke();
    if (!flag('hKey')) {
      txt(ctx, '🔒', 3405, 545, { size: 34 });
    }
    for (let i = 0; i < this.slots.length; i++) {
      const s = this.slots[i];
      // pinne
      ctx.fillStyle = '#20242f';
      ctx.beginPath();
      ctx.arc(s.x, s.y, 10, 0, TAU);
      ctx.fill();
      if (this.showGhost && !s.taken) {
        ctx.save();
        ctx.globalAlpha = 0.3 + 0.15 * Math.sin(t * 4);
        drawGear(ctx, s.x, s.y, GEAR_R[s.size], 0, true);
        ctx.restore();
      }
    }
    // placerade kugghjul (snurrar när dörren öppnas)
    for (let i = 0; i < this.gears.length; i++) {
      const g = this.gears[i];
      if (g.state === 'placed') {
        const slot = this.slots[g.slot];
        const spin = flag('hDoor') ? t * 2.4 * (g.size === 1 ? -1 : 1) : 0;
        drawGear(ctx, slot.x, slot.y, GEAR_R[g.size], spin, true);
      }
    }

    // hyllan med stolpar
    ctx.fillStyle = '#6a4a8a';
    ctx.fillRect(LEDGE.x - LEDGE.w / 2, LEDGE.y, LEDGE.w, 26);
    ctx.fillStyle = '#54387a';
    ctx.fillRect(LEDGE.x - LEDGE.w / 2 + 16, LEDGE.y + 26, 18, GROUND - LEDGE.y - 26);
    ctx.fillRect(LEDGE.x + LEDGE.w / 2 - 34, LEDGE.y + 26, 18, GROUND - LEDGE.y - 26);
    txt(ctx, 'VINDEN', LEDGE.x, LEDGE.y - 16, { size: 22, bold: true, color: '#b9a8d8' });

    // marken
    drawGround(ctx, this.cam, t);

    // brevlåda
    drawMailbox(ctx, MAILBOX_X, GROUND, t, this.stage === 0);

    // nyckel
    if (this.stage === 1) {
      glow(ctx, KEY_POS.x, KEY_POS.y, 56, PAL.gold, 0.4 + 0.2 * Math.sin(t * 4));
      drawKey(ctx, KEY_POS.x, KEY_POS.y, t);
    }

    // kugghjul på marken
    for (let i = 0; i < this.gears.length; i++) {
      const g = this.gears[i];
      if (g.state === 'ground') drawGear(ctx, g.x, g.y, GEAR_R[g.size], Math.sin(t + i) * 0.1, false);
    }

    // flygplanet i hangaren
    drawPlane(ctx, PLANE_POS.x, PLANE_POS.y, 0, t, { spin: this.stage === 3 ? 0.35 : 0, alice: false });

    // fysikvärlden (lådor + Alice)
    drawWorld(ctx, alpha, t);

    // buret kugghjul ovanför huvudet
    if (this.carried >= 0) {
      const p = this.walker.pos();
      const g = this.gears[this.carried];
      drawGear(ctx, p.x, p.y - 90 - GEAR_R[g.size], GEAR_R[g.size], Math.sin(t * 2) * 0.15, false);
    }

    // interaktionsbubbla
    if (this.near && !HUD.blocked() && this.near.kind !== 'drop') {
      drawActionBubble(ctx, this.near.x, this.near.y - 40, t);
    }

    this.drawCoins(ctx, t);
    PS.draw(ctx);
    this.cam.end(ctx);
  }
}

// ---------- bakgrunds- och byggnadsritning ----------
function drawSkyFar(c, w, h) {
  const g = c.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#7ec8ff');
  g.addColorStop(0.5, '#ffd9a8');
  g.addColorStop(0.78, '#ffb385');
  g.addColorStop(1, '#ff9d78');
  c.fillStyle = g;
  c.fillRect(0, 0, w, h);
  // sol med strålar
  const sx = 1500, sy = 300;
  const sg = c.createRadialGradient(sx, sy, 20, sx, sy, 180);
  sg.addColorStop(0, 'rgba(255,250,220,1)');
  sg.addColorStop(0.35, 'rgba(255,225,140,0.85)');
  sg.addColorStop(1, 'rgba(255,210,110,0)');
  c.fillStyle = sg;
  c.beginPath(); c.arc(sx, sy, 180, 0, TAU); c.fill();
  c.fillStyle = '#fff6d8';
  c.beginPath(); c.arc(sx, sy, 62, 0, TAU); c.fill();
  // moln
  c.fillStyle = 'rgba(255,255,255,0.85)';
  cloud(c, 300, 220, 1.2); cloud(c, 800, 140, 0.8); cloud(c, 1200, 330, 1); cloud(c, 1850, 180, 0.9);
  function cloud(cc, x, y, s) {
    cc.beginPath();
    cc.arc(x, y, 38 * s, 0, TAU);
    cc.arc(x + 42 * s, y - 14 * s, 30 * s, 0, TAU);
    cc.arc(x + 84 * s, y, 34 * s, 0, TAU);
    cc.arc(x + 42 * s, y + 16 * s, 30 * s, 0, TAU);
    cc.fill();
  }
}

function drawHillsFar(c, w, h) {
  c.fillStyle = 'rgba(120,180,140,0.75)';
  hillPath(c, w, h, 140, 1, 3);
  c.fill();
}
function drawHillsNear(c, w, h) {
  c.fillStyle = '#69b06e';
  hillPath(c, w, h, 120, 2, 5);
  c.fill();
  c.fillStyle = 'rgba(40,90,50,0.25)';
  for (let i = 0; i < 40; i++) {
    c.beginPath();
    c.arc(Math.random() * w, 200 + Math.random() * (h - 220), 3 + Math.random() * 5, 0, TAU);
    c.fill();
  }
}
// heltalsfrekvenser k1/k2 → kurvan möter sig själv vid tile-kanten
function hillPath(c, w, h, amp, k1, k2) {
  c.beginPath();
  c.moveTo(0, h);
  for (let x = 0; x <= w; x += 16) {
    c.lineTo(x, 130 + Math.sin((x / w) * k1 * TAU) * amp + Math.sin((x / w) * k2 * TAU) * amp * 0.3);
  }
  c.lineTo(w, h);
  c.closePath();
}

function drawGround(ctx, cam, t) {
  const x0 = Math.max(0, cam.x - view.w / 2 - 100);
  const x1 = Math.min(W + 200, cam.x + view.w / 2 + 100);
  const g = ctx.createLinearGradient(0, GROUND, 0, GROUND + 120);
  g.addColorStop(0, '#7a5a3a');
  g.addColorStop(1, '#5a3f28');
  ctx.fillStyle = g;
  ctx.fillRect(x0, GROUND, x1 - x0, 140);
  ctx.fillStyle = '#59b25e';
  ctx.fillRect(x0, GROUND - 8, x1 - x0, 22);
  // grästuvor + blommor (deterministiska per x)
  for (let x = Math.floor(x0 / 90) * 90; x < x1; x += 90) {
    const r = (Math.sin(x * 12.9898) * 43758.5453) % 1;
    const rr2 = Math.abs(r);
    ctx.strokeStyle = '#3f9147';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x, GROUND - 4);
    ctx.quadraticCurveTo(x + 4, GROUND - 20, x + 10, GROUND - 26 - rr2 * 8);
    ctx.stroke();
    if (rr2 > 0.6) {
      ctx.fillStyle = ['#ff6bcb', '#ffd24a', '#7ec8ff', '#ffffff'][Math.floor(rr2 * 40) % 4];
      for (let pI = 0; pI < 5; pI++) {
        const a = (pI / 5) * TAU;
        ctx.beginPath();
        ctx.arc(x + 40 + Math.cos(a) * 6, GROUND - 24 + Math.sin(a) * 6, 4, 0, TAU);
        ctx.fill();
      }
      ctx.fillStyle = '#ffd24a';
      ctx.beginPath();
      ctx.arc(x + 40, GROUND - 24, 3.4, 0, TAU);
      ctx.fill();
    }
  }
}

function drawHousePiece(c, w, h) {
  const gx = 60, gy = 120;   // huskropp börjar här
  // kropp
  const g = c.createLinearGradient(0, gy + 120, 0, h);
  g.addColorStop(0, '#ffd9ec');
  g.addColorStop(1, '#ffb8dc');
  c.fillStyle = g;
  c.fillRect(gx, gy + 160, 560, 400);
  // tak
  c.fillStyle = '#b06ad0';
  c.beginPath();
  c.moveTo(gx - 50, gy + 170);
  c.lineTo(gx + 280, gy - 10);
  c.lineTo(gx + 610, gy + 170);
  c.closePath();
  c.fill();
  c.strokeStyle = '#8a4aa8';
  c.lineWidth = 6;
  c.stroke();
  // skorsten + hjärtfönster på vinden
  c.fillStyle = '#d68ab0';
  c.fillRect(gx + 430, gy + 20, 60, 110);
  c.fillStyle = '#fff';
  heartAt(c, gx + 280, gy + 110, 26);
  // dörr
  c.fillStyle = '#fff';
  c.fillRect(gx + 60, gy + 350, 120, 210);
  c.fillStyle = '#b06ad0';
  c.beginPath(); c.arc(gx + 160, gy + 460, 8, 0, TAU); c.fill();
  // fönster med blomlådor
  for (let i = 0; i < 2; i++) {
    const wx = gx + 250 + i * 190;
    c.fillStyle = '#fff';
    c.fillRect(wx, gy + 320, 120, 110);
    c.fillStyle = '#ffe9a8';
    c.fillRect(wx + 8, gy + 328, 104, 94);
    c.strokeStyle = '#b06ad0';
    c.lineWidth = 5;
    c.strokeRect(wx, gy + 320, 120, 110);
    c.beginPath();
    c.moveTo(wx + 60, gy + 320); c.lineTo(wx + 60, gy + 430);
    c.moveTo(wx, gy + 375); c.lineTo(wx + 120, gy + 375);
    c.stroke();
    // blomlåda
    c.fillStyle = '#8a5a2b';
    c.fillRect(wx - 6, gy + 430, 132, 22);
    for (let f = 0; f < 4; f++) {
      c.fillStyle = ['#ff4d6d', '#ffd24a', '#7ec8ff', '#ff9e40'][f];
      c.beginPath();
      c.arc(wx + 18 + f * 32, gy + 424, 9, 0, TAU);
      c.fill();
    }
  }
  // vimplar
  for (let i = 0; i < 7; i++) {
    c.fillStyle = RAINBOW[i];
    const fx = gx + 40 + i * 80;
    c.beginPath();
    c.moveTo(fx, gy + 210);
    c.lineTo(fx + 40, gy + 210);
    c.lineTo(fx + 20, gy + 248);
    c.closePath();
    c.fill();
  }
  function heartAt(cc, x, y, s) {
    cc.save();
    cc.translate(x, y);
    cc.beginPath();
    cc.moveTo(0, s * 0.9);
    cc.bezierCurveTo(-s * 1.1, s * 0.15, -s * 0.62, -s * 0.75, 0, -s * 0.18);
    cc.bezierCurveTo(s * 0.62, -s * 0.75, s * 1.1, s * 0.15, 0, s * 0.9);
    cc.fill();
    cc.restore();
  }
}

function drawHangarPiece(c, w, h) {
  // valvformad hangar med öppning
  const baseY = h - 20;
  const g = c.createLinearGradient(0, 0, 0, baseY);
  g.addColorStop(0, '#aeb6c8');
  g.addColorStop(1, '#7e8698');
  // bakvägg (mörk insida syns genom öppningen)
  c.fillStyle = '#2a2f3e';
  c.fillRect(300, 120, 1400, baseY - 120);
  // valv
  c.fillStyle = g;
  c.beginPath();
  c.moveTo(0, baseY);
  c.lineTo(0, 260);
  c.quadraticCurveTo(60, 60, 320, 50);
  c.lineTo(1500, 50);
  c.quadraticCurveTo(1720, 70, 1748, 300);
  c.lineTo(1748, baseY);
  c.lineTo(1560, baseY);
  c.lineTo(1560, 160);
  c.lineTo(430, 160);
  c.lineTo(430, baseY);
  c.closePath();
  c.fill();
  c.strokeStyle = '#5a6274';
  c.lineWidth = 6;
  c.stroke();
  // nitar och paneler
  c.fillStyle = 'rgba(90,98,116,0.6)';
  for (let x = 60; x < 1700; x += 120) {
    for (let y = 90; y < 150; y += 40) {
      c.beginPath(); c.arc(x, y, 5, 0, TAU); c.fill();
    }
  }
  // skylt
  c.fillStyle = '#20242f';
  c.fillRect(700, 62, 560, 76);
  c.strokeStyle = '#ffd24a';
  c.lineWidth = 4;
  c.strokeRect(700, 62, 560, 76);
  c.fillStyle = '#ffd24a';
  c.font = 'bold 52px "Trebuchet MS", sans-serif';
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.fillText('✈ HANGAR ✈', 980, 102);
}

export const homeScene = new HomeScene();
