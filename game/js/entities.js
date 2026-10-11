// ---- Shared pixel-art draw helpers -------------------------------------
// Coordinates are world-space in the 480x270-scaled logical grid; render()
// applies the camera translate, so entities just store raw x,y.
const _tintCache = new Map();
function _whiteVersion(img) {
  if (!img || img._broken || !img.width) return null;
  let cv = _tintCache.get(img);
  if (cv) return cv;
  cv = document.createElement('canvas');
  cv.width = img.width; cv.height = img.height;
  const c = cv.getContext('2d');
  c.drawImage(img, 0, 0);
  c.globalCompositeOperation = 'source-atop';
  c.fillStyle = '#ffffff';
  c.fillRect(0, 0, cv.width, cv.height);
  _tintCache.set(img, cv);
  return cv;
}
// Like _whiteVersion but any colour — a silhouette of the sprite filled with `color`,
// cached per (image,colour). Used as a tint OVERLAY (drawn over the sprite at low alpha),
// so it recolours only the sprite's own pixels — no main-canvas compositing bleed.
const _colorCache = new Map();
function _tintVersion(img, color) {
  if (!img || img._broken || !img.width) return null;
  let byColor = _colorCache.get(img);
  if (!byColor) { byColor = new Map(); _colorCache.set(img, byColor); }
  let cv = byColor.get(color);
  if (cv) return cv;
  cv = document.createElement('canvas');
  cv.width = img.width; cv.height = img.height;
  const c = cv.getContext('2d');
  c.drawImage(img, 0, 0);
  c.globalCompositeOperation = 'source-atop';
  c.fillStyle = color;
  c.fillRect(0, 0, cv.width, cv.height);
  byColor.set(color, cv);
  return cv;
}

// Draw a sprite centred at cx with its feet sitting on feetY. opts.sx/sy give
// feet-anchored squash/stretch for juice.
function drawSprite(ctx, img, cx, feetY, scale, opts = {}) {
  if (!img || img._broken || !img.width || img.complete === false) return;
  const sx = opts.sx || 1, sy = opts.sy || 1;
  const w = img.width * scale * sx, h = img.height * scale * sy;
  // _footPad (sheet frames): empty px below the feet — shift down so feet sit on the ground.
  const x = Math.round(cx - w / 2), y = Math.round(feetY - h + (img._footPad || 0) * scale * sy);
  ctx.save();
  if (opts.alpha != null) ctx.globalAlpha = opts.alpha;
  ctx.drawImage(img, x, y, w, h);
  if (opts.flash) {
    const wv = _whiteVersion(img);
    if (wv) { ctx.globalAlpha = (opts.alpha != null ? opts.alpha : 1) * opts.flash; ctx.drawImage(wv, x, y, w, h); }
  }
  ctx.restore();
}

// Draw a sprite rotated about an anchor (rounded for crispness).
function drawRot(ctx, img, ax, ay, scale, angle, ox = 0.5, oy = 0.5) {
  if (!img || img._broken || !img.width || img.complete === false) return;
  const w = img.width * scale, h = img.height * scale;
  ctx.save();
  ctx.translate(Math.round(ax), Math.round(ay));
  ctx.rotate(angle);
  ctx.drawImage(img, -w * ox, -h * oy, w, h);
  ctx.restore();
}

// Soft top-down drop shadow that grounds a billboard sprite.
function drawShadow(ctx, cx, feetY, w, alpha) {
  ctx.save();
  ctx.globalAlpha = alpha == null ? 0.28 : alpha;
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.ellipse(Math.round(cx), Math.round(feetY) + 1, w * 0.5, Math.max(2, w * 0.22), 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// A thrown javelin (Catcash): wooden shaft + sinew binding + steel head, pointing along `ang`.
// Used both for the in-hand spear and the flying projectile so they read as the same weapon.
function drawSpear(ctx, x, y, ang, scale) {
  const len = 12 * scale, half = len / 2;
  ctx.save();
  ctx.translate(Math.round(x), Math.round(y));
  ctx.rotate(ang);
  ctx.lineCap = 'butt';
  ctx.strokeStyle = '#7a5230'; ctx.lineWidth = Math.max(1, 1.4 * scale);     // shaft
  ctx.beginPath(); ctx.moveTo(-half, 0); ctx.lineTo(half - 3 * scale, 0); ctx.stroke();
  ctx.strokeStyle = '#cdae6a';                                              // binding near the head
  ctx.beginPath(); ctx.moveTo(half - 5 * scale, 0); ctx.lineTo(half - 3.5 * scale, 0); ctx.stroke();
  ctx.fillStyle = '#d7dde8';                                                // steel head
  ctx.beginPath();
  ctx.moveTo(half, 0);
  ctx.lineTo(half - 3.5 * scale, -2 * scale);
  ctx.lineTo(half - 3.5 * scale, 2 * scale);
  ctx.closePath(); ctx.fill();
  ctx.restore();
}

// ---- Player (free 2D roam) ---------------------------------------------
window.Player = class {
  constructor(hero) {
    this.hero = hero;
    this.char = hero.key;
    this.scale = hero.scale;
    this.x = CONFIG.world.castle.breachX + 80;
    this.y = (CONFIG.world.castle.y0 + CONFIG.world.castle.y1) / 2;
    this.vx = 0; this.vy = 0;
    this.facing = 'r';
    this.maxHearts = hero.hearts;
    this.hearts = hero.hearts;
    this.anim = new Animator(hero.key);
    this.invuln = 0;
    this.input = { left: false, right: false, up: false, down: false };
    this.charging = false;
    this.charge = 0;
    this.fireCd = 0;
    this.aim = 0;
    this.movePhase = 0;
    this.spd = 0;
    this.squashT = 0;     // fire squash timer
    this.recoil = 0;
    this._dustT = 0;
  }
  get feetY() { return this.y; }
  get handX() { return this.x + (this.facing === 'r' ? 4 : -4); }
  get handY() { return this.y - 16 * this.scale; }

  hurt() {
    if (this.invuln > 0) return false;
    this.hearts--;
    this.invuln = CONFIG.player.invulnOnHit;
    this.anim.play('hurt', { fps: 12, loop: false, reset: true });
    return true;
  }
  fire(game) {
    if (this.fireCd > 0 || this.charge < CONFIG.player.drawMin) return false;
    const up = (game.runState && game.runState.upgrades) || {};
    const act = (game.runState && game.runState.active) || {};
    const c = Math.min(1, this.charge);
    const sp = CONFIG.player.arrowSpeedMin + (CONFIG.player.arrowSpeedMax - CONFIG.player.arrowSpeedMin) * c;
    const dmg = 1 + (c >= 0.5 ? 1 : 0) + (c >= 0.85 ? 1 : 0) + this.hero.dmgBonus + (up.damage || 0);
    const pierce = up.pierce || 0;
    const n = 1 + (up.multishot || 0);
    if (this.hero.attack === 'fireball') {
      const fsp = sp * 1.12;                     // fireballs fly a touch faster + always burst
      for (let k = 0; k < n; k++) {
        const a = this.aim + (k - (n - 1) / 2) * 0.09;
        game.arrows.push(new Fireball(this.handX, this.handY, Math.cos(a) * fsp, Math.sin(a) * fsp, dmg + 1, c));
      }
    } else if (this.hero.attack === 'spear') {
      const ssp = sp * 1.18;                     // heavy spears fly fast + flat, and skewer (+1 innate pierce)
      const fx = { fire: up.fire || 0, frost: up.frost || 0, explode: up.explosive || 0 };
      for (let k = 0; k < n; k++) {
        const a = this.aim + (k - (n - 1) / 2) * 0.07;
        game.arrows.push(new Spear(this.handX, this.handY, Math.cos(a) * ssp, Math.sin(a) * ssp, dmg + 1, c, pierce + 1, fx));
      }
    } else {
      const fx = { fire: up.fire || 0, frost: up.frost || 0, explode: up.explosive || 0 };
      for (let k = 0; k < n; k++) {
        const a = this.aim + (k - (n - 1) / 2) * 0.10;
        game.arrows.push(new Arrow(this.handX, this.handY, Math.cos(a) * sp, Math.sin(a) * sp, dmg, c, pierce, fx));
      }
    }
    let cd = (this.hero.fireCd || CONFIG.player.fireCooldown) * Math.pow(0.88, up.firerate || 0);
    if (act.rapidfireT > 0) cd *= 0.4;
    this.fireCd = cd;
    this.squashT = 0.12; this.recoil = 0.1;
    if (game._spawnFireSpark) game._spawnFireSpark(this, c);
    Sfx.shoot();
    return true;
  }
  update(dt, game) {
    if (this.invuln > 0) this.invuln -= dt;
    if (this.fireCd > 0) this.fireCd -= dt;
    if (this.squashT > 0) this.squashT = Math.max(0, this.squashT - dt);
    if (this.recoil > 0) this.recoil = Math.max(0, this.recoil - dt);
    const up = (game.runState && game.runState.upgrades) || {};

    const cax = Math.cos(this.aim);              // deadzone near vertical aim so facing doesn't flicker
    if (cax > 0.12) this.facing = 'r'; else if (cax < -0.12) this.facing = 'l';

    // 8-way acceleration / friction.
    let dx = (this.input.right ? 1 : 0) - (this.input.left ? 1 : 0);
    let dy = (this.input.down ? 1 : 0) - (this.input.up ? 1 : 0);
    const il = Math.hypot(dx, dy);
    if (il > 0) { dx /= il; dy /= il; }
    const ACC = CONFIG.player.accel;
    this.vx += dx * ACC * dt;
    this.vy += dy * ACC * dt * CONFIG.player.depthFactor;
    const fr = Math.pow(1 / (1 + CONFIG.player.friction), dt);
    if (dx === 0) this.vx *= fr;
    if (dy === 0) this.vy *= fr;
    const maxV = this.hero.moveSpeed * (1 + 0.18 * (up.movespeed || 0));
    const v = Math.hypot(this.vx, this.vy);
    if (v > maxV) { this.vx = this.vx / v * maxV; this.vy = this.vy / v * maxV; }
    this.x += this.vx * dt; this.y += this.vy * dt;
    const wc = CONFIG.world;
    this.x = Math.max(wc.castle.breachX + 8, Math.min(wc.W - wc.margin, this.x));
    this.y = Math.max(wc.margin, Math.min(wc.H - wc.margin, this.y));
    this.spd = v;
    const moving = v > 10;
    this.movePhase += dt * (10 + v * 0.04);

    // Dust puffs while moving.
    if (moving && game._spawnDust) {
      this._dustT -= dt;
      if (this._dustT <= 0) { this._dustT = 0.11; game._spawnDust(this.x, this.y); }
    }

    if (this.charging) {
      const drawTime = this.hero.drawTime * Math.pow(0.9, up.fastdraw || 0);
      this.charge = Math.min(1, this.charge + dt / drawTime);
    }

    this.anim.dir = this.facing;
    if (this.anim.anim === 'hurt' && !this.anim.done) {
      // let it finish
    } else if (moving) {
      this.anim.play('walkRun', { fps: v > maxV * 0.6 ? 16 : 11, loop: true });
    } else {
      this.anim.play('idle', { fps: 6, loop: true });
    }
    this.anim.update(dt);
  }
  bodyBox() {
    const s = this.scale;
    return { x: this.x - 6 * s, y: this.y - 22 * s, w: 12 * s, h: 22 * s };
  }
  draw(ctx, game) {
    drawShadow(ctx, this.x, this.y, 16 * this.scale);
    const blink = this.invuln > 0 && Math.floor(this.invuln * 16) % 2 === 0;
    const bob = this.spd > 10 ? Math.round(Math.sin(this.movePhase)) : 0;
    const k = this.squashT / 0.12;
    const sx = 1 + 0.18 * k, sy = 1 - 0.14 * k;
    const rx = this.recoil > 0 ? (this.facing === 'r' ? -2 : 2) * (this.recoil / 0.1) : 0;
    drawSprite(ctx, this.anim.image(), this.x + rx, this.y + bob, this.scale, { alpha: blink ? 0.4 : 1, sx, sy });

    if (this.hero.attack === 'fireball') {
      // Wizard: a purple fireball charges in the casting hand (no bow).
      const reach = 6 * this.scale;
      const hx = this.handX + rx + Math.cos(this.aim) * reach;
      const hy = this.handY + bob + Math.sin(this.aim) * reach;
      const cc = this.charging ? Math.max(0.2, this.charge) : 0.16;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const r = (2 + cc * 5) * this.scale * 0.75;
      ctx.globalAlpha = 0.45 + 0.4 * cc; ctx.fillStyle = '#8a2be2';
      ctx.beginPath(); ctx.arc(Math.round(hx), Math.round(hy), r, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 0.85; ctx.fillStyle = '#e0c3ff';
      ctx.beginPath(); ctx.arc(Math.round(hx), Math.round(hy), r * 0.5, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    } else if (this.hero.attack === 'spear') {
      // Centaur: a spear is hefted along the aim (no bow), cocked back further the more it's charged.
      const reach = 7 * this.scale;
      const pull = this.charging ? (1 - Math.min(1, this.charge)) * 3 * this.scale : 0;
      const bx = this.handX + rx + Math.cos(this.aim) * (reach - pull);
      const by = this.handY + bob + Math.sin(this.aim) * (reach - pull);
      drawSpear(ctx, bx, by, this.aim, this.scale * 1.25);
    } else {
      // Hold the bow OUT in front of the body — the lead arm extends along the aim, so the
      // (vertical) bow sits to the side and doesn't cross the torso. Stays upright aiming flat.
      const frame = !this.charging ? 0 : (this.charge < 0.34 ? 0 : this.charge < 0.72 ? 1 : 2);
      const bow = Assets.weapon('bow', frame);
      const reach = 7 * this.scale;
      const bx = this.handX + rx + Math.cos(this.aim) * reach;
      const by = this.handY + bob + Math.sin(this.aim) * reach;
      drawRot(ctx, bow, bx, by, this.scale * 1.05, this.aim, 0.5, 0.5);
      if (this.charging && this.charge > CONFIG.player.drawMin) {
        drawRot(ctx, Assets.weapon('arrow'), bx, by, this.scale * 0.8, this.aim + Math.PI / 2, 0.5, 0.65);
      }
    }

    // --- active power-up auras (drawn over the player) ---
    if (game && game.runState) {
      const act = game.runState.active;
      if (act.shieldHits > 0) {                 // Oaken Guard — protective bubble
        const pulse = 0.55 + 0.3 * Math.sin(this.movePhase * 3);
        ctx.save();
        ctx.globalAlpha = 0.4 * pulse; ctx.strokeStyle = '#9fdcff'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(this.x, this.y - 9 * this.scale, 15 * this.scale, 0, Math.PI * 2); ctx.stroke();
        ctx.globalAlpha = 0.12; ctx.fillStyle = '#9fdcff';
        ctx.beginPath(); ctx.arc(this.x, this.y - 9 * this.scale, 14 * this.scale, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      }
      if (act.rapidfireT > 0) {                 // Fury of the Forest — haste aura + speed lines
        const f = Math.min(1, act.rapidfireT / 6);
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 0.2 * f; ctx.fillStyle = '#ff8c42';
        ctx.beginPath(); ctx.arc(this.x, this.y - 9 * this.scale, 12 * this.scale, 0, Math.PI * 2); ctx.fill();
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 0.5 * f; ctx.strokeStyle = '#ffc966'; ctx.lineWidth = 1;
        const ph = this.movePhase * 8;
        for (let i = 0; i < 3; i++) {
          const yo2 = (i - 1) * 5 * this.scale;
          const x0 = this.x - 11 * this.scale - ((ph + i * 2) % 8);
          ctx.beginPath();
          ctx.moveTo(Math.round(x0), Math.round(this.y - 9 * this.scale + yo2));
          ctx.lineTo(Math.round(x0 + 7), Math.round(this.y - 9 * this.scale + yo2));
          ctx.stroke();
        }
        ctx.restore();
      }
    }
  }
};

// ---- Arrow (flat-flight) -----------------------------------------------
window.Arrow = class {
  constructor(x, y, vx, vy, dmg, charge, pierce, fx) {
    this.x = x; this.y = y; this.vx = vx; this.vy = vy;
    this.dmg = dmg; this.charge = charge;
    this.pierce = pierce || 0;
    this.fx = fx || null;
    this.trailCol = fx && fx.fire ? '#ff9d4a' : fx && fx.frost ? '#9fdcff' : fx && fx.explode ? '#ffd24a' : '#f4e3b2';
    this.hitIds = new Set();
    this.dead = false; this.trail = []; this.life = 2.2;
  }
  update(dt) {
    this.life -= dt;
    this.trail.push({ x: this.x, y: this.y });
    if (this.trail.length > 6) this.trail.shift();
    this.x += this.vx * dt; this.y += this.vy * dt;
    const w = CONFIG.world;
    if (this.life <= 0 || this.x > w.W + 20 || this.x < -20 || this.y < -20 || this.y > w.H + 20) this.dead = true;
  }
  get angle() { return Math.atan2(this.vy, this.vx); }
  draw(ctx) {
    ctx.save();
    ctx.fillStyle = this.trailCol;
    for (let i = 0; i < this.trail.length; i++) {
      const t = this.trail[i];
      ctx.globalAlpha = (i / this.trail.length) * 0.4;
      ctx.fillRect(Math.round(t.x), Math.round(t.y), 1, 1);
    }
    ctx.restore();
    drawRot(ctx, Assets.weapon('arrow'), this.x, this.y, 1.1, this.angle + Math.PI / 2, 0.5, 0.7);
  }
};

// ---- Wizard fireball: lives in the arrows array, bursts (explode fx) on hit ----
window.Fireball = class {
  constructor(x, y, vx, vy, dmg, charge) {
    this.x = x; this.y = y; this.vx = vx; this.vy = vy;
    this.dmg = dmg; this.charge = charge;
    this.pierce = 0;
    this.fx = { explode: 1, fire: 1 };          // AoE burst + burn — reuses _applyArrowFx
    this.trailCol = '#c77dff';
    this.hitIds = new Set();
    this.dead = false; this.trail = []; this.life = 2.0; this.t = 0;
  }
  update(dt) {
    this.life -= dt; this.t += dt;
    this.trail.push({ x: this.x, y: this.y });
    if (this.trail.length > 8) this.trail.shift();
    this.x += this.vx * dt; this.y += this.vy * dt;
    const w = CONFIG.world;
    if (this.life <= 0 || this.x > w.W + 20 || this.x < -20 || this.y < -20 || this.y > w.H + 20) this.dead = true;
  }
  get angle() { return Math.atan2(this.vy, this.vx); }
  draw(ctx) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < this.trail.length; i++) {
      const t = this.trail[i], a = i / this.trail.length;
      ctx.globalAlpha = a * 0.5; ctx.fillStyle = '#8a2be2';
      ctx.beginPath(); ctx.arc(Math.round(t.x), Math.round(t.y), 1 + a * 2.6, 0, Math.PI * 2); ctx.fill();
    }
    const pulse = 3 + Math.sin(this.t * 30) * 0.6;
    ctx.globalAlpha = 0.9; ctx.fillStyle = '#c77dff';
    ctx.beginPath(); ctx.arc(Math.round(this.x), Math.round(this.y), pulse, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 0.85; ctx.fillStyle = '#f0e0ff';
    ctx.beginPath(); ctx.arc(Math.round(this.x), Math.round(this.y), pulse * 0.5, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
};

// ---- Centaur spear: heavy, pierces (+1 innate), flies point-first; lives in the arrows array ----
window.Spear = class {
  constructor(x, y, vx, vy, dmg, charge, pierce, fx) {
    this.x = x; this.y = y; this.vx = vx; this.vy = vy;
    this.dmg = dmg; this.charge = charge;
    this.pierce = pierce || 0;
    this.fx = fx || null;
    this.trailCol = fx && fx.fire ? '#ff9d4a' : fx && fx.frost ? '#9fdcff' : '#d8c089';
    this.hitIds = new Set();
    this.dead = false; this.trail = []; this.life = 2.4;
  }
  update(dt) {
    this.life -= dt;
    this.trail.push({ x: this.x, y: this.y });
    if (this.trail.length > 5) this.trail.shift();
    this.x += this.vx * dt; this.y += this.vy * dt;
    const w = CONFIG.world;
    if (this.life <= 0 || this.x > w.W + 24 || this.x < -24 || this.y < -24 || this.y > w.H + 24) this.dead = true;
  }
  get angle() { return Math.atan2(this.vy, this.vx); }
  draw(ctx) {
    ctx.save();
    ctx.fillStyle = this.trailCol;
    for (let i = 0; i < this.trail.length; i++) {
      const t = this.trail[i];
      ctx.globalAlpha = (i / this.trail.length) * 0.35;
      ctx.fillRect(Math.round(t.x), Math.round(t.y), 1, 1);
    }
    ctx.restore();
    drawSpear(ctx, this.x, this.y, this.angle, 1.25);
  }
};

// ---- Enemy (seek the gate, free 2D) ------------------------------------
window.Enemy = class {
  constructor(key, def, x, y) {
    this.key = key; this.def = def;
    this.x = x == null ? CONFIG.world.W - 40 : x;
    this.y = y == null ? (CONFIG.world.castle.y0 + CONFIG.world.castle.y1) / 2 : y;
    this.scale = def.scale;
    this.hp = def.hp; this.maxHp = def.hp;
    this.vx = 0; this.vy = 0;
    this.anim = new Animator(def.sprite || key);   // archetypes reuse an existing sheet via def.sprite
    this.anim.dir = 'l';
    this.state = 'walk';
    this.hurtFlash = 0;
    this.dead = false; this.breached = false; this.killed = false;
    this.throwCd = (def.throwEvery || def.castEvery || 2) * (0.5 + 0.5 * Math.random());
    this.bob = Math.random() * Math.PI * 2;
    this.slowT = 0; this.burnT = 0; this.burnDmg = 0; this.burnTick = 0;
    this.spawnT = 0;   // >0 while emerging from a spawn marker (hold + scale-in)
    this.faceAng = Math.PI;                         // facing the gate (west) by default
    this._lastHitT = 99; this._regenAcc = 0;        // regenerator bookkeeping
    this.chargeState = def.charge ? 'seek' : null;  // charger state machine
    this.chargeCd = def.charge ? def.charge.cd * Math.random() : 0;
    this.chargeT = 0; this._chargeAng = Math.PI;
    this.phase = def.boss ? 1 : 0;                  // boss phase (1/2/3); 0 = not a boss
    this.dyingT = 0;                                // safety timeout so a 'dying' enemy can't stick
  }
  get feetY() { return this.y; }
  get drawScale() {
    return this.scale * (0.92 + 0.16 * (this.y / CONFIG.world.H));   // lower on map = nearer = bigger
  }
  hitBox() {
    const s = this.drawScale;
    return { x: this.x - 7 * s, y: this.y - 22 * s, w: 14 * s, h: 22 * s };
  }
  _clampField() { const w = CONFIG.world; this.y = Math.max(w.margin, Math.min(w.H - w.margin, this.y)); }
  takeDamage(dmg, game, arrowAngle) {
    if (this.state === 'dying') return;
    this._lastHitT = 0;                                  // regenerator: pause healing
    // Shield Warden: a hit landing on the front arc (arrow travelling opposite the enemy's facing)
    // is mostly deflected — the player must flank to its side/back for full damage.
    if (this.def.shield === 'front' && arrowAngle != null) {
      const dot = Math.cos(arrowAngle) * Math.cos(this.faceAng) + Math.sin(arrowAngle) * Math.sin(this.faceAng);
      if (dot < -0.25) { dmg *= 0.34; this._blockFlash = 0.2; }
    }
    this.hp -= dmg;
    this.hurtFlash = 0.18;
    if (arrowAngle != null) {
      const kb = CONFIG.juice.knockback / (1 + (this.maxHp - 1) * 0.35);
      this.vx += Math.cos(arrowAngle) * kb;
      this.vy += Math.sin(arrowAngle) * kb * 0.5;
    }
    if (this.hp <= 0) {
      this.state = 'dying'; this.killed = true; this.spawnT = 0;   // cancel scale-in so it can't clobber the death anim
      this.anim.play('death', { fps: 10, loop: false, reset: true });
      game.onKill(this);
    } else {
      this.state = 'hurt'; this.hurtTimer = 0.26;
      this.anim.play('hurt', { fps: 12, loop: false, reset: true });
      Sfx.hit();
    }
  }
  update(dt, game) {
    if (this.hurtFlash > 0) this.hurtFlash -= dt;
    if (this._blockFlash > 0) this._blockFlash -= dt;
    if (this._regenFlash > 0) this._regenFlash -= dt;
    if (this._phaseFlash > 0) this._phaseFlash -= dt;
    this._lastHitT += dt;
    this.bob += dt * 6;
    if (this.spawnT > 0 && this.state !== 'dying') {   // emerging from the ground — hold + scale-in
      this.spawnT -= dt;
      this.anim.play('walkRun', { fps: 8, loop: true }); this.anim.update(dt);
      return;
    }
    if (this.slowT > 0) this.slowT -= dt;
    if (this.burnT > 0 && this.state !== 'dying') {
      this.burnT -= dt; this.burnTick -= dt;
      if (this.burnTick <= 0) {
        this.burnTick = 0.5;
        this.hp -= this.burnDmg; this.hurtFlash = 0.12;
        if (game._spawnBurn) game._spawnBurn(this.x, this.y);
        if (this.hp <= 0 && this.state !== 'dying') {
          this.state = 'dying'; this.killed = true; this.spawnT = 0;
          this.anim.play('death', { fps: 10, loop: false, reset: true });
          game.onKill(this);
        }
      }
    }

    if (this.state === 'dying') { this.anim.update(dt); this.dyingT += dt; if (this.anim.done || this.dyingT > 1.2) this.dead = true; return; }
    if (this.state === 'hurt') {
      this.hurtTimer -= dt;
      this.x += this.vx * dt; this.y += this.vy * dt;        // knockback slide
      this.vx *= Math.pow(0.02, dt); this.vy *= Math.pow(0.02, dt);
      this._clampField();
      this.anim.update(dt);
      if (this.hurtTimer <= 0) this.state = 'walk';
      return;
    }
    if (game.runState && game.runState.active.freezeT > 0) {
      this.state = 'walk'; return;   // frozen solid — hold pose & position (no anim advance)
    }

    // Boss phases: P1 normal, P2 (<66%) telegraphed charges, P3 (<33%) enrage + spawn adds.
    if (this.def.boss) {
      const ratio = this.hp / this.maxHp;
      const np = ratio > 0.66 ? 1 : (ratio > 0.33 ? 2 : 3);
      if (np > this.phase) {
        this.phase = np; this._phaseFlash = 0.7;
        if (game._setBanner) game._setBanner(np === 3 ? (this.def.name + ' ENRAGED').toUpperCase() : 'PHASE ' + np, 1.1);
        if (game.trauma != null) game.trauma = Math.min(1, game.trauma + 0.35);
        if (np === 3) this._addCd = 2.5;
      }
      this._berserk = this.phase === 3 ? 1.5 : 1;
      if (this.phase === 3 && this.def.adds) {
        this._addCd -= dt;
        if (this._addCd <= 0) {
          this._addCd = this.def.adds.every || 6;
          const hm = game._hpMult(game.wave);
          for (let i = 0; i < (this.def.adds.count || 2); i++) {
            const aa = -0.6 + i * 1.2;
            const cd = Object.assign({}, ENEMIES.goblin, { hp: Math.max(1, Math.ceil(ENEMIES.goblin.hp * hm)) });
            game._hatchEnemy('goblin', cd, this.x + Math.cos(aa) * 28, this.y + Math.sin(aa) * 18);
          }
        }
      }
    }

    // Regenerator: knit wounds back unless hit recently.
    if (this.def.regen && this.hp < this.maxHp && this._lastHitT > this.def.regen.delay) {
      this._regenAcc += dt;
      if (this._regenAcc >= this.def.regen.rate) {
        this._regenAcc = 0; this.hp = Math.min(this.maxHp, this.hp + 1); this._regenFlash = 0.5;
        for (let i = 0; i < 4; i++) { const ra = -Math.PI / 2 + (Math.random() - 0.5) * 1.4, rs = 18 + Math.random() * 28; game.particles.push(new Particle(this.x, this.y - 12 * this.drawScale, Math.cos(ra) * rs, Math.sin(ra) * rs, 0.45, '#86e0a0', 1, 60, { glow: true, shrink: true })); }
      }
    } else if (this.def.regen) { this._regenAcc = 0; }

    // Charger: telegraph a wind-up, then dash at the player; recover; repeat.
    if (this.def.charge) {
      const ch = this.def.charge, bx = CONFIG.world.castle.breachX;
      if (this.chargeState === 'windup') {
        this.chargeT -= dt; this.vx = 0; this.vy = 0;
        this.anim.play('walkRun', { fps: 4, loop: true }); this.anim.update(dt);
        if (this.chargeT <= 0) { this.chargeState = 'dash'; this.chargeT = ch.burst; this.vx = Math.cos(this._chargeAng) * ch.speed; this.vy = Math.sin(this._chargeAng) * ch.speed; }
        return;
      }
      if (this.chargeState === 'dash') {
        this.chargeT -= dt;
        this.x += this.vx * dt; this.y += this.vy * dt; this._clampField();
        if (this.vx < -6) this.anim.dir = 'l'; else if (this.vx > 6) this.anim.dir = 'r';
        this.faceAng = Math.atan2(this.vy, this.vx);
        this.anim.play('walkRun', { fps: 16, loop: true }); this.anim.update(dt);
        if (this.x <= bx) { this.breached = true; this.dead = true; }
        if (this.chargeT <= 0) { this.chargeState = 'seek'; this.chargeCd = ch.cd; }
        return;
      }
      this.chargeCd -= dt;
      const cd = Math.hypot(this.x - game.player.x, this.y - game.player.y);
      if (this.chargeCd <= 0 && cd <= ch.range && cd > 24 && !game._finalRush && (!this.def.boss || this.phase >= 2)) {
        this.chargeState = 'windup'; this.chargeT = ch.windup;
        this._chargeAng = Math.atan2(game.player.y - this.y, game.player.x - this.x);
        this.faceAng = this._chargeAng; this.vx = 0; this.vy = 0;
        return;
      }
      // else fall through to the normal seek below
    }

    // Caster: fire a straight, fast bolt on a cooldown while still advancing.
    if (this.def.type === 'caster') {
      const d = Math.hypot(this.x - game.player.x, this.y - game.player.y);
      this.throwCd -= dt;
      if (d <= this.def.castRange && d > 40 && this.throwCd <= 0) {
        this.throwCd = this.def.castEvery * (0.85 + 0.3 * Math.random());
        if (game.spawnEnemyBolt) game.spawnEnemyBolt(this);
      }
    }

    if (this.def.type === 'thrower') {
      // Throwers lob projectiles on a cooldown but KEEP ADVANCING toward the gate — they no
      // longer camp at max range (which left them "stuck" and hard to engage). Fall through to seek.
      const d = Math.hypot(this.x - game.player.x, this.y - game.player.y);
      this.throwCd -= dt;
      if (d <= this.def.throwRange && d > 40 && this.throwCd <= 0) {
        this.throwCd = this.def.throwEvery * (0.85 + 0.3 * Math.random());
        game.spawnEnemyProjectile(this);
      }
    }

    // Seek the castle's east face + separation so the horde fans out.
    const c = CONFIG.world.castle;
    const ty = Math.max(c.y0, Math.min(c.y1, this.y));
    const ang = Math.atan2(ty - this.y, c.breachX - this.x);
    this.faceAng = ang;                  // forward direction (used by the front-shield check)
    // Stragglers charge the gate fast so the wave always resolves (they reach the gate and breach
    // quickly even if the player can't land the final shot), instead of crawling/kiting forever.
    const baseSpd = (game._finalRush ? Math.max(this.def.speed * 2.2, 90) : this.def.speed) * (this._berserk || 1);
    const spd = baseSpd * (this.slowT > 0 ? 0.6 : 1);
    const desVx = Math.cos(ang) * spd, desVy = Math.sin(ang) * spd;
    let px = 0, py = 0;
    const es = game.enemies;
    for (let i = 0; i < es.length; i++) {
      const o = es[i];
      if (o === this || o.dead) continue;
      const sx = this.x - o.x, sy = this.y - o.y;
      const dist = Math.hypot(sx, sy);
      if (dist > 0 && dist < 14) { const f = 1 - dist / 14; px += sx / dist * f; py += sy / dist * f; }
    }
    const STEER = Math.min(1, 6 * dt), SEP = 130;
    this.vx += (desVx - this.vx) * STEER + px * SEP * dt;
    this.vy += (desVy - this.vy) * STEER + py * SEP * dt;
    this.x += this.vx * dt; this.y += this.vy * dt;
    this._clampField();
    this.state = 'walk';
    if (this.vx < -6) this.anim.dir = 'l';       // face travel dir, with a deadzone so a
    else if (this.vx > 6) this.anim.dir = 'r';   // jittering near-zero vx doesn't flip every frame
    this.anim.play('walkRun', { fps: 11, loop: true });
    this.anim.update(dt);
    if (this.x <= c.breachX) { this.breached = true; this.dead = true; }
  }
  draw(ctx, game) {
    const yo = this.state === 'walk' ? Math.round(Math.sin(this.bob)) : 0;
    // Spawn-in: grow from the ground (feet-anchored), so it reads as popping up.
    const sp = this.spawnT > 0 ? Math.max(0, 1 - this.spawnT / 0.3) : 1;
    const s = this.drawScale * (this.spawnT > 0 ? 0.4 + 0.6 * sp : 1);
    drawShadow(ctx, this.x, this.y, 15 * s);
    if (this.slowT > 0) { ctx.save(); ctx.globalAlpha = 0.5; ctx.strokeStyle = '#9fdcff'; ctx.lineWidth = 1; ctx.beginPath(); ctx.ellipse(this.x, this.y, 8 * s, 3 * s, 0, 0, Math.PI * 2); ctx.stroke(); ctx.restore(); }
    drawSprite(ctx, this.anim.image(), this.x, this.y + yo, s,
      { flash: this.hurtFlash > 0 ? Math.min(1, this.hurtFlash / 0.18) : 0, alpha: this.spawnT > 0 ? 0.55 + 0.45 * sp : 1 });
    // Body recolor (shaman/revenant): translucent tint overlay so the archetype reads at a glance.
    if (this.def.tint && this.state !== 'dying') {
      const img = this.anim.image(), tn = _tintVersion(img, this.def.tint);
      if (tn && img && img.width) {
        const w = img.width * s, h = img.height * s;
        ctx.save(); ctx.globalAlpha = (this.spawnT > 0 ? 0.55 + 0.45 * sp : 1) * 0.5;
        ctx.drawImage(tn, Math.round(this.x - w / 2), Math.round((this.y + yo) - h), w, h); ctx.restore();
      }
    }
    // Shield Warden: a plate arc on the front side; flares when it deflects a hit.
    if (this.def.shield === 'front' && this.state !== 'dying' && this.spawnT <= 0) {
      ctx.save(); ctx.translate(this.x, this.y - 11 * s); ctx.rotate(this.faceAng);
      ctx.globalAlpha = this._blockFlash > 0 ? 1 : 0.85;
      ctx.strokeStyle = this._blockFlash > 0 ? '#eaf6ff' : '#aebfd4'; ctx.lineWidth = 2.4;
      ctx.beginPath(); ctx.arc(6 * s, 0, 7 * s, -1.05, 1.05); ctx.stroke();
      ctx.restore();
    }
    // Charger: pulsing wind-up ring + a line aimed where it will dash.
    if (this.chargeState === 'windup') {
      const k = 1 - this.chargeT / this.def.charge.windup;
      ctx.save();
      ctx.globalAlpha = 0.45 + 0.4 * Math.abs(Math.sin(k * Math.PI * 6));
      ctx.strokeStyle = '#ff5a4a'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(this.x, this.y, (6 + 16 * k) * s, (3 + 7 * k) * s, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(this.x, this.y - 8 * s);
      ctx.lineTo(this.x + Math.cos(this._chargeAng) * 22 * s, this.y - 8 * s + Math.sin(this._chargeAng) * 22 * s); ctx.stroke();
      ctx.restore();
    }
    // Regenerator: a green pulse ring on each heal tick.
    if (this.def.regen && this._regenFlash > 0 && this.state !== 'dying') {
      ctx.save(); ctx.globalAlpha = this._regenFlash; ctx.strokeStyle = '#86e0a0'; ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.ellipse(this.x, this.y, 11 * s, 4 * s, 0, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
    }
    // Boss: red flash on phase change; persistent ember tint while enraged (phase 3).
    if (this.def.boss && this.state !== 'dying') {
      const ph = (this._phaseFlash > 0 ? this._phaseFlash : 0) + (this.phase === 3 ? 0.28 : 0);
      if (ph > 0) {
        const img = this.anim.image(), rt = _tintVersion(img, '#ff4530');
        if (rt && img && img.width) { const w = img.width * s, h = img.height * s; ctx.save(); ctx.globalAlpha = Math.min(0.7, ph); ctx.drawImage(rt, Math.round(this.x - w / 2), Math.round((this.y + yo) - h), w, h); ctx.restore(); }
      }
    }
    // FROZEN: tint the body icy-blue + orbiting sparkles + frost ring while a freeze is active.
    if (game && game.runState && game.runState.active.freezeT > 0 && this.state !== 'dying') {
      const a = Math.min(0.85, game.runState.active.freezeT / 4 + 0.3);
      const img = this.anim.image(), ice = _tintVersion(img, '#8fd0ff');
      if (ice && img && img.width) {
        const w = img.width * s, h = img.height * s;
        const ix = Math.round(this.x - w / 2), iy = Math.round((this.y + yo) - h);
        ctx.save(); ctx.globalAlpha = 0.6 * a; ctx.drawImage(ice, ix, iy, w, h); ctx.restore();
      }
      ctx.save();
      ctx.globalAlpha = a; ctx.fillStyle = '#eaf7ff';                 // ice sparkles
      for (let i = 0; i < 5; i++) {
        const ang = (i / 5) * Math.PI * 2 + this.bob * 0.5;
        ctx.fillRect(Math.round(this.x + Math.cos(ang) * 9 * s) - 1, Math.round(this.y - 12 * s + Math.sin(ang) * 7 * s) - 1, 2, 2);
      }
      ctx.globalAlpha = a * 0.5; ctx.strokeStyle = '#9fdcff'; ctx.lineWidth = 1;   // frost ring
      ctx.beginPath(); ctx.ellipse(this.x, this.y, 11 * s, 4 * s, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    }
    if (this.maxHp > 1 && this.state !== 'dying' && this.spawnT <= 0) {
      const w = 14, x0 = Math.round(this.x - w / 2), y0 = Math.round(this.y - 22 * s - 5);
      ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(x0 - 1, y0 - 1, w + 2, 4);
      ctx.fillStyle = '#7bd66a';
      ctx.fillRect(x0, y0, Math.round(w * Math.max(0, this.hp) / this.maxHp), 2);
    }
  }
};

// ---- Allied knight (summoned for one wave; hunts monsters in melee) ----
window.Ally = class {
  constructor(key, x, y) {
    this.key = key; this.x = x; this.y = y; this.vx = 0; this.vy = 0;
    this.scale = 2.0;
    this.anim = new Animator(key); this.anim.dir = 'l';
    this.dead = false; this.bob = Math.random() * Math.PI * 2;
    this.atkCd = 0; this.state = 'walk';
  }
  get feetY() { return this.y; }
  get drawScale() { return this.scale * (0.92 + 0.16 * (this.y / CONFIG.world.H)); }
  update(dt, game) {
    this.bob += dt * 6;
    if (this.atkCd > 0) this.atkCd -= dt;
    let best = null, bd = 1e9;
    for (const e of game.enemies) {
      if (e.dead || e.state === 'dying') continue;
      const d = Math.hypot(e.x - this.x, e.y - this.y);
      if (d < bd) { bd = d; best = e; }
    }
    if (!best) { this.state = 'idle'; this.anim.play('idle', { fps: 6, loop: true }); this.anim.update(dt); return; }
    const reach = 20;
    if (bd > reach) {
      const ang = Math.atan2(best.y - this.y, best.x - this.x);
      const spd = 88;
      this.vx = Math.cos(ang) * spd; this.vy = Math.sin(ang) * spd;
      this.x += this.vx * dt; this.y += this.vy * dt;
      const w = CONFIG.world; this.y = Math.max(w.margin, Math.min(w.H - w.margin, this.y));
      if (this.vx < -6) this.anim.dir = 'l'; else if (this.vx > 6) this.anim.dir = 'r';
      this.state = 'walk'; this.anim.play('walkRun', { fps: 11, loop: true }); this.anim.update(dt);
    } else {
      this.anim.dir = best.x <= this.x ? 'l' : 'r';
      this.state = 'attack'; this.anim.play('attack', { fps: 12, loop: true }); this.anim.update(dt);
      if (this.atkCd <= 0) { this.atkCd = 0.55; best.takeDamage(2, game, Math.atan2(best.y - this.y, best.x - this.x)); }
    }
  }
  draw(ctx) {
    const yo = this.state === 'walk' ? Math.round(Math.sin(this.bob)) : 0;
    const s = this.drawScale;
    drawShadow(ctx, this.x, this.y, 15 * s);
    ctx.save(); ctx.globalAlpha = 0.45; ctx.strokeStyle = '#9fe8c0'; ctx.lineWidth = 1;   // friendly ring
    ctx.beginPath(); ctx.ellipse(this.x, this.y, 9 * s, 3.5 * s, 0, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
    drawSprite(ctx, this.anim.image(), this.x, this.y + yo, s);
  }
};

// ---- Enemy projectile (thrown stick, arcs) -----------------------------
window.EnemyProjectile = class {
  constructor(x, y, vx, vy, opts) {
    this.x = x; this.y = y; this.vx = vx; this.vy = vy; this.dead = false; this.spin = 0;
    this.bolt = !!(opts && opts.bolt);                 // caster bolt: flies straight, glows
    this.col = (opts && opts.color) || '#b483ff';
  }
  update(dt) {
    if (!this.bolt) this.vy += CONFIG.GRAVITY * 0.6 * dt;   // thrown sticks arc; bolts fly straight
    this.x += this.vx * dt; this.y += this.vy * dt;
    this.spin += dt * 12;
    const w = CONFIG.world;
    if (this.x < -20 || this.x > w.W + 20 || this.y < -20 || this.y > w.H + 20) this.dead = true;
  }
  box() { return { x: this.x - 4, y: this.y - 4, w: 8, h: 8 }; }
  draw(ctx) {
    if (this.bolt) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = this.col;
      ctx.globalAlpha = 0.35; ctx.beginPath(); ctx.arc(this.x, this.y, 6, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 0.95; ctx.beginPath(); ctx.arc(this.x, this.y, 3, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    } else {
      drawRot(ctx, Assets.weapon('stick'), this.x, this.y, 1, this.spin, 0.5, 0.5);
    }
  }
};

// ---- Cosmetic coin (magnet juice) --------------------------------------
window.Coin = class {
  constructor(x, y) {
    this.x = x; this.y = y; this.groundY = y;
    const a = -Math.PI / 2 + (Math.random() - 0.5) * 1.5;
    const sp = 50 + Math.random() * 60;
    this.vx = Math.cos(a) * sp; this.vy = Math.sin(a) * sp;
    this.dead = false; this.life = 6; this.glint = Math.random() * Math.PI * 2;
  }
  update(dt, game) {
    this.life -= dt; if (this.life <= 0) { this.dead = true; return; }
    this.glint += dt * 12;
    const p = game.player;
    const dx = p.x - this.x, dy = (p.y - 6) - this.y, d = Math.hypot(dx, dy);
    if (d < CONFIG.juice.magnetRadius) {
      this.vx += dx / d * CONFIG.juice.magnetAccel * dt;
      this.vy += dy / d * CONFIG.juice.magnetAccel * dt;
      const sp = Math.hypot(this.vx, this.vy), mx = CONFIG.juice.magnetMax;
      if (sp > mx) { this.vx = this.vx / sp * mx; this.vy = this.vy / sp * mx; }
      if (d < 7) { this.dead = true; if (game._onCoinCollected) game._onCoinCollected(this); }
    } else {
      this.vy += 320 * dt; this.vx *= Math.pow(0.25, dt);
      if (this.y > this.groundY) { this.y = this.groundY; this.vy = 0; }
    }
    this.x += this.vx * dt; this.y += this.vy * dt;
  }
  draw(ctx) {
    drawShadow(ctx, this.x, this.groundY, 6, 0.2);
    const x = Math.round(this.x), y = Math.round(this.y);
    ctx.fillStyle = '#c98521'; ctx.fillRect(x - 1, y - 1, 3, 3);
    ctx.fillStyle = '#f2b03c'; ctx.fillRect(x - 1, y - 1, 2, 2);
    if (Math.sin(this.glint) > 0.6) { ctx.fillStyle = '#ffe9a8'; ctx.fillRect(x, y - 1, 1, 1); }
  }
};

// ---- Spawn marker: a ring that pops from the ground, then hatches an enemy ----
window.SpawnMarker = class {
  constructor(x, y, key, def) {
    this.x = x; this.y = y; this.key = key; this.def = def;
    this.t = 0; this.life = 0.62; this.dead = false; this.hatched = false; this._dust = 0;
  }
  update(dt, game) {
    this.t += dt;
    this._dust -= dt;
    if (this._dust <= 0 && game._spawnDust) { this._dust = 0.1; game._spawnDust(this.x + (Math.random() - 0.5) * 12, this.y); }
    if (this.t >= this.life && !this.hatched) {
      this.hatched = true; this.dead = true;
      if (game._hatchEnemy) game._hatchEnemy(this.key, this.def, this.x, this.y);
    }
  }
  draw(ctx) {
    const p = Math.min(1, this.t / this.life);
    const r = 6 + p * 26;                                    // expanding ground circle
    ctx.save();
    ctx.lineCap = 'round';
    // soft filled disc growing out of the ground
    ctx.globalAlpha = 0.32 * (1 - p) + 0.06;
    ctx.fillStyle = '#ff7a4a';
    ctx.beginPath(); ctx.ellipse(this.x, this.y, r * 0.85, r * 0.36, 0, 0, Math.PI * 2); ctx.fill();
    // bright expanding ring (gold -> danger red)
    ctx.globalAlpha = 0.9 * (1 - p) + 0.18;
    ctx.strokeStyle = p < 0.55 ? '#ffd166' : '#ff5a44';
    ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.ellipse(this.x, this.y, r, r * 0.42, 0, 0, Math.PI * 2); ctx.stroke();
    // inner pulse ring
    ctx.globalAlpha = 0.5 * (1 - p);
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.ellipse(this.x, this.y, r * 0.55, r * 0.23, 0, 0, Math.PI * 2); ctx.stroke();
    if (p > 0.45) {                                          // upward spark beam just before it hatches
      ctx.globalAlpha = (p - 0.45) * 1.6; ctx.fillStyle = '#ffe9a8';
      const h = Math.round((p - 0.45) * 26);
      ctx.fillRect(Math.round(this.x) - 1, Math.round(this.y - h), 2, h);
    }
    ctx.restore();
  }
};

// ---- Particles & floating text -----------------------------------------
window.Particle = class {
  constructor(x, y, vx, vy, life, color, size, grav, opts = {}) {
    this.x = x; this.y = y; this.vx = vx; this.vy = vy;
    this.life = life; this.max = life; this.color = color; this.size = size || 2;
    this.grav = grav == null ? 300 : grav; this.dead = false;
    this.glow = !!opts.glow; this.shrink = !!opts.shrink; this.drag = opts.drag || 0;
  }
  update(dt) {
    this.vy += this.grav * dt;
    if (this.drag) { const f = Math.pow(1 / (1 + this.drag), dt); this.vx *= f; this.vy *= f; }
    this.x += this.vx * dt; this.y += this.vy * dt;
    this.life -= dt; if (this.life <= 0) this.dead = true;
  }
  draw(ctx) {
    const k = Math.max(0, this.life / this.max);
    ctx.save();
    ctx.globalAlpha = k;
    if (this.glow) ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = this.color;
    const s = this.shrink ? Math.max(1, Math.round(this.size * k)) : this.size;
    ctx.fillRect(Math.round(this.x), Math.round(this.y), s, s);
    ctx.restore();
  }
};

window.FloatingText = class {
  constructor(x, y, text, color, opts = {}) {
    this.x = x; this.y = y; this.text = text; this.color = color || '#ffd87a';
    this.life = opts.life || 0.95; this.max = this.life; this.dead = false;
    this.vy = opts.vy || -26; this.size = opts.size || 8;
  }
  update(dt) { this.y += this.vy * dt; this.vy *= Math.pow(0.12, dt); this.life -= dt; if (this.life <= 0) this.dead = true; }
  draw(ctx) {
    const k = this.life / this.max;                 // 1 → 0 over the lifetime
    const fadeIn = Math.min(1, (this.max - this.life) / 0.1);   // quick pop-in
    const fadeOut = Math.min(1, k * 1.6);                       // smooth tail-out
    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(fadeIn, fadeOut));
    ctx.font = `bold ${this.size}px "Fredoka", system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(0,0,0,0.75)';
    ctx.strokeText(this.text, this.x, this.y);
    ctx.fillStyle = this.color;
    ctx.fillText(this.text, this.x, this.y);
    ctx.restore();
  }
};
