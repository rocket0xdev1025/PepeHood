// ====================================================================
//  Sherwood Standoff — free-roam valley, scrolling camera, waves, shop.
//  Renders a 480x270 viewport into a larger world; integer-upscaled.
// ====================================================================

function makeRunState() {
  return {
    gold: 0, goldEarned: 0,
    upgrades: { damage: 0, firerate: 0, fastdraw: 0, maxheart: 0, movespeed: 0,
                multishot: 0, pierce: 0, fire: 0, frost: 0, explosive: 0, goldfind: 0, aimassist: 0, aimline: 0 },
    inventory: { fullheal: 0, volley: 0, freeze: 0, rapidfire: 0, shield: 0, windfall: 0 },
    active: { freezeT: 0, rapidfireT: 0, shieldHits: 0 },
  };
}

window.Game = class {
  constructor(canvas) {
    this.cv = canvas;
    this.ctx = canvas.getContext('2d');

    this.state = 'menu';
    this.onGameOver = null;
    this.onShop = null;

    this.mouse = { x: CONFIG.VIEW_W * 0.7, y: CONFIG.VIEW_H * 0.5, down: false };
    this.keys = {};
    this.menuAnim = new Animator('robinHood');

    this.hud = {
      root: document.getElementById('hud'),
      hearts: document.getElementById('hud-hearts'),
      gold: document.getElementById('hud-gold'),
      wave: document.getElementById('hud-wave'),
      combo: document.getElementById('hud-combo'),
      items: document.getElementById('hud-items'),
    };
    this._itemsSig = null;
    this.viewScale = 1;
    this.zoomMult = CONFIG.world.zoom;   // 2 / 5 / 10 (cycle with Z)

    this.reset();
    this._buildTerrain();
    this._bindInput();
    this.resize();
    window.addEventListener('resize', () => this.resize());
    window.addEventListener('orientationchange', () => this.resize());

    this._last = 0;
    requestAnimationFrame((t) => this._frame(t));
  }

  reset() {
    this.player = null;
    this.enemies = [];
    this.allies = [];       // summoned knights (live for one wave)
    this.markers = [];      // pending spawn telegraphs (ring pops, then hatches an enemy)
    this.arrows = [];
    this.eprojectiles = [];
    this.particles = [];
    this.texts = [];
    this.coins = [];
    this.runState = makeRunState();
    this.kills = 0;
    this._btKills = 0;
    this.combo = 1;
    this.comboTimer = 0;
    this.wave = 1;
    this.waveActive = false;
    this.waveRoster = [];
    this.waveClock = 0;
    this.trauma = 0;
    this.flash = 0;
    this.hitStop = 0;
    this.camera = { x: 0, y: 0 };
    this.banner = null;
  }

  start(hero) {
    this.reset();
    this.player = new Player(hero);
    const w = CONFIG.world;
    this.camera.x = this.player.x - CONFIG.VIEW_W * this.zoomMult * w.anchorX;
    this.camera.y = this.player.y - CONFIG.VIEW_H * this.zoomMult * w.anchorY;
    this._clampCamera();
    this._startWave(1);
    this.state = 'playing';
    Sfx.resume();
  }
  _clampCamera() {
    const w = CONFIG.world, vw = CONFIG.VIEW_W * this.zoomMult, vh = CONFIG.VIEW_H * this.zoomMult;
    this.camera.x = vw >= w.W ? (w.W - vw) / 2 : Math.max(0, Math.min(w.W - vw, this.camera.x));
    this.camera.y = vh >= w.H ? (w.H - vh) / 2 : Math.max(0, Math.min(w.H - vh, this.camera.y));
  }
  toMenu() { this.state = 'menu'; this.reset(); }

  // ---- Display ------------------------------------------------------
  resize() {
    const dpr = Math.max(1, Math.min(window.devicePixelRatio || 1, 3));
    const host = this.cv.parentElement || document.body;
    const availW = host.clientWidth || window.innerWidth;
    const availH = host.clientHeight || window.innerHeight;
    let s = Math.min(availW / CONFIG.VIEW_W, availH / CONFIG.VIEW_H);
    s = s >= 1 ? Math.floor(s) : s;
    s = Math.max(0.25, s);
    this.viewScale = s;
    const cssW = CONFIG.VIEW_W * s, cssH = CONFIG.VIEW_H * s;
    this.cv.style.width = cssW + 'px';
    this.cv.style.height = cssH + 'px';
    this.cv.width = Math.round(cssW * dpr);
    this.cv.height = Math.round(cssH * dpr);
    this.ctx.setTransform(s * dpr, 0, 0, s * dpr, 0, 0);
    this.ctx.imageSmoothingEnabled = false;
  }
  _toView(clientX, clientY) {
    const r = this.cv.getBoundingClientRect();
    return {
      x: (clientX - r.left) * (CONFIG.VIEW_W / r.width),
      y: (clientY - r.top) * (CONFIG.VIEW_H / r.height),
    };
  }

  // ---- Input ---------------------------------------------------------
  _bindInput() {
    const cv = this.cv;
    const resetInput = () => {
      this.keys = {};
      this.mouse.down = false;
      if (this.player) { this.player.charging = false; this.player.charge = 0; }
    };
    window.addEventListener('blur', resetInput);
    document.addEventListener('visibilitychange', () => { if (document.hidden) resetInput(); });
    cv.addEventListener('touchcancel', resetInput, { passive: false });

    cv.addEventListener('mousemove', (e) => { const p = this._toView(e.clientX, e.clientY); this.mouse.x = p.x; this.mouse.y = p.y; });
    cv.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      this.mouse.down = true;
      if (this.state === 'playing' && this.player) { this.player.charging = true; this.player.charge = 0; Sfx.draw(); }
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button !== 0) return;
      this.mouse.down = false;
      if (this.player && this.player.charging) {
        if (this.state === 'playing') this.player.fire(this);
        this.player.charging = false; this.player.charge = 0;
      }
    });
    cv.addEventListener('touchstart', (e) => {
      e.preventDefault();
      const t = e.changedTouches[0]; const p = this._toView(t.clientX, t.clientY);
      this.mouse.x = p.x; this.mouse.y = p.y; this.mouse.down = true;
      if (this.state === 'playing' && this.player) { this.player.charging = true; this.player.charge = 0; Sfx.draw(); }
    }, { passive: false });
    cv.addEventListener('touchmove', (e) => {
      e.preventDefault();
      const t = e.changedTouches[0]; const p = this._toView(t.clientX, t.clientY);
      this.mouse.x = p.x; this.mouse.y = p.y;
    }, { passive: false });
    window.addEventListener('touchend', () => {
      this.mouse.down = false;
      if (this.player && this.player.charging) {
        if (this.state === 'playing') this.player.fire(this);
        this.player.charging = false; this.player.charge = 0;
      }
    });
    window.addEventListener('keydown', (e) => {
      const ae = document.activeElement;
      if (ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA' || ae.isContentEditable)) return;
      this.keys[e.code] = true;
      if (e.code === 'KeyP' || e.code === 'Escape') {
        if (this.state === 'playing') { this.state = 'paused'; if (this.player) { this.player.charging = false; this.player.charge = 0; } }
        else if (this.state === 'paused') this.state = 'playing';
      }
      if (e.code === 'KeyM') { Sfx.setMuted(!Sfx.isMuted()); this._syncMute(); }
      if (e.code === 'KeyZ') {
        const levels = [2, 5, 10];
        this.zoomMult = levels[(levels.indexOf(this.zoomMult) + 1) % levels.length];
        if (this.player) this._clampCamera();
        this._setBanner('ZOOM ' + this.zoomMult + '×', 1.1);
      }
      if (this.state === 'playing' && /^Digit[1-6]$/.test(e.code)) {
        const c = CONFIG.shop.consumables[parseInt(e.code.slice(5), 10) - 1];
        if (c) this.activateConsumable(c.key);
      }
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code) && this.state === 'playing') e.preventDefault();
    });
    window.addEventListener('keyup', (e) => { this.keys[e.code] = false; });
  }
  _syncMute() { const el = document.getElementById('mute-ind'); if (el) el.innerHTML = window.icon(Sfx.isMuted() ? 'soundOff' : 'soundOn'); }

  // ---- Wave director -------------------------------------------------
  _waveCount(n) { const w = CONFIG.waves; return Math.round(w.countBase + w.countLin * (n - 1) + w.countPow * Math.pow(n - 1, w.countExp)); }
  // Soft-cap HP growth so very deep waves stay finite (a wave-50 boss would otherwise need ~350
  // hits). Past the knee (~wave 33) rising enemy count + speed carry the difficulty instead.
  _hpMult(n) { return Math.min(12, Math.pow(CONFIG.waves.hpBase, n - 1)); }
  _speedMult(n) { const w = CONFIG.waves; return Math.min(w.speedCap, 1 + w.speedPerWave * (n - 1)); }
  _spawnGap(n) { const w = CONFIG.waves; return Math.max(w.spawnGapMin, w.spawnGapStart - w.spawnGapPerWave * (n - 1)); }
  _pickType(n) {
    const allowed = [];
    for (const key in ENEMIES) if (CONFIG.waves.unlock[key] <= n) allowed.push([key, ENEMIES[key]]);
    let total = 0; for (const [, d] of allowed) total += d.weight;
    let r = Math.random() * total;
    for (const [key, d] of allowed) { r -= d.weight; if (r <= 0) return key; }
    return allowed[0][0];
  }
  _buildRoster(n) {
    const roster = [];
    const count = this._waveCount(n);
    const gap = this._spawnGap(n);
    // On-screen, right-biased spawn points (telegraphed) so spawns are always visible.
    const spots = ['right', 'right', 'right', 'ne', 'se', 'upper', 'lower'];
    let t = 0.4;
    for (let i = 0; i < count; i++) {
      const key = this._pickType(n);
      const spot = n >= 2 ? spots[(Math.random() * spots.length) | 0] : 'right';
      t += gap * (0.7 + Math.random() * 0.6);
      roster.push({ key, spot, r: Math.random(), r2: Math.random(), delay: t });
    }
    if (n % CONFIG.waves.bossEvery === 0) {
      t += gap;
      // Every 10th wave = Morgan le Fay, the arch-boss. Other boss waves (5/15/25…) alternate
      // the regular Troll / Mordred.
      let bossKey, arch = false;
      if (n % CONFIG.waves.archEvery === 0) { bossKey = 'morgan'; arch = true; }
      else { bossKey = (((n / CONFIG.waves.bossEvery - 1) / 2) % 2 === 0) ? 'troll' : 'mordred'; }
      roster.push({ key: bossKey, spot: 'right', r: 0.5, r2: 0.5, delay: t, boss: true, arch });
    }
    return roster;
  }
  _startWave(n) {
    this.wave = n;
    this.waveRoster = this._buildRoster(n);
    this.waveClock = 0;
    this.waveActive = true;
    this._setBanner('WAVE ' + n, 1.4);
  }
  _spawnDescriptor(d) {
    const base = ENEMIES[d.key];
    const hpMult = this._hpMult(this.wave) * (d.boss ? CONFIG.waves.bossHpMult : 1) * (d.arch ? CONFIG.waves.archHpMult : 1);
    const def = Object.assign({}, base, { hp: Math.ceil(base.hp * hpMult), speed: base.speed * this._speedMult(this.wave) });
    if (d.boss) { def.boss = true; def.scale = base.scale * (d.arch ? CONFIG.waves.archScale : 1.25); }
    if (d.arch) def.arch = true;
    // Choose a point INSIDE the visible view, biased to the right, so the spawn
    // telegraph (ring) is always seen and enemies never slide in off-screen.
    const w = CONFIG.world, cam = this.camera, M = 30;
    const vw = CONFIG.VIEW_W * this.zoomMult, vh = CONFIG.VIEW_H * this.zoomMult;
    const vx0 = Math.max(0, cam.x), vx1 = Math.min(w.W, cam.x + vw);
    const vy0 = Math.max(0, cam.y), vy1 = Math.min(w.H, cam.y + vh);
    const lerp = (a, b, t) => a + (b - a) * t;
    const gw = vx1 - vx0, gh = vy1 - vy0;
    let x, y;
    switch (d.spot) {
      case 'ne':    x = lerp(vx0 + gw * 0.66, vx1 - M, d.r); y = lerp(vy0 + M, vy0 + gh * 0.28, d.r2); break;
      case 'se':    x = lerp(vx0 + gw * 0.66, vx1 - M, d.r); y = lerp(vy0 + gh * 0.72, vy1 - M, d.r2); break;
      case 'upper': x = lerp(vx0 + gw * 0.45, vx1 - M, d.r); y = lerp(vy0 + M, vy0 + gh * 0.22, d.r2); break;
      case 'lower': x = lerp(vx0 + gw * 0.45, vx1 - M, d.r); y = lerp(vy0 + gh * 0.78, vy1 - M, d.r2); break;
      default:      x = lerp(vx0 + gw * 0.62, vx1 - M, d.r); y = lerp(vy0 + gh * 0.20, vy0 + gh * 0.80, d.r2); break;  // right band
    }
    x = Math.max(w.castle.breachX + 60, Math.min(w.W - 12, x));
    y = Math.max(w.margin, Math.min(w.H - w.margin, y));
    // Never pop right on top of the player.
    if (this.player && Math.hypot(x - this.player.x, y - this.player.y) < 80) {
      x = Math.min(w.W - 12, x + 90);
    }
    this.markers.push(new SpawnMarker(x, y, d.key, def));
  }
  _hatchEnemy(key, def, x, y) {
    const e = new Enemy(key, def, x, y);
    e.spawnT = 0.3;            // emerge/scale-in
    this.enemies.push(e);
    if (this._spawnDust) { this._spawnDust(x, y); this._spawnDust(x + 4, y + 2); }
  }
  _enterShop() {
    this.state = 'shop';
    this.arrows = []; this.eprojectiles = []; this.coins = []; this.markers = []; this.allies = [];
    this.runState.active = { freezeT: 0, rapidfireT: 0, shieldHits: 0 };   // power-ups don't carry between waves
    this.combo = 1; this.comboTimer = 0;
    if (this.player) { this.player.charging = false; this.player.charge = 0; }
    if (this.onShop) this.onShop(this.runState, this.wave);
  }
  finalScore() {
    const s = CONFIG.score;
    return Math.round(this.runState.goldEarned * s.goldWeight + this.kills * s.killWeight + (this.wave - 1) * s.waveWeight);
  }
  _setBanner(text, life) { this.banner = { text, life, max: life }; }

  // ---- Events --------------------------------------------------------
  onKill(enemy) {
    if (this.comboTimer > 0) this.combo = Math.min(CONFIG.combo.max, this.combo + 1);
    else this.combo = 1;
    this.comboTimer = CONFIG.combo.window;
    const up = this.runState.upgrades;
    const gold = Math.round(enemy.def.gold * this.combo * this.player.hero.goldMult * (1 + 0.2 * (up.goldfind || 0)) * CONFIG.economy.killGoldMult);
    this.runState.gold += gold;
    this.runState.goldEarned += gold;
    this.kills++;
    Sfx.kill(); Sfx.coin();
    this.hitStop = Math.max(this.hitStop, CONFIG.juice.hitStop);
    this.trauma = Math.min(1, this.trauma + 0.14);
    this.texts.push(new FloatingText(enemy.x, enemy.y - 22 * enemy.drawScale - 6,
      `+${gold}${this.combo > 1 ? ' ×' + this.combo : ''}`, '#ffd87a'));
    this._spawnCoinPop(enemy.x, enemy.y);
    // Death burst — a puff of dust so the enemy pops instead of just vanishing.
    const dcol = ['#6b5538', '#7d6a48', '#8a8276'];
    for (let i = 0; i < 9; i++) {
      const a = Math.random() * Math.PI * 2, sp = 45 + Math.random() * 75;
      this.particles.push(new Particle(enemy.x, enemy.y - 8 * enemy.drawScale, Math.cos(a) * sp, Math.sin(a) * sp * 0.6, 0.32 + Math.random() * 0.18, dcol[(Math.random() * dcol.length) | 0], 2, 90, { shrink: true }));
    }
    // Splitter (Ooze): burst into lesser copies that don't split again.
    if (enemy.def.splits && !enemy._isChild) {
      const childDef = Object.assign({}, enemy.def, { hp: 1, scale: enemy.def.scale * 0.58, splits: 0, gold: Math.max(2, Math.round(enemy.def.gold * 0.3)) });
      for (let i = 0; i < enemy.def.splits; i++) {
        const ca = (i / enemy.def.splits) * Math.PI * 2 + 0.6;
        const child = new Enemy(enemy.key, childDef, enemy.x + Math.cos(ca) * 10, enemy.y + Math.sin(ca) * 8);
        child.spawnT = 0.12; child._isChild = true;
        this.enemies.push(child);
      }
    }
    // Bloodthirst: heal a heart every N kills (N shrinks with level).
    const bt = up.bloodthirst || 0;
    if (bt > 0) {
      this._btKills = (this._btKills || 0) + 1;
      const thr = [18, 12, 8][bt - 1] || 8;
      if (this._btKills >= thr) {
        this._btKills = 0;
        if (this.player.hearts < this.player.maxHearts) {
          this.player.hearts++;
          this.texts.push(new FloatingText(this.player.x, this.player.y - 30, '+1', '#7bd66a'));
          for (let i = 0; i < 6; i++) { const a = -Math.PI / 2 + (Math.random() - 0.5) * 1.2, sp = 30 + Math.random() * 40; this.particles.push(new Particle(this.player.x, this.player.y - 10, Math.cos(a) * sp, Math.sin(a) * sp, 0.45, '#7bd66a', 1, 55, { glow: true, shrink: true })); }
        }
      }
    }
  }
  spawnEnemyProjectile(enemy) {
    const sx = enemy.x - 3, sy = enemy.y - 16 * enemy.drawScale;
    const tx = this.player.handX, ty = this.player.handY, t = 0.9;
    const vx = (tx - sx) / t;
    const vy = (ty - sy) / t - 0.5 * CONFIG.GRAVITY * 0.6 * t;
    this.eprojectiles.push(new EnemyProjectile(sx, sy, vx, vy));
  }
  spawnEnemyBolt(enemy) {
    const sx = enemy.x, sy = enemy.y - 14 * enemy.drawScale;
    const a = Math.atan2((this.player.y - 8) - sy, this.player.x - sx);
    const sp = enemy.def.projSpeed || 230;
    this.eprojectiles.push(new EnemyProjectile(sx, sy, Math.cos(a) * sp, Math.sin(a) * sp, { bolt: true, color: enemy.def.tint || '#b483ff' }));
  }
  _loseHeart(reason) {
    if (this.runState.active.shieldHits > 0) {
      this.runState.active.shieldHits--;
      this.trauma = Math.min(1, this.trauma + 0.3); this.flash = 0.4;
      this.texts.push(new FloatingText(this.player.x, this.player.y - 30, 'BLOCK', '#9fdcff'));
      return;
    }
    if (!this.player.hurt()) return;
    this.trauma = Math.min(1, this.trauma + (reason === 'breach' ? CONFIG.juice.traumaHeavy : CONFIG.juice.traumaLight));
    this.flash = 0.5; this.combo = 1; this.comboTimer = 0;
    if (reason === 'breach') Sfx.breach();
    this.texts.push(new FloatingText(this.player.x, this.player.y - 30, reason === 'breach' ? 'BREACH!' : '-1', '#e2604f'));
    if (this.player.hearts <= 0) this._gameOver();
  }
  _gameOver() {
    if (this.state === 'gameover') return;
    this.state = 'gameover';
    this.player.anim.play('death', { fps: 8, loop: false, reset: true });
    Sfx.over();
    if (this.onGameOver) this.onGameOver(this.finalScore(), this.wave, this.kills, this.runState.goldEarned);
  }
  activateConsumable(key) {
    if (this.state !== 'playing' || !this.player) return;
    const inv = this.runState.inventory;
    if (!inv[key] || inv[key] <= 0) return;
    const act = this.runState.active;
    switch (key) {
      case 'fullheal': {
        this.player.hearts = Math.min(this.player.maxHearts, this.player.hearts + 1);
        this._setBanner('HEAL +1', 0.9);
        this.texts.push(new FloatingText(this.player.x, this.player.y - 30, '+1', '#7bd66a'));
        for (let i = 0; i < 7; i++) { const ang = -Math.PI / 2 + (Math.random() - 0.5) * 1.3, sp = 30 + Math.random() * 45; this.particles.push(new Particle(this.player.x, this.player.y - 10, Math.cos(ang) * sp, Math.sin(ang) * sp, 0.5, '#7bd66a', 1, 55, { glow: true, shrink: true })); }
        break;
      }
      case 'volley': {
        const cx = this.player.handX, cy = this.player.handY, sp = CONFIG.player.arrowSpeedMax * 0.85;
        for (let i = 0; i < 14; i++) { const a = (i / 13) * Math.PI * 2; this.arrows.push(new Arrow(cx, cy, Math.cos(a) * sp, Math.sin(a) * sp, 2, 1, 0)); }
        this._setBanner('ARROW STORM', 0.9);
        break;
      }
      case 'freeze': act.freezeT = 4; this._setBanner('FROZEN', 0.9); break;
      case 'rapidfire': act.rapidfireT = 6; this._setBanner('RAPID FIRE', 0.9); break;
      case 'shield': act.shieldHits = 3; this._setBanner('SHIELDED', 0.9); break;
      case 'windfall': {
        const wd = CONFIG.shop.consumables.find((c) => c.key === 'windfall');
        const cost = wd ? wd.cost : 70;
        const jackpot = Math.random() < 0.05;                              // 5% chance for a big windfall
        const gain = jackpot
          ? cost * 2 + Math.floor(Math.random() * (cost * 3))              // jackpot: ~2x–5x cost
          : Math.floor(cost * 0.4) + Math.floor(Math.random() * (cost * 0.9));  // usual: ~0.4x–1.3x (EV ≈ break-even)
        this.runState.gold += gain; this.runState.goldEarned += gain;
        this._setBanner((jackpot ? 'JACKPOT! +' : '+') + gain + ' GOLD', jackpot ? 1.3 : 0.9);
        for (let i = 0; i < (jackpot ? 12 : 4); i++) this._spawnCoinPop(this.player.x, this.player.y - 8);
        break;
      }
      case 'thunderclap': {
        const R = 135, px = this.player.x, py = this.player.y;
        for (const e of this.enemies) {
          if (e.state === 'dying' || e.dead) continue;
          if (Math.hypot(e.x - px, e.y - py) <= R) e.takeDamage(3, this, Math.atan2(e.y - py, e.x - px));
        }
        this._setBanner('THUNDERCLAP', 0.9);
        this.trauma = Math.min(1, this.trauma + 0.45); this.flash = 0.3;
        for (let i = 0; i < 20; i++) { const a = i / 20 * Math.PI * 2; this.particles.push(new Particle(px, py, Math.cos(a) * 190, Math.sin(a) * 190, 0.4, '#cfe8ff', 2, 30, { glow: true, shrink: true })); }
        break;
      }
      case 'knights': {
        const types = ['lancelot', 'gawain', 'percival'];
        for (let i = 0; i < 3; i++) {
          const ang = (i / 3) * Math.PI * 2;
          const ax = this.player.x + Math.cos(ang) * 26, ay = this.player.y + Math.sin(ang) * 18;
          this.allies.push(new Ally(types[i % types.length], ax, ay));
          for (let j = 0; j < 8; j++) { const a2 = Math.random() * Math.PI * 2, sp = 40 + Math.random() * 50; this.particles.push(new Particle(ax, ay, Math.cos(a2) * sp, Math.sin(a2) * sp, 0.4, '#9fe8c0', 1, 40, { glow: true, shrink: true })); }
        }
        this._setBanner('KNIGHTS!', 1.0);
        break;
      }
    }
    inv[key]--;
    Sfx.coin();
  }

  // ---- Particle / coin spawners (juice) ------------------------------
  _spawnHitSparks(x, y, charge) {
    const n = 6 + Math.round((charge || 0) * 5);
    const cols = ['#ffffff', '#ffe9a8', '#f2b03c', '#c0392b'];
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 40 + Math.random() * (110 + (charge || 0) * 120);
      this.particles.push(new Particle(x, y, Math.cos(a) * sp, Math.sin(a) * sp - 26,
        0.16 + Math.random() * 0.26, cols[Math.floor(Math.random() * cols.length)],
        1 + Math.round(Math.random()), 130, { glow: i < Math.ceil(n * 0.45), shrink: true, drag: 5 }));
    }
  }
  _spawnCoinPop(x, y) {
    const n = 1 + Math.floor(Math.random() * 3);
    for (let i = 0; i < n; i++) this.coins.push(new Coin(x + (Math.random() - 0.5) * 6, y - 6));
    for (let i = 0; i < 3; i++) {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * 1.2, sp = 30 + Math.random() * 40;
      this.particles.push(new Particle(x, y - 8, Math.cos(a) * sp, Math.sin(a) * sp, 0.3, '#ffe9a8', 1, 160, { glow: true, shrink: true }));
    }
  }
  _spawnDust(x, y) {
    for (let i = 0; i < 2; i++) {
      const a = Math.PI / 2 + (Math.random() - 0.5) * 1.2, sp = 8 + Math.random() * 14;
      this.particles.push(new Particle(x + (Math.random() - 0.5) * 4, y - 1, Math.cos(a) * sp, -Math.random() * 10,
        0.3 + Math.random() * 0.2, '#cbb892', 1, 36, { shrink: true }));
    }
  }
  _spawnFireSpark(player, charge) {
    if (charge < 0.85) return;
    for (let i = 0; i < 4; i++) {
      const a = player.aim + (Math.random() - 0.5) * 0.8, sp = 30 + Math.random() * 40;
      this.particles.push(new Particle(player.handX, player.handY, Math.cos(a) * sp, Math.sin(a) * sp, 0.2, '#ffe9a8', 1, 30, { glow: true, shrink: true }));
    }
  }
  _onCoinCollected(coin) {
    this.particles.push(new Particle(coin.x, coin.y, 0, -20, 0.25, '#ffe9a8', 1, 20, { glow: true, shrink: true }));
  }
  _spawnBurn(x, y) {
    const a = -Math.PI / 2 + (Math.random() - 0.5) * 0.8, sp = 16 + Math.random() * 28;
    this.particles.push(new Particle(x + (Math.random() - 0.5) * 8, y - 10, Math.cos(a) * sp, Math.sin(a) * sp, 0.4,
      ['#ffd24a', '#ff8c42', '#e8585b'][(Math.random() * 3) | 0], 2, -20, { glow: true, shrink: true }));
  }
  _applyArrowFx(a, e) {
    const fx = a.fx;
    if (!fx) return;
    if (fx.frost) {
      e.slowT = Math.max(e.slowT, 1.4 + 0.6 * fx.frost);
      for (let i = 0; i < 4; i++) { const ang = Math.random() * Math.PI * 2, sp = 20 + Math.random() * 40; this.particles.push(new Particle(a.x, a.y, Math.cos(ang) * sp, Math.sin(ang) * sp, 0.35, '#9fdcff', 1, 40, { glow: true, shrink: true })); }
    }
    if (fx.fire) { e.burnT = Math.max(e.burnT, 2 + fx.fire); e.burnDmg = fx.fire; }
    if (fx.explode) {
      const R = 24 + 12 * fx.explode, dmg = Math.max(1, Math.round(a.dmg * 0.6));
      for (const o of this.enemies) { if (o === e || o.dead || o.state === 'dying' || (a.hitIds && a.hitIds.has(o))) continue; if (Math.hypot(o.x - a.x, o.y - a.y) < R) { o.takeDamage(dmg, this, Math.atan2(o.y - a.y, o.x - a.x)); if (a.hitIds) a.hitIds.add(o); } }
      for (let i = 0; i < 10; i++) { const ang = Math.random() * Math.PI * 2, sp = 60 + Math.random() * 120; this.particles.push(new Particle(a.x, a.y, Math.cos(ang) * sp, Math.sin(ang) * sp, 0.3, ['#fff', '#ffd24a', '#ff8c42', '#c0392b'][i % 4], 2, 120, { glow: i < 5, shrink: true, drag: 5 })); }
      this.trauma = Math.min(1, this.trauma + 0.1); this.hitStop = Math.max(this.hitStop, 0.04);
    }
  }

  // ---- Update --------------------------------------------------------
  update(dt) {
    if (this.state !== 'playing') {
      if (this.state === 'gameover' && this.player) this.player.anim.update(dt);
      this._updateFx(dt);
      return;
    }
    const rs = this.runState;
    if (rs.active.freezeT > 0) rs.active.freezeT = Math.max(0, rs.active.freezeT - dt);
    if (rs.active.rapidfireT > 0) rs.active.rapidfireT = Math.max(0, rs.active.rapidfireT - dt);

    const p = this.player;
    const mwx = this.camera.x + this.mouse.x * this.zoomMult, mwy = this.camera.y + this.mouse.y * this.zoomMult;
    const shX = p.x + (Math.cos(p.aim) >= 0 ? 4 : -4), shY = p.y - 16 * p.scale;
    p.aim = Math.atan2(mwy - shY, mwx - shX);
    p.input.left = !!(this.keys['KeyA'] || this.keys['ArrowLeft']);
    p.input.right = !!(this.keys['KeyD'] || this.keys['ArrowRight']);
    p.input.up = !!(this.keys['KeyW'] || this.keys['ArrowUp']);
    p.input.down = !!(this.keys['KeyS'] || this.keys['ArrowDown']);
    p.update(dt, this);
    this._updateCamera(dt);

    this.waveClock += dt;
    // Throttle how many enemies are on the field at once so deep waves (which can total 80+) don't
    // dump everything and tank the framerate. Over-cap entries stay queued and hatch as foes die;
    // per-wave totals and the wave-clear check are unchanged. Early waves stay under the cap.
    const fieldCap = Math.min(34, 12 + this.wave * 1.4);
    while (this.waveRoster.length && this.waveRoster[0].delay <= this.waveClock
      && this.enemies.length + this.markers.length < fieldCap) this._spawnDescriptor(this.waveRoster.shift());

    if (this.comboTimer > 0) { this.comboTimer -= dt; if (this.comboTimer <= 0) this.combo = 1; }

    for (const m of this.markers) m.update(dt, this);   // ring telegraphs hatch enemies
    this.markers = this.markers.filter((m) => !m.dead);
    // Final-rush: once no more spawns are pending and only stragglers remain, they charge
    // the gate fast (and throwers stop kiting) so the last enemy can never stall the wave.
    this._finalRush = this.waveActive && this.waveRoster.length === 0 && this.markers.length === 0
      && this.enemies.length === 1;
    for (const e of this.enemies) e.update(dt, this);
    for (const al of this.allies) al.update(dt, this);
    this.allies = this.allies.filter((a) => !a.dead);
    for (const a of this.arrows) a.update(dt);
    for (const pr of this.eprojectiles) pr.update(dt);
    for (const c of this.coins) c.update(dt, this);

    this._collide();

    for (const e of this.enemies) if (e.breached && !e._counted) { e._counted = true; this._loseHeart('breach'); }

    this.enemies = this.enemies.filter((e) => !e.dead);
    this.arrows = this.arrows.filter((a) => !a.dead);
    this.eprojectiles = this.eprojectiles.filter((pr) => !pr.dead);
    this.coins = this.coins.filter((c) => !c.dead);

    this._updateFx(dt);

    if (this.waveActive && this.waveRoster.length === 0 && this.markers.length === 0 && this.enemies.length === 0) {
      this.waveActive = false;
      this._setBanner('WAVE CLEARED', 1.2);
      this._enterShop();
    }
  }
  _updateCamera(dt) {
    const w = CONFIG.world, z = this.zoomMult;
    const vw = CONFIG.VIEW_W * z, vh = CONFIG.VIEW_H * z;
    const ax = w.anchorX * vw, ay = w.anchorY * vh, dzx = w.deadzoneX * z, dzy = w.deadzoneY * z;
    const sx = this.player.x - this.camera.x, sy = this.player.y - this.camera.y;
    let dx = this.camera.x, dy = this.camera.y;
    if (sx < ax - dzx) dx = this.player.x - (ax - dzx);
    else if (sx > ax + dzx) dx = this.player.x - (ax + dzx);
    if (sy < ay - dzy) dy = this.player.y - (ay - dzy);
    else if (sy > ay + dzy) dy = this.player.y - (ay + dzy);
    const k = Math.min(1, w.camFollow * dt);
    this.camera.x += (dx - this.camera.x) * k;
    this.camera.y += (dy - this.camera.y) * k;
    this._clampCamera();
  }
  _updateFx(dt) {
    if (this.banner) { this.banner.life -= dt; if (this.banner.life <= 0) this.banner = null; }
    for (const t of this.texts) t.update(dt);
    for (const pa of this.particles) pa.update(dt);
    this.texts = this.texts.filter((t) => !t.dead);
    this.particles = this.particles.filter((p) => !p.dead);
    if (this.particles.length > 320) this.particles.splice(0, this.particles.length - 320);
    if (this.trauma > 0) this.trauma = Math.max(0, this.trauma - dt * 1.4);
    if (this.flash > 0) this.flash = Math.max(0, this.flash - dt * 2);
  }
  _collide() {
    const up = this.runState ? this.runState.upgrades : {};
    const pad = 5 * (up.aimassist || 0);
    for (const a of this.arrows) {
      if (a.dead) continue;
      for (const e of this.enemies) {
        if (e.state === 'dying' || e.dead || a.hitIds.has(e)) continue;
        const b = e.hitBox();
        if (a.x >= b.x - pad && a.x <= b.x + b.w + pad && a.y >= b.y - pad && a.y <= b.y + b.h + pad) {
          e.takeDamage(a.dmg, this, a.angle);
          a.hitIds.add(e);
          this._applyArrowFx(a, e);
          this._spawnHitSparks(a.x, a.y, a.charge);
          if (a.charge >= 0.85) this.hitStop = Math.max(this.hitStop, 0.03);
          if (a.pierce > 0) a.pierce--; else { a.dead = true; break; }
        }
      }
    }
    const pb = this.player.bodyBox();
    for (const pr of this.eprojectiles) {
      if (pr.dead) continue;
      const b = pr.box();
      if (b.x < pb.x + pb.w && b.x + b.w > pb.x && b.y < pb.y + pb.h && b.y + b.h > pb.y) {
        pr.dead = true; this._loseHeart('hit'); break;
      }
    }
  }

  // ---- Render --------------------------------------------------------
  render() {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, CONFIG.VIEW_W, CONFIG.VIEW_H);
    ctx.fillStyle = '#17271b'; ctx.fillRect(0, 0, CONFIG.VIEW_W, CONFIG.VIEW_H);   // off-world backdrop

    ctx.save();
    const shake = this.trauma * this.trauma * CONFIG.juice.maxShake;
    if (shake > 0.2) ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake * 0.6);

    // Top-down terrain: blit the visible world region (size scales with zoom),
    // clamped to the terrain so off-world margins stay clear.
    const z = this.zoomMult, rs = 1 / z;
    const cx = Math.round(this.camera.x), cy = Math.round(this.camera.y);
    const vw = CONFIG.VIEW_W * z, vh = CONFIG.VIEW_H * z;
    if (this._terrain) {
      const t = this._terrain, scX = CONFIG.VIEW_W / vw, scY = CONFIG.VIEW_H / vh;
      let sx = cx, sy = cy, sw = vw, sh = vh, dx = 0, dy = 0, dw = CONFIG.VIEW_W, dh = CONFIG.VIEW_H;
      if (sx < 0) { dx = -sx * scX; dw += sx * scX; sw += sx; sx = 0; }
      if (sy < 0) { dy = -sy * scY; dh += sy * scY; sh += sy; sy = 0; }
      if (sx + sw > t.width) { dw -= (sx + sw - t.width) * scX; sw = t.width - sx; }
      if (sy + sh > t.height) { dh -= (sy + sh - t.height) * scY; sh = t.height - sy; }
      if (sw > 0 && sh > 0) ctx.drawImage(t, sx, sy, sw, sh, dx, dy, dw, dh);
    }

    ctx.save();
    ctx.scale(rs, rs);
    ctx.translate(-cx, -cy);   // world -> view (scaled by zoom)
    ctx.imageSmoothingEnabled = false;
    if (this.player) {
      this._drawAimGuide(ctx);
      for (const m of this.markers) m.draw(ctx);   // ground rings under the entities
      const drawList = this.enemies.concat(this.allies);
      drawList.push(this.player);
      drawList.sort((a, b) => a.feetY - b.feetY);
      for (const e of drawList) e.draw(ctx, this);
      for (const a of this.arrows) a.draw(ctx);
      for (const pr of this.eprojectiles) pr.draw(ctx);
      for (const c of this.coins) c.draw(ctx);
      for (const pa of this.particles) pa.draw(ctx);
      for (const t of this.texts) t.draw(ctx);
      this._drawChargeBar(ctx);
    } else {
      this.menuAnim.dir = 'r';
      this.menuAnim.play('idle', { fps: 6 });
      this.menuAnim.update(1 / 60);
      const c = CONFIG.world.castle;
      drawSprite(ctx, this.menuAnim.image(), c.breachX + 90, (c.y0 + c.y1) / 2, 1.7);
    }
    ctx.restore();   // end camera translate
    ctx.restore();   // end shake

    if (this.flash > 0) { ctx.save(); ctx.globalAlpha = this.flash * 0.45; ctx.fillStyle = '#b11'; ctx.fillRect(0, 0, CONFIG.VIEW_W, CONFIG.VIEW_H); ctx.restore(); }
    if (this.banner && this.state === 'playing') this._drawBanner(ctx);
    if (this.state === 'playing') this._drawBossBar(ctx);
    if (this.state === 'paused') this._drawCenter(ctx, 'PAUSED', 'press P to resume');
  }
  _drawBossBar(ctx) {
    let boss = null;
    for (const e of this.enemies) { if (e.def.boss && e.state !== 'dying' && e.spawnT <= 0) { boss = e; break; } }
    if (!boss) return;
    const W = CONFIG.VIEW_W, bw = Math.min(220, W - 80), bh = 7, bx = Math.round((W - bw) / 2), by = 66;
    const r = Math.max(0, boss.hp / boss.maxHp);
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(bx - 2, by - 2, bw + 4, bh + 4);
    ctx.fillStyle = '#3a1414'; ctx.fillRect(bx, by, bw, bh);
    ctx.fillStyle = `rgb(${Math.round(60 + 170 * (1 - r))},${Math.round(40 + 160 * r)},48)`;   // green→red
    ctx.fillRect(bx, by, Math.round(bw * r), bh);
    ctx.fillStyle = 'rgba(0,0,0,0.6)';                                   // phase ticks at 33% / 66%
    ctx.fillRect(bx + Math.round(bw * 0.33), by, 1, bh);
    ctx.fillRect(bx + Math.round(bw * 0.66), by, 1, bh);
    ctx.textAlign = 'center'; ctx.font = 'bold 10px "Cinzel", Georgia, serif';
    ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(20,12,4,0.85)';
    const label = (boss.def.name || 'BOSS').toUpperCase() + (boss.phase === 3 ? ' — ENRAGED' : '');
    ctx.strokeText(label, W / 2, by - 5); ctx.fillStyle = boss.phase === 3 ? '#ff8a6a' : '#ffe9a8'; ctx.fillText(label, W / 2, by - 5);
    ctx.restore();
  }
  _drawAimGuide(ctx) {
    if (this.state !== 'playing' || !this.player.charging) return;
    if ((this.runState.upgrades.aimline || 0) <= 0) return;
    const len = this.runState.upgrades.aimline >= 2 ? 240 : 150;
    let x = this.player.handX, y = this.player.handY;
    const ca = Math.cos(this.player.aim), sa = Math.sin(this.player.aim);
    ctx.save();
    let dist = 0, i = 0;
    const w = CONFIG.world;
    while (dist < len) {
      x += ca * 5; y += sa * 5; dist += 5; i++;
      let hit = false;
      for (const e of this.enemies) {
        if (e.dead || e.state === 'dying') continue;
        const b = e.hitBox();
        if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) { hit = true; break; }
      }
      if (hit) { ctx.globalAlpha = 0.95; ctx.fillStyle = '#ffcf3f'; ctx.fillRect(Math.round(x) - 2, Math.round(y) - 2, 4, 4); break; }
      if (x < -20 || x > w.W + 20 || y < -20 || y > w.H + 20) break;
      if (i % 2 === 0) {
        ctx.globalAlpha = 0.85 * (1 - dist / len) + 0.12;
        ctx.fillStyle = '#1c140a'; ctx.fillRect(Math.round(x), Math.round(y), 2, 2);
        ctx.fillStyle = '#fff3c4'; ctx.fillRect(Math.round(x), Math.round(y), 1, 1);
      }
    }
    ctx.restore();
  }
  _drawChargeBar(ctx) {
    if (!(this.player.charging && this.player.charge > 0.02)) return;
    const bw = 36, bh = 3;
    const bx = Math.round(this.player.x - bw / 2), by = Math.round(this.player.y - 22 * this.player.scale - 7);
    ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(bx - 1, by - 1, bw + 2, bh + 2);
    const c = Math.min(1, this.player.charge);
    ctx.fillStyle = c >= 0.85 ? '#ff5a3c' : '#ffd23c';
    ctx.fillRect(bx, by, Math.round(bw * c), bh);
  }
  _drawBanner(ctx) {
    const b = this.banner, k = Math.min(1, b.life / 0.35);
    ctx.save();
    ctx.globalAlpha = k;
    ctx.textAlign = 'center';
    ctx.font = 'bold 22px "Cinzel", Georgia, serif';
    ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(20,12,4,0.8)';
    ctx.strokeText(b.text, CONFIG.VIEW_W / 2, 52);
    ctx.fillStyle = '#ffe9a8'; ctx.fillText(b.text, CONFIG.VIEW_W / 2, 52);
    ctx.restore();
  }
  _drawCenter(ctx, big, small) {
    const W = CONFIG.VIEW_W, H = CONFIG.VIEW_H;
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fillRect(0, 0, W, H);
    ctx.textAlign = 'center'; ctx.fillStyle = '#fff';
    ctx.font = 'bold 26px "Cinzel", Georgia, serif';
    ctx.fillText(big, W / 2, H / 2 - 4);
    if (small) { ctx.font = '10px "Fredoka", system-ui'; ctx.fillStyle = '#d8d8d8'; ctx.fillText(small, W / 2, H / 2 + 14); }
    ctx.restore();
  }

  // ---- Pre-rendered top-down terrain (one big offscreen, blitted by sub-rect) ----
  _rnd(s) { const x = Math.sin(s * 12.9898) * 43758.5453; return x - Math.floor(x); }
  _disc(g, x, y, r, col) { g.fillStyle = col; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); }
  _ellipse(g, x, y, rx, ry, col) { g.fillStyle = col; g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); g.fill(); }
  _treeTop(g, x, y) {
    this._ellipse(g, x + 4, y + 15, 17, 6, 'rgba(0,0,0,0.18)');
    g.fillStyle = '#5a3c22'; g.fillRect(x - 2, y + 5, 4, 11);
    this._disc(g, x, y, 18, '#21532e'); this._disc(g, x - 7, y - 3, 13, '#2f7049');
    this._disc(g, x + 7, y - 1, 12, '#2f7049'); this._disc(g, x - 2, y - 7, 11, '#3c8a52');
    this._disc(g, x - 6, y - 9, 5, '#54a05c');
  }
  _bushTop(g, x, y) {
    this._ellipse(g, x + 2, y + 6, 10, 4, 'rgba(0,0,0,0.16)');
    this._disc(g, x, y, 9, '#21532e'); this._disc(g, x - 3, y - 2, 6, '#2f7049');
    g.fillStyle = '#54a05c'; g.fillRect(x - 4, y - 4, 2, 2);
  }
  _rockTop(g, x, y) {
    this._ellipse(g, x + 2, y + 4, 9, 4, 'rgba(0,0,0,0.16)');
    this._disc(g, x + 1, y + 1, 8, '#6f675a'); this._disc(g, x, y, 8, '#9a9183');
    this._disc(g, x - 3, y - 3, 3, '#b8b0a0');
  }
  _tower(g, cx, topY) {
    const r = 30, bodyH = 86;
    this._ellipse(g, cx + 9, topY + bodyH + 9, r, 12, 'rgba(0,0,0,0.20)');
    g.fillStyle = '#857b6d'; g.fillRect(cx - r, topY, r * 2, bodyH);
    g.fillStyle = '#9a9183'; g.fillRect(cx - r + 6, topY, r * 2 - 18, bodyH);
    g.fillStyle = '#6c6256'; g.fillRect(cx + r - 8, topY, 8, bodyH);
    g.fillStyle = 'rgba(0,0,0,0.10)'; for (let yy = topY + 10; yy < topY + bodyH; yy += 13) g.fillRect(cx - r, yy, r * 2, 1);
    this._ellipse(g, cx, topY, r, 11, '#b0a692'); this._ellipse(g, cx, topY + 2, r - 5, 7, '#857b6d');
    g.fillStyle = '#9a9183'; for (let a = 0; a < 5; a++) g.fillRect(cx - r + a * (r * 2 / 5) + 2, topY - 8, 8, 9);
    g.fillStyle = '#7a3b2a'; g.beginPath(); g.moveTo(cx, topY - 34); g.lineTo(cx - r + 3, topY - 5); g.lineTo(cx + r - 3, topY - 5); g.closePath(); g.fill();
    g.fillStyle = '#5e2c1f'; g.beginPath(); g.moveTo(cx, topY - 34); g.lineTo(cx, topY - 5); g.lineTo(cx + r - 3, topY - 5); g.closePath(); g.fill();
    g.fillStyle = '#3a2a18'; g.fillRect(cx - 1, topY - 46, 2, 13);
    g.fillStyle = '#2c6b43'; g.fillRect(cx + 1, topY - 45, 10, 6);
  }
  _buildTerrain() {
    const w = CONFIG.world, W = w.W, H = w.H;
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const g = cv.getContext('2d'); g.imageSmoothingEnabled = false;
    const rnd = (s) => this._rnd(s);

    // 1. Grass base + large tonal drift blobs.
    g.fillStyle = '#5a9d3c'; g.fillRect(0, 0, W, H);
    const tone = ['#67ab46', '#4f8f34', '#6fb050', '#559638'];
    for (let i = 0; i < 1400; i++) {
      const x = rnd(i * 1.7 + 1) * W, y = rnd(i * 2.3 + 5) * H, r = 22 + rnd(i * 0.6 + 2) * 42;
      g.globalAlpha = 0.5; this._ellipse(g, x, y, r, r * 0.7, tone[(rnd(i + 9) * tone.length) | 0]); g.globalAlpha = 1;
    }
    // 2. Fine grass texture: blades, dappled light, tiny stones.
    for (let i = 0; i < 6200; i++) {
      const x = rnd(i * 1.3 + 1) * W, y = rnd(i * 1.9 + 9) * H, r = rnd(i * 0.7 + 3);
      if (r < 0.42) { g.fillStyle = 'rgba(150,210,120,0.5)'; g.fillRect(x, y, 2, 1); }
      else if (r < 0.74) { g.fillStyle = '#3a6f2a'; g.fillRect(x, y, 1, 2); g.fillRect(x + 1, y + 1, 1, 1); }
      else if (r < 0.9) { g.fillStyle = 'rgba(58,92,40,0.4)'; g.fillRect(x, y, 3, 2); }
      else { g.fillStyle = 'rgba(150,148,132,0.7)'; g.fillRect(x, y, 2, 2); }
    }

    // 3. Dirt paths converging on the castle gate.
    const gx = w.castle.breachX + 8, gy = (w.castle.y0 + w.castle.y1) / 2;
    const path = (pts) => {
      g.lineCap = 'round'; g.lineJoin = 'round';
      g.strokeStyle = '#6f5436'; g.lineWidth = 24; g.beginPath(); g.moveTo(pts[0][0], pts[0][1]); for (let k = 1; k < pts.length; k++) g.lineTo(pts[k][0], pts[k][1]); g.stroke();
      g.strokeStyle = '#8a6b46'; g.lineWidth = 17; g.stroke();
      g.strokeStyle = 'rgba(154,123,82,0.5)'; g.lineWidth = 5; g.stroke();
    };
    path([[W + 20, gy - 160], [1500, gy - 90], [820, gy - 30], [gx, gy]]);
    path([[W * 0.62, -20], [1240, 470], [720, gy - 70], [gx, gy - 22]]);
    path([[W * 0.5, H + 20], [1080, 1240], [690, gy + 90], [gx, gy + 22]]);

    // 4. Pond with shoreline + ripples.
    const px = 1560, py = 1000, prx = 190, pry = 126;
    this._ellipse(g, px, py, prx + 10, pry + 10, '#c9b487');
    const wg = g.createRadialGradient(px, py - 24, 18, px, py, prx); wg.addColorStop(0, '#4f96bd'); wg.addColorStop(1, '#2c6486');
    g.fillStyle = wg; g.beginPath(); g.ellipse(px, py, prx, pry, 0, 0, Math.PI * 2); g.fill();
    g.strokeStyle = 'rgba(255,255,255,0.16)'; g.lineWidth = 1;
    for (let k = 0; k < 6; k++) { g.beginPath(); g.ellipse(px - 40 + k * 14, py - 40 + k * 18, 34, 9, 0, 0.2, Math.PI - 0.2); g.stroke(); }
    this._disc(g, px - 70, py + 26, 9, '#3f8a4a'); this._disc(g, px + 60, py - 34, 7, '#3f8a4a');

    // helper: keep props off the castle + pond + their reflection bands.
    const blocked = (x, y) => (x < w.castle.x1 + 70 && y > w.castle.y0 - 90 && y < w.castle.y1 + 90)
      || (Math.hypot((x - px) / (prx + 26), (y - py) / (pry + 26)) < 1);

    // 5. Rocks.
    for (let i = 0; i < 46; i++) { const x = rnd(i * 3.1 + 11) * W, y = rnd(i * 2.7 + 7) * H; if (!blocked(x, y)) this._rockTop(g, x, y); }
    // 6. Flowers.
    const fcol = ['#e8585b', '#ffd24a', '#ffffff', '#c77dff', '#ff8c42'];
    for (let i = 0; i < 420; i++) {
      const x = rnd(i * 2.1 + 2) * W, y = rnd(i * 1.1 + 4) * H; if (blocked(x, y)) continue;
      g.fillStyle = '#3a6f2a'; g.fillRect(x, y, 1, 2);
      g.fillStyle = fcol[(rnd(i + 7) * fcol.length) | 0];
      g.fillRect(x, y - 1, 1, 1); g.fillRect(x - 1, y, 1, 1); g.fillRect(x + 1, y, 1, 1);
    }
    // 7. Bushes + trees (drawn back-to-front by y for clean overlap).
    const props = [];
    for (let i = 0; i < 90; i++) { const x = rnd(i * 3.3 + 5) * W, y = rnd(i * 2.2 + 1) * H; if (!blocked(x, y)) props.push({ x, y, t: 'b' }); }
    for (let i = 0; i < 60; i++) { const x = rnd(i * 4.7 + 13) * W, y = rnd(i * 3.9 + 3) * H; if (!blocked(x, y)) props.push({ x, y, t: 't' }); }
    props.sort((a, b) => a.y - b.y);
    for (const p of props) (p.t === 't' ? this._treeTop(g, p.x, p.y) : this._bushTop(g, p.x, p.y));

    // 8. Pseudo-3D castle on the west.
    this._drawCastlePixel(g);
    this._terrain = cv;
  }
  _drawCastlePixel(g) {
    const c = CONFIG.world.castle, x0 = c.x0, x1 = c.x1, y0 = c.y0, y1 = c.y1;
    const wall = '#94897a', wallTop = '#a89d88', faceE = '#6f6557', dark = '#534a3f';
    // Cast shadow on the grass (south-east) — sells the height.
    g.fillStyle = 'rgba(0,0,0,0.20)';
    g.beginPath(); g.moveTo(x0, y1); g.lineTo(x1 + 40, y1); g.lineTo(x1 + 70, y1 + 46); g.lineTo(x0, y1 + 46); g.closePath(); g.fill();
    // Keep / courtyard top (we look down on it).
    g.fillStyle = wallTop; g.fillRect(x0, y0, x1 - x0, y1 - y0);
    g.fillStyle = '#8c8276'; g.fillRect(x0 + 22, y0 + 22, (x1 - 40) - (x0 + 22), (y1 - 22) - (y0 + 22));
    g.fillStyle = '#7d7468'; g.fillRect(x0 + 34, y0 + 34, (x1 - 52) - (x0 + 34), (y1 - 34) - (y0 + 34));
    // Flagstone grid so the courtyard isn't flat grey.
    g.strokeStyle = 'rgba(0,0,0,0.09)'; g.lineWidth = 1;
    for (let yy = y0 + 46; yy < y1 - 40; yy += 18) { g.beginPath(); g.moveTo(x0 + 40, yy); g.lineTo(x1 - 46, yy); g.stroke(); }
    for (let xx = x0 + 44; xx < x1 - 44; xx += 18) { g.beginPath(); g.moveTo(xx, y0 + 44); g.lineTo(xx, y1 - 42); g.stroke(); }
    g.strokeStyle = 'rgba(255,255,255,0.06)'; g.lineWidth = 1;
    for (let yy = y0 + 47; yy < y1 - 40; yy += 18) { g.beginPath(); g.moveTo(x0 + 40, yy); g.lineTo(x1 - 46, yy); g.stroke(); }
    // East curtain wall — the vertical face toward the player.
    const wx = x1 - 38;
    g.fillStyle = wall; g.fillRect(wx, y0, x1 - wx, y1 - y0);
    g.fillStyle = faceE; for (let yy = y0; yy < y1; yy += 14) g.fillRect(wx, yy, x1 - wx, 2);
    g.fillStyle = wallTop; g.fillRect(wx, y0, x1 - wx, 3);
    g.fillStyle = dark; g.fillRect(x1 - 4, y0, 4, y1 - y0);
    // Merlons along the east wall top.
    g.fillStyle = wall; for (let yy = y0; yy < y1; yy += 22) g.fillRect(wx - 6, yy, 7, 12);
    // Gate (the breach point) at the east wall centre.
    const gy = (y0 + y1) / 2;
    g.fillStyle = '#2a1c0f'; g.fillRect(wx - 3, gy - 28, x1 - wx + 8, 56);
    g.fillStyle = '#5a3c22'; g.fillRect(wx - 2, gy - 25, x1 - wx + 5, 50);
    g.fillStyle = '#6e4a2a'; for (let i = 0; i < 6; i++) g.fillRect(wx - 2 + i * 6, gy - 25, 2, 50);
    g.fillStyle = '#3f2a16'; g.fillRect(wx - 2, gy - 9, x1 - wx + 5, 2); g.fillRect(wx - 2, gy + 7, x1 - wx + 5, 2);
    // South wall face (height toward camera).
    g.fillStyle = faceE; g.fillRect(x0, y1, x1 - x0 + 6, 40);
    g.fillStyle = dark; g.fillRect(x0, y1 + 34, x1 - x0 + 6, 6);
    g.fillStyle = wallTop; g.fillRect(x0, y1, x1 - x0, 3);
    // Towers flanking the gate (visible from the breach) + an inner keep + corners.
    this._tower(g, x1 - 22, gy - 122);
    this._tower(g, x1 - 22, gy + 122);
    this._tower(g, x0 + 78, gy - 40);
    this._tower(g, x1 - 26, y0 + 30);
    this._tower(g, x1 - 26, y1 - 30);
    // Torch glow flanking the gate.
    g.fillStyle = 'rgba(255,170,70,0.4)';
    g.beginPath(); g.arc(x1 - 2, gy - 40, 9, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.arc(x1 - 2, gy + 40, 9, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#ffd87a'; g.fillRect(x1 - 3, gy - 44, 2, 5); g.fillRect(x1 - 3, gy + 36, 2, 5);
  }

  // ---- DOM HUD sync --------------------------------------------------
  _syncHud() {
    const h = this.hud;
    if (!h.root) return;
    const show = this.player && (this.state === 'playing' || this.state === 'paused');
    h.root.classList.toggle('hidden', !show);
    if (!show) return;
    if (!this._hudInit) {
      h.gold.innerHTML = window.icon('coin', 'ico-gold') + '<span class="hud-n" id="hud-gold-n">0</span>';
      h.wave.innerHTML = window.icon('banner') + '<span class="hud-n" id="hud-wave-n"></span>';
      h.combo.innerHTML = window.icon('flame', 'ico-flame') + '<span class="hud-n" id="hud-combo-n"></span>';
      this._goldN = document.getElementById('hud-gold-n');
      this._waveN = document.getElementById('hud-wave-n');
      this._comboN = document.getElementById('hud-combo-n');
      this._hudInit = true; this._heartsSig = null;
    }
    const hs = this.player.hearts + '/' + this.player.maxHearts;
    if (hs !== this._heartsSig) {
      this._heartsSig = hs;
      let html = '';
      for (let i = 0; i < this.player.maxHearts; i++) html += window.icon(i < this.player.hearts ? 'heartFull' : 'heartEmpty', i < this.player.hearts ? 'ico-heart' : 'ico-heart-off');
      h.hearts.innerHTML = html;
    }
    this._goldN.textContent = window.fmtNum(this.runState.gold);
    this._waveN.textContent = 'Wave ' + this.wave;
    h.combo.style.visibility = this.combo > 1 ? 'visible' : 'hidden';
    if (this.combo > 1) this._comboN.textContent = '×' + this.combo;
    const inv = this.runState.inventory;
    const sig = CONFIG.shop.consumables.map((c) => inv[c.key] || 0).join(',');
    if (sig !== this._itemsSig) {
      this._itemsSig = sig;
      let html = '';
      CONFIG.shop.consumables.forEach((c, idx) => {
        const q = inv[c.key] || 0; if (q <= 0) return;
        html += `<button class="hud-item" data-key="${c.key}"><span class="hi-key">${idx + 1}</span>${window.iconImg(c.key, 'hi-img')}<span class="hi-q">${q}</span></button>`;
      });
      h.items.innerHTML = html;
      h.items.querySelectorAll('.hud-item').forEach((btn) => { btn.onclick = () => { this.activateConsumable(btn.dataset.key); btn.blur(); }; });
    } else {
      CONFIG.shop.consumables.forEach((c) => { const el = h.items.querySelector(`.hud-item[data-key="${c.key}"] .hi-q`); if (el) el.textContent = inv[c.key] || 0; });
    }
  }

  _frame(t) {
    let dt = Math.min(0.05, (t - this._last) / 1000 || 0);
    this._last = t;
    if (this.hitStop > 0) { this.hitStop -= dt; dt *= 0.08; }
    this.update(dt);
    this.render();
    this._syncHud();
    requestAnimationFrame((tt) => this._frame(tt));
  }
};

// ====================================================================
//  UI / screen wiring
// ====================================================================
(function bootstrap() {
  function boot() {
    Assets.preload();
    const canvas = document.getElementById('game-canvas');
    const game = new Game(canvas);
    window.GAME = game;

    const screens = {
      wallet: document.getElementById('screen-wallet'),
      menu: document.getElementById('screen-menu'),
      chars: document.getElementById('screen-chars'),
      unlock: document.getElementById('screen-unlock'),
      entry: document.getElementById('screen-entry'),
      over: document.getElementById('screen-over'),
      board: document.getElementById('screen-board'),
      how: document.getElementById('screen-how'),
      shop: document.getElementById('screen-shop'),
    };
    function show(name) {
      for (const k in screens) screens[k].classList.toggle('hidden', k !== name);
      if (!name) { for (const k in screens) screens[k].classList.add('hidden'); return; }
      let target = null;
      if (name === 'wallet') target = document.getElementById('wallet-options');
      else if (name === 'menu') target = document.getElementById('btn-play');
      else if (name === 'chars') {
        if (game._paintHeroPortraits) game._paintHeroPortraits();
        if (game._paintHeroLocks) game._paintHeroLocks();                       // paint from cache now
        if (window.Entry) Entry.prefetch();
        if (window.Characters) Characters.prefetch().then(() => { if (game._paintHeroLocks) game._paintHeroLocks(); });   // refresh after on-chain read
        target = document.querySelector('.hero-card');
      }
      else if (name === 'unlock') target = document.getElementById('btn-unlock');
      else if (name === 'entry') target = document.getElementById('btn-pay-play');
      else if (name === 'how') target = document.getElementById('btn-how-back');
      else if (name === 'board') target = document.getElementById('btn-board-back');
      else if (name === 'over') target = document.getElementById('name-input');
      else if (name === 'shop') target = document.getElementById('btn-next-wave');
      if (target) target.focus({ preventScroll: true });
      const panel = screens[name].querySelector('.panel');
      if (panel) panel.scrollTop = 0;
      const body = screens[name].querySelector('.shop-body');
      if (body) body.scrollTop = 0;
    }
    // ---- Wallet connect gate (required before play; logic in js/wallet.js) ----
    const walletChip = document.getElementById('wallet-chip');
    const walletNote = document.getElementById('wallet-note');
    function requireWallet() {
      const w = window.Wallet && window.Wallet.state;
      if (w && w.mode === 'wallet' && w.address) return true;
      if (walletNote) walletNote.textContent = 'Connect a wallet to play.';
      show('wallet');
      return false;
    }
    function syncWalletChip() {
      if (!walletChip || !window.Wallet) return;
      const w = window.Wallet.state;
      if (w.mode === 'wallet' && w.address) {
        walletChip.classList.add('on');
        walletChip.innerHTML = window.icon('wallet') + '<span>' + window.Wallet.short(w.address) + '</span>';
        walletChip.title = (w.name || 'Wallet') + (w.chainOk ? ' · Robinhood' : '') + ' — click to manage';
      } else {
        walletChip.classList.remove('on');
        walletChip.innerHTML = window.icon('wallet') + '<span>Connect</span>';
        walletChip.title = 'Connect a wallet';
      }
    }
    if (window.Wallet) {
      window.Wallet.renderOptions(document.getElementById('wallet-options'), async (detail) => {
        if (walletNote) walletNote.textContent = 'Connecting…';
        try {
          await window.Wallet.connect(detail);
          if (walletNote) walletNote.textContent = window.Wallet.state.note || '';
          show('menu');
        } catch (e) {
          if (walletNote) walletNote.textContent = (e && e.message) ? e.message : 'Connection cancelled.';
        }
      });
      window.Wallet.onChange(syncWalletChip);
      window.Wallet.onChange(() => {                                            // warm caches as soon as the wallet/chain is ready
        if (window.Entry) Entry.prefetch();
        if (window.Characters) Characters.prefetch().then(() => { if (game._paintHeroLocks) game._paintHeroLocks(); });
      });
      // Auto-disconnect: when the wallet drops (incl. switching accounts), bail to the connect screen
      // with a clean slate so no session/ownership carries over to a different wallet.
      let prevWalletMode = window.Wallet.state.mode;
      window.Wallet.onChange(() => {
        const m = window.Wallet.state.mode;
        if (prevWalletMode === 'wallet' && !m) {
          if (window.Characters) Characters.clearCache();
          try { game.toMenu(); } catch (e) {}
          show('wallet');
        }
        prevWalletMode = m;
      });
      if (walletChip) walletChip.addEventListener('click', () => { if (walletNote) walletNote.textContent = ''; show('wallet'); });
      syncWalletChip();
      show(window.Wallet.state.mode ? 'menu' : 'wallet');
    } else {
      show('menu');
    }

    // Inject SVG icons into static labels (no emoji anywhere).
    const setBtn = (id, name, label) => { const el = document.getElementById(id); if (el) el.innerHTML = window.icon(name) + (label ? '<span>' + label + '</span>' : ''); };
    setBtn('btn-play', 'play', 'Play');
    setBtn('btn-board-menu', 'trophy', 'Leaderboard');
    setBtn('btn-how', 'help', 'How to play');
    setBtn('btn-how-back', 'chevronLeft', 'Back');
    setBtn('btn-chars-back', 'chevronLeft', 'Back');
    setBtn('btn-board-back', 'chevronLeft', 'Back');
    setBtn('btn-next-wave', 'swords', 'Next Wave');
    setBtn('btn-retry', 'retry', 'Play again');
    const tcL = document.getElementById('tc-left'); if (tcL) tcL.innerHTML = window.icon('arrowLeft');
    const tcR = document.getElementById('tc-right'); if (tcR) tcR.innerHTML = window.icon('arrowRight');
    const tcJ = document.getElementById('tc-jump'); if (tcJ) tcJ.innerHTML = window.icon('jumpUp');
    const sgi = document.getElementById('shop-gold-ico'); if (sgi) sgi.innerHTML = window.icon('coin', 'ico-gold');
    const fsi = document.getElementById('final-score-ico'); if (fsi) fsi.innerHTML = window.icon('trophy', 'ico-gold');

    const grid = document.getElementById('hero-grid');
    HEROES.forEach((h) => {
      const mc = SPRITE_MANIFEST.characters[h.key];
      const card = document.createElement('button');
      card.className = 'hero-card';
      card.dataset.heroKey = h.key;
      card.setAttribute('aria-label', `Play as ${h.name || (mc && mc.name) || h.key} — ${h.tagline}`);
      card.innerHTML =
        `<div class="hero-portrait-well"><canvas class="hero-portrait" width="32" height="32" data-hero="${h.key}"></canvas></div>
         <div class="hero-name" data-hero="${h.key}">${h.name || (mc && mc.name) || h.key}</div>
         <div class="hero-tag">${h.tagline}</div>
         <div class="hero-stats">
           <span>${window.icon('heartFull', 'ico-heart')}${h.hearts}</span>
           <span>${window.icon('movespeed')}${h.moveSpeed}</span>
           <span>${window.icon('fastdraw')}${h.fireCd <= 0.07 ? 'fast' : h.fireCd >= 0.15 ? 'slow' : 'med'}</span>
         </div>` +
        (h.unlock ? `<div class="hero-lock hidden"></div>` : '');
      card.addEventListener('click', () => chooseHero(h));
      grid.appendChild(card);
    });
    // Teaser: one locked "coming soon" hero (non-interactive, greyed, matches the card layout).
    const soonCard = document.createElement('div');
    soonCard.className = 'hero-card hero-soon';
    soonCard.setAttribute('aria-disabled', 'true');
    soonCard.setAttribute('aria-label', 'New hero — coming soon');
    soonCard.innerHTML =
      `<div class="hero-portrait-well"><span class="hero-soon-q">?</span></div>
       <div class="hero-name">???<span class="soon-badge">Soon</span></div>
       <div class="hero-tag">A new champion rides to Sherwood… soon.</div>
       <div class="hero-stats">
         <span>${window.icon('heartFull', 'ico-heart')}?</span>
         <span>${window.icon('movespeed')}?</span>
         <span>${window.icon('fastdraw')}?</span>
       </div>`;
    grid.appendChild(soonCard);
    // Sheet-based heroes (e.g. the Wizard) have no on-disk portrait PNG, so paint each
    // hero's idle frame into its canvas (works for sliced canvases AND loaded PNGs).
    function paintHeroPortraits() {
      document.querySelectorAll('canvas.hero-portrait').forEach((cv) => {
        const key = cv.dataset.hero;
        const img = Assets.frame(key, 'idle', 'r', 0);
        const cx = cv.getContext('2d');
        cx.clearRect(0, 0, cv.width, cv.height); cx.imageSmoothingEnabled = false;
        if (img && img.width) {
          const s = Math.min(cv.width / img.width, cv.height / img.height);
          const w = img.width * s, hh = img.height * s;
          cx.drawImage(img, (cv.width - w) / 2, cv.height - hh, w, hh);
        }
        const mc = SPRITE_MANIFEST.characters[key];
        const h = HEROES.find((x) => x.key === key);
        const display = (h && h.name) || (mc && mc.name);   // config name wins over the sprite-sheet name
        if (display) {
          const el = document.querySelector(`.hero-name[data-hero="${key}"]`); if (el) el.textContent = display;
          const card = cv.closest('.hero-card');
          if (card && h) card.setAttribute('aria-label', `Play as ${display} — ${h.tagline}`);
        }
      });
    }
    game._paintHeroPortraits = paintHeroPortraits;
    // Paint lock badges on gated heroes the wallet doesn't own yet (from cache; called again after read).
    function paintHeroLocks() {
      HEROES.forEach((h) => {
        const card = grid.querySelector(`.hero-card[data-hero-key="${h.key}"]`);
        if (!card) return;
        const badge = card.querySelector('.hero-lock');
        card.classList.remove('locked');
        if (badge) badge.classList.add('hidden');
      });
    }
    game._paintHeroLocks = paintHeroLocks;

    document.getElementById('btn-play').addEventListener('click', () => { if (!requireWallet()) return; Sfx.resume(); show('chars'); });
    document.getElementById('btn-how').addEventListener('click', () => show('how'));
    document.getElementById('btn-board-menu').addEventListener('click', () => openBoard());
    document.getElementById('btn-how-back').addEventListener('click', () => show('menu'));
    document.getElementById('btn-chars-back').addEventListener('click', () => show('menu'));
    document.getElementById('btn-board-back').addEventListener('click', () => show('menu'));

    // ---- Character unlock gate (clicking a hero) ----
    let pendingUnlockHero = null;
    async function chooseHero(h) {
      if (window.Sfx && Sfx.resume) Sfx.resume();
      beginRun(h); // paywall removed: all heroes unlocked, skip purchase gate
    }
    function showUnlock(h) {
      pendingUnlockHero = h;
      const u = h.unlock, parts = String(u.label).split(' '), mc = SPRITE_MANIFEST.characters[h.key];
      document.getElementById('unlock-price-amt').textContent = parts[0] || u.label;
      document.getElementById('unlock-price-unit').textContent = parts[1] || u.token;
      document.getElementById('unlock-hero').textContent = 'Unlock ' + (h.name || (mc && mc.name) || h.key);
      document.getElementById('unlock-status').textContent = '';
      const balEl = document.getElementById('unlock-balance'); balEl.textContent = '';
      const btn = document.getElementById('btn-unlock'); btn.disabled = false; btn.classList.remove('is-busy');
      show('unlock');
      (async () => {
        if (!Characters.available()) { document.getElementById('unlock-status').textContent = 'Connect a Robinhood wallet to unlock.'; btn.disabled = true; return; }
        try {
          const tokenAddr = u.token === 'CASHCAT' ? CONFIG.chain.cashcatToken : CONFIG.chain.rewardToken;
          const bal = await Characters.balanceOf(tokenAddr);
          balEl.textContent = 'You hold ' + window.fmtNum(Number(bal / (10n ** 15n)) / 1000) + ' ' + u.token;
          if (bal < BigInt(u.priceWei)) { document.getElementById('unlock-status').textContent = 'Not enough ' + u.token + ' — buy more to unlock.'; btn.disabled = true; }
        } catch (e) {}
      })();
    }
    document.getElementById('btn-unlock').addEventListener('click', async (e) => {
      const btn = e.currentTarget, status = document.getElementById('unlock-status');
      if (!pendingUnlockHero || !window.Characters) return;
      btn.disabled = true; btn.classList.add('is-busy');
      status.textContent = 'Preparing…';
      try {
        await Characters.unlock(pendingUnlockHero, (m) => { status.textContent = m; });
        pendingUnlockHero = null;
        status.textContent = 'Unlocked — it’s yours!';
        btn.classList.remove('is-busy');
        if (game._paintHeroLocks) game._paintHeroLocks();
        show('chars');
      } catch (err) {
        status.textContent = (err && err.message) ? err.message : 'Unlock failed.';
        btn.disabled = false; btn.classList.remove('is-busy');
      }
    });
    document.getElementById('btn-unlock-back').addEventListener('click', () => { pendingUnlockHero = null; show('chars'); });

    // ---- Pay-to-play gate (between hero pick and the run) ----
    let pendingHero = null;
    async function beginRun(h) {
      if (window.Sfx && Sfx.resume) Sfx.resume();
      show(null);
      game.start(h); // paywall removed: skip entry-fee payment gate
    }
    document.getElementById('btn-pay-play').addEventListener('click', async (e) => {
      const btn = e.currentTarget;
      const status = document.getElementById('entry-status');
      if (!pendingHero || !window.Entry) return;
      btn.disabled = true; btn.classList.add('is-busy');
      status.textContent = 'Preparing payment…';
      try {
        await Entry.payEntry((m) => { status.textContent = m; });
        const h = pendingHero; pendingHero = null;
        status.textContent = 'Entered — good luck!';
        btn.classList.remove('is-busy');
        show(null); game.start(h);
      } catch (err) {
        status.textContent = (err && err.message) ? err.message : 'Payment failed.';
        btn.disabled = false; btn.classList.remove('is-busy');
      }
    });
    document.getElementById('btn-entry-back').addEventListener('click', () => { pendingHero = null; show('chars'); });

    function bindHold(id, on, off) {
      const el = document.getElementById(id);
      if (!el) return;
      const start = (e) => { e.preventDefault(); on(); };
      const end = (e) => { e.preventDefault(); if (off) off(); };
      el.addEventListener('pointerdown', start);
      el.addEventListener('pointerup', end);
      el.addEventListener('pointerleave', end);
      el.addEventListener('pointercancel', end);
    }
    bindHold('tc-left', () => { if (game.state === 'playing') game.keys['ArrowLeft'] = true; }, () => { game.keys['ArrowLeft'] = false; });
    bindHold('tc-right', () => { if (game.state === 'playing') game.keys['ArrowRight'] = true; }, () => { game.keys['ArrowRight'] = false; });
    bindHold('tc-jump', () => { if (game.state === 'playing') game.keys['ArrowUp'] = true; }, () => { game.keys['ArrowUp'] = false; });
    bindHold('tc-down', () => { if (game.state === 'playing') game.keys['ArrowDown'] = true; }, () => { game.keys['ArrowDown'] = false; });

    const SHOP_CAT = {
      damage: 'atk', firerate: 'atk', fastdraw: 'atk', multishot: 'atk', pierce: 'atk',
      fire: 'atk', frost: 'atk', explosive: 'atk',
      maxheart: 'def', movespeed: 'def',
      goldfind: 'util', aimassist: 'util', aimline: 'util', bloodthirst: 'def',
      fullheal: 'def', shield: 'def', freeze: 'util', rapidfire: 'atk', volley: 'atk', windfall: 'util', thunderclap: 'atk', knights: 'def',
    };
    function shopCard(d, kind, owned, cost, maxed, afford) {
      let pips = '<span class="sc-pips">';
      for (let i = 0; i < d.max; i++) pips += `<i class="${i < owned ? 'on' : ''}"></i>`;
      pips += '</span>';
      const cost2 = maxed
        ? '<span class="sc-max">MAXED</span>'
        : `<span class="sc-cost${afford ? '' : ' poor'}">${window.icon('coin', 'ico-gold')}${cost}</span>`;
      const cat = SHOP_CAT[d.key] || 'util';
      return `<button class="shop-card cat-${cat}${maxed ? ' maxed' : ''}${afford ? '' : ' poor'}" data-key="${d.key}" ${afford ? '' : 'disabled'}>
        <div class="sc-art">
          <span class="sc-ghost" style="background-image:url('assets/ui/icons/${d.key}.png')"></span>
          ${window.iconImg(d.key)}
          ${maxed ? '<span class="sc-max">MAXED</span>' : ''}
        </div>
        <div class="sc-info">
          <div class="sc-name">${d.name}</div>
          <div class="sc-desc">${d.desc}</div>
          <div class="sc-foot">${pips}${maxed ? '' : cost2}</div>
        </div></button>`;
    }
    function renderShop() {
      const rs = game.runState;
      document.getElementById('shop-wave').textContent = 'Wave ' + game.wave + ' cleared';
      document.getElementById('shop-gold').textContent = window.fmtNum(rs.gold);
      document.getElementById('shop-upgrades').innerHTML = CONFIG.shop.upgrades.map((d) => {
        const lvl = rs.upgrades[d.key] || 0, maxed = lvl >= d.max, cost = Math.round(d.baseCost * Math.pow(d.costGrow, lvl));
        return shopCard(d, 'up', lvl, cost, maxed, rs.gold >= cost && !maxed);
      }).join('');
      document.getElementById('shop-consumables').innerHTML = CONFIG.shop.consumables.map((d) => {
        const owned = rs.inventory[d.key] || 0, maxed = owned >= d.max;
        return shopCard(d, 'co', owned, d.cost, maxed, rs.gold >= d.cost && !maxed);
      }).join('');
      document.querySelectorAll('#shop-upgrades .shop-card').forEach((b) => { b.onclick = () => buy(b.dataset.key, 'up'); });
      document.querySelectorAll('#shop-consumables .shop-card').forEach((b) => { b.onclick = () => buy(b.dataset.key, 'co'); });
    }
    function buy(key, kind) {
      const rs = game.runState;
      if (kind === 'up') {
        const d = CONFIG.shop.upgrades.find((u) => u.key === key), lvl = rs.upgrades[key] || 0;
        if (lvl >= d.max) return;
        const cost = Math.round(d.baseCost * Math.pow(d.costGrow, lvl));
        if (rs.gold < cost) return;
        rs.gold -= cost; rs.upgrades[key] = lvl + 1;
        if (key === 'maxheart' && game.player) { game.player.maxHearts++; game.player.hearts++; }
      } else {
        const d = CONFIG.shop.consumables.find((u) => u.key === key), owned = rs.inventory[key] || 0;
        if (owned >= d.max || rs.gold < d.cost) return;
        rs.gold -= d.cost; rs.inventory[key] = owned + 1;
      }
      Sfx.coin();
      renderShop();
      const card = document.querySelector(`.shop-card[data-key="${key}"]`);
      if (card) { card.classList.add('buy-pop'); setTimeout(() => card.classList.remove('buy-pop'), 260); }
    }
    game.onShop = () => { renderShop(); show('shop'); };
    document.getElementById('btn-next-wave').addEventListener('click', () => { show(null); game._startWave(game.wave + 1); game.state = 'playing'; });

    async function openBoard() {
      show('board');
      const list = document.getElementById('board-list');
      list.innerHTML = '<li class="board-loading">Loading…</li>';
      const { scope, list: rows } = await Leaderboard.top();
      document.getElementById('board-scope').innerHTML = scope === 'on-chain' ? window.icon('link') + ' On-chain'
        : scope === 'global' ? window.icon('globe') + ' Global' : window.icon('device') + ' This device';
      if (!rows.length) { list.innerHTML = '<li class="board-loading">No scores yet — be the first!</li>'; return; }
      list.innerHTML = rows.map((r, i) => `<li class="rank-${i + 1}${r.me ? ' me' : ''}"><span class="rank">${i + 1}</span><span class="bn">${escapeHtml(r.name)}</span><span class="bs">${window.icon('trophy', 'ico-gold')}${window.fmtNum(r.score)}</span></li>`).join('');
    }

    let lastReward = 0;   // coins (gold) earned in the run just ended — what the Collect button claims
    let rewardCollected = true;   // gate: Submit is blocked until this run's coins are collected (or there are none)
    game.onGameOver = async (score, wave, kills, goldEarned) => {
      setTimeout(() => { if (game.state === 'gameover') show('over'); }, 1100);
      document.getElementById('final-score').textContent = window.fmtNum(score);
      document.getElementById('final-meta').innerHTML =
        `<span class="stat">${window.icon('banner')}<b>${wave}</b><i>wave</i></span>` +
        `<span class="stat">${window.icon('swords')}<b>${kills}</b><i>villains</i></span>` +
        `<span class="stat">${window.icon('coin', 'ico-gold')}<b>${window.fmtNum(goldEarned)}</b><i>gold</i></span>`;
      const rank = await Leaderboard.rankOf(score);
      const oc = window.OnChain && window.OnChain.available();
      document.getElementById('final-rank').textContent = rank ? `That ranks #${rank}${oc ? ' on-chain' : (Leaderboard.isRemote ? ' worldwide' : ' on this device')}!` : '';
      document.getElementById('submit-status').textContent = '';
      document.getElementById('name-input').value = localStorage.getItem('sherwood_name') || '';

      // Coin reward — show "Collect" only when rewards are configured and this run earned coins.
      lastReward = Math.max(0, Math.floor(goldEarned || 0));
      const hasCoins = !!(window.Claim && Claim.configured() && lastReward > 0);
      rewardCollected = !hasCoins;   // if there are coins, they must be collected before Submit is allowed
      const rewardRow = document.getElementById('reward-row');
      if (rewardRow && hasCoins) {
        const collectBtn = document.getElementById('btn-collect');
        collectBtn.innerHTML = window.icon('coin', 'ico-gold') + 'Collect ' + window.fmtNum(lastReward) + ' coins';
        collectBtn.disabled = false;
        document.getElementById('collect-status').textContent = Claim.available() ? '' : 'Connect your Robinhood wallet to collect.';
        rewardRow.classList.remove('hidden');
      } else if (rewardRow) {
        rewardRow.classList.add('hidden');
      }
    };
    document.getElementById('btn-submit').addEventListener('click', async (e) => {
      if (!rewardCollected) {   // must collect this run's coins before submitting — else they're lost
        document.getElementById('submit-status').textContent = '⚠ Collect your coins first — submitting now loses them.';
        const cb = document.getElementById('btn-collect');
        if (cb) { cb.classList.add('pulse'); setTimeout(() => cb.classList.remove('pulse'), 1200); }
        return;
      }
      const name = document.getElementById('name-input').value;
      localStorage.setItem('sherwood_name', name);
      e.target.disabled = true;
      const onchain = window.OnChain && window.OnChain.available();
      if (onchain) e.target.classList.add('is-busy');   // spinner only for the on-chain (wallet) path
      document.getElementById('submit-status').textContent = onchain ? 'Confirm in your wallet…' : '';
      const res = await Leaderboard.submit(name, game.finalScore());
      document.getElementById('submit-status').textContent =
        res.scope === 'on-chain' ? 'Recorded on-chain ✓' : res.scope === 'global' ? 'Posted to the global board!' : 'Saved to this device.';
      e.target.disabled = false; e.target.classList.remove('is-busy');
      game.toMenu();
      openBoard();
    });
    document.getElementById('btn-collect').addEventListener('click', async (e) => {
      const btn = e.currentTarget;
      const status = document.getElementById('collect-status');
      if (!window.Claim || !Claim.configured()) return;
      if (!Claim.available()) { status.textContent = 'Connect your Robinhood wallet to collect.'; return; }
      btn.disabled = true; btn.classList.add('is-busy');
      status.textContent = 'Confirm in your wallet…';
      try {
        await Claim.claim(lastReward);
        rewardCollected = true;                      // unblocks Submit
        btn.classList.remove('is-busy');
        status.textContent = 'Coins collected ✓';   // collect-or-lose: stays disabled after a successful claim
        document.getElementById('submit-status').textContent = '';   // clear any "collect first" warning
      } catch (err) {
        status.textContent = (err && err.message) ? err.message : 'Collect failed.';
        btn.disabled = false; btn.classList.remove('is-busy');
      }
    });
    document.getElementById('btn-retry').addEventListener('click', () => { if (!requireWallet()) return; show('chars'); });
    document.getElementById('btn-over-menu').addEventListener('click', () => { game.toMenu(); show('menu'); });

    document.querySelectorAll('.disc-ico').forEach((el) => { el.innerHTML = window.icon('warn'); });
    game._syncMute();
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  // Compact large numbers so deep-wave gold/score stay readable in the small HUD (e.g. 12345 → 12.3k).
  window.fmtNum = function (n) {
    n = Math.round(n || 0);
    if (n < 10000) return '' + n;
    if (n < 1e6) return (n / 1000).toFixed(n < 1e5 ? 1 : 0).replace(/\.0$/, '') + 'k';
    return (n / 1e6).toFixed(1).replace(/\.0$/, '') + 'm';
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
