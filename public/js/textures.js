// Prozedurale Brett-Texturen (Holz, Marmor, Harz-Wirbel, Kupfer, Magma, Wasserlicht, Rauschen, Frost).
// Eine Textur deckt das ganze Brett ab – jedes Feld zeigt seinen Ausschnitt, Adern laufen über Felder hinweg.
import { BOARDS } from './catalog.js';

const SIZE = 512;   // Endgröße
const LOW = 256;    // Pixel-Berechnung (wird weich hochskaliert)

// ---------------------------------------------------------------- Rauschen
function makeNoise(seed) {
  const perm = new Uint8Array(512);
  let s = seed * 9301 + 49297;
  const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  const p = [...Array(256).keys()];
  for (let i = 255; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [p[i], p[j]] = [p[j], p[i]]; }
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
  const grad = (h, x, y) => ((h & 1) ? x : -x) + ((h & 2) ? y : -y);
  const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
  const noise = (x, y) => {
    const X = Math.floor(x) & 255, Y = Math.floor(y) & 255;
    x -= Math.floor(x); y -= Math.floor(y);
    const u = fade(x), v = fade(y);
    const a = perm[X] + Y, b = perm[X + 1] + Y;
    const l1 = grad(perm[a], x, y) + u * (grad(perm[b], x - 1, y) - grad(perm[a], x, y));
    const l2 = grad(perm[a + 1], x, y - 1) + u * (grad(perm[b + 1], x - 1, y - 1) - grad(perm[a + 1], x, y - 1));
    return l1 + v * (l2 - l1); // ca. -1..1
  };
  const fbm = (x, y, o = 4) => { let a = 0.5, f = 1, t = 0; for (let i = 0; i < o; i++) { t += a * noise(x * f, y * f); a *= 0.5; f *= 2.03; } return t; };
  return { noise, fbm, rnd };
}

const hex = (c) => { const n = parseInt(c.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);

function pixelCanvas(fn) {
  const c = document.createElement('canvas'); c.width = c.height = LOW;
  const g = c.getContext('2d'); const img = g.createImageData(LOW, LOW); const d = img.data;
  for (let y = 0; y < LOW; y++) for (let x = 0; x < LOW; x++) {
    const [r, gg, b] = fn(x / LOW, y / LOW); const i = (y * LOW + x) * 4;
    d[i] = r; d[i + 1] = gg; d[i + 2] = b; d[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return c;
}

// ---------------------------------------------------------------- Muster
const KINDS = {
  // Harz-Wirbel wie bei Epoxid-/Marmorbrettern: verwirbelte helle Schlieren in Türkis/Rosa/Jade
  swirl(spec, N) {
    const base = hex(spec.base), acc = hex(spec.accent), deep = hex(spec.deep || spec.base);
    return pixelCanvas((u, v) => {
      const x = u * 3.2, y = v * 3.2;
      const wx = N.fbm(x + 1.7, y + 9.2, 4) * 1.6, wy = N.fbm(x + 8.3, y + 2.8, 4) * 1.6;
      const n = N.fbm(x + wx, y + wy, 5);
      const band = Math.abs(Math.sin((n * 3.2 + u * 0.8) * Math.PI));
      const streak = Math.pow(1 - band, 6);           // dünne helle Schlieren
      const cloud = clamp01(n * 0.9 + 0.5);            // weiche Tiefe
      let c = mix(deep, base, cloud);
      c = mix(c, acc, clamp01(streak * 1.15 + Math.pow(1 - band, 22) * 0.6));
      return c;
    });
  },
  marble(spec, N) {
    const base = hex(spec.base), acc = hex(spec.accent);
    return pixelCanvas((u, v) => {
      const x = u * 2.6, y = v * 2.6;
      const t = N.fbm(x * 1.4 + N.fbm(x, y, 3) * 1.8, y * 1.4, 5);
      const vein = Math.pow(1 - Math.abs(Math.sin((u * 2.2 + v * 1.3 + t * 1.8) * Math.PI)), 9);
      const cloud = N.fbm(x * 3, y * 3, 3) * 0.08;
      return mix(base.map((c) => c * (1 + cloud)), acc, clamp01(vein * 0.85));
    });
  },
  wood(spec, N) {
    const base = hex(spec.base), acc = hex(spec.accent);
    return pixelCanvas((u, v) => {
      const ring = Math.sin((v * 22 + N.fbm(u * 1.5, v * 6, 4) * 3.2) * Math.PI);
      const grain = N.fbm(u * 40, v * 3, 2) * 0.5;
      const t = clamp01(0.5 + ring * 0.25 + grain * 0.35);
      return mix(base, acc, t * 0.75);
    });
  },
  brushed(spec, N) {
    const base = hex(spec.base), acc = hex(spec.accent);
    return pixelCanvas((u, v) => {
      const s = N.fbm(u * 2, v * 120, 3) * 0.5 + N.fbm(u * 1.2, v * 1.2, 2) * 0.35;
      return mix(base, acc, clamp01(0.35 + s));
    });
  },
  magma(spec, N) {
    const base = hex(spec.base), acc = hex(spec.accent), hot = [255, 225, 140];
    const pts = Array.from({ length: 34 }, () => [N.rnd(), N.rnd()]);
    return pixelCanvas((u, v) => {
      let d1 = 9, d2 = 9;
      for (const [px, py] of pts) { const dx = Math.min(Math.abs(u - px), 1 - Math.abs(u - px)), dy = Math.min(Math.abs(v - py), 1 - Math.abs(v - py)); const d = dx * dx + dy * dy; if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d; }
      const edge = Math.sqrt(d2) - Math.sqrt(d1);
      const crack = clamp01(1 - edge * 38 + N.fbm(u * 8, v * 8, 2) * 0.6);
      const rock = mix(base, base.map((c) => c * 1.8), clamp01(N.fbm(u * 6, v * 6, 4) * 0.5 + 0.3));
      return mix(mix(rock, acc, crack * 0.9), hot, Math.pow(crack, 4) * 0.8);
    });
  },
  caustic(spec, N) {
    const base = hex(spec.base), acc = hex(spec.accent);
    const pts = Array.from({ length: 46 }, () => [N.rnd(), N.rnd()]);
    return pixelCanvas((u, v) => {
      const wu = u + N.fbm(u * 4, v * 4, 2) * 0.03, wv = v + N.fbm(u * 4 + 5, v * 4, 2) * 0.03;
      let d1 = 9, d2 = 9;
      for (const [px, py] of pts) { const dx = Math.min(Math.abs(wu - px), 1 - Math.abs(wu - px)), dy = Math.min(Math.abs(wv - py), 1 - Math.abs(wv - py)); const d = dx * dx + dy * dy; if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d; }
      const edge = Math.sqrt(d2) - Math.sqrt(d1);
      const light = Math.pow(clamp01(1 - edge * 22), 3);
      const depth = clamp01(0.5 + N.fbm(u * 2, v * 2, 3) * 0.5);
      return mix(mix(base.map((c) => c * 0.85), base, depth), acc, light * 0.75);
    });
  },
  // Zerbrochenes Displayglas: Scherben mit eigener Tönung, feine helle Bruchkanten, Spiegelungen
  shards(spec, N) {
    const base = hex(spec.base), acc = hex(spec.accent), deep = hex(spec.deep || spec.base);
    const pts = Array.from({ length: 26 }, () => [N.rnd(), N.rnd(), N.rnd()]);
    return pixelCanvas((u, v) => {
      let d1 = 9, d2 = 9, id = 0;
      for (const [px, py, pr] of pts) {
        const dx = Math.min(Math.abs(u - px), 1 - Math.abs(u - px)), dy = Math.min(Math.abs(v - py), 1 - Math.abs(v - py));
        const d = dx * dx + dy * dy;
        if (d < d1) { d2 = d1; d1 = d; id = pr; } else if (d < d2) d2 = d;
      }
      const edge = Math.sqrt(d2) - Math.sqrt(d1);
      const line = Math.pow(clamp01(1 - edge * 60), 3);
      const tint = mix(deep, base, 0.3 + id * 0.7);
      const sheen = Math.pow(clamp01(Math.sin((u * 0.9 + v * 1.5 + id * 2) * Math.PI * 2) * 0.5 + 0.5), 10) * 0.45;
      return mix(mix(tint, acc, sheen), acc, line * 0.95);
    });
  },
  // Leere zwischen den Dimensionen: dunkler Nebel, hauchdünne leuchtende Risse, Sterne
  rift(spec, N) {
    const base = hex(spec.base), acc = hex(spec.accent), acc2 = hex(spec.accent2 || spec.accent), deep = hex(spec.deep || '#000000');
    return pixelCanvas((u, v) => {
      const x = u * 3, y = v * 3;
      const w = N.fbm(x + 3.1, y + 1.7, 4) * 1.5;
      const n = N.fbm(x + w, y - w, 5);
      const vein = Math.pow(1 - Math.abs(Math.sin((n * 4 + u * 1.2) * Math.PI)), 26);
      const neb = clamp01(N.fbm(x * 0.7, y * 0.7, 3) * 0.9 + 0.45);
      let c = mix(deep, base, neb);
      c = mix(c, mix(acc, acc2, clamp01(N.fbm(u * 2 + 9, v * 2, 2) + 0.5)), clamp01(vein * 1.4));
      return N.rnd() > 0.996 ? mix(c, [255, 255, 255], 0.85) : c;
    });
  },
  noise(spec, N) {
    const base = hex(spec.base), acc = hex(spec.accent);
    return pixelCanvas((u, v) => mix(base, acc, clamp01(0.5 + N.fbm(u * 5, v * 5, 4) * 0.7)));
  },
};

function render(spec, seed) {
  const N = makeNoise(seed);
  const low = (KINDS[spec.kind] || KINDS.noise)(spec, N);
  const c = document.createElement('canvas'); c.width = c.height = SIZE;
  const g = c.getContext('2d');
  g.imageSmoothingQuality = 'high';
  g.drawImage(low, 0, 0, SIZE, SIZE);
  // Feines Korn gegen „Plastik“-Look
  const img = g.getImageData(0, 0, SIZE, SIZE), d = img.data;
  for (let i = 0; i < d.length; i += 4) { const n = (N.rnd() - 0.5) * 7; d[i] += n; d[i + 1] += n; d[i + 2] += n; }
  g.putImageData(img, 0, 0);
  if (spec.stars) {
    for (let i = 0; i < 160; i++) {
      const x = N.rnd() * SIZE, y = N.rnd() * SIZE, r = N.rnd() * 1.2 + 0.3;
      g.fillStyle = N.rnd() < 0.3 ? 'rgba(255,215,130,.9)' : 'rgba(255,255,255,.75)';
      g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
    }
  }
  return c;
}

// Frost-Overlay: Eiskristalle an den Rändern + Glitzer
function renderFrost(seed) {
  const N = makeNoise(seed);
  const c = document.createElement('canvas'); c.width = c.height = SIZE;
  const g = c.getContext('2d');
  g.lineCap = 'round';
  const branch = (x, y, ang, len, w, depth) => {
    if (depth > 4 || len < 3) return;
    const x2 = x + Math.cos(ang) * len, y2 = y + Math.sin(ang) * len;
    g.strokeStyle = `rgba(255,255,255,${0.16 + 0.1 * (4 - depth) / 4})`; g.lineWidth = w;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x2, y2); g.stroke();
    for (let i = 1; i <= 3; i++) {
      const t = i / 4, bx = x + (x2 - x) * t, by = y + (y2 - y) * t;
      branch(bx, by, ang + 1.05, len * 0.42, w * 0.6, depth + 1);
      branch(bx, by, ang - 1.05, len * 0.42, w * 0.6, depth + 1);
    }
  };
  for (let i = 0; i < 26; i++) {
    const side = Math.floor(N.rnd() * 4), p = N.rnd() * SIZE;
    const [x, y, a] = side === 0 ? [p, 0, Math.PI / 2] : side === 1 ? [p, SIZE, -Math.PI / 2] : side === 2 ? [0, p, 0] : [SIZE, p, Math.PI];
    branch(x, y, a + (N.rnd() - 0.5) * 0.9, 30 + N.rnd() * 70, 1.6, 0);
  }
  for (let i = 0; i < 260; i++) {
    const x = N.rnd() * SIZE, y = N.rnd() * SIZE;
    g.fillStyle = `rgba(255,255,255,${0.15 + N.rnd() * 0.5})`;
    g.fillRect(x, y, 1.2, 1.2);
  }
  const grd = g.createRadialGradient(SIZE / 2, SIZE / 2, SIZE * 0.25, SIZE / 2, SIZE / 2, SIZE * 0.75);
  grd.addColorStop(0, 'rgba(220,250,255,0)'); grd.addColorStop(1, 'rgba(220,250,255,.28)');
  g.fillStyle = grd; g.fillRect(0, 0, SIZE, SIZE);
  return c;
}

// ---------------------------------------------------------------- Cache & Warteschlange
const cache = new Map();     // themeId -> { light, dark, frost, urls }
const waiting = new Map();   // themeId -> [callbacks]
const queue = [];
let busy = false;

function build(theme) {
  const seed = [...theme.id].reduce((s, ch) => s + ch.charCodeAt(0), 0);
  const res = { light: render(theme.tex.light, seed + 1), dark: render(theme.tex.dark, seed + 7), frost: theme.frost ? renderFrost(seed + 3) : null };
  res.urls = { light: res.light.toDataURL('image/jpeg', 0.86), dark: res.dark.toDataURL('image/jpeg', 0.86), frost: res.frost ? res.frost.toDataURL('image/png') : null };
  cache.set(theme.id, res);
  return res;
}

function pump() {
  if (busy || !queue.length) return;
  busy = true;
  setTimeout(() => {
    const theme = queue.shift();
    let res = null;
    try { res = cache.get(theme.id) || build(theme); } catch (e) { console.error(e); }
    for (const cb of waiting.get(theme.id) || []) cb(res);
    waiting.delete(theme.id);
    busy = false; pump();
  }, 0);
}

// Asynchron (für Brett & Vorschauen): ruft cb(res) auf, sobald fertig
export function boardTextures(themeId, cb) {
  const theme = BOARDS.find((b) => b.id === themeId);
  if (!theme?.tex) { cb(null); return; }
  if (cache.has(themeId)) { cb(cache.get(themeId)); return; }
  if (!waiting.has(themeId)) { waiting.set(themeId, []); queue.push(theme); }
  waiting.get(themeId).push(cb);
  pump();
}

// Synchron (für den 3D-Finisher)
export function boardTexturesSync(themeId) {
  const theme = BOARDS.find((b) => b.id === themeId);
  if (!theme?.tex) return null;
  return cache.get(themeId) || build(theme);
}
