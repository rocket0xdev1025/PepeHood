// Game tuning constants and character definitions.
// All gameplay numbers live here so balancing is a one-file job.
//
// NOTE: the game renders in a LOW internal resolution (480x270) and is
// integer-upscaled, so every spatial/px-per-second value below is in that
// 480x270 space (roughly half the old 960x540 numbers).
window.CONFIG = {
  VIEW_W: 768,       // logical viewport (1:1 world px) — bigger = camera further back
  VIEW_H: 432,
  GRAVITY: 550,      // px/s^2 for thrown projectiles

  // Robinhood cluster — used by js/wallet.js for wallet connect.
  solana: {
    cluster: 'mainnet-beta',
    rpcUrl: 'https://api.mainnet-beta.solana.com',
    ticker: 'HOOD',
    name: 'Robinhood',
  },

  // Legacy EVM chain config (on-chain leaderboard/rewards still EVM; inactive until migrated).
  chain: {
    chainIdHex: '0x1237',          // 4663
    chainId: 4663,
    chainName: 'Robinhood',
    rpcUrls: ['https://poptye-always-win.poptyedev.com/'],
    nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
    blockExplorerUrls: [],
    // On-chain leaderboard contract (SherwoodLeaderboard). Paste the deployed address here once the
    // chain is live; until then it stays empty and the leaderboard transparently uses the local board.
    leaderboardAddress: '',

    // Coin rewards (SherwoodDistributor contract + the claim-signer Worker). Both must be set for the
    // "Collect coins" button to appear; while either is empty, rewards are OFF and the game plays as
    // normal. distributorAddress = the deployed SherwoodDistributor; claimUrl = your claim Worker URL.
    distributorAddress: '0x5b8e1181De05317CB6C9B7BaAC06a566f427fa69',
    claimUrl: 'https://sherwood-claim-signer.robinero.workers.dev/claim',
    // Reward token (HOOD) — needed for the pay-to-play approve/entry flow. The per-game
    // entry fee itself is read live from the contract (entryFee()); set it on-chain via setEntryFee().
    rewardToken: '0x4644df504ba0a63372226d32c8959810101f7b19',
    // Character unlocks (SherwoodCharacters contract) + the CashCat token used by the centaur.
    // Empty charactersAddress = unlocks off (all heroes free). Prices/ids live on each HERO's
    // `unlock` field below and must match setCharacter() on-chain.
    charactersAddress: '0x07Ab60087220cEa68300448d9C99Ec4525c2A5FC',
    cashcatToken: '0x020bfc650a365f8bb26819deaabf3e21291018b4',
  },

  // Player handling
  player: {
    accel: 900,         // px/s^2 toward input direction
    friction: 12,       // exponential damping when no input
    depthFactor: 1.0,   // top-down: x and y move equally
    drawMin: 0.10,
    arrowSpeedMin: 300,
    arrowSpeedMax: 560,
    fireCooldown: 0.12,
    invulnOnHit: 1.1,
  },

  combo: { window: 2.6, max: 5 },

  // Large 2D top-down field. Camera follows the player in x AND y. A pseudo-3D
  // castle anchors the WEST side; enemies seek it and breach at its east face.
  // (Terrain is pre-rendered once to a ~2200x1700 offscreen canvas ≈ 15 MB.)
  world: {
    W: 2200, H: 1700, margin: 40,
    castle: { x0: 0, x1: 300, breachX: 300, y0: 560, y1: 1140 },
    anchorX: 0.5, anchorY: 0.5,
    deadzoneX: 38, deadzoneY: 28,    // tight follow box (in base screen px) — low lag
    camFollow: 11,                    // follow speed: k = min(1, camFollow*dt)
    zoom: 2,                          // default zoom-out (cycle 2/5/10 with Z)
  },

  // Feel / juice tuning.
  juice: {
    knockback: 95, magnetRadius: 52, magnetAccel: 720, magnetMax: 220,
    hitStop: 0.055, traumaHeavy: 0.55, traumaLight: 0.32, maxShake: 7,
  },

  // Endless discrete waves (exponential but tamed). See game.js wave helpers.
  waves: {
    countBase: 2, countLin: 1.6, countPow: 0.45, countExp: 1.35,
    hpBase: 1.08,                 // hpMult = hpBase^(n-1)
    speedPerWave: 0.03, speedCap: 1.6,
    spawnGapStart: 0.95, spawnGapPerWave: 0.045, spawnGapMin: 0.4,
    unlock: {                     // earliest wave each monster can appear (troll = boss only)
      goblin: 1,
      hobgoblin: 2,
      thief: 3,
      slime: 3,
      ooze: 3,
      satyr: 4,
      ravager: 4,
      boar: 4,
      golem: 5,
      shaman: 5,
      warden: 6,
      revenant: 7,
    },
    bossEvery: 5, bossHpMult: 2.7,
    archEvery: 10, archHpMult: 2.0, archScale: 1.4,   // Morgan le Fay = arch-boss every 10th wave (boss-only)
  },

  // Combined leaderboard score (spending gold never lowers it).
  score: { goldWeight: 1, killWeight: 12, waveWeight: 250 },

  // Economy. killGoldMult scales ALL gold earned from kills (the only income). 0.25 = 75% cut so the
  // shop matters and the player can't out-upgrade the difficulty in the first few waves.
  economy: { killGoldMult: 0.25 },

  shop: {
    // Permanent, per-run upgrades. Next-purchase cost = round(baseCost*costGrow^level).
    upgrades: [
      { key: 'aimline',   name: 'Keen Eye',     desc: 'Dotted aim line — see your arrow’s arc',        baseCost: 50,  costGrow: 1.8,  max: 2 },
      { key: 'damage',    name: 'Heavy Tips',   desc: '+1 arrow damage',                                    baseCost: 60,  costGrow: 1.7,  max: 4 },
      { key: 'firerate',  name: 'Quick Nock',   desc: 'Shoot faster (-12% cooldown)',                       baseCost: 65,  costGrow: 1.7,  max: 4 },
      { key: 'fastdraw',  name: 'Limber Arms',  desc: 'Draw the bow faster (-10% draw time)',               baseCost: 50,  costGrow: 1.55, max: 3 },
      { key: 'maxheart',  name: 'Stout Heart',  desc: '+1 max heart (and heal 1)',                          baseCost: 80,  costGrow: 1.7,  max: 4 },
      { key: 'movespeed', name: 'Fleet Foot',   desc: '+18% move speed',                                    baseCost: 45,  costGrow: 1.5,  max: 3 },
      { key: 'multishot', name: 'Split Shot',   desc: '+1 arrow per shot (spread)',                         baseCost: 130, costGrow: 1.9, max: 3 },
      { key: 'pierce',    name: 'Bodkin Point', desc: 'Arrows pierce +1 enemy',                             baseCost: 130, costGrow: 1.8, max: 3 },
      { key: 'fire',      name: 'Fire Arrows',  desc: 'Hits set foes ablaze — burning damage',              baseCost: 100, costGrow: 1.7,  max: 3 },
      { key: 'frost',     name: 'Frost Arrows', desc: 'Hits chill foes, slowing their advance',             baseCost: 85,  costGrow: 1.7,  max: 3 },
      { key: 'explosive', name: 'Blast Tips',   desc: 'Arrows burst, damaging nearby foes',                 baseCost: 150, costGrow: 1.9, max: 3 },
      { key: 'goldfind',  name: 'Friar’s Purse', desc: '+20% gold from kills',                         baseCost: 70,  costGrow: 1.65, max: 4 },
      { key: 'aimassist', name: 'Steady Aim',   desc: 'Bigger hit window on enemies',                       baseCost: 60,  costGrow: 1.6,  max: 3 },
      { key: 'bloodthirst', name: 'Bloodthirst', desc: 'Heal 1 heart every 18 kills (faster per level)',    baseCost: 120, costGrow: 1.7,  max: 3 },
    ],
    // One-time consumables, used mid-wave (hotkeys 1-6).
    consumables: [
      { key: 'fullheal',  name: 'Healing Draught',     desc: 'Restore one heart',                  cost: 120, max: 3 },
      { key: 'volley',    name: 'Arrow Storm',         desc: 'Loose a fan of arrows at once',      cost: 110, max: 3 },
      { key: 'freeze',    name: 'Sheriff’s Chill', desc: 'Freeze all enemies for 4s',          cost: 120, max: 3 },
      { key: 'rapidfire', name: 'Fury of the Forest',  desc: 'Rapid fire for 6s',                  cost: 120, max: 3 },
      { key: 'shield',    name: 'Oaken Guard',         desc: 'Block the next 3 hits',              cost: 90,  max: 3 },
      { key: 'windfall',  name: 'Gamble Cache',        desc: 'Wager for random gold — 5% windfall', cost: 70,  max: 5 },
      { key: 'thunderclap', name: 'Thunderclap',       desc: 'Blast nearby foes — damage + knockback', cost: 90, max: 3 },
      { key: 'knights',   name: 'Knights of the Round', desc: 'Summon 3 knights to fight this wave', cost: 120, max: 2 },
    ],
  },
};

// Player-selectable heroes (all wield the bow — they're Merry archers).
// fireCd = seconds between shots; scale/moveSpeed are in 480x270 space.
window.HEROES = [
  {
    key: 'robinHood', tagline: 'The complete archer — fast draw, true aim.',
    hearts: 3, moveSpeed: 95, drawTime: 0.66, fireCd: 0.10, dmgBonus: 0, goldMult: 1.0, scale: 1.5,
  },
  {
    key: 'littleJohn', tagline: 'Tanky and strong — slow to draw, but his shots crush armour.',
    hearts: 4, moveSpeed: 82, drawTime: 0.92, fireCd: 0.16, dmgBonus: 1, goldMult: 1.0, scale: 1.6,
    unlock: { id: 1, token: 'HOOD', priceWei: '500000000000000000000000', label: '500,000 HOOD' },
  },
  {
    key: 'maidMarian', tagline: 'Glass cannon — fragile, but a blistering rate of fire.',
    hearts: 2, moveSpeed: 122, drawTime: 0.50, fireCd: 0.08, dmgBonus: 0, goldMult: 1.0, scale: 1.45,
    unlock: { id: 2, token: 'HOOD', priceWei: '750000000000000000000000', label: '750,000 HOOD' },
  },
  {
    key: 'merlin', tagline: 'The wizard — hurls purple fireballs that burst on impact.',
    hearts: 2, moveSpeed: 92, drawTime: 0.60, fireCd: 0.15, dmgBonus: 1, goldMult: 1.0, scale: 2.0, attack: 'fireball',
    unlock: { id: 3, token: 'HOOD', priceWei: '1000000000000000000000000', label: '1,000,000 HOOD' },
  },
  {
    key: 'catcash', name: 'Cashcat', tagline: 'The centaur — hurls heavy spears that skewer the whole line.',
    hearts: 3, moveSpeed: 104, drawTime: 0.62, fireCd: 0.20, dmgBonus: 1, goldMult: 1.0, scale: 1.7, attack: 'spear',
    unlock: { id: 4, token: 'CASHCAT', priceWei: '160000000000000000000000', label: '160,000 CASHCAT' },
  },
];

// Monsters. keys MUST match the sheet-character keys in sheets.js (Animator uses the key).
// speed/scale/throwRange/projSpeed are in 480x270 space. Sheets are 32px, so scales run a
// touch lower than the 24px Robin. Troll is boss-only (see _buildRoster); not in waves.unlock.
window.ENEMIES = {
  goblin: {
    name: 'Goblin', hp: 1, speed: 42, gold: 4, scale: 2.0, type: 'melee', weight: 3,
  },
  hobgoblin: {
    name: 'Hobgoblin', hp: 2, speed: 40, gold: 8, scale: 2.1, type: 'melee', weight: 3,
  },
  thief: {
    name: 'Bandit', hp: 2, speed: 44, gold: 12, scale: 2.0, type: 'thrower', weight: 2,
    throwRange: 175, throwEvery: 2.3, projSpeed: 185,
  },
  slime: {
    name: 'Slime', hp: 3, speed: 34, gold: 10, scale: 2.0, type: 'melee', weight: 2,
  },
  satyr: {
    name: 'Satyr', hp: 2, speed: 52, gold: 14, scale: 2.1, type: 'melee', weight: 2,
  },
  golem: {
    name: 'Stone Golem', hp: 5, speed: 26, gold: 24, scale: 2.6, type: 'elite', weight: 1,
  },
  troll: {                          // boss: charges in P2, enrages + spawns goblin adds in P3
    name: 'Troll', hp: 6, speed: 30, gold: 30, scale: 3.0, type: 'elite', weight: 1,
    charge: { range: 250, windup: 0.75, burst: 0.5, speed: 180, cd: 4.5 }, adds: { count: 2, every: 6 },
  },
  mordred: {                        // alternate boss (Camelot knight): faster, more aggressive charges
    name: 'Mordred', sprite: 'mordred', hp: 7, speed: 34, gold: 42, scale: 2.6, type: 'elite', weight: 1,
    charge: { range: 290, windup: 0.6, burst: 0.55, speed: 235, cd: 3.6 }, adds: { count: 2, every: 5 },
  },
  // --- Behavior archetypes (reuse existing sprites via `sprite`; `tint` recolors the body) ---
  warden: {                         // shielded: blocks most damage from the front — flank it
    name: 'Shield Warden', sprite: 'golem', hp: 4, speed: 24, gold: 22, scale: 2.5,
    type: 'melee', weight: 1, shield: 'front',
  },
  ravager: {                        // charger: telegraphs, then dashes at the player
    name: 'Ravager', sprite: 'satyr', hp: 2, speed: 34, gold: 16, scale: 2.1,
    type: 'charger', weight: 2, charge: { range: 210, windup: 0.55, burst: 0.4, speed: 215, cd: 2.6 },
  },
  boar: {                           // beast charger: fast, relentless, barely telegraphs its gore-dash
    name: 'Wild Boar', hp: 3, speed: 60, gold: 14, scale: 2.4,
    type: 'charger', weight: 2, charge: { range: 235, windup: 0.38, burst: 0.45, speed: 260, cd: 2.0 },
  },
  ooze: {                           // splitter: bursts into two lesser oozes on death
    name: 'Ooze', sprite: 'slime', hp: 3, speed: 30, gold: 12, scale: 2.2,
    type: 'melee', weight: 2, splits: 2,
  },
  revenant: {                       // regenerator: heals over time unless recently hurt
    name: 'Revenant', sprite: 'troll', tint: '#86e0a0', hp: 5, speed: 24, gold: 22, scale: 2.3,
    type: 'elite', weight: 1, regen: { rate: 1.4, delay: 2.2 },
  },
  shaman: {                         // caster: fires straight magic bolts from range
    name: 'Goblin Shaman', sprite: 'goblin', tint: '#b483ff', hp: 2, speed: 28, gold: 16, scale: 2.0,
    type: 'caster', weight: 2, castRange: 300, castEvery: 2.4, projSpeed: 230,
  },
  morgan: {                         // ARCH-BOSS (Camelot sorceress): every 10th wave, boss-only.
    name: 'Morgan le Fay', sprite: 'morgan', tint: '#c77dff', hp: 5, speed: 24, gold: 60, scale: 2.2,
    type: 'caster', weight: 1, castRange: 340, castEvery: 1.6, projSpeed: 260,
    adds: { count: 2, every: 5 },   // spawns goblin adds while enraged (phase 3)
  },
};
