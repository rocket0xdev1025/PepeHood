// Asset loading + frame resolution. Uses window.SPRITE_MANIFEST (manifest.js).
// No fetch() of JSON — everything is image <-> path, so this works from file://.
window.Assets = (function () {
  const M = window.SPRITE_MANIFEST;
  const BASE = 'game/assets/sprites';
  const cache = {};        // path -> Image
  let toLoad = 0, loaded = 0, failed = 0;

  function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

  function load(path) {
    if (cache[path]) return cache[path];
    const img = new Image();
    toLoad++;
    img.onload = () => { loaded++; };
    img.onerror = () => { failed++; loaded++; img._broken = true; };
    img.src = path;
    cache[path] = img;
    return img;
  }

  // Queue every sprite referenced by the manifest.
  function preload() {
    for (const charKey in M.characters) {
      const c = M.characters[charKey];
      for (const anim in c.anims) {
        const dirs = c.anims[anim];
        for (const d in dirs) {
          const n = dirs[d];
          for (let i = 0; i < n; i++) {
            load(`${BASE}/${charKey}/${anim}/${d}${cap(anim)}_${i}.png`);
          }
        }
      }
    }
    for (let i = 0; i < (M.weapons.bowFrames || 0); i++) load(`${BASE}/weapons/bow_${i}.png`);
    load(`${BASE}/weapons/arrow_.png`);
    load(`${BASE}/weapons/stick_.png`);
    // Sheet characters (raw 32px spritesheets) — sliced into per-frame canvases at load.
    if (window.SHEET_CHARS) for (const k in window.SHEET_CHARS) sliceSheet(k, window.SHEET_CHARS[k]);
  }

  // Slice a spritesheet into per-frame canvases (both facings) and register the
  // character in the manifest, so the rest of the pipeline treats it like any other.
  function sliceSheet(key, def) {
    const img = new Image();
    toLoad++;
    img.onload = () => {
      const F = def.frame, cols = def.cols;
      let probe = null;
      try {
        const sc = document.createElement('canvas'); sc.width = img.width; sc.height = img.height;
        const sx = sc.getContext('2d'); sx.drawImage(img, 0, 0); probe = sx;
      } catch (e) { probe = null; }
      const nativeDir = def.face, otherDir = nativeDir === 'r' ? 'l' : 'r';
      // footPad = empty rows below the character in a planted (idle) frame, so we can sit
      // the feet on the ground instead of the frame's bottom edge (kills the "floating" look).
      // Default ~1/8 of the frame (4px @ 32) so monsters still sit on the ground even when the
      // pixel probe is unavailable (canvas tainted on file://); refine from pixels when we can.
      let footPad = Math.round(F / 8);
      const rowOf = (spec) => (spec && typeof spec === 'object' ? spec.row : spec);
      if (probe) {
        const idleRow = def.anims.idle != null ? rowOf(def.anims.idle) : 0;
        let bottom = -1;
        try {
          const d = probe.getImageData(0, idleRow * F, F, F).data;     // idle frame 0
          for (let yy = F - 1; yy >= 0 && bottom < 0; yy--) for (let xx = 0; xx < F; xx++) { if (d[(yy * F + xx) * 4 + 3] > 16) { bottom = yy; break; } }
        } catch (e) {}
        if (bottom >= 0) footPad = F - 1 - bottom;
      }
      const anims = {};
      for (const anim in def.anims) {
        // An anim spec is a row index, OR { row, start, count } to pin an explicit sub-range.
        // The latter lets us drop sheets whose row packs TWO directional half-cycles (e.g. the
        // monster walk rows: frames 0-3 face one way, 4-7 the other) — playing all of them made
        // the character "look left then right" while walking.
        const spec = def.anims[anim];
        const isRange = spec && typeof spec === 'object';
        const row = isRange ? spec.row : spec;
        const start = isRange && spec.start != null ? spec.start : 0;
        let n;
        if (isRange && spec.count != null) {
          n = spec.count;                             // explicit count — skip auto-detect
        } else if (probe) {                           // count leading non-empty cells
          n = 0;
          for (let c = 0; c < cols; c++) {
            let any = false;
            try {
              const d = probe.getImageData(c * F, row * F, F, F).data;
              for (let p = 3; p < d.length; p += 4) { if (d[p] !== 0) { any = true; break; } }
            } catch (e) { any = true; }
            if (!any) break;
            n++;
          }
          if (n === 0) n = 1;
        } else {
          n = cols;
        }
        const cap = anim.charAt(0).toUpperCase() + anim.slice(1);
        for (let i = 0; i < n; i++) {
          const cv = document.createElement('canvas'); cv.width = F; cv.height = F;
          cv.getContext('2d').drawImage(img, (start + i) * F, row * F, F, F, 0, 0, F, F);
          cv._footPad = footPad;
          cache[`${BASE}/${key}/${anim}/${nativeDir}${cap}_${i}.png`] = cv;
          const fv = document.createElement('canvas'); fv.width = F; fv.height = F;
          const fc = fv.getContext('2d'); fc.translate(F, 0); fc.scale(-1, 1); fc.drawImage(cv, 0, 0);
          fv._footPad = footPad;
          cache[`${BASE}/${key}/${anim}/${otherDir}${cap}_${i}.png`] = fv;
        }
        anims[anim] = { l: n, r: n };
      }
      M.characters[key] = { name: def.name || key, role: def.role || 'villain', anims };
      loaded++;
    };
    img.onerror = () => { loaded++; failed++; img._broken = true; };
    img.src = def.sheet;
  }

  // Resolve an animation's available direction/length with graceful fallback.
  function resolveAnim(charKey, anim) {
    const c = M.characters[charKey];
    if (!c) return null;
    if (c.anims[anim]) return { anim, dirs: c.anims[anim] };
    // Fallbacks: jump -> walkRun -> idle; anything -> idle.
    const order = anim === 'jump' ? ['walkRun', 'idle'] : ['idle', 'walkRun'];
    for (const a of order) if (c.anims[a]) return { anim: a, dirs: c.anims[a] };
    return null;
  }

  // Get a single frame Image with direction + index fallback.
  function frame(charKey, anim, dir, index) {
    const r = resolveAnim(charKey, anim);
    if (!r) return null;
    let d = dir;
    if (!(d in r.dirs)) d = (d === 'l') ? 'r' : 'l';
    if (!(d in r.dirs)) d = Object.keys(r.dirs)[0];
    const count = r.dirs[d];
    const i = ((index % count) + count) % count;
    return cache[`${BASE}/${charKey}/${r.anim}/${d}${cap(r.anim)}_${i}.png`] || null;
  }

  function animLength(charKey, anim, dir) {
    const r = resolveAnim(charKey, anim);
    if (!r) return 1;
    let d = (dir in r.dirs) ? dir : Object.keys(r.dirs)[0];
    return r.dirs[d];
  }

  function weapon(kind, i) {
    if (kind === 'bow') return cache[`${BASE}/weapons/bow_${i || 0}.png`];
    if (kind === 'arrow') return cache[`${BASE}/weapons/arrow_.png`];
    if (kind === 'stick') return cache[`${BASE}/weapons/stick_.png`];
    return null;
  }

  function progress() { return toLoad === 0 ? 1 : loaded / toLoad; }
  function ready() { return toLoad > 0 && loaded >= toLoad; }

  return { preload, frame, animLength, weapon, progress, ready, FRAME: M.frameSize };
})();

// Per-entity animation clock. Advances frames at a fixed fps and tracks loops.
window.Animator = class {
  constructor(charKey) {
    this.char = charKey;
    this.anim = 'idle';
    this.dir = 'r';
    this.t = 0;
    this.frame = 0;
    this.fps = 10;
    this.loop = true;
    this.done = false;
  }
  play(anim, { fps = 10, loop = true, reset = false } = {}) {
    if (this.anim === anim && !reset) { this.loop = loop; this.fps = fps; return; }
    this.anim = anim; this.fps = fps; this.loop = loop;
    this.t = 0; this.frame = 0; this.done = false;
  }
  update(dt) {
    const len = Assets.animLength(this.char, this.anim, this.dir);
    this.t += dt;
    const step = 1 / this.fps;
    while (this.t >= step) {
      this.t -= step;
      if (this.frame + 1 >= len) {
        if (this.loop) this.frame = 0;
        else { this.frame = len - 1; this.done = true; }
      } else {
        this.frame++;
      }
    }
  }
  image() { return Assets.frame(this.char, this.anim, this.dir, this.frame); }
};
