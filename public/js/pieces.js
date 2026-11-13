import { PIECES, splitLook } from './catalog.js';

// Eigene Figuren-Silhouetten (viewBox 0 0 45 45). F = Füllung, D = Detail-Linie
const BASE = '<path class="F" d="M10 40.5h25a1.5 1.5 0 0 0 1.5-1.5v-.6a2.2 2.2 0 0 0-2.2-2.2H10.7a2.2 2.2 0 0 0-2.2 2.2v.6a1.5 1.5 0 0 0 1.5 1.5z"/>';
const SHAPES = {
  p: `<path class="F" d="M18.6 21.8c-.4 5.2-2.6 10-6.1 14.4h20c-3.5-4.4-5.7-9.2-6.1-14.4z"/>
      <path class="F" d="M16.4 22.2h12.2a1.6 1.6 0 0 0 0-3.2H16.4a1.6 1.6 0 0 0 0 3.2z"/>
      <circle class="F" cx="22.5" cy="13.2" r="5.4"/>${BASE}`,
  r: `<path class="F" d="M15 18.6h15l1.6 17.6H13.4z"/>
      <path class="F" d="M12.3 16.3V9h4.6v3h3.1V9h5v3h3.1V9h4.6v7.3l-2.6 2.6H14.9z"/>
      <path class="D" d="M15 18.9h15M14.2 32.5h16.6" fill="none"/>${BASE}`,
  n: `<path class="F" d="M13.2 36.2c-.3-6.2 2.2-10 5.6-12.8 1.6-1.4 1.6-3.6-.3-3.9-2.6-.4-4.6 2-6.2 3-2 1.2-4.2.2-3.9-2.3.6-4.6 5.6-10 8.4-11.6l.6-3.4 2.8 2.7c7.5-.5 14 4.3 15.2 13.4.7 5.5-.6 10.6-1.5 14.9z"/>
      <path class="D" d="M24.3 11.4c4.6 2.6 7 7.6 6.9 14.6" fill="none"/>
      <circle class="E" cx="17.2" cy="13.6" r="1.25"/><circle class="E" cx="10.4" cy="20.4" r=".8"/>${BASE}`,
  b: `<circle class="F" cx="22.5" cy="7.2" r="2.6"/>
      <path class="F" d="M22.5 10.2c-6.6 4.4-8.4 10.4-6.4 15.2.9 2.2 2.4 3.3 2.4 3.3h8s1.5-1.1 2.4-3.3c2-4.8.2-10.8-6.4-15.2z"/>
      <path class="F" d="M17 28.6h11a1.6 1.6 0 0 1 0 3.2H17a1.6 1.6 0 0 1 0-3.2z"/>
      <path class="F" d="M18.6 31.8c-.5 2-2.6 3.4-5.4 4.4h18.6c-2.8-1-4.9-2.4-5.4-4.4z"/>
      <path class="D" d="M24.6 15.2l-4 4.6M22.5 21.2v3.6" fill="none"/>${BASE}`,
  q: `<path class="F" d="M9 15.4l4.2 16h18.6l4.2-16-6 9.4-.6-13-4.6 12.6-2.3-13.6-2.3 13.6-4.6-12.6-.6 13z"/>
      <path class="F" d="M13.2 31.4h18.6l.9 4.8H12.3z"/>
      <circle class="F" cx="9" cy="13.6" r="2.3"/><circle class="F" cx="15.8" cy="10.6" r="2.3"/><circle class="F" cx="22.5" cy="9.4" r="2.4"/><circle class="F" cx="29.2" cy="10.6" r="2.3"/><circle class="F" cx="36" cy="13.6" r="2.3"/>
      <path class="D" d="M13.4 31.6h18.2" fill="none"/>${BASE}`,
  k: `<path class="F" d="M21.1 3.6h2.8v3.1h3.1v2.8h-3.1v3.6h-2.8V9.5H18V6.7h3.1z"/>
      <path class="F" d="M22.5 13.4c-4.6 0-5.6 3.8-4 6.8-5.6-3.2-11.2-1.2-10.2 4.6.8 4.4 4.6 5.8 4.8 7h18.8c.2-1.2 4-2.6 4.8-7 1-5.8-4.6-7.8-10.2-4.6 1.6-3 .6-6.8-4-6.8z"/>
      <path class="F" d="M13.1 31.8h18.8l.8 4.4H12.3z"/>
      <path class="D" d="M22.5 16.4v15.2M13.3 31.9h18.4" fill="none"/>${BASE}`,
};


// ---------------------------------------------------------------- Weitere Formen (Shop-Tab „Formen“)
// Klassen: F = Füllung (Skin-Verlauf), D = Detail-Linie, E = Detail-Fläche, S = Umriss-Fläche, T = Schrift, K = Bäckchen, W = Glanzpunkt
const ACCENTS = /<text[\s\S]*?<\/text>|<[^>]*class="[SKTW]"[^>]*\/>/g; // für Wirbel-/Glanz-Ebenen nur die Silhouette

// Modern: geometrische Grundformen
function star(cx, cy, ro, ri, n = 5) {
  let d = '';
  for (let i = 0; i < n * 2; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / n, r = i % 2 ? ri : ro;
    d += `${i ? 'L' : 'M'}${(cx + Math.cos(a) * r).toFixed(2)} ${(cy + Math.sin(a) * r).toFixed(2)}`;
  }
  return d + 'z';
}
const MODERN = {
  p: `<circle class="F" cx="22.5" cy="13" r="5.6"/><path class="F" d="M16.6 36.2L22.5 19.6l5.9 16.6z"/>${BASE}`,
  r: `<path class="F" d="M13 9.6h4.4v3.6h3V9.6h4.2v3.6h3V9.6H32v8.4H13z"/><path class="F" d="M15.2 18h14.6v18.2H15.2z"/><path class="D" d="M15.4 27h14.2" fill="none"/>${BASE}`,
  n: `<path class="F" d="M13 36.2l2.6-15.6-5.4-3.4 7.4-10.4 9.6.6 6.4 9.8-1.6 19z"/><circle class="E" cx="19" cy="12.6" r="1.5"/><path class="D" d="M24 9.5l4.6 8" fill="none"/>${BASE}`,
  b: `<path class="F" d="M22.5 4.6l7.6 12.2-7.6 12.2-7.6-12.2z"/><path class="D" d="M22.5 11v11.6M18.6 16.8h7.8" fill="none"/><path class="F" d="M18.2 29h8.6l2.2 7.2H16z"/>${BASE}`,
  q: `<path class="F" d="${star(22.5, 15, 11, 4.8)}"/><path class="F" d="M17.4 25.2h10.2l2.6 11H14.8z"/>${BASE}`,
  k: `<path class="F" d="M20.4 2.8h4.2v4.4H29v4.2h-4.4v4.4h-4.2v-4.4H16V7.2h4.4z"/><path class="F" d="M14.2 17h16.6l-3.2 19.2H17.4z"/><path class="D" d="M15.6 22.4h13.8" fill="none"/>${BASE}`,
};

// Spielsteine: runde Steine mit Buchstaben
const LETTER = { p: 'B', n: 'S', b: 'L', r: 'T', q: 'D', k: 'K' };
const TOKEN = Object.fromEntries(Object.entries(LETTER).map(([t, l]) => [t,
  `<circle class="F" cx="22.5" cy="22.8" r="17.4"/><circle class="D" cx="22.5" cy="22.8" r="13.4" fill="none"/>
   <text class="T" x="22.5" y="29.6" text-anchor="middle" font-size="19" font-weight="900" font-family="Georgia, 'Times New Roman', serif">${l}</text>`]));

// Kawaii: klassische Form mit Gesicht
const face = (x, y, s = 1) => {
  const e = 2.1 * s;
  return `<circle class="E" cx="${x - e}" cy="${y}" r="${1.25 * s}"/><circle class="E" cx="${x + e}" cy="${y}" r="${1.25 * s}"/>
    <circle class="W" cx="${x - e + 0.4 * s}" cy="${y - 0.45 * s}" r="${0.42 * s}"/><circle class="W" cx="${x + e + 0.4 * s}" cy="${y - 0.45 * s}" r="${0.42 * s}"/>
    <ellipse class="K" cx="${x - e - 1.5 * s}" cy="${y + 2.4 * s}" rx="${1.35 * s}" ry="${0.85 * s}"/><ellipse class="K" cx="${x + e + 1.5 * s}" cy="${y + 2.4 * s}" rx="${1.35 * s}" ry="${0.85 * s}"/>
    <path class="D" d="M${x - 1.1 * s} ${y + 2.2 * s}q${1.1 * s} ${1.1 * s} ${2.2 * s} 0" fill="none"/>`;
};
const noDetail = (svg) => svg.replace(/<path class="D"[^>]*\/>/g, '');
const KAWAII = {
  p: SHAPES.p + face(22.5, 12.6, 0.95),
  r: SHAPES.r + face(22.5, 24.2, 1.15),
  n: SHAPES.n.replace(/<circle class="E" cx="17.2" cy="13.6" r="1.25"\/>/, '<circle class="E" cx="17.4" cy="13.4" r="1.9"/><circle class="W" cx="17.9" cy="12.8" r=".6"/>') + '<ellipse class="K" cx="14.6" cy="17.6" rx="1.5" ry=".9"/>',
  b: noDetail(SHAPES.b) + face(22.5, 19.4, 1),
  q: noDetail(SHAPES.q) + face(22.5, 23.4, 1.05),
  k: noDetail(SHAPES.k) + face(22.5, 22.6, 1.1),
};

// Pixel: 11×13-Raster, je Pixel 3 Einheiten
const PX = {
  p: ['...........', '...........', '....###....', '...#####...', '...#####...', '....###....', '...#####...', '....###....', '....###....', '...#####...', '..#######..', '.#########.', '.#########.'],
  r: ['...........', '.##.###.##.', '.#########.', '.#########.', '..#######..', '...#####...', '...#####...', '...#####...', '...#####...', '..#######..', '..#######..', '.#########.', '.#########.'],
  n: ['...........', '....#.#....', '...######..', '..########.', '.##.######.', '.#########.', '..##.#####.', '.....#####.', '....######.', '...#######.', '..########.', '.#########.', '.#########.'],
  b: ['.....#.....', '....###....', '...##.##...', '...#.###...', '..##.####..', '..#######..', '...#####...', '....###....', '...#####...', '....###....', '...#####...', '.#########.', '.#########.'],
  q: ['#..#.#.#..#', '#..#.#.#..#', '##.#####.##', '.#########.', '.#########.', '..#######..', '...#####...', '....###....', '...#####...', '....###....', '...#####...', '.#########.', '.#########.'],
  k: ['.....#.....', '....###....', '.....#.....', '..##.#.##..', '.#########.', '.#########.', '..#######..', '...#####...', '....###....', '...#####...', '...#####...', '.#########.', '.#########.'],
};
const PIXEL = Object.fromEntries(Object.entries(PX).map(([t, rows]) => {
  let fill = '', edge = '';
  rows.forEach((row, y) => [...row].forEach((ch, x) => {
    if (ch !== '#') return;
    const X = 6 + x * 3, Y = 3.5 + y * 3;
    fill += `M${X} ${Y}h3v3h-3z`;
    edge += `M${X - 1.1} ${Y - 1.1}h5.2v5.2h-5.2z`;
  }));
  return [t, `<g class="px" shape-rendering="crispEdges"><path class="S" d="${edge}"/><path class="F" d="${fill}"/></g>`];
}));

const SHAPE_SETS = { klassisch: SHAPES, modern: MODERN, abzeichen: TOKEN, kawaii: KAWAII, pixel: PIXEL };

const cache = new Map();

export function pieceSVG(type, color, look) {
  const { skin: skinId, shape } = splitLook(look);
  const skin = PIECES.find((s) => s.id === skinId) || PIECES[0];
  const SHP = SHAPE_SETS[shape] || SHAPES;
  const body = SHP[type], sil = body.replace(ACCENTS, '');
  const c = skin[color];
  const gid = `g${color}`;
  const glow = c.glow ? `<filter id="gl" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="1.1" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>` : '';
  const shadow = `<filter id="sh" x="-20%" y="-20%" width="140%" height="150%"><feDropShadow dx="0" dy="1.2" stdDeviation=".9" flood-color="#000" flood-opacity=".38"/></filter>`;
  // Marmor-/Harz-Wirbel: Turbulenz-Rauschen, nur an den Graten sichtbar, auf die Figur zugeschnitten
  let swirlDef = '', swirlLayer = '';
  if (c.swirl) {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(c.swirl.slice(i, i + 2), 16) / 255);
    const seed = 'pnbrqk'.indexOf(type) * 7 + (color === 'w' ? 3 : 11);
    swirlDef = `<filter id="sw" x="0" y="0" width="100%" height="100%" filterUnits="userSpaceOnUse"><feTurbulence type="turbulence" baseFrequency="0.07 0.16" numOctaves="3" seed="${seed}" result="t"/>
      <feColorMatrix in="t" type="matrix" values="0 0 0 0 ${r.toFixed(3)} 0 0 0 0 ${g.toFixed(3)} 0 0 0 0 ${b.toFixed(3)} -7 0 0 0 1.45" result="v"/>
      <feComposite in="v" in2="SourceAlpha" operator="in"/></filter>`;
    swirlLayer = `<g filter="url(#sw)" opacity="${c.glow ? 1 : 0.9}">${sil.replace(/class="F"/g, 'fill="#000"').replace(/class="[DE]"[^/]*\/>/g, '/>')}</g>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 45 45"><defs>
    <linearGradient id="${gid}" x1="0" y1="0" x2=".35" y2="1"><stop offset="0" stop-color="${c.fill[0]}"/><stop offset="1" stop-color="${c.fill[1]}"/></linearGradient>
    <linearGradient id="hl" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity=".0"/><stop offset=".3" stop-color="#fff" stop-opacity=".28"/><stop offset=".55" stop-color="#fff" stop-opacity="0"/></linearGradient>
    ${shadow}${glow}${swirlDef}</defs>
    <style>.F{fill:url(#${gid});stroke:${c.stroke};stroke-width:1.35;stroke-linejoin:round}.D{stroke:${c.detail};stroke-width:1.2;stroke-linecap:round}.E,.T{fill:${c.detail}}.S{fill:${c.stroke}}.px .F{stroke:none}.K{fill:#ff6f96;opacity:.6}.W{fill:#fff}</style>
    <g filter="url(#${c.glow ? 'gl' : 'sh'})">${body}</g>
    ${swirlLayer}
    <g style="mix-blend-mode:screen" opacity=".9">${sil.replace(/class="F"/g, 'fill="url(#hl)" stroke="none"').replace(/class="[DE]"[^/]*\/>/g, '/>')}</g>
  </svg>`;
}

// 3D-Figuren: einmal mit Three.js rendern (lazy), auf dem Gerät speichern, bis dahin Platzhalter zeigen
const SPRITE_KEY = 'pieces3d-v4';
const sprites3d = new Map();
let loading3d = null;
try { const c = JSON.parse(localStorage.getItem(SPRITE_KEY) || 'null'); if (c) for (const [k, v] of Object.entries(c)) sprites3d.set(k, `url("${v}")`); } catch { /* egal */ }
function load3d() {
  if (loading3d || typeof window === 'undefined') return;
  loading3d = import('./finisher.js').then((m) => {
    const map = m.renderPieceSprites({ size: 200 });
    const store = {};
    for (const [k, url] of map) { sprites3d.set(k, `url("${url}")`); store[k] = url; }
    try { localStorage.setItem(SPRITE_KEY, JSON.stringify(store)); } catch { /* Speicher voll – egal */ }
    window.dispatchEvent(new CustomEvent('pieces3d'));
  }).catch((e) => { console.warn('3D-Figuren konnten nicht gerendert werden', e); });
}
export const has3dSprites = () => sprites3d.size === 12;

export function pieceURL(type, color, skinId) {
  if (splitLook(skinId).skin === 'figuren3d') { const s = sprites3d.get(type + color); if (s) return s; load3d(); }
  const key = type + color + skinId;
  if (raster.has(key)) return raster.get(key);
  if (!cache.has(key)) cache.set(key, `url("data:image/svg+xml;charset=utf-8,${encodeURIComponent(pieceSVG(type, color, skinId))}")`);
  queueRaster(key);
  return cache.get(key);
}

// ---------------------------------------------------------------- Leistung: Figuren einmal in fertige Bilder umwandeln
// Vektor-Figuren mit Schatten/Wirbeln muss der Browser bei jedem Neuzeichnen (z. B. Scrollen) neu berechnen –
// auf Handy & iPad sehr teuer. Deshalb im Hintergrund in PNG-Bilder umwandeln und danach überall diese nutzen.
const raster = new Map(), rasterQueue = [], rasterQueued = new Set(), rasterDone = new Map();
let rasterRunning = false, patchTimer = 0;
const RASTER_PX = typeof window === 'undefined' ? 0 : Math.min(256, Math.ceil(100 * (window.devicePixelRatio || 1)));
function queueRaster(key) {
  if (!RASTER_PX || rasterQueued.has(key) || typeof document === 'undefined') return;
  rasterQueued.add(key); rasterQueue.push(key);
  if (!rasterRunning) { rasterRunning = true; (window.requestIdleCallback || ((f) => setTimeout(f, 30)))(rasterStep, { timeout: 300 }); }
}
async function rasterStep() {
  const canvas = rasterStep.c ||= Object.assign(document.createElement('canvas'), { width: RASTER_PX, height: RASTER_PX });
  const ctx = canvas.getContext('2d');
  for (let n = 0; n < 6 && rasterQueue.length; n++) {
    const key = rasterQueue.shift(), svgUrl = cache.get(key);
    try {
      const img = new Image();
      img.src = svgUrl.slice(5, -2);
      await img.decode();
      ctx.clearRect(0, 0, RASTER_PX, RASTER_PX);
      ctx.drawImage(img, 0, 0, RASTER_PX, RASTER_PX);
      const blob = await new Promise((r) => canvas.toBlob(r, 'image/png'));
      if (!blob) continue;
      const url = `url("${URL.createObjectURL(blob)}")`;
      raster.set(key, url); rasterDone.set(svgUrl, url);
    } catch { /* bleibt Vektor */ }
  }
  clearTimeout(patchTimer); patchTimer = setTimeout(patchDom, 120);
  if (rasterQueue.length) (window.requestIdleCallback || ((f) => setTimeout(f, 30)))(rasterStep, { timeout: 300 });
  else rasterRunning = false;
}
// Schon angezeigte Figuren (Brett, Shop, Profil …) direkt auf die Bilder umstellen
function patchDom() {
  if (!rasterDone.size) return;
  const done = [...rasterDone]; rasterDone.clear();
  for (const el of document.querySelectorAll('[style*="svg+xml"]')) {
    let st = el.getAttribute('style'), changed = false;
    for (const [svg, png] of done) if (st.includes(svg)) { st = st.split(svg).join(png); changed = true; }
    if (changed) el.setAttribute('style', st);
  }
}

// 4er-Schach: vier Spielerfarben + Grau für ausgeschiedene Spieler
const FOUR_PALETTES = [
  { fill: ['#ff7a7a', '#b3161b'], stroke: '#3d0306', detail: '#ffe1e1' },
  { fill: ['#7dbcff', '#1b4fbf'], stroke: '#05173f', detail: '#e2efff' },
  { fill: ['#ffe27a', '#c99406'], stroke: '#3d2b00', detail: '#fff6cc' },
  { fill: ['#7cf0ac', '#168447'], stroke: '#032814', detail: '#e3fff0' },
  { fill: ['#c4c7ce', '#71757e'], stroke: '#2a2c31', detail: '#eceef2' },
];
const cache4 = new Map();
export function pieceURL4(type, color) {
  const key = type + color;
  if (!cache4.has(key)) {
    const pal = FOUR_PALETTES[color];
    const fake = { id: '__four' + color, w: pal, b: pal };
    PIECES.push(fake);
    const svg = pieceSVG(type, 'w', fake.id).replace(/id="gw"/g, `id="g4${color}"`).replace(/url\(#gw\)/g, `url(#g4${color})`);
    PIECES.pop();
    cache4.set(key, `url("data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}")`);
  }
  return cache4.get(key);
}

// ---------------------------------------------------------------- Auren (z. B. Blitz): zwei Blitz-Muster je Farbe, abwechselnd eingeblendet
const AURA_COLORS = { lightning: { w: ['#fff7c2', '#ffc400'], b: ['#e6fbff', '#29b6ff'] } };
const BOLTS = [
  'M50 4l-5 9 7 3-7 11M93 38l-11 5 5 6-12 6M8 60l11-3-3 9 12 2M58 97l-4-10 7-4-8-11M20 14l8 9-6 4 9 8',
  'M80 10l-7 9 6 4-9 8M96 70l-11-2 2 8-12-1M4 30l10 4-5 6 11 4M36 98l3-11-7-3 8-10M66 3l-1 10 6-1-3 11',
];
const auraCache = new Map();
export function auraOf(look) { return PIECES.find((p) => p.id === splitLook(look).skin)?.aura || null; }
// CSS-Variablen für eine Figur mit Aura (oder '' ohne Aura)
export function auraVars(look, color) {
  const kind = auraOf(look); if (!kind) return '';
  const key = kind + color;
  if (!auraCache.has(key)) {
    const [core, glow] = AURA_COLORS[kind][color];
    const svg = (d) => `url("data:image/svg+xml;charset=utf-8,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><g fill='none' stroke-linecap='round' stroke-linejoin='round'><path d='${d}' stroke='${glow}' stroke-width='7' opacity='.45'/><path d='${d}' stroke='${glow}' stroke-width='3.6'/><path d='${d}' stroke='${core}' stroke-width='1.4'/></g></svg>`)}")`;
    auraCache.set(key, `--boltA:${svg(BOLTS[0])};--boltB:${svg(BOLTS[1])};--aura:${glow}`);
  }
  return auraCache.get(key);
}
// Auf ein Figuren-Element anwenden (Klasse + Variablen + eigener Flacker-Rhythmus)
export function applyAura(el, look, color) {
  const vars = auraVars(look, color);
  el.classList.toggle('aura', !!vars);
  if (!vars) { for (const v of ['--boltA', '--boltB', '--aura', '--ad']) el.style.removeProperty(v); return; }
  for (const part of vars.split(/;(?=--)/)) { const i = part.indexOf(':'); el.style.setProperty(part.slice(0, i), part.slice(i + 1)); }
  if (!el.style.getPropertyValue('--ad')) el.style.setProperty('--ad', `${(-Math.random() * 2).toFixed(2)}s`);
}
