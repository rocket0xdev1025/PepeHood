// Hand-authored inline-SVG icon set — replaces ALL emoji. Every icon is
// monochrome and uses currentColor, so CSS `color` themes it. 24x24 viewBox.
(function () {
  const L = 'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"';
  const F = 'fill="currentColor"';
  const svg = (inner, attrs) => `<svg viewBox="0 0 24 24" ${attrs}>${inner}</svg>`;
  const HEART = 'M12 20.5C5.5 15.7 3 12.4 3 8.8 3 6.1 5 4 7.6 4c1.7 0 3.2.9 4.4 2.6C13.2 4.9 14.7 4 16.4 4 19 4 21 6.1 21 8.8c0 3.6-2.5 6.9-9 11.7z';

  window.ICONS = {
    // --- core ---
    heartFull: svg(`<path d="${HEART}"/>`, F),
    heartEmpty: svg(`<path d="${HEART}"/>`, L),
    coin: svg(`<circle cx="12" cy="12" r="9" fill="currentColor"/><circle cx="12" cy="12" r="6.2" fill="none" stroke="rgba(0,0,0,.28)" stroke-width="1.4"/><path d="M12 8.4l3.6 3.6L12 15.6 8.4 12z" fill="rgba(0,0,0,.26)"/>`, ''),
    flame: svg(`<path d="M12 2C9.2 6 7 8 7 12a5 5 0 0 0 10 0c0-2-1-3.3-2.1-4.4.1 1.6-1 2.2-1.7 2.2C13.5 8 13 5 12 2z"/>`, F),
    banner: svg(`<path d="M6 3v18"/><path d="M6 4.2h12l-3 3.3L18 11H6"/>`, L),

    // --- upgrades ---
    damage: svg(`<path d="M12 3l5.5 8.5H14V21h-4V11.5H6.5z"/>`, F),
    firerate: svg(`<path d="M13 2L5 13.5h5l-2 8.5 9-12.5h-5z"/>`, F),
    fastdraw: svg(`<path d="M8 3a12 12 0 0 1 0 18"/><path d="M8 3v18"/><path d="M5 12h13l-3-3M18 12l-3 3"/>`, L),
    maxheart: svg(`<path d="${HEART}"/><rect x="11" y="8" width="2" height="7" fill="rgba(0,0,0,.32)"/><rect x="8.5" y="10.5" width="7" height="2" fill="rgba(0,0,0,.32)"/>`, F),
    movespeed: svg(`<path d="M7 3h3.5v9.5L17 15.5V19H7z" fill="currentColor" stroke="none"/><path d="M2 9h3.5M1 13h4.5"/>`, L),
    multishot: svg(`<path d="M3 7h10M10 4l3 3-3 3"/><path d="M3 17h10M10 14l3 3-3 3"/><path d="M3 12h15M15 9l3 3-3 3"/>`, L),
    pierce: svg(`<path d="M3.5 20.5l3.5-1L5 17z"/><path d="M6.5 18 18 6.5"/><path d="M17 5.5l3.5-1-1 3.5"/><path d="M11 13l2-2 2 2-2 2z" fill="currentColor"/>`, L),
    fire: svg(`<path d="M12 2C9.2 6 7 8 7 12a5 5 0 0 0 10 0c0-2-1-3.3-2.1-4.4.1 1.6-1 2.2-1.7 2.2C13.5 8 13 5 12 2z"/>`, F),
    frost: svg(`<path d="M12 2v20M3.6 7l16.8 10M20.4 7 3.6 17"/><path d="M12 5.5 9.5 3.5M12 5.5 14.5 3.5M12 18.5 9.5 20.5M12 18.5 14.5 20.5M4.5 9.5 4 6.5M4.5 9.5 7.5 9M19.5 14.5 20 17.5M19.5 14.5 16.5 15"/>`, L),
    explosive: svg(`<path d="M12 3l2 4 4-2-2 4 4 2-4 2 2 4-4-2-2 4-2-4-4 2 2-4-4-2 4-2-2-4 4 2z"/><circle cx="12" cy="12" r="2.6" fill="#fff"/>`, F),
    goldfind: svg(`<path d="M8 7.5c.5-2.5 7.5-2.5 8 0"/><path d="M5.5 7.5h13l1.5 12.5H4z" fill="currentColor" stroke="none"/><path d="M5.5 7.5h13l1.5 12.5H4z"/><path d="M9.5 4l2.5 3.5L14.5 4"/>`, L),
    aimassist: svg(`<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4.4"/><circle cx="12" cy="12" r="1" fill="currentColor"/><path d="M12 1.5v3M12 19.5v3M1.5 12h3M19.5 12h3"/>`, L),
    aimline: svg(`<path d="M2.5 12S6 6.8 12 6.8 21.5 12 21.5 12 18 17.2 12 17.2 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="2.4" fill="currentColor"/><path d="M14.5 8.5c3.5.2 5.5 2.5 6.5 4.5" stroke-dasharray="0.5 2.5"/>`, L),

    // --- consumables ---
    fullheal: svg(`<path d="M9.5 3h5M10.5 3v4.5l-4 9.5a3.4 3.4 0 0 0 3.2 4.7h4.6a3.4 3.4 0 0 0 3.2-4.7l-4-9.5V3"/><path d="M12 12.5v4M10 14.5h4"/>`, L),
    volley: svg(`<path d="M5 19 10 6"/><path d="M10 6l-.5 3M10 6l3 .3"/><path d="M5 19 18 14"/><path d="M18 14l-3 .2M18 14l-.3-3"/><path d="M5 19 14.5 9.5"/><path d="M14.5 9.5l-.2 3M14.5 9.5l3 .2"/>`, L),
    freeze: svg(`<path d="M12 2v20M3.6 7l16.8 10M20.4 7 3.6 17"/><path d="M12 5.5 9.5 3.5M12 5.5 14.5 3.5M12 18.5 9.5 20.5M12 18.5 14.5 20.5M4.5 9.5 4 6.5M4.5 9.5 7.5 9M19.5 14.5 20 17.5M19.5 14.5 16.5 15"/>`, L),
    rapidfire: svg(`<circle cx="12" cy="13" r="8"/><path d="M12 8.5V13l3.2 1.8"/><path d="M12 2.2V4M5 4.2l1 1.6M19 4.2l-1 1.6"/>`, L),
    shield: svg(`<path d="M12 2.5l8 3v5.6c0 5-3.6 8.9-8 10.9-4.4-2-8-5.9-8-10.9V5.5z"/><path d="M12 6v12"/><path d="M9 9.5c1 1 1 2.5 0 3.5M15 9.5c-1 1-1 2.5 0 3.5"/>`, L),
    windfall: svg(`<ellipse cx="12" cy="16.5" rx="7" ry="2.6"/><path d="M5 16.5v-2c0 1.4 3.1 2.6 7 2.6s7-1.2 7-2.6v2"/><ellipse cx="12" cy="12.5" rx="7" ry="2.6"/><ellipse cx="12" cy="8.5" rx="7" ry="2.6"/>`, L),

    // --- UI glyphs ---
    play: svg(`<path d="M7 4.5l12.5 7.5L7 19.5z"/>`, F),
    trophy: svg(`<path d="M7 4h10v4.5a5 5 0 0 1-10 0z"/><path d="M7 5.5H4.2a2.8 2.8 0 0 0 3 3M17 5.5h2.8a2.8 2.8 0 0 1-3 3"/><path d="M12 13.5V17M9 20.5h6M10 17.5h4v3h-4z"/>`, L),
    help: svg(`<circle cx="12" cy="12" r="9"/><path d="M9.3 9.4a2.8 2.8 0 1 1 4 2.6c-.9.5-1.3 1-1.3 2.1"/><circle cx="12" cy="17" r="0.7" fill="currentColor"/>`, L),
    swords: svg(`<path d="M4 5l11 11"/><path d="M15 16l3-.6-.6-3"/><path d="M4 5h3M4 5v3"/><path d="M20 5L9 16"/><path d="M9 16l-3-.6.6-3"/><path d="M20 5h-3M20 5v3"/>`, L),
    chevronLeft: svg(`<path d="M15 5l-7 7 7 7"/>`, L),
    chevronRight: svg(`<path d="M9 5l7 7-7 7"/>`, L),
    retry: svg(`<path d="M20 12a8 8 0 1 1-2.4-5.7"/><path d="M20 3.5V8h-4.5"/>`, L),
    soundOn: svg(`<path d="M4 9.5v5h3.5L13 19V5L7.5 9.5z"/><path d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8 8 0 0 1 0 12"/>`, L),
    soundOff: svg(`<path d="M4 9.5v5h3.5L13 19V5L7.5 9.5z"/><path d="M16.5 9.5l5 5M21.5 9.5l-5 5"/>`, L),
    globe: svg(`<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3.2 3 14.8 0 18M12 3c-3 3.2-3 14.8 0 18"/>`, L),
    device: svg(`<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M8 4v6h8V4M9 14.5h6"/>`, L),
    arrowLeft: svg(`<path d="M15 5 7 12l8 7z"/>`, F),
    arrowRight: svg(`<path d="M9 5l8 7-8 7z"/>`, F),
    jumpUp: svg(`<path d="M12 5l7 8h-4v6h-6v-6H5z"/>`, F),
    wallet: svg(`<rect x="3" y="5.5" width="18" height="13" rx="2.5"/><path d="M3 9.5h18"/><circle cx="16.5" cy="14" r="1.3" fill="currentColor"/>`, L),
    warn: svg(`<path d="M12 3.5 21 19H3z"/><path d="M12 10v4"/><circle cx="12" cy="16.6" r="0.7" fill="currentColor"/>`, L),
    link: svg(`<path d="M9 15l6-6"/><path d="M10.5 6.5l1.8-1.8a3.5 3.5 0 0 1 5 5L14.5 12"/><path d="M13.5 17.5l-1.8 1.8a3.5 3.5 0 0 1-5-5L9.5 12"/>`, L),
    logout: svg(`<path d="M14 4H6a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h8"/><path d="M11 12h10M18 9l3 3-3 3"/>`, L),
    lock: svg(`<rect x="5" y="10.5" width="14" height="10" rx="2"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/>`, L),
  };

  window.icon = function (name, cls) {
    return `<span class="ico ${cls || ''}" aria-hidden="true">${window.ICONS[name] || ''}</span>`;
  };

  // Colored pixel-art item image (CC0 pack), with inline-SVG fallback if missing.
  window.iconImg = function (key, cls) {
    return `<img class="ui-img ${cls || ''}" src="assets/ui/icons/${key}.png" alt="" aria-hidden="true" onerror="window._iconFallback(this,'${key}')">`;
  };
  window._iconFallback = function (img, key) {
    const span = document.createElement('span');
    span.className = 'ico';
    span.innerHTML = window.ICONS[key] || '';
    img.replaceWith(span);
  };
})();
