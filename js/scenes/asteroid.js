// Guldasteroiden: Nastyas rymdbutik (betala exakt 60 för värmedräkten),
// balansvågen vid skattvalvet (1 guldtacka = 3 silvermynt) och gruvgrottan.

import { VH, GRAV, PAL, RAINBOW, TAU, rand, clamp, lerp, dist } from '../config.js';
import { view, makeCanvas, Parallax, PS, txt, glow, QY, rr, drawGem, drawCoin, starPath, panel } from '../render.js';
import { setScheme, IN, NO_IN } from '../input.js';
import { M, addToWorld, addStatic, addSprite, removeBody, drawWorld, CAT, linkBodies, pinTo } from '../world.js';
import { SAVE, setFlag, flag, advanceTo, addCoins, spendCoins, coinTotal, persist } from '../save.js';
import { AUD } from '../audio.js';
import { TTS } from '../speech.js';
import { HUD } from '../hud.js';
import { drawGirl, WHO } from '../chars.js';
import { drawRocket, drawActionBubble } from '../props.js';
import { SceneBase, PuzzleBase, makeWalker, bindWalkerSprite, NAV } from './base.js';

const W = 5400;
const GROUND = 1000;
const ROCKET_X = 350;
const SHOP_X = 2350;
const SCALE_X = 3750;
const VAULT_X = 4250;
const MINE_X = 4900;
const SUIT_PRICE = 60;

class AsteroidScene extends SceneBase {
  constructor() {
    super('asteroid');
    this.song = 'asteroid';
    this.gravity = 0.45;   // "magnetkängorna" håller oss nere
  }

  enter() {
    this.baseEnter();
    setScheme('walk', { action: true });

    addStatic(W / 2, GROUND + 60, W + 400, 120);
    addStatic(-40, VH / 2, 80, VH * 2);
    addStatic(W + 40, VH / 2, 80, VH * 2);

    this.walker = makeWalker(ROCKET_X + 160, 930, { jumpV: 12 });
    const w = this.walker;
    bindWalkerSprite(w, function (ctx, x, y, a, t) {
      drawGirl(ctx, x, y + 34, t, WHO.aliceSuit, { mode: w.mode, face: w.face, ph: w.ph });
    }, 6);

    this.metNastya = flag('metNastya');
    this.hasSuit = flag('suit');
    this.vaultOpen = flag('vaultOpen');
    this.shopOpen = false;
    this.pay = { gold: 0, silver: 0 };
    this.shopBtns = [];
    this.nastyaDance = 0;

    // --- balansvågen (fysik) ---
    this.buildScale();
    this.balanceT = 0;
    this.pzScale = new PuzzleBase('Guldtackan är lika tung som TRE silvermynt — lägg på fler! ⚖️');
    const self = this;
    this.pzScale.simplify = function () { HUD.toast('Prova med precis TRE silvermynt! 3️⃣'); };
    this.scaleHintShown = false;
    this.dragBody = null;

    // --- gruvan ---
    this.nodes = [];
    for (let i = 0; i < 4; i++) {
      this.nodes.push({ x: MINE_X - 140 + i * 120, y: GROUND - 40 - (i % 2) * 130, cd: 0 });
    }
    this.swingT = 0;

    // mynt utspridda
    this.coinRow(900, 920, 3, 70, 'silver');
    this.coinRow(1500, 780, 2, 80, 'silver');
    this.addCoin(1750, 920, 'gold');
    this.coinRow(3100, 900, 3, 70, 'silver');

    // plattformar av guldklumpar
    addStatic(1500, 830, 220, 26);
    addStatic(3050, 950, 260, 26);

    this.par = new Parallax();
    this.par.add(0.0, 2048, VH, drawAsteroidSky);
    this.par.add(0.16, 2048, 460, drawGoldRocks, { y: 480 });

    HUD.objective(this.hasSuit ? 'Tillbaka till raketen! 🚀' : 'Hälsa på Nastya i butiken! 🎀');
    if (!this.metNastya) {
      this.after(0.8, function () {
        HUD.dialog([{ who: 'alice', text: 'En hel asteroid av GULD! Och titta — en liten butik! 🪙' }]);
      });
    }
  }

  buildScale() {
    // Vågen simuleras som ett eget 1-frihetsgradssystem (vinkel + vridmoment +
    // köl + dämpning) — stabilt och rättvist. Mynten är fria fysikkroppar tills
    // de "snäpps" i en skål; då blir de logiska vikter som ritas i skålen.
    this.scaleY0 = 520;
    this.scaleTheta = -0.35;
    this.scaleOmega = 0;
    this.panCoins = [[], []];    // [vänster, höger] — listor med myntkroppar

    this.coinsPhys = [];
    if (!this.vaultOpen) {
      for (let i = 0; i < 5; i++) {
        const c = M.Bodies.circle(SCALE_X - 480 + (i % 3) * 90, GROUND - 30 - Math.floor(i / 3) * 60, 26, {
          density: 0.0022, friction: 0.65, frictionAir: 0.02, restitution: 0, sleepThreshold: Infinity,
          collisionFilter: { category: CAT.PROP, mask: CAT.TERRAIN | CAT.PROP | CAT.PLAYER }
        });
        addToWorld(c);
        this.coinsPhys.push(c);
        addSpriteCoin(c);
      }
    }
  }

  // skålens mittpunkt i världen
  panWorld(side) {
    const th = this.scaleTheta, ca = Math.cos(th), sa = Math.sin(th);
    return {
      x: SCALE_X + ca * side * 210 - sa * 60,
      y: this.scaleY0 + sa * side * 210 + ca * 60
    };
  }

  coinPanIndex(c) {
    for (let s = 0; s < 2; s++) {
      const idx = this.panCoins[s].indexOf(c);
      if (idx >= 0) return { side: s, idx: idx };
    }
    return null;
  }

  stepScale(dt) {
    const BAR = 3, COIN = 1;      // vikter i "silvermynt"
    const left = BAR + this.panCoins[0].length * COIN;
    const right = this.panCoins[1].length * COIN;
    const th = this.scaleTheta;
    let torque = (right - left) * 210 * Math.cos(th) * 3.2;  // hävstång
    torque -= 900 * Math.sin(th);                             // kölens återförande moment
    this.scaleOmega += (torque / 9000) * dt * 60;
    this.scaleOmega *= Math.exp(-2.2 * dt);
    this.scaleTheta += this.scaleOmega * dt;
    if (this.scaleTheta < -0.35) { this.scaleTheta = -0.35; if (this.scaleOmega < 0) this.scaleOmega = 0; }
    if (this.scaleTheta > 0.35) { this.scaleTheta = 0.35; if (this.scaleOmega > 0) this.scaleOmega = 0; }

    // mynt i skålarna följer med (kropparna är borttagna ur världen — bara grafik)
    for (let s = 0; s < 2; s++) {
      const side = s === 0 ? -1 : 1;
      const pw = this.panWorld(side);
      for (let i = 0; i < this.panCoins[s].length; i++) {
        const slots = [-40, 0, 40, -20, 20];
        this.panCoins[s][i].renderPos = {
          x: pw.x + Math.cos(this.scaleTheta) * slots[i % 5],
          y: pw.y - 20 - Math.floor(i / 5) * 30 + Math.sin(this.scaleTheta) * slots[i % 5]
        };
      }
    }
  }

  update(dt) {
    this.tick(dt);
    const blocked = HUD.blocked() || this.shopOpen;
    const inp = blocked ? NO_IN : IN;
    const w = this.walker;
    w.update(dt, inp);
    const p = w.pos();
    this.updateCoins(dt, p.x, p.y);

    // dra silvermynt med fingret
    if (!blocked) this.updateDrag(dt);

    // vågen (egen simulering)
    this.stepScale(dt);
    if (!this.vaultOpen) {
      const left = 3 + this.panCoins[0].length;
      const right = this.panCoins[1].length;
      if (Math.abs(this.scaleTheta) < 0.06 && right >= 1 && right === left) {
        this.balanceT += dt;
        if (this.balanceT > 1.2) this.openVault();
      } else {
        this.balanceT = 0;
        if (right > 0 && Math.abs(this.scaleTheta) > 0.12) {
          this.scaleWrongT = (this.scaleWrongT || 0) + dt;
          if (this.scaleWrongT > 9 && !this.scaleHintShown) {
            this.scaleHintShown = true;
            this.pzScale.fail(true);
            this.pzScale.fail(true);
            this.pzScale.fail(true);   // tredje → tips
          }
        }
      }
    }

    // gruvsving
    if (this.swingT > 0) {
      this.swingT -= dt;
      if (this.swingT <= 0 && this.swingNode >= 0) {
        const n = this.nodes[this.swingNode];
        n.cd = 18;
        AUD.sfx('crack');
        PS.burst('chunk', n.x, n.y, 10, { color: PAL.gold, speed: 240, g: 700 });
        const gold = Math.random() < 0.18;
        this.addCoin(n.x - 30, n.y - 40, gold ? 'gold' : 'silver');
        this.addCoin(n.x + 30, n.y - 50, 'silver');
        this.cam.shake(4, 0.25);
      }
    }
    for (let i = 0; i < this.nodes.length; i++) {
      if (this.nodes[i].cd > 0) this.nodes[i].cd -= dt;
    }

    // röstberättare vid vågen
    if (!this.vaultOpen && !this.scaleIntro && Math.abs(p.x - SCALE_X) < 420) {
      this.scaleIntro = true;
      TTS.say('Vågen ska väga precis jämnt! Guldtackan väger lika mycket som TRE silvermynt. Dra mynt till den tomma skålen!', 'narrator', { queue: true });
    }

    // interaktioner
    this.near = null;
    if (!blocked) {
      if (Math.abs(p.x - SHOP_X) < 220) this.near = { kind: 'nastya', x: SHOP_X + 150, y: 640 };
      else if (Math.abs(p.x - ROCKET_X) < 170) this.near = { kind: 'rocket', x: ROCKET_X, y: 640 };
      else {
        for (let i = 0; i < this.nodes.length; i++) {
          const n = this.nodes[i];
          if (n.cd <= 0 && dist(p.x, p.y, n.x, n.y) < 130) {
            this.near = { kind: 'mine', i: i, x: n.x, y: n.y - 90 };
            break;
          }
        }
      }
      if (inp.actionEdge && this.near) {
        if (this.near.kind === 'nastya') this.talkNastya();
        else if (this.near.kind === 'rocket') this.leave();
        else if (this.near.kind === 'mine') {
          this.swingT = 0.4;
          this.swingNode = this.near.i;
          AUD.sfx('whoosh');
        }
      }
    }

    if (this.nastyaDance > 0) this.nastyaDance -= dt;

    this.cam.clampTo(0, -200, W, VH + 40);
    this.cam.follow(p.x, p.y - 160, 0.1);
    this.cam.update(dt);
  }

  updateDrag(dt) {
    const pt = IN.pointer;
    if (pt.down) {
      const wx = pt.x - this.cam.ox, wy = pt.y - this.cam.oy;
      if (!this.dragBody) {
        // fria mynt i världen
        for (let i = 0; i < this.coinsPhys.length; i++) {
          const c = this.coinsPhys[i];
          if (!this.coinPanIndex(c) && dist(wx, wy, c.position.x, c.position.y) < 70) { this.dragBody = c; break; }
        }
        // mynt som ligger i en skål — lyft ur
        if (!this.dragBody) {
          for (let s = 0; s < 2 && !this.dragBody; s++) {
            for (let i = 0; i < this.panCoins[s].length; i++) {
              const c = this.panCoins[s][i];
              if (c.renderPos && dist(wx, wy, c.renderPos.x, c.renderPos.y) < 70) {
                this.panCoins[s].splice(i, 1);
                addToWorld(c);
                addSpriteCoin(c);
                M.Body.setPosition(c, { x: wx, y: wy });
                M.Body.setVelocity(c, { x: 0, y: 0 });
                this.dragBody = c;
                AUD.sfx('pop');
                break;
              }
            }
          }
        }
      }
      if (this.dragBody) {
        const b = this.dragBody;
        const vx = clamp((wx - b.position.x) * 0.35, -20, 20);
        const vy = clamp((wy - b.position.y) * 0.35, -20, 20);
        M.Body.setVelocity(b, { x: vx, y: vy });
      }
    } else {
      if (this.dragBody) {
        // släpp nära en skål ⇒ myntet läggs i skålen (blir logisk vikt)
        const b = this.dragBody;
        for (let s = 0; s < 2; s++) {
          const pw = this.panWorld(s === 0 ? -1 : 1);
          if (dist(b.position.x, b.position.y, pw.x, pw.y) < 170) {
            removeBody(b);              // tar även bort spriten
            this.panCoins[s].push(b);
            b.renderPos = { x: pw.x, y: pw.y - 20 };
            AUD.sfx('coinS');
            PS.burst('sparkle', pw.x, pw.y - 30, 6, { color: '#f0f6ff', speed: 120 });
            break;
          }
        }
      }
      this.dragBody = null;
    }
  }

  openVault() {
    this.vaultOpen = true;
    setFlag('vaultOpen');
    this.pzScale.solve();
    AUD.sfx('bigwin');
    this.cam.shake(7, 0.5);
    HUD.toast('⚖️ JÄMNT! 1 guld = 3 silver!');
    // skatter!
    this.addCoin(VAULT_X - 60, 900, 'gold');
    this.addCoin(VAULT_X, 860, 'gold');
    this.addCoin(VAULT_X + 60, 900, 'gold');
    this.addCoin(VAULT_X + 20, 930, 'silver');
    this.addCoin(VAULT_X - 20, 930, 'silver');
    SAVE.gems += 2;
    persist();
    PS.burst('star', VAULT_X, 850, 20, { color: PAL.gold, speed: 320 });
  }

  talkNastya() {
    const self = this;
    if (!this.metNastya) {
      this.metNastya = true;
      setFlag('metNastya');
      HUD.dialog([
        { who: 'nastya', text: 'Hej hej! Välkommen till min rymdbutik! Jag heter Nastya! 🎀' },
        { who: 'nastya', text: 'Draculaura ringde — ska du till den KALLASTE planeten?! Brrr! Då behöver du en värmedräkt!' },
        { who: 'nastya', text: 'Den kostar 60. Guldmynt är värda 10 och silvermynt 5! Och pssst — skattvalvet där borta öppnas med vågen! ⚖️' }
      ], function () {
        self.shopOpen = true;
        HUD.objective('Betala EXAKT 60 för värmedräkten! 🧥');
      });
    } else if (this.hasSuit) {
      HUD.dialog([
        { who: 'nastya', text: 'Dräkten passar perfekt! Hälsa din pappa — och Melinda på Europa! 💦' }
      ]);
    } else {
      this.shopOpen = true;
      TTS.say('Lägg mynt på disken tills det blir exakt 60! Guld är värt 10 och silver 5.', 'nastya', { queue: true });
    }
  }

  leave() {
    if (!this.hasSuit) {
      HUD.dialog([{ who: 'alice', text: 'Neptunus är ISKALL — jag måste köpa värmedräkten hos Nastya först! 🧥' }]);
      return;
    }
    advanceTo('travel_europa');
    HUD.dialog([{ who: 'alice', text: 'Nu till Vattenmånen Europa — och sjöjungfrun Melinda! 🧜‍♀️' }], function () {
      NAV.go('travel_europa');
    });
  }

  onTap(x, y) {
    if (this.shopOpen) {
      for (let i = 0; i < this.shopBtns.length; i++) {
        const b = this.shopBtns[i];
        if (x > b.x && x < b.x + b.w && y > b.y && y < b.y + b.h) {
          this.shopAction(b.id);
          return;
        }
      }
      return;
    }
  }

  shopAction(id) {
    const total = this.pay.gold * 10 + this.pay.silver * 5;
    if (id === 'close') {
      this.shopOpen = false;
      this.pay = { gold: 0, silver: 0 };
      AUD.sfx('click');
    } else if (id === 'addGold') {
      if (SAVE.coins.gold - this.pay.gold > 0) {
        this.pay.gold++;
        AUD.sfx('coinG');
        this.speakTotal();
      } else AUD.sfx('wrong');
    } else if (id === 'addSilver') {
      if (SAVE.coins.silver - this.pay.silver > 0) {
        this.pay.silver++;
        AUD.sfx('coinS');
        this.speakTotal();
      } else AUD.sfx('wrong');
    } else if (id === 'removeGold') {
      if (this.pay.gold > 0) { this.pay.gold--; AUD.sfx('pop'); this.speakTotal(); }
    } else if (id === 'removeSilver') {
      if (this.pay.silver > 0) { this.pay.silver--; AUD.sfx('pop'); this.speakTotal(); }
    } else if (id === 'buy') {
      if (total === SUIT_PRICE) {
        spendCoins(this.pay.gold, this.pay.silver);
        this.hasSuit = true;
        setFlag('suit');
        this.shopOpen = false;
        this.nastyaDance = 4;
        AUD.sfx('bigwin');
        PS.burst('heart', SHOP_X, 700, 14, { color: '#ff6bcb', speed: 220 });
        const self = this;
        HUD.dialog([
          { who: 'nastya', text: 'EXAKT rätt betalt — du är ju en mattestjärna! ⭐ Här är värmedräkten!' },
          { who: 'alice', text: 'Tack Nastya! Nu fryser jag ALDRIG! Rosa OCH varm! 💕' }
        ], function () {
          HUD.objective('Tillbaka till raketen! 🚀');
        });
      } else {
        AUD.sfx('wrong');
        HUD.toast(total < SUIT_PRICE ? 'Det fattas — lägg på mer! 🪙' : 'För mycket — ta bort något! 🤭');
      }
    }
  }

  draw(ctx, alpha, t) {
    this.par.draw(ctx, this.cam.x, this.cam.y * 0.15, QY.layersMax());
    this.cam.begin(ctx);

    drawGoldGround(ctx, this.cam);

    // raket + platta
    ctx.fillStyle = '#3a3f52';
    rr(ctx, ROCKET_X - 160, GROUND - 22, 320, 22, 8);
    ctx.fill();
    drawRocket(ctx, ROCKET_X, GROUND - 125, 0, t, { alice: false, flame: 0, scale: 1 });

    // Nastya först — disken ritas över så att hon står BAKOM den
    drawGirl(ctx, SHOP_X + 60, GROUND - 92, t, WHO.nastya, {
      mode: this.nastyaDance > 0 ? 'dance' : 'stand',
      face: this.walker.pos().x < SHOP_X + 60 ? -1 : 1
    });
    drawShopStall(ctx, SHOP_X, GROUND, t, this.hasSuit);

    // valvet
    drawVault(ctx, VAULT_X, GROUND, t, this.vaultOpen);

    // vågen
    this.drawScale(ctx, t);

    // gruvan
    drawMineCave(ctx, MINE_X, GROUND, t);
    for (let i = 0; i < this.nodes.length; i++) {
      const n = this.nodes[i];
      const ready = n.cd <= 0;
      if (ready) glow(ctx, n.x, n.y, 46, PAL.gold, 0.35 + 0.15 * Math.sin(t * 3 + i));
      ctx.save();
      ctx.globalAlpha = ready ? 1 : 0.35;
      const gg = ctx.createRadialGradient(n.x - 8, n.y - 8, 4, n.x, n.y, 30);
      gg.addColorStop(0, '#ffe9a8');
      gg.addColorStop(1, PAL.gold2);
      ctx.fillStyle = gg;
      ctx.beginPath();
      ctx.moveTo(n.x - 28, n.y + 18);
      ctx.lineTo(n.x - 16, n.y - 22);
      ctx.lineTo(n.x + 10, n.y - 28);
      ctx.lineTo(n.x + 28, n.y - 2);
      ctx.lineTo(n.x + 18, n.y + 20);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = PAL.goldDark;
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.restore();
    }
    // hacka-sving
    if (this.swingT > 0 && this.swingNode >= 0) {
      const n = this.nodes[this.swingNode];
      ctx.save();
      ctx.translate(this.walker.pos().x, this.walker.pos().y - 40);
      ctx.rotate(Math.sin((0.4 - this.swingT) / 0.4 * Math.PI) * 2 - 1);
      ctx.strokeStyle = '#8a5a2b';
      ctx.lineWidth = 9;
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(52, -52); ctx.stroke();
      ctx.fillStyle = '#aeb6c8';
      ctx.beginPath();
      ctx.moveTo(30, -74);
      ctx.quadraticCurveTo(62, -66, 74, -36);
      ctx.lineTo(60, -30);
      ctx.quadraticCurveTo(52, -52, 26, -58);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    drawWorld(ctx, alpha, t);

    if (this.near && !HUD.blocked() && !this.shopOpen) drawActionBubble(ctx, this.near.x, this.near.y, t);

    this.drawCoins(ctx, t);
    PS.draw(ctx);
    this.cam.end(ctx);

    // butiks-UI
    if (this.shopOpen) this.drawShop(ctx, t);
  }

  drawScale(ctx, t) {
    const y0 = this.scaleY0;
    // stolpe
    ctx.fillStyle = '#6a4a2b';
    ctx.fillRect(SCALE_X - 12, y0, 24, GROUND - y0);
    ctx.fillStyle = PAL.gold2;
    ctx.beginPath();
    ctx.arc(SCALE_X, y0, 18, 0, TAU);
    ctx.fill();

    // hela vågen ritas i pivotens roterade koordinatsystem
    ctx.save();
    ctx.translate(SCALE_X, y0);
    ctx.rotate(this.scaleTheta);
    // balk
    ctx.fillStyle = '#8a5a2b';
    rr(ctx, -235, -9, 470, 18, 9);
    ctx.fill();
    // kölen (pendeln som centrerar vågen)
    ctx.fillStyle = '#6a4a2b';
    rr(ctx, -17, 12, 34, 108, 12);
    ctx.fill();
    ctx.fillStyle = PAL.gold2;
    ctx.beginPath();
    ctx.arc(0, 126, 20, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = PAL.goldDark;
    ctx.lineWidth = 3;
    ctx.stroke();
    for (let side = -1; side <= 1; side += 2) {
      const px = side * 210;
      // fästen
      ctx.strokeStyle = '#c8ccd8';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(px, 4);
      ctx.lineTo(px - 94, 64);
      ctx.moveTo(px, 4);
      ctx.lineTo(px + 94, 64);
      ctx.stroke();
      // skål med höga kanter
      ctx.fillStyle = '#b8871f';
      rr(ctx, px - 100, 66, 200, 14, 7);
      ctx.fill();
      ctx.fillStyle = '#a8771a';
      ctx.fillRect(px - 100, 12, 12, 60);
      ctx.fillRect(px + 88, 12, 12, 60);
    }
    // guldtackan på vänstra skålen
    const bg = ctx.createLinearGradient(-258, 12, -162, 66);
    bg.addColorStop(0, '#ffe9a8');
    bg.addColorStop(1, PAL.gold2);
    ctx.fillStyle = bg;
    ctx.beginPath();
    ctx.moveTo(-258, 66);
    ctx.lineTo(-244, 12);
    ctx.lineTo(-176, 12);
    ctx.lineTo(-162, 66);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = PAL.goldDark;
    ctx.lineWidth = 3;
    ctx.stroke();
    txt(ctx, '3', -210, 42, { size: 30, bold: true, color: PAL.goldDark });
    ctx.restore();

    // stopp-pinnarna (dekor)
    ctx.fillStyle = PAL.gold2;
    ctx.beginPath(); ctx.arc(SCALE_X - 80, y0 + 40, 11, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(SCALE_X + 80, y0 + 40, 11, 0, TAU); ctx.fill();

    // mynt som ligger i skålarna
    for (let s = 0; s < 2; s++) {
      for (let i = 0; i < this.panCoins[s].length; i++) {
        const rp = this.panCoins[s][i].renderPos;
        if (rp) {
          glow(ctx, rp.x, rp.y, 36, '#dfe6f0', 0.2);
          drawCoin(ctx, rp.x, rp.y, 24, 'silver', t + i);
        }
      }
    }

    if (!this.vaultOpen) {
      txt(ctx, '⚖️ Väg JÄMNT så öppnas valvet!', SCALE_X, 400, { size: 26, bold: true, color: '#ffe9b3', stroke: 'rgba(40,20,0,0.7)', strokeW: 5 });
    }
  }

  // räkna högt: myntsumman på disken (smygmatte + funkar utan läsning)
  speakTotal() {
    const t2 = this.pay.gold * 10 + this.pay.silver * 5;
    if (t2 === SUIT_PRICE) TTS.say('Exakt 60! Tryck på BETALA!', 'nastya');
    else if (t2 > SUIT_PRICE) HUD.toast('Oj, det blev för mycket! 🤭');
    else TTS.say(String(t2), 'nastya');
  }

  drawShop(ctx, t) {
    this.shopBtns = [];
    const Wp = Math.min(1350, view.w - 100), Hp = 640;
    const X = view.w / 2 - Wp / 2, Y = VH / 2 - Hp / 2 - 40;
    panel(ctx, X, Y, Wp, Hp, { r: 36 });
    txt(ctx, '🎀 NASTYAS RYMDBUTIK 🎀', view.w / 2, Y + 62, { size: 44, bold: true, color: PAL.gold, stroke: 'rgba(60,20,10,0.7)', strokeW: 7 });

    // dräkten + pris
    drawSuitIcon(ctx, X + 150, Y + 250, t);
    txt(ctx, 'VÄRMEDRÄKT', X + 150, Y + 380, { size: 28, bold: true, color: '#ff9ed9' });
    txt(ctx, 'PRIS: 60', X + 150, Y + 425, { size: 34, bold: true, color: '#fff' });

    const total = this.pay.gold * 10 + this.pay.silver * 5;

    // disken (betalningen)
    panel(ctx, X + 320, Y + 120, Wp - 380, 260, { r: 22, bg: 'rgba(60,36,90,0.7)', edgeW: 2 });
    txt(ctx, 'PÅ DISKEN:', X + 350, Y + 158, { size: 24, bold: true, color: '#b9a8d8', align: 'left' });
    let cx = X + 360;
    for (let i = 0; i < this.pay.gold; i++) { drawCoin(ctx, cx + 26, Y + 230, 26, 'gold', t + i); cx += 62; }
    for (let i = 0; i < this.pay.silver; i++) { drawCoin(ctx, cx + 24, Y + 230, 22, 'silver', t + i); cx += 54; }
    const okColor = total === SUIT_PRICE ? '#59d666' : (total > SUIT_PRICE ? '#ff5a5a' : '#fff');
    txt(ctx, total + ' / 60', X + Wp - 200, Y + 230, { size: 52, bold: true, color: okColor });
    // ta bort-knappar
    this.shopBtn(ctx, 'removeGold', '− 🥇', X + 350, Y + 290, 150, 66, '#7a5a20');
    this.shopBtn(ctx, 'removeSilver', '− 🥈', X + 520, Y + 290, 150, 66, '#5a6274');

    // plånboken
    txt(ctx, 'DIN PLÅNBOK:', X + 350, Y + 440, { size: 24, bold: true, color: '#b9a8d8', align: 'left' });
    drawCoin(ctx, X + 380, Y + 500, 26, 'gold', t);
    txt(ctx, '× ' + (SAVE.coins.gold - this.pay.gold), X + 450, Y + 500, { size: 32, bold: true, color: PAL.gold, align: 'left' });
    drawCoin(ctx, X + 580, Y + 500, 22, 'silver', t);
    txt(ctx, '× ' + (SAVE.coins.silver - this.pay.silver), X + 645, Y + 500, { size: 32, bold: true, color: PAL.silver, align: 'left' });
    // lägg till-knappar
    this.shopBtn(ctx, 'addGold', '+ 🥇 (10)', X + 780, Y + 462, 210, 76, '#b8871f');
    this.shopBtn(ctx, 'addSilver', '+ 🥈 (5)', X + 1010, Y + 462, 210, 76, '#7e8ca0');

    // köp / stäng
    this.shopBtn(ctx, 'buy', 'BETALA 💰', view.w / 2 - 240, Y + Hp - 90, 300, 76, total === SUIT_PRICE ? '#2e9e50' : '#555');
    this.shopBtn(ctx, 'close', 'Stäng ✖', view.w / 2 + 90, Y + Hp - 90, 200, 76, '#7a3a5a');
  }

  shopBtn(ctx, id, label, x, y, w, h, color) {
    rr(ctx, x, y, w, h, 18);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.7)';
    ctx.lineWidth = 3;
    ctx.stroke();
    txt(ctx, label, x + w / 2, y + h / 2, { size: 28, bold: true, color: '#fff' });
    this.shopBtns.push({ id: id, x: x, y: y, w: w, h: h });
  }
}

// fysiskt silvermynt vid vågen (dras med fingret)
function addSpriteCoin(c) {
  addSprite(c, function (ctx, x, y, a, t) {
    glow(ctx, x, y, 40, '#dfe6f0', 0.2);
    drawCoin(ctx, x, y, 24, 'silver', t);
  }, 4);
}

function drawSuitIcon(ctx, x, y, t) {
  ctx.save();
  ctx.translate(x, y + Math.sin(t * 2) * 5);
  glow(ctx, 0, 0, 120, '#ff9ed9', 0.3);
  // rosa overall med päls
  ctx.fillStyle = '#ff6bcb';
  rr(ctx, -60, -80, 120, 150, 26);
  ctx.fill();
  ctx.strokeStyle = '#c93f8e';
  ctx.lineWidth = 4;
  ctx.stroke();
  // ärmar
  rr(ctx, -95, -70, 40, 100, 18);
  ctx.fillStyle = '#ff6bcb';
  ctx.fill();
  ctx.stroke();
  rr(ctx, 55, -70, 40, 100, 18);
  ctx.fill();
  ctx.stroke();
  // pälskrage
  ctx.fillStyle = '#fff';
  for (let i = -3; i <= 3; i++) {
    ctx.beginPath();
    ctx.arc(i * 15, -80, 11, 0, TAU);
    ctx.fill();
  }
  // gulddragkedja + stjärna
  ctx.strokeStyle = PAL.gold;
  ctx.lineWidth = 4;
  ctx.beginPath(); ctx.moveTo(0, -66); ctx.lineTo(0, 40); ctx.stroke();
  ctx.fillStyle = PAL.gold;
  starPath(ctx, -30, 0, 14, 6, 5, 0);
  ctx.fill();
  ctx.restore();
}

function drawShopStall(ctx, x, groundY, t, suitSold) {
  // disk
  ctx.fillStyle = '#8a5a2b';
  rr(ctx, x - 220, groundY - 130, 440, 130, 10);
  ctx.fill();
  ctx.fillStyle = '#a86a32';
  ctx.fillRect(x - 232, groundY - 142, 464, 18);
  // stolpar + markis
  ctx.fillStyle = '#6a4a2b';
  ctx.fillRect(x - 220, groundY - 420, 16, 290);
  ctx.fillRect(x + 204, groundY - 420, 16, 290);
  for (let i = 0; i < 6; i++) {
    ctx.fillStyle = i % 2 === 0 ? '#ff4d6d' : '#ffffff';
    ctx.beginPath();
    ctx.moveTo(x - 240 + i * 80, groundY - 420);
    ctx.lineTo(x - 160 + i * 80, groundY - 420);
    ctx.lineTo(x - 200 + i * 80, groundY - 360);
    ctx.closePath();
    ctx.fill();
  }
  ctx.fillStyle = '#ff4d6d';
  rr(ctx, x - 250, groundY - 470, 500, 56, 14);
  ctx.fill();
  txt(ctx, "NASTYAS RYMDBUTIK", x, groundY - 442, { size: 30, bold: true, color: '#fff' });
  // varor: dräkten på ställning (tills köpt)
  if (!suitSold) {
    ctx.strokeStyle = '#c8ccd8';
    ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(x - 150, groundY - 130); ctx.lineTo(x - 150, groundY - 330); ctx.stroke();
    drawSuitIcon(ctx, x - 150, groundY - 240, t);
    txt(ctx, '60', x - 150, groundY - 150, { size: 30, bold: true, color: PAL.gold, stroke: 'rgba(60,30,0,0.8)', strokeW: 5 });
  }
  // leksaker på disken
  drawGem(ctx, x + 150, groundY - 150, 20, '#c95cff', t);
  ctx.fillStyle = '#7ec8ff';
  ctx.beginPath(); ctx.arc(x + 100, groundY - 148, 16, 0, TAU); ctx.fill();
}

function drawVault(ctx, x, groundY, t, open) {
  ctx.fillStyle = '#5a4a30';
  rr(ctx, x - 160, groundY - 320, 320, 320, 16);
  ctx.fill();
  ctx.strokeStyle = '#3a2f1e';
  ctx.lineWidth = 6;
  ctx.stroke();
  if (open) {
    ctx.fillStyle = '#241a08';
    rr(ctx, x - 120, groundY - 280, 240, 280, 10);
    ctx.fill();
    glow(ctx, x, groundY - 140, 130, PAL.gold, 0.35 + 0.1 * Math.sin(t * 3));
    for (let i = 0; i < 3; i++) {
      drawGem(ctx, x - 60 + i * 60, groundY - 60 - (i % 2) * 40, 22, [PAL.gold, '#c95cff', '#39d7d0'][i], t + i);
    }
  } else {
    // rund valvdörr
    const g = ctx.createRadialGradient(x - 20, groundY - 180, 20, x, groundY - 160, 130);
    g.addColorStop(0, '#d8dde8');
    g.addColorStop(1, '#8f97a8');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, groundY - 160, 118, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = '#5a6274';
    ctx.lineWidth = 8;
    ctx.stroke();
    // ratt
    ctx.save();
    ctx.translate(x, groundY - 160);
    ctx.rotate(t * 0.2);
    ctx.strokeStyle = '#3a3f52';
    ctx.lineWidth = 10;
    ctx.beginPath();
    ctx.arc(0, 0, 44, 0, TAU);
    ctx.stroke();
    for (let i = 0; i < 3; i++) {
      ctx.rotate(TAU / 3);
      ctx.beginPath(); ctx.moveTo(0, -8); ctx.lineTo(0, -60); ctx.stroke();
    }
    ctx.restore();
    txt(ctx, 'SKATTVALV', x, groundY - 300 + 14, { size: 24, bold: true, color: PAL.gold });
  }
}

function drawMineCave(ctx, x, groundY, t) {
  ctx.fillStyle = '#33230e';
  ctx.beginPath();
  ctx.moveTo(x - 260, groundY);
  ctx.quadraticCurveTo(x - 220, groundY - 340, x, groundY - 360);
  ctx.quadraticCurveTo(x + 230, groundY - 340, x + 270, groundY);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#5a4a30';
  ctx.lineWidth = 8;
  ctx.stroke();
  txt(ctx, '⛏️ GRUVAN', x, groundY - 300, { size: 26, bold: true, color: '#ffd24a' });
}

function drawGoldGround(ctx, cam) {
  const x0 = Math.max(0, cam.x - view.w / 2 - 60);
  const x1 = Math.min(W + 200, cam.x + view.w / 2 + 60);
  const g = ctx.createLinearGradient(0, GROUND, 0, GROUND + 130);
  g.addColorStop(0, '#c89a3a');
  g.addColorStop(1, '#8a5f1e');
  ctx.fillStyle = g;
  ctx.fillRect(x0, GROUND - 8, x1 - x0, 148);
  for (let x = Math.floor(x0 / 220) * 220; x < x1; x += 220) {
    const r = Math.abs(Math.sin(x * 12.9898) * 43758.5453) % 1;
    ctx.fillStyle = 'rgba(255,230,150,' + (0.25 + r * 0.3) + ')';
    ctx.beginPath();
    ctx.arc(x + 60, GROUND + 30 + r * 50, 6 + r * 10, 0, TAU);
    ctx.fill();
  }
}

function drawAsteroidSky(c, w, h) {
  const g = c.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#0a0512');
  g.addColorStop(0.7, '#241428');
  g.addColorStop(1, '#3a2418');
  c.fillStyle = g;
  c.fillRect(0, 0, w, h);
  c.fillStyle = '#fff';
  for (let i = 0; i < 160; i++) {
    c.globalAlpha = 0.3 + Math.random() * 0.7;
    c.beginPath();
    c.arc(Math.random() * w, Math.random() * h * 0.8, Math.random() * 1.6 + 0.4, 0, TAU);
    c.fill();
  }
  c.globalAlpha = 1;
  // asteroidbälte i fjärran
  for (let i = 0; i < 14; i++) {
    const x = (i / 14) * w + 40, y = 220 + Math.sin(i * 2.4) * 90;
    c.fillStyle = 'rgba(200,160,90,' + (0.25 + (i % 3) * 0.14) + ')';
    c.beginPath();
    c.arc(x, y, 10 + (i % 4) * 8, 0, TAU);
    c.fill();
  }
}

function drawGoldRocks(c, w, h) {
  c.fillStyle = 'rgba(120,85,30,0.8)';
  c.beginPath();
  c.moveTo(0, h);
  for (let x = 0; x <= w; x += 20) {
    c.lineTo(x, 190 - 110 * Math.abs(Math.sin(x * Math.PI * 2.5 / w)) - 40 * Math.sin(x * TAU * 6 / w));
  }
  c.lineTo(w, h);
  c.closePath();
  c.fill();
}

export const asteroidScene = new AsteroidScene();
