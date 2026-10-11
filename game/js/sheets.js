// Sheet-character metadata. These packs ship as raw spritesheets (8 cols of 32px
// frames; rows = animations). sprites.js slices each row into per-frame canvases at
// load and registers the character so it behaves exactly like a pre-sliced one.
// Row indices below were read off each sheet; frame counts are auto-detected.
// NOTE: `face` = the native art's facing; the engine mirrors it to match each entity's heading. The
// CAVE pack (goblin/hobgoblin/slime/golem) ships left-facing art → face:'l'; the TAIGA (satyr/thief/
// troll) and CAMELOT (merlin/knights/mordred/morgan) packs ship right-facing art → face:'r'. With these
// correct, left-moving enemies face left, right-chasing knights face right, and Merlin faces its aim.
// Several packs split each row into TWO directional half-cycles (cols 0-3 vs 4-7); playing the whole row
// made them "look/die both ways", so we pin those to the single 4-frame half that faces LEFT, via
// {row,start,count}. GOTCHA: rows are NOT ordered consistently — the left half is cols 4-7 for some rows
// and cols 0-3 for others (e.g. mordred walk=start:4 but its hurt/death=start:0), so each anim is pinned
// to its own verified half. Pinned: goblin/hobgoblin/slime/golem (all), mordred (all), morgan (all),
// troll (walk). troll idle/hurt/death + satyr/thief + merlin/knights are single sequences (full rows).
window.SHEET_CHARS = {
  goblin:    { sheet: 'game/assets/sheets/goblin.png',    frame: 32, cols: 8, face: 'l', role: 'villain', anims: { idle: { row: 0, start: 4, count: 4 }, walkRun: { row: 1, start: 4, count: 4 }, hurt: { row: 6, start: 4, count: 4 }, death: { row: 7, start: 4, count: 4 } } },
  hobgoblin: { sheet: 'game/assets/sheets/hobgoblin.png', frame: 32, cols: 8, face: 'l', role: 'villain', anims: { idle: { row: 0, start: 4, count: 4 }, walkRun: { row: 1, start: 4, count: 4 }, hurt: { row: 6, start: 4, count: 4 }, death: { row: 7, start: 4, count: 4 } } },
  slime:     { sheet: 'game/assets/sheets/slime.png',     frame: 32, cols: 8, face: 'l', role: 'villain', anims: { idle: { row: 0, start: 4, count: 4 }, walkRun: { row: 1, start: 4, count: 4 }, hurt: { row: 11, start: 4, count: 4 }, death: { row: 12, start: 4, count: 4 } } },
  golem:     { sheet: 'game/assets/sheets/golem.png',     frame: 32, cols: 8, face: 'l', role: 'villain', anims: { idle: { row: 0, start: 4, count: 4 }, walkRun: { row: 1, start: 4, count: 4 }, hurt: { row: 8, start: 4, count: 4 }, death: { row: 9, start: 4, count: 4 } } },
  troll:     { sheet: 'game/assets/sheets/troll.png',     frame: 32, cols: 8, face: 'r', role: 'villain', anims: { idle: 0, walkRun: { row: 1, start: 0, count: 4 }, hurt: 7,  death: 8  } },
  satyr:     { sheet: 'game/assets/sheets/satyr.png',     frame: 32, cols: 8, face: 'r', role: 'villain', anims: { idle: 0, walkRun: 1, hurt: 6,  death: 7  } },
  thief:     { sheet: 'game/assets/sheets/thief.png',     frame: 32, cols: 8, face: 'r', role: 'villain', anims: { idle: 0, walkRun: 2, hurt: 8,  death: 9  } },
  // --- Camelot: playable Wizard + summonable knight allies ---
  merlin:    { sheet: 'game/assets/sheets/merlin.png',    frame: 32, cols: 8, face: 'r', role: 'hero', name: 'Merlin',   anims: { idle: 0, walkRun: 1, hurt: 9, death: 10 } },
  lancelot:  { sheet: 'game/assets/sheets/lancelot.png',  frame: 32, cols: 8, face: 'r', role: 'ally', name: 'Lancelot', anims: { idle: 0, walkRun: 1, attack: 2, hurt: 8, death: 9 } },
  gawain:    { sheet: 'game/assets/sheets/gawain.png',    frame: 32, cols: 8, face: 'r', role: 'ally', name: 'Gawain',   anims: { idle: 0, walkRun: 1, attack: 2, hurt: 8, death: 9 } },
  percival:  { sheet: 'game/assets/sheets/percival.png',  frame: 32, cols: 8, face: 'r', role: 'ally', name: 'Percival', anims: { idle: 0, walkRun: 1, attack: 2, hurt: 8, death: 9 } },
  // Mordred — alternate boss (same sheet layout as merlin: 8 cols x 11 rows).
  mordred:   { sheet: 'game/assets/sheets/mordred.png',   frame: 32, cols: 8, face: 'r', role: 'villain', name: 'Mordred', anims: { idle: { row: 0, start: 4, count: 4 }, walkRun: { row: 1, start: 4, count: 4 }, hurt: { row: 9, start: 0, count: 4 }, death: { row: 10, start: 0, count: 4 } } },
  // Morgan le Fay — caster elite (8 cols x 7 rows).
  morgan:    { sheet: 'game/assets/sheets/morgan.png',    frame: 32, cols: 8, face: 'r', role: 'villain', name: 'Morgan le Fay', anims: { idle: { row: 0, start: 0, count: 4 }, walkRun: { row: 1, start: 0, count: 4 }, hurt: { row: 5, start: 0, count: 4 }, death: { row: 6, start: 0, count: 4 } } },
  // --- Forest pack (8 cols x 6 rows @28px). Single-direction art (face:'r' → engine mirrors). Each
  //     row is a 4-frame anim DUPLICATED across cols 0-3 and 4-7, so we pin to one 4-frame half
  //     ({count:4}) — otherwise one-shots (death/hurt) play the cycle twice (collapse→revive→collapse).
  //     Rows: idle 0, walk/run 2, (centaur) rear/throw 3, hurt 4, death 5. Catcash = playable centaur. ---
  catcash:   { sheet: 'game/assets/sheets/catcash.png',   frame: 28, cols: 8, face: 'r', role: 'hero',    name: 'Cashcat',   anims: { idle: { row: 0, start: 0, count: 4 }, walkRun: { row: 2, start: 0, count: 4 }, attack: { row: 3, start: 0, count: 4 }, hurt: { row: 4, start: 0, count: 4 }, death: { row: 5, start: 0, count: 4 } } },
  boar:      { sheet: 'game/assets/sheets/boar.png',       frame: 28, cols: 8, face: 'r', role: 'villain', name: 'Wild Boar', anims: { idle: { row: 0, start: 0, count: 4 }, walkRun: { row: 2, start: 0, count: 4 }, hurt: { row: 4, start: 0, count: 4 }, death: { row: 5, start: 0, count: 4 } } },
};
