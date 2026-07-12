// Neptunus — den kallaste planeten. Snöstorm, halkig is, glidande isblock,
// pendel-rivkulan, norrskenslåset … och längst in i isgrottan: PAPPA.

import { VH, GRAV, PAL, RAINBOW, TAU, rand, clamp, lerp, dist } from '../config.js';
import { view, makeCanvas, Parallax, PS, txt, glow, QY, rr, drawGem, starPath } from '../render.js';
import { setScheme, IN, NO_IN } from '../input.js';
import { M, addToWorld, addStatic, removeBody, drawWorld, CAT, makePendulum } from '../world.js';
import { SAVE, setFlag, flag, advanceTo } from '../save.js';
import { AUD } from '../audio.js';
import { HUD } from '../hud.js';
import { drawGirl, WHO } from '../chars.js';
import { drawRocket, drawActionBubble } from '../props.js';
import { SceneBase, PuzzleBase, makeWalker, bindWalkerSprite, NAV } from './base.js';

const W = 6200;
const GROUND = 1000;
const ROCKET_X = 350;
// isblocks-pusslet: två gropar + tre block på spegelhal is
const PUZZLE = { x0: 1500, x1: 3300 };
const PITS = [[2200, 2500], [2760, 3060]];   // gropar i marken
const BLOCK_START = [1750, 1980, 2640];
const BLOCK_SIZE = 140;
const WALL_X = 4080;
const PEND_X = 3820;
const LOCK_X = 4480;
const CAVE_X = 4700;
const PAPA_X = 5480;
const AURORA_COLORS = ['#59d666', '#3fb8ff', '#c95cff', '#ff6bcb'];

class NeptuneScene extends SceneBase {
  constructor() {
    super('neptune');
    this.song = 'neptune';
    this.gravity = GRAV.neptune;
  }

  enter() {
    this.baseEnter();
    setScheme('walk', { action: true });

    // mark i segment: gropar i isfältet är riktiga hål
    const segs = [[-200, PITS[0][0]], [PITS[0][1], PITS[1][0]], [PITS[1][1], 6400]];
    for (let i = 0; i < segs.length; i++) {
      addStatic((segs[i][0] + segs[i][1]) / 2, GROUND + 60, segs[i][1] - segs[i][0], 120);
    }
    // gropbottnar (grunda — man kan hoppa upp)
    for (let i = 0; i < PITS.length; i++) {
      addStatic((PITS[i][0] + PITS[i][1]) / 2, GROUND + 150, PITS[i][1] - PITS[i][0], 60);
    }
    addStatic(-40, VH / 2, 80, VH * 2);
    addStatic(W + 40, VH / 2, 80, VH * 2);

    this.blocksDone = flag('nepBlocks');
    this.wallDone = flag('nepWall');
    this.lockDone = flag('nepLock');
    this.found = flag('foundPapa');

    // isblock (statiska kroppar som tweenas när de glider)
    this.blocks = [];
    if (!this.blocksDone) {
      for (let i = 0; i < 3; i++) {
        this.blocks.push({
          x: BLOCK_START[i], y: GROUND - BLOCK_SIZE / 2,
          body: addStatic(BLOCK_START[i], GROUND - BLOCK_SIZE / 2, BLOCK_SIZE, BLOCK_SIZE),
          sliding: 0, inPit: -1, leanT: 0
        });
      }
    } else {
      // blocken fyller groparna
      for (let i = 0; i < 2; i++) {
        const cx = (PITS[i][0] + PITS[i][1]) / 2;
        this.blocks.push({ x: cx, y: GROUND - BLOCK_SIZE / 2 + 120, body: addStatic(cx, GROUND - BLOCK_SIZE / 2 + 120, BLOCK_SIZE, BLOCK_SIZE), sliding: 0, inPit: i, leanT: 0 });
      }
    }
    this.pzBlocks = new PuzzleBase('Knuffa isblocken i groparna — de glider tills de stöter emot något! 🧊');
    const self = this;
    this.pzBlocks.simplify = function () { HUD.toast('Fyll bägge groparna med block! 🧊🧊'); };

    // isväggen (krossbara bitar)
    this.wallChunks = [];
    if (!this.wallDone) {
      for (let r = 0; r < 5; r++) {
        for (let c = 0; c < 2; c++) {
          const b = addStatic(WALL_X + c * 62, GROUND - 60 - r * 118, 60, 116);
          this.wallChunks.push(b);
        }
      }
    }
    // pendel-rivkulan
    this.pend = null;
    if (!this.wallDone) {
      this.pend = makePendulum(PEND_X, 140, 4, 88, 58, { sleepThreshold: Infinity, restitution: 0.2 });
      this.pend.ball.collisionFilter.mask = CAT.TERRAIN | CAT.PLAYER | CAT.PROP;
      const ball = this.pend.ball;
      ball.plugin.onHit = function (other) {
        if (self.wallDone) return;
        if (self.wallChunks.indexOf(other) >= 0) {
          if (Math.abs(ball.velocity.x) > 8.5) self.breakWall();
          else { AUD.sfx('thump'); self.cam.shake(4, 0.2); }
        }
      };
      M.Body.setVelocity(ball, { x: 4, y: 0 });
    }
    this.pzWall = new PuzzleBase('Putta kulan i TAKT med gungningen — som en gungbräda — tills den slår HÅRT! 💥');
    this.pzWall.simplify = function () { if (self.pend) M.Body.setVelocity(self.pend.ball, { x: 12, y: 0 }); };

    // norrskenslåset
    this.lock = { state: this.lockDone ? 'done' : 'idle', seq: [], input: 0, round: 0, playT: 0, playIdx: -1, glow: [0, 0, 0, 0] };
    this.pzLock = new PuzzleBase('Titta på norrskenet — tryck på kristallerna i samma färgordning! 🌈');
    this.pzLock.simplify = function () { self.lockSlow = true; };
    this.lockSlow = false;
    this.caveOpen = this.lockDone;

    // pappa (i grottan)
    this.papaX = PAPA_X;
    this.cut = this.found ? 'done' : 'none';   // none | walk | hug | done
    this.cutT = 0;

    // snöflingor
    this.flakes = [];
    for (let i = 0; i < 130; i++) {
      this.flakes.push({ x: rand(0, W), y: rand(-100, VH), spd: rand(60, 190), sway: rand(20, 70), ph: rand(0, TAU), r: rand(2, 5.5), layer: Math.random() < 0.5 ? 0 : 1 });
    }

    // Alice i värmedräkten!
    this.walker = makeWalker(ROCKET_X + 150, 930, { ice: true, jumpV: 14.5 });
    const w = this.walker;
    bindWalkerSprite(w, function (ctx, x, y, a, t) {
      drawGirl(ctx, x, y + 34, t, WHO.aliceWarm, { mode: w.mode, face: w.face, ph: w.ph });
    }, 6);

    this.coinRow(1000, 900, 3, 80, 'silver');
    this.addCoin(3350, 880, 'gold');
    this.coinRow(4800, 900, 2, 80, 'silver');

    this.par = new Parallax();
    this.par.add(0.0, 2048, VH, drawNeptuneSky);
    this.par.add(0.12, 2048, 420, drawIceMountains, { y: 520 });

    HUD.objective(this.found ? 'Hem till jorden — tillsammans! 💜' : 'Hitta pappa! Kompassen pekar hitåt… 🧭');
    if (!flag('nepIntro')) {
      setFlag('nepIntro');
      this.after(1, function () {
        HUD.dialog([
          { who: 'alice', text: 'Brrr! Den KALLASTE planeten! Tur att jag har värmedräkten från Nastya! 🧥' },
          { who: 'alice', text: 'Pärlkompassen lyser — PAPPA ÄR HÄR NÅNSTANS! 🧭💜' }
        ]);
      });
    }
    AUD.loop('wind', true, 0.14);
  }

  exit() {
    AUD.loop('wind', false);
  }

  breakWall() {
    this.wallDone = true;
    setFlag('nepWall');
    AUD.sfx('crash');
    this.cam.shake(14, 0.7);
    for (let i = 0; i < this.wallChunks.length; i++) {
      const b = this.wallChunks[i];
      PS.burst('chunk', b.position.x, b.position.y, 4, { color: '#cfe8f8', speed: 320, g: 600 });
      removeBody(b);
    }
    this.wallChunks = [];
    this.pzWall.solve();
    HUD.toast('KRASCH! Isväggen sprack! 💥');
    const self = this;
    this.after(1, function () {
      HUD.objective('Norrskenslåset vid grottan! 🌈');
      if (self.lock.state === 'idle') self.startLock(3);
    });
  }

  startLock(len) {
    const L = this.lock;
    L.state = 'listen';
    L.seq = [];
    for (let i = 0; i < len; i++) {
      let n = Math.floor(Math.random() * 4);
      if (i > 0 && n === L.seq[i - 1]) n = (n + 1) % 4;
      L.seq.push(n);
    }
    L.playT = 1;
    L.playIdx = -1;
    L.input = 0;
  }

  stepLock(dt) {
    const L = this.lock;
    for (let i = 0; i < 4; i++) if (L.glow[i] > 0) L.glow[i] -= dt * 2;
    this.auroraFlash = -1;
    if (L.state === 'listen') {
      L.playT -= dt;
      if (L.playT <= 0) {
        L.playIdx++;
        if (L.playIdx >= L.seq.length) {
          L.state = 'repeat';
          L.input = 0;
          HUD.toast('Din tur! 🌈');
        } else {
          const n = L.seq[L.playIdx];
          L.glow[n] = 1;
          this.auroraFlash = n;
          AUD.note([72, 76, 79, 83][n], 0.5, 'bell', 0.85);
          L.playT = this.lockSlow ? 1.15 : 0.8;
        }
      }
    } else if (L.state === 'repeat' && L.playIdx >= 0 && L.glow[L.seq[Math.max(0, L.playIdx)]] > 0.5) {
      this.auroraFlash = L.seq[Math.max(0, L.playIdx)];
    }
  }

  tapCrystal(i) {
    const L = this.lock;
    if (L.state !== 'repeat') return;
    L.glow[i] = 1;
    AUD.note([72, 76, 79, 83][i], 0.45, 'bell', 0.85);
    if (i === L.seq[L.input]) {
      L.input++;
      if (L.input >= L.seq.length) {
        L.round++;
        if (L.round >= 3) {
          L.state = 'done';
          this.lockDone = true;
          this.caveOpen = true;
          setFlag('nepLock');
          this.pzLock.solve();
          HUD.toast('Grottan öppnar sig! ❄️➡️');
          HUD.objective('In i isgrottan — PAPPA! 💜');
          AUD.setLayer('warm', true);
        } else {
          AUD.sfx('fanfare');
          this.startLock(3 + L.round);
        }
      }
    } else {
      this.pzLock.fail();
      HUD.toast('Nästan! Titta på färgerna igen… 👀');
      this.startLock(L.seq.length);
    }
  }

  update(dt) {
    this.tick(dt);
    const inCut = this.cut === 'walk' || this.cut === 'hug';
    const inp = (HUD.blocked() || inCut) ? NO_IN : IN;
    const w = this.walker;
    w.update(dt, inp);
    const p = w.pos();
    this.updateCoins(dt, p.x, p.y);

    // snö
    const wind = Math.sin(this.t * 0.4) * 40 - 60;
    for (let i = 0; i < this.flakes.length; i++) {
      const f = this.flakes[i];
      f.y += f.spd * dt;
      f.x += (wind + Math.sin(this.t * 1.4 + f.ph) * f.sway) * dt;
      if (f.y > VH + 40) { f.y = -30; f.x = rand(0, W); }
      if (f.x < -40) f.x = W + 20;
    }

    // --- isblocken ---
    if (!this.blocksDone) {
      let leanBlock = -1;
      for (let i = 0; i < this.blocks.length; i++) {
        const bl = this.blocks[i];
        if (bl.sliding !== 0) {
          bl.x += bl.sliding * 640 * dt;
          // stanna mot hindret som låstes när gliden började
          const stopAt = bl.stopAt;
          if ((bl.sliding > 0 && bl.x >= stopAt) || (bl.sliding < 0 && bl.x <= stopAt)) {
            bl.x = stopAt;
            bl.sliding = 0;
            AUD.sfx('thump');
            this.cam.shake(3, 0.15);
            // hamnade blocket över en grop? → faller i
            for (let pi = 0; pi < PITS.length; pi++) {
              const c = (PITS[pi][0] + PITS[pi][1]) / 2;
              if (Math.abs(bl.x - c) < 40 && bl.inPit < 0) {
                bl.inPit = pi;
                bl.y = GROUND - BLOCK_SIZE / 2 + 120;
                AUD.sfx('crack');
                PS.burst('snowpuff', bl.x, GROUND + 40, 10, { color: '#e8f6ff', speed: 160 });
              }
            }
          }
          M.Body.setPosition(bl.body, { x: bl.x, y: bl.y });
        } else if (bl.inPit < 0 && !HUD.blocked()) {
          // knuffdetektering: luta mot blocket en kort stund
          const dy = Math.abs(p.y - bl.y);
          const dx = bl.x - p.x;
          if (dy < 120 && Math.abs(dx) < BLOCK_SIZE / 2 + 55 && Math.sign(inp.ax) === Math.sign(dx) && inp.ax !== 0) {
            bl.leanT += dt;
            leanBlock = i;
            if (bl.leanT > 0.3) {
              bl.sliding = Math.sign(dx);
              bl.stopAt = this.blockStop(i, bl.sliding);
              bl.leanT = 0;
              AUD.sfx('whoosh');
            }
          } else bl.leanT = 0;
        }
      }
      // klart när båda groparna är fyllda
      let filled = 0;
      for (let i = 0; i < this.blocks.length; i++) if (this.blocks[i].inPit >= 0) filled++;
      if (filled >= 2) {
        this.blocksDone = true;
        setFlag('nepBlocks');
        this.pzBlocks.solve();
        HUD.toast('Vägen är slät — vidare! ✨');
        HUD.objective('Slå sönder isväggen! 💥');
      }
    }

    // --- pendeln + väggen ---
    if (this.pend && !this.wallDone) {
      const ball = this.pend.ball;
      // liten hjälpande puff när Alice springer in i kulan sköts av fysiken;
      // resonans-tips efter 20s vid väggen
      if (Math.abs(p.x - PEND_X) < 700) {
        this.wallT = (this.wallT || 0) + dt;
        if (this.wallT > 22 && !this.wallHinted) {
          this.wallHinted = true;
          this.pzWall.fail(true); this.pzWall.fail(true); this.pzWall.fail(true);
        }
      }
    }

    // --- norrskenslåset ---
    if (this.wallDone && !this.lockDone && this.lock.state === 'idle' && Math.abs(p.x - LOCK_X) < 500) {
      this.startLock(3);
    }
    this.stepLock(dt);

    // --- grottcutscene ---
    if (this.caveOpen && this.cut === 'none' && p.x > PAPA_X - 420) {
      this.cut = 'walk';
      this.cutT = 0;
      AUD.playSong('reunion');
    }
    if (this.cut === 'walk') {
      this.cutT += dt;
      // pappa springer mot Alice
      this.papaX = lerp(this.papaX, p.x + 90, 1 - Math.exp(-1.6 * dt));
      if (this.papaX - p.x < 110) {
        this.cut = 'hug';
        this.cutT = 0;
        AUD.sfx('magic');
        for (let i = 0; i < 3; i++) {
          PS.burst('heart', (p.x + this.papaX) / 2, p.y - 60, 6, { color: '#ff6bcb', speed: 160 });
        }
        const self = this;
        HUD.dialog([
          { who: 'papa', text: 'ALICE?! Min lilla stjärna… Flög du genom HELA rymden — helt själv?!' },
          { who: 'alice', text: 'PAPPA!!! Jag har saknat dig SÅ JÄTTEMYCKET! 💜' },
          { who: 'papa', text: 'Förlåt gumman. Radion frös fast, och min raket med. Men vet du vad?' },
          { who: 'papa', text: 'Nu åker vi HEM. Du och jag. Tillsammans hela vägen till jorden! 🌍' },
          { who: 'alice', text: 'Och alla mina nya vänner vinkar på vägen — Draculaura, Nastya, Melinda och Stella!' }
        ], function () {
          setFlag('foundPapa');
          self.cut = 'done';
          advanceTo('homecoming');
          HUD.toast('💜 PAPPA! 💜');
          self.after(1.2, function () { NAV.go('homecoming'); });
        });
      }
    }

    // interaktion (raketen — bara före grottan)
    this.near = null;
    if (!HUD.blocked() && Math.abs(p.x - ROCKET_X) < 170 && !this.found) {
      this.near = { kind: 'rocket', x: ROCKET_X, y: 640 };
      if (inp.actionEdge) {
        HUD.dialog([{ who: 'alice', text: 'Inte utan pappa! Kompassen pekar åt HÖGER… 🧭' }]);
      }
    }

    this.cam.clampTo(0, -200, W, VH + 40);
    this.cam.follow(p.x + (this.cut === 'hug' ? 60 : 0), p.y - 160, 0.1);
    this.cam.update(dt);
  }

  // var stannar block i när det glider åt dir?
  blockStop(bi, dir) {
    const bl = this.blocks[bi];
    let stop = dir > 0 ? PUZZLE.x1 - BLOCK_SIZE / 2 : PUZZLE.x0 + BLOCK_SIZE / 2;
    // gropar: blocket faller i första gropen på vägen (stopp mitt över gropen)
    for (let pi = 0; pi < PITS.length; pi++) {
      const c = (PITS[pi][0] + PITS[pi][1]) / 2;
      let occupied = false;
      for (let j = 0; j < this.blocks.length; j++) if (this.blocks[j].inPit === pi) occupied = true;
      if (occupied) continue;
      if (dir > 0 && c > bl.x + 20 && c < stop) stop = c;
      if (dir < 0 && c < bl.x - 20 && c > stop) stop = c;
    }
    // andra block (som inte ligger i grop)
    for (let j = 0; j < this.blocks.length; j++) {
      if (j === bi || this.blocks[j].inPit >= 0) continue;
      const ox = this.blocks[j].x;
      if (dir > 0 && ox > bl.x && ox - BLOCK_SIZE < stop) stop = Math.min(stop, ox - BLOCK_SIZE);
      if (dir < 0 && ox < bl.x && ox + BLOCK_SIZE > stop) stop = Math.max(stop, ox + BLOCK_SIZE);
    }
    return stop;
  }

  onTap(x, y) {
    if (HUD.blocked()) return;
    const wx = x - this.cam.ox, wy = y - this.cam.oy;
    if (this.lock.state === 'repeat') {
      for (let i = 0; i < 4; i++) {
        if (dist(wx, wy, LOCK_X - 135 + i * 90, GROUND - 120) < 60) { this.tapCrystal(i); return; }
      }
    }
  }

  draw(ctx, alpha, t) {
    this.par.draw(ctx, this.cam.x, this.cam.y * 0.12, QY.layersMax());

    // norrsken (över parallax, under världen)
    this.drawAurora(ctx, t);

    this.cam.begin(ctx);

    drawSnowGround(ctx, this.cam, t);

    // raket + platta
    ctx.fillStyle = '#3a3f52';
    rr(ctx, ROCKET_X - 160, GROUND - 22, 320, 22, 8);
    ctx.fill();
    drawRocket(ctx, ROCKET_X, GROUND - 125, 0, t, { alice: false, flame: 0, scale: 1 });

    // isblock
    for (let i = 0; i < this.blocks.length; i++) {
      const bl = this.blocks[i];
      drawIceBlock(ctx, bl.x, bl.y, BLOCK_SIZE, t, bl.leanT > 0);
    }
    // grop-markeringar
    if (!this.blocksDone) {
      for (let i = 0; i < PITS.length; i++) {
        const c = (PITS[i][0] + PITS[i][1]) / 2;
        let filled = false;
        for (let j = 0; j < this.blocks.length; j++) if (this.blocks[j].inPit === i) filled = true;
        if (!filled) {
          ctx.setLineDash([12, 10]);
          ctx.strokeStyle = 'rgba(160,220,255,0.7)';
          ctx.lineWidth = 4;
          ctx.strokeRect(c - BLOCK_SIZE / 2, GROUND - 20, BLOCK_SIZE, 140);
          ctx.setLineDash([]);
        }
      }
    }

    // pendeln
    if (this.pend && !this.wallDone) {
      const ball = this.pend.ball;
      ctx.strokeStyle = '#8a90a4';
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(PEND_X, 140);
      for (let i = 0; i < this.pend.links.length; i++) {
        ctx.lineTo(this.pend.links[i].position.x, this.pend.links[i].position.y);
      }
      ctx.lineTo(ball.position.x, ball.position.y);
      ctx.stroke();
      // upphängning
      ctx.fillStyle = '#5a6274';
      ctx.beginPath(); ctx.arc(PEND_X, 140, 14, 0, TAU); ctx.fill();
      ctx.fillStyle = '#6a7284';
      ctx.fillRect(PEND_X - 130, 96, 260, 26);
      // kulan
      const g = ctx.createRadialGradient(ball.position.x - 18, ball.position.y - 18, 8, ball.position.x, ball.position.y, 60);
      g.addColorStop(0, '#8a94ac');
      g.addColorStop(1, '#3a4256');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(ball.position.x, ball.position.y, 58, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = '#232a3c';
      ctx.lineWidth = 4;
      ctx.stroke();
    }

    // isväggen
    for (let i = 0; i < this.wallChunks.length; i++) {
      const b = this.wallChunks[i];
      drawIceBlock(ctx, b.position.x, b.position.y, 58, t, false, 116);
    }

    // grottan
    drawCave(ctx, t, this.caveOpen);

    // norrskenslåsets kristaller
    if (this.wallDone && !this.found) {
      for (let i = 0; i < 4; i++) {
        const cx = LOCK_X - 135 + i * 90, cy = GROUND - 120;
        const gl = this.lock.glow[i];
        if (gl > 0) glow(ctx, cx, cy, 80, AURORA_COLORS[i], 0.6 * gl);
        drawGem(ctx, cx, cy, 30 + gl * 6, AURORA_COLORS[i], t + i);
        ctx.fillStyle = '#cfe8f8';
        ctx.fillRect(cx - 8, cy + 34, 16, 60);
      }
      if (this.lock.state !== 'done') {
        txt(ctx, '🌈 NORRSKENSLÅSET', LOCK_X, GROUND - 260, { size: 26, bold: true, color: '#cfe8ff', stroke: 'rgba(10,20,50,0.8)', strokeW: 5 });
      }
    }

    // pappa!
    if (this.caveOpen || this.found) {
      const papaMode = this.cut === 'hug' || this.cut === 'done' ? 'hug' : (this.cut === 'walk' ? 'walk' : 'wave');
      drawGirl(ctx, this.papaX, GROUND - 4, t, WHO.papa, {
        mode: papaMode === 'hug' ? 'stand' : papaMode,
        face: -1,
        ph: t * 8,
        arms: papaMode === 'hug' ? 'hug' : undefined,
        mouth: 'smile'
      });
      if (this.cut === 'hug' || this.cut === 'done') {
        if (Math.random() < 0.15) {
          PS.spawn('heart', (this.walker.pos().x + this.papaX) / 2 + rand(-40, 40), this.walker.pos().y - 120, { color: '#ff6bcb', vy: -80, life: 1.4, size: rand(8, 14) });
        }
        glow(ctx, (this.walker.pos().x + this.papaX) / 2, this.walker.pos().y - 40, 160, '#ff9ed9', 0.15);
      }
    }

    drawWorld(ctx, alpha, t);

    if (this.near && !HUD.blocked()) drawActionBubble(ctx, this.near.x, this.near.y, t);

    this.drawCoins(ctx, t);
    PS.draw(ctx);

    // snöflingor (i världskoordinater, två lager)
    ctx.save();
    for (let i = 0; i < this.flakes.length; i++) {
      const f = this.flakes[i];
      if (!this.cam.visible(f.x, f.y, 60)) continue;
      ctx.globalAlpha = f.layer === 0 ? 0.85 : 0.45;
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(f.x, f.y, f.layer === 0 ? f.r : f.r * 0.6, 0, TAU);
      ctx.fill();
    }
    ctx.restore();

    this.cam.end(ctx);

    // kall ton + mörker i grottan
    ctx.fillStyle = 'rgba(120,170,255,0.05)';
    ctx.fillRect(0, 0, view.w, VH);
    if (this.walker.pos().x > CAVE_X) {
      const dark = clamp((this.walker.pos().x - CAVE_X) / 500, 0, 0.5) * (this.cut === 'hug' || this.cut === 'done' ? 0.3 : 1);
      ctx.fillStyle = 'rgba(4,8,24,' + (dark * 0.6).toFixed(2) + ')';
      ctx.fillRect(0, 0, view.w, VH);
    }
  }

  drawAurora(ctx, t) {
    ctx.save();
    ctx.globalAlpha = 0.35;
    for (let band = 0; band < 3; band++) {
      const flash = this.auroraFlash >= 0 && band === 1;
      const col = flash ? AURORA_COLORS[this.auroraFlash] : ['#59d666', '#3fb8ff', '#c95cff'][band];
      if (flash) ctx.globalAlpha = 0.7;
      const g = ctx.createLinearGradient(0, 60 + band * 60, 0, 320 + band * 60);
      g.addColorStop(0, col);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(0, 340 + band * 50);
      for (let x = 0; x <= view.w; x += 40) {
        ctx.lineTo(x, 200 + band * 55 + Math.sin(x * 0.004 + t * (0.7 + band * 0.2) + band * 2) * 60);
      }
      ctx.lineTo(view.w, 60);
      ctx.lineTo(0, 60);
      ctx.closePath();
      ctx.fill();
      if (flash) ctx.globalAlpha = 0.35;
    }
    ctx.restore();
  }
}

function drawIceBlock(ctx, x, y, wdt, t, leaning, hgt) {
  const W2 = wdt, H2 = hgt === undefined ? wdt : hgt;
  ctx.save();
  ctx.translate(x, y);
  if (leaning) ctx.rotate(Math.sin(t * 30) * 0.02);
  const g = ctx.createLinearGradient(-W2 / 2, -H2 / 2, W2 / 2, H2 / 2);
  g.addColorStop(0, 'rgba(220,245,255,0.95)');
  g.addColorStop(0.5, 'rgba(160,215,245,0.9)');
  g.addColorStop(1, 'rgba(110,170,215,0.95)');
  ctx.fillStyle = g;
  rr(ctx, -W2 / 2, -H2 / 2, W2, H2, 14);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.8)';
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.5)';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(-W2 / 2 + 14, -H2 / 2 + 20);
  ctx.lineTo(-W2 / 2 + 30, -H2 / 2 + 8);
  ctx.stroke();
  ctx.restore();
}

function drawCave(ctx, t, open) {
  // berg med grottöppning
  ctx.fillStyle = '#2a3450';
  ctx.beginPath();
  ctx.moveTo(CAVE_X - 300, GROUND);
  ctx.quadraticCurveTo(CAVE_X + 200, 60, CAVE_X + 900, 130);
  ctx.lineTo(6400, 200);
  ctx.lineTo(6400, GROUND);
  ctx.closePath();
  ctx.fill();
  // öppningen
  ctx.fillStyle = open ? '#0c1228' : '#1a2440';
  ctx.beginPath();
  ctx.moveTo(CAVE_X + 60, GROUND);
  ctx.quadraticCurveTo(CAVE_X + 170, 560, CAVE_X + 300, 540);
  ctx.quadraticCurveTo(CAVE_X + 430, 560, CAVE_X + 520, GROUND);
  ctx.closePath();
  ctx.fill();
  if (!open) {
    // is-slab för öppningen
    ctx.fillStyle = 'rgba(160,215,245,0.85)';
    ctx.beginPath();
    ctx.moveTo(CAVE_X + 90, GROUND);
    ctx.quadraticCurveTo(CAVE_X + 180, 600, CAVE_X + 300, 585);
    ctx.quadraticCurveTo(CAVE_X + 420, 600, CAVE_X + 490, GROUND);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 3;
    ctx.stroke();
  } else {
    // varmt sken inifrån
    glow(ctx, CAVE_X + 290, GROUND - 160, 220, '#ffb385', 0.18 + 0.05 * Math.sin(t * 2));
  }
  // istappar
  ctx.fillStyle = '#cfe8f8';
  for (let i = 0; i < 6; i++) {
    const ix = CAVE_X + 40 + i * 90;
    const len = 40 + (i % 3) * 26;
    ctx.beginPath();
    ctx.moveTo(ix - 14, 560 - i * 8);
    ctx.lineTo(ix, 560 + len);
    ctx.lineTo(ix + 14, 560 - i * 8);
    ctx.closePath();
    ctx.fill();
  }
  // kristaller i grottan
  for (let i = 0; i < 4; i++) {
    const cx = CAVE_X + 500 + i * 220;
    glow(ctx, cx, GROUND - 60, 60, ['#c95cff', '#3fb8ff', '#ff6bcb', '#59d666'][i], 0.25 + 0.1 * Math.sin(t * 2 + i));
    drawGem(ctx, cx, GROUND - 50, 22, ['#c95cff', '#3fb8ff', '#ff6bcb', '#59d666'][i], t + i);
  }
}

function drawSnowGround(ctx, cam, t) {
  const x0 = Math.max(0, cam.x - view.w / 2 - 60);
  const x1 = Math.min(W + 200, cam.x + view.w / 2 + 60);
  const g = ctx.createLinearGradient(0, GROUND, 0, GROUND + 140);
  g.addColorStop(0, '#e8f4ff');
  g.addColorStop(1, '#8ab0d8');
  ctx.fillStyle = g;
  ctx.fillRect(x0, GROUND - 8, x1 - x0, 148);
  // gropar ritas mörkare
  for (let i = 0; i < PITS.length; i++) {
    ctx.fillStyle = '#5a7aa8';
    ctx.fillRect(PITS[i][0], GROUND - 4, PITS[i][1] - PITS[i][0], 124);
    ctx.fillStyle = '#c8ddf0';
    ctx.fillRect(PITS[i][0], GROUND + 112, PITS[i][1] - PITS[i][0], 12);
  }
  // isglans på det hala fältet
  ctx.save();
  ctx.globalAlpha = 0.4;
  ctx.fillStyle = '#ffffff';
  for (let x = Math.floor(x0 / 200) * 200; x < x1; x += 200) {
    if (x > PUZZLE.x0 - 200 && x < PUZZLE.x1 + 100) {
      ctx.beginPath();
      ctx.ellipse(x + 100, GROUND + 4, 70, 6, 0, 0, TAU);
      ctx.fill();
    }
  }
  ctx.restore();
}

function drawNeptuneSky(c, w, h) {
  const g = c.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#060a1e');
  g.addColorStop(0.6, '#0c1634');
  g.addColorStop(1, '#16244a');
  c.fillStyle = g;
  c.fillRect(0, 0, w, h);
  c.fillStyle = '#fff';
  for (let i = 0; i < 120; i++) {
    c.globalAlpha = 0.25 + Math.random() * 0.6;
    c.beginPath();
    c.arc(Math.random() * w, Math.random() * h * 0.6, Math.random() * 1.5 + 0.4, 0, TAU);
    c.fill();
  }
  c.globalAlpha = 1;
}

function drawIceMountains(c, w, h) {
  c.fillStyle = 'rgba(60,90,140,0.8)';
  c.beginPath();
  c.moveTo(0, h);
  for (let x = 0; x <= w; x += 16) {
    c.lineTo(x, 200 - 150 * Math.abs(Math.sin(x * Math.PI * 2 / w)) - 40 * Math.sin(x * TAU * 6 / w));
  }
  c.lineTo(w, h);
  c.closePath();
  c.fill();
  c.fillStyle = 'rgba(230,245,255,0.6)';
  for (let x = 0; x <= w; x += 16) {
    const y = 200 - 150 * Math.abs(Math.sin(x * Math.PI * 2 / w)) - 40 * Math.sin(x * TAU * 6 / w);
    if (y < 110) { c.beginPath(); c.arc(x, y + 6, 10, 0, TAU); c.fill(); }
  }
}

export const neptuneScene = new NeptuneScene();
