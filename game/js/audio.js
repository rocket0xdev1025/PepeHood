// Tiny WebAudio SFX — no audio files needed. All synthesized blips.
window.Sfx = (function () {
  let ctx = null, muted = false;
  function ac() {
    if (!ctx) { try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {} }
    if (ctx && ctx.state === 'suspended') ctx.resume();
    return ctx;
  }
  function tone(freq, dur, type, gain, slideTo) {
    if (muted) return;
    const c = ac(); if (!c) return;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type || 'square';
    o.frequency.setValueAtTime(freq, c.currentTime);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(40, slideTo), c.currentTime + dur);
    g.gain.setValueAtTime(0.0001, c.currentTime);
    g.gain.exponentialRampToValueAtTime(gain || 0.12, c.currentTime + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + dur);
    o.connect(g); g.connect(c.destination);
    o.start(); o.stop(c.currentTime + dur + 0.02);
  }
  return {
    draw() { tone(220, 0.12, 'sawtooth', 0.05, 320); },
    shoot() { tone(680, 0.12, 'square', 0.10, 240); },
    hit() { tone(160, 0.09, 'square', 0.12, 90); },
    kill() { tone(440, 0.10, 'square', 0.12, 660); tone(660, 0.12, 'square', 0.08, 880); },
    coin() { tone(880, 0.08, 'triangle', 0.10, 1320); },
    breach() { tone(120, 0.30, 'sawtooth', 0.16, 50); },
    jump() { tone(420, 0.10, 'square', 0.07, 700); },
    over() { tone(330, 0.5, 'sawtooth', 0.14, 70); },
    setMuted(m) { muted = m; },
    isMuted() { return muted; },
    resume() { ac(); },
  };
})();
