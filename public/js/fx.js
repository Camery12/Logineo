// 2D-Effekte: Splitter & Funken auf dem Brett, Beben, Konfetti, Münzregen
import { pieceSVG } from './pieces.js';
const rand = (a, b) => a + Math.random() * (b - a);

// Figurenbilder für die Splitter (einmal laden, dann wiederverwenden)
const imgCache = new Map();
function pieceImage(type, color, skin) {
  const key = type + color + skin;
  if (!imgCache.has(key)) {
    const img = new Image();
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(pieceSVG(type, color, skin));
    imgCache.set(key, img);
  }
  return imgCache.get(key);
}
export function preloadPieces(skins) {
  for (const c of ['w', 'b']) for (const t of 'pnbrqk') pieceImage(t, c, skins[c]);
}

// ---------------------------------------------------------------- Partikel-Canvas über dem Brett
let bcv = null, bctx = null, bparts = [], braf = 0;
function boardCanvas(boardEl) {
  if (!bcv || bcv.parentElement !== boardEl) {
    bcv?.remove();
    bcv = document.createElement('canvas');
    bcv.className = 'fx-canvas';
    boardEl.appendChild(bcv);
    bctx = bcv.getContext('2d');
  }
  const r = bcv.getBoundingClientRect();
  const dpr = Math.min(devicePixelRatio || 1, 2);
  if (bcv.width !== Math.round(r.width * dpr)) { bcv.width = Math.round(r.width * dpr); bcv.height = Math.round(r.height * dpr); }
  return { w: bcv.width, h: bcv.height, dpr };
}

let lastT = 0;
function loop(now) {
  braf = 0;
  if (!bctx) return;
  const dt = Math.min(0.05, lastT ? (now - lastT) / 1000 : 1 / 60); lastT = now;
  const k = dt * 60; // Bewegung unabhängig von der Bildwiederholrate
  bctx.clearRect(0, 0, bcv.width, bcv.height);
  bparts = bparts.filter((p) => (p.life -= dt) > 0);
  for (const p of bparts) {
    if (p.delay > 0) { p.delay -= dt; p.life += dt; continue; }
    p.vy += p.g * k; const dr = Math.pow(p.drag, k); p.vx *= dr; p.vy *= dr; p.x += p.vx * k; p.y += p.vy * k; p.rot += p.vr * k;
    const a = Math.min(1, p.life / p.max * (p.shape === 'tri' ? 2.5 : 1.5));
    bctx.globalAlpha = a;
    bctx.globalCompositeOperation = p.shape === 'tri' || p.shape === 'dust' ? 'source-over' : 'lighter';
    if (p.shape === 'tri') {
      // Splitter aus dem echten Figurenbild
      const sc = 0.85 + 0.15 * a;
      bctx.save(); bctx.translate(p.x, p.y); bctx.rotate(p.rot); bctx.scale(sc, sc);
      bctx.beginPath(); bctx.moveTo(p.pts[0], p.pts[1]); bctx.lineTo(p.pts[2], p.pts[3]); bctx.lineTo(p.pts[4], p.pts[5]); bctx.closePath();
      bctx.save(); bctx.clip();
      if (p.img.complete) bctx.drawImage(p.img, -p.cx, -p.cy, p.S, p.S);
      bctx.restore();
      bctx.strokeStyle = 'rgba(255,255,255,.18)'; bctx.lineWidth = 1; bctx.stroke();
      bctx.restore();
    } else if (p.shape === 'dust') {
      const g = bctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.s);
      g.addColorStop(0, `rgba(${p.c},${0.28 * a})`); g.addColorStop(1, `rgba(${p.c},0)`);
      bctx.globalAlpha = 1; bctx.fillStyle = g; bctx.beginPath(); bctx.arc(p.x, p.y, p.s, 0, Math.PI * 2); bctx.fill();
      p.s += p.grow * k;
    } else if (p.shape === 'ring') {
      bctx.strokeStyle = p.c; bctx.lineWidth = p.s * (0.3 + a);
      bctx.beginPath(); bctx.arc(p.x, p.y, p.r0 + (1 - p.life / p.max) * p.grow, 0, Math.PI * 2); bctx.stroke();
    } else if (p.shape === 'shard') {
      bctx.save(); bctx.translate(p.x, p.y); bctx.rotate(p.rot); bctx.fillStyle = p.c;
      bctx.beginPath(); bctx.moveTo(-p.s, -p.s * 0.4); bctx.lineTo(p.s, 0); bctx.lineTo(-p.s * 0.3, p.s * 0.6); bctx.closePath(); bctx.fill(); bctx.restore();
    } else {
      const g = bctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.s);
      g.addColorStop(0, p.c); g.addColorStop(1, 'rgba(0,0,0,0)');
      bctx.fillStyle = g; bctx.beginPath(); bctx.arc(p.x, p.y, p.s, 0, Math.PI * 2); bctx.fill();
    }
  }
  bctx.globalAlpha = 1; bctx.globalCompositeOperation = 'source-over';
  if (bparts.length) braf = requestAnimationFrame(loop); else lastT = 0;
}
const kick = () => { if (!braf) braf = requestAnimationFrame(loop); };

// Geschlagene Figur zerspringt in ~24 Splitter ihres eigenen Bildes
export function shatterPiece(board, sq, type, color, skin, fromSq) {
  if (!sq || !type) return;
  const dims = boardCanvas(board.el);
  const { x, y, size } = center(board, sq, dims);
  const img = pieceImage(type, color, skin);
  const S = size * 0.88, ox = -S / 2, oy = -S / 2 + size * 0.03;
  // Stoßrichtung: vom angreifenden Feld weg
  let dirx = 0, diry = -1;
  if (fromSq) { const f = center(board, fromSq, dims); const dx = x - f.x, dy = y - f.y, d = Math.hypot(dx, dy) || 1; dirx = dx / d; diry = dy / d; }
  const N = 4, cell = S / N;
  for (let gy = 0; gy < N; gy++) for (let gx = 0; gx < N; gx++) {
    const jx = () => rand(-cell * 0.18, cell * 0.18);
    const x0 = gx * cell, y0 = gy * cell, x1 = x0 + cell, y1 = y0 + cell;
    const quads = Math.random() < 0.5
      ? [[x0, y0, x1 + jx(), y0, x0, y1 + jx()], [x1, y0, x1, y1, x0 + jx(), y1]]
      : [[x0, y0, x1, y0 + jx(), x1, y1], [x0, y0, x1 + jx(), y1, x0, y1]];
    for (const t of quads) {
      const cx = (t[0] + t[2] + t[4]) / 3, cy = (t[1] + t[3] + t[5]) / 3;
      const rx = cx - S / 2, ry = cy - S / 2, rd = Math.hypot(rx, ry) || 1;
      const sp = rand(1.2, 3.4) * dims.dpr;
      bparts.push({
        shape: 'tri', img, S, cx, cy, pts: [t[0] - cx, t[1] - cy, t[2] - cx, t[3] - cy, t[4] - cx, t[5] - cy],
        x: x + ox + cx, y: y + oy + cy,
        vx: (rx / rd) * sp + dirx * rand(1, 3) * dims.dpr, vy: (ry / rd) * sp + diry * rand(1, 3) * dims.dpr - rand(1.5, 3.5) * dims.dpr,
        g: 0.32 * dims.dpr, drag: 0.985, rot: 0, vr: rand(-0.18, 0.18), life: rand(0.55, 0.8), max: 0.8, delay: 0,
      });
    }
  }
}

// Mittelpunkt eines Feldes in Canvas-Pixeln
function center(board, sq, dims) {
  const [x, y] = board._xy(sq);
  const inner = dims.w / 1.16; // Canvas ist 8 % größer auf jeder Seite
  const off = (dims.w - inner) / 2, size = inner / 8;
  return { x: off + (x + 0.5) * size, y: off + (y + 0.5) * size, size };
}

export function burstAt(board, sq, { kind = 'capture', color = '#ffd166' } = {}) {
  if (!sq) return;
  const dims = boardCanvas(board.el);
  const { x, y, size } = center(board, sq, dims);
  const add = (o) => bparts.push({ x, y, vx: 0, vy: 0, g: 0, drag: 0.94, rot: 0, vr: 0, s: 4, life: 0.6, max: 0.6, c: color, shape: 'dot', ...o });
  if (kind === 'capture') {
    // Weicher Einschlag: kurzer Lichtpunkt, feine Funken, Staubwolke, dünne Druckwelle
    add({ s: size * 0.55, life: 0.18, max: 0.18, c: 'rgba(255,244,214,.9)' });
    for (let i = 0; i < 14; i++) { const a = rand(0, Math.PI * 2), v = rand(1.5, 4.5) * dims.dpr; add({ vx: Math.cos(a) * v, vy: Math.sin(a) * v - 1, g: 0.12 * dims.dpr, s: rand(1.5, 3.2) * dims.dpr, life: rand(0.3, 0.55), max: 0.55, c: i % 3 ? '#ffc56b' : '#fff6dc' }); }
    for (let i = 0; i < 5; i++) { const a = rand(0, Math.PI * 2); add({ shape: 'dust', x: x + Math.cos(a) * size * 0.15, y: y + size * 0.2, vx: Math.cos(a) * 0.5 * dims.dpr, vy: -0.25 * dims.dpr, s: size * 0.22, grow: 0.5 * dims.dpr, life: rand(0.5, 0.8), max: 0.8, c: color === '#f2f2f2' ? '210,205,195' : '90,90,100' }); }
    add({ shape: 'ring', r0: size * 0.3, grow: size * 0.55, s: 2 * dims.dpr, life: 0.35, max: 0.35, c: 'rgba(255,255,255,.55)' });
  } else if (kind === 'move') {
    add({ shape: 'ring', r0: size * 0.25, grow: size * 0.45, s: 3 * dims.dpr, life: 0.35, max: 0.35, c: 'rgba(255,255,255,.7)' });
    for (let i = 0; i < 8; i++) { const a = rand(0, Math.PI * 2); add({ x: x + Math.cos(a) * size * 0.35, y: y + size * 0.3, vx: Math.cos(a) * 1.2 * dims.dpr, vy: -rand(0.3, 1) * dims.dpr, s: rand(2, 4) * dims.dpr, life: 0.4, max: 0.4, c: 'rgba(255,255,255,.55)' }); }
  } else if (kind === 'check') {
    for (let i = 0; i < 3; i++) add({ shape: 'ring', r0: size * 0.3, grow: size * (1 + i * 0.5), s: 4 * dims.dpr, life: 0.6 + i * 0.15, max: 0.6 + i * 0.15, c: '#ff2d55' });
  } else if (kind === 'promo') {
    for (let i = 0; i < 40; i++) { const a = rand(0, Math.PI * 2), v = rand(1, 5) * dims.dpr; add({ vx: Math.cos(a) * v, vy: Math.sin(a) * v, s: rand(3, 6) * dims.dpr, life: rand(0.6, 1.1), max: 1.1, c: i % 2 ? '#ffd166' : '#fff' }); }
    add({ shape: 'ring', r0: size * 0.2, grow: size * 1.4, s: 6 * dims.dpr, life: 0.7, max: 0.7, c: '#ffd166' });
  } else if (kind === 'mate') {
    for (let i = 0; i < 90; i++) { const a = rand(0, Math.PI * 2), v = rand(2, 12) * dims.dpr; add({ vx: Math.cos(a) * v, vy: Math.sin(a) * v - 2, g: 0.2 * dims.dpr, s: rand(3, 9) * dims.dpr, life: rand(0.6, 1.3), max: 1.3, c: i % 3 ? '#ff2d55' : '#ffd166' }); }
    for (let i = 0; i < 4; i++) add({ shape: 'ring', r0: size * 0.2, grow: size * (1.5 + i), s: 7 * dims.dpr, life: 0.7 + i * 0.12, max: 0.7 + i * 0.12, c: i % 2 ? '#ff2d55' : '#fff' });
  }
  kick();
}

export function shakeBoard(frameEl, strong = false) {
  const cls = strong ? 'shake-l' : 'shake-s';
  frameEl.classList.remove('shake-s', 'shake-l'); void frameEl.offsetWidth; frameEl.classList.add(cls);
  setTimeout(() => frameEl.classList.remove(cls), 650);
}
export function checkFlash(frameEl) {
  frameEl.classList.remove('check-flash'); void frameEl.offsetWidth; frameEl.classList.add('check-flash');
  setTimeout(() => frameEl.classList.remove('check-flash'), 750);
}

// ---------------------------------------------------------------- Konfetti (ganzer Bildschirm)
export function confetti(duration = 2600) {
  const cv = document.createElement('canvas');
  cv.className = 'fx-screen';
  document.body.appendChild(cv);
  const dpr = Math.min(devicePixelRatio || 1, 2);
  cv.width = innerWidth * dpr; cv.height = innerHeight * dpr;
  const c = cv.getContext('2d');
  const cols = ['#7c5cff', '#22d3ee', '#f5c542', '#34d399', '#f43f5e', '#ffffff', '#ff8fb8'];
  const ps = [];
  for (const side of [0, 1]) for (let i = 0; i < 110; i++) {
    const a = side ? rand(-2.4, -1.9) : rand(-1.25, -0.75);
    const v = rand(14, 26) * dpr;
    ps.push({ x: side ? cv.width : 0, y: cv.height * 0.85, vx: Math.cos(a) * v, vy: Math.sin(a) * v, w: rand(6, 12) * dpr, h: rand(3, 6) * dpr, r: rand(0, 6), vr: rand(-0.3, 0.3), c: cols[i % cols.length] });
  }
  const t0 = performance.now();
  (function frame(now) {
    const k = (now - t0) / duration;
    c.clearRect(0, 0, cv.width, cv.height);
    for (const p of ps) {
      p.vy += 0.45 * dpr; p.vx *= 0.985; p.vy *= 0.985; p.x += p.vx; p.y += p.vy; p.r += p.vr;
      c.save(); c.translate(p.x, p.y); c.rotate(p.r); c.globalAlpha = Math.max(0, 1 - k * k);
      c.fillStyle = p.c; c.fillRect(-p.w / 2, -p.h / 2 * Math.abs(Math.cos(p.r * 2)), p.w, p.h * Math.abs(Math.cos(p.r * 2)) + 1); c.restore();
    }
    if (k < 1) requestAnimationFrame(frame); else cv.remove();
  })(t0);
}

// ---------------------------------------------------------------- Münzen fliegen zum Münzzähler
export function coinRain(fromEl, toEl, n = 12, onEach) {
  if (!fromEl || !toEl) return;
  const a = fromEl.getBoundingClientRect(), b = toEl.getBoundingClientRect();
  for (let i = 0; i < n; i++) {
    const el = document.createElement('div');
    el.className = 'coin-fly'; el.innerHTML = '<i class="coin"></i>';
    document.body.appendChild(el);
    const sx = a.left + a.width / 2 + rand(-40, 40), sy = a.top + a.height / 2 + rand(-20, 20);
    const ex = b.left + b.width / 2 - 13, ey = b.top + b.height / 2 - 13;
    const cx = (sx + ex) / 2 + rand(-160, 160), cy = Math.min(sy, ey) - rand(80, 220);
    const dur = 700 + rand(0, 300), delay = i * 55;
    const t0 = performance.now() + delay;
    (function f(now) {
      const t = Math.max(0, Math.min(1, (now - t0) / dur));
      const e = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
      const x = (1 - e) ** 2 * sx + 2 * (1 - e) * e * cx + e * e * ex;
      const y = (1 - e) ** 2 * sy + 2 * (1 - e) * e * cy + e * e * ey;
      el.style.transform = `translate(${x}px, ${y}px) scale(${1 - e * 0.4}) rotate(${e * 540}deg)`;
      el.style.opacity = now < t0 ? 0 : 1;
      if (t < 1) requestAnimationFrame(f); else { el.remove(); onEach?.(i); }
    })(performance.now());
  }
}
