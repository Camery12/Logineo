import { PIECES } from './catalog.js';

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

const cache = new Map();

export function pieceSVG(type, color, skinId) {
  const skin = PIECES.find((s) => s.id === skinId) || PIECES[0];
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
    swirlLayer = `<g filter="url(#sw)" opacity="${c.glow ? 1 : 0.9}">${SHAPES[type].replace(/class="F"/g, 'fill="#000"').replace(/class="[DE]"[^/]*\/>/g, '/>')}</g>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 45 45"><defs>
    <linearGradient id="${gid}" x1="0" y1="0" x2=".35" y2="1"><stop offset="0" stop-color="${c.fill[0]}"/><stop offset="1" stop-color="${c.fill[1]}"/></linearGradient>
    <linearGradient id="hl" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity=".0"/><stop offset=".3" stop-color="#fff" stop-opacity=".28"/><stop offset=".55" stop-color="#fff" stop-opacity="0"/></linearGradient>
    ${shadow}${glow}${swirlDef}</defs>
    <style>.F{fill:url(#${gid});stroke:${c.stroke};stroke-width:1.35;stroke-linejoin:round}.D{stroke:${c.detail};stroke-width:1.2;stroke-linecap:round}.E{fill:${c.detail}}</style>
    <g filter="url(#${c.glow ? 'gl' : 'sh'})">${SHAPES[type]}</g>
    ${swirlLayer}
    <g style="mix-blend-mode:screen" opacity=".9">${SHAPES[type].replace(/class="F"/g, 'fill="url(#hl)" stroke="none"').replace(/class="[DE]"[^/]*\/>/g, '/>')}</g>
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
  if (skinId === 'figuren3d') { const s = sprites3d.get(type + color); if (s) return s; load3d(); }
  const key = type + color + skinId;
  if (!cache.has(key)) cache.set(key, `url("data:image/svg+xml;charset=utf-8,${encodeURIComponent(pieceSVG(type, color, skinId))}")`);
  return cache.get(key);
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
