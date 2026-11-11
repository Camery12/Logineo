// 2D-Effekte: Funken auf dem Brett, Beben, Konfetti, Münzregen
const rand = (a, b) => a + Math.random() * (b - a);

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

function loop() {
  braf = 0;
  if (!bctx) return;
  bctx.clearRect(0, 0, bcv.width, bcv.height);
  bctx.globalCompositeOperation = 'lighter';
  bparts = bparts.filter((p) => (p.life -= 1 / 60) > 0);
  for (const p of bparts) {
    p.vy += p.g; p.vx *= p.drag; p.vy *= p.drag; p.x += p.vx; p.y += p.vy; p.rot += p.vr;
    const a = Math.min(1, p.life / p.max * 1.5);
    bctx.globalAlpha = a;
    if (p.shape === 'ring') {
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
  bctx.globalAlpha = 1;
  if (bparts.length) braf = requestAnimationFrame(loop);
}
const kick = () => { if (!braf) braf = requestAnimationFrame(loop); };

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
    for (let i = 0; i < 26; i++) { const a = rand(0, Math.PI * 2), v = rand(2, 7) * dims.dpr; add({ vx: Math.cos(a) * v, vy: Math.sin(a) * v - 2, g: 0.25 * dims.dpr, s: rand(3, 7) * dims.dpr, life: rand(0.4, 0.8), max: 0.8, c: i % 3 ? '#ffb347' : '#fff3c4' }); }
    for (let i = 0; i < 10; i++) { const a = rand(0, Math.PI * 2), v = rand(3, 8) * dims.dpr; add({ shape: 'shard', vx: Math.cos(a) * v, vy: Math.sin(a) * v - 3, g: 0.35 * dims.dpr, s: rand(4, 8) * dims.dpr, vr: rand(-0.4, 0.4), life: rand(0.5, 0.9), max: 0.9, c: color }); }
    add({ shape: 'ring', r0: size * 0.2, grow: size * 0.9, s: 5 * dims.dpr, life: 0.45, max: 0.45, c: '#ffffff' });
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
