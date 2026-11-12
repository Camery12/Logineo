// 4er-Schach-Brett: 14×14 ohne Ecken, jeder sieht seine eigene Farbe unten
import { N, valid, legalMoves, inCheck, kingSquare } from './four.js';
import { pieceURL4 } from './pieces.js';

// Anzeige-Position eines Feldes je nach Blickrichtung (Farbe unten)
function view(r, c, me) {
  if (me === 1) return [N - 1 - c, r];         // Blau (links) nach unten drehen
  if (me === 2) return [N - 1 - r, N - 1 - c]; // Gelb (oben)
  if (me === 3) return [c, N - 1 - r];         // Grün (rechts)
  return [r, c];
}

export class FourBoard {
  constructor(el, { onMove } = {}) {
    this.el = el; this.onMove = onMove;
    this.me = 0; this.state = null; this.sel = null; this.targets = [];
    el.classList.add('fb');
    el.innerHTML = '<div class="fb-squares"></div><div class="fb-marks"></div><div class="fb-pieces"></div>';
    this.sqLayer = el.querySelector('.fb-squares');
    this.markLayer = el.querySelector('.fb-marks');
    this.pcLayer = el.querySelector('.fb-pieces');
    this.pieceEls = new Map();
    el.addEventListener('pointerdown', (e) => this._click(e));
  }

  setTheme(light, dark) { this.el.style.setProperty('--fl', light); this.el.style.setProperty('--fd', dark); }

  _pos(i) { const [r, c] = view(Math.floor(i / N), i % N, this.me); return `translate(${c * 100}%, ${r * 100}%)`; }

  _layout() {
    this.sqLayer.innerHTML = '';
    for (let i = 0; i < N * N; i++) {
      const r = Math.floor(i / N), c = i % N;
      if (!valid(r, c)) continue;
      const d = document.createElement('div');
      d.className = `fsq ${(r + c) % 2 ? 'd' : 'l'}`;
      d.style.transform = this._pos(i);
      d.dataset.i = i;
      this.sqLayer.appendChild(d);
    }
  }

  // state: { board, turn, alive, last, ... }  move: { from, to } für Animation
  set(state, me, move = null) {
    const layoutChanged = this.me !== me || !this.sqLayer.children.length;
    this.me = me; this.state = state;
    if (layoutChanged) this._layout();
    this.sel = null; this.targets = [];
    // Figuren neu aufbauen; die gezogene Figur gleitet vom Start- zum Zielfeld
    const keep = new Map();
    for (let i = 0; i < N * N; i++) {
      const p = state.board[i];
      if (!p) continue;
      const color = p.dead ? 4 : p.c;
      const key = `${i}`;
      let el = this.pieceEls.get(key);
      const img = pieceURL4(p.t, color);
      if (!el) { el = document.createElement('div'); el.className = 'fpc'; this.pcLayer.appendChild(el); }
      el.style.backgroundImage = img;
      el.classList.toggle('dead', !!p.dead);
      if (move && move.to === i && !layoutChanged) {
        el.style.transition = 'none';
        el.style.transform = this._pos(move.from);
        el.getBoundingClientRect();
        el.style.transition = '';
      }
      el.style.transform = this._pos(i);
      keep.set(key, el);
    }
    for (const [k, el] of this.pieceEls) if (keep.get(k) !== el) el.remove();
    this.pieceEls = keep;
    this._marks();
  }

  _marks() {
    const s = this.state; if (!s) return;
    this.markLayer.innerHTML = '';
    const mark = (i, cls) => { const d = document.createElement('div'); d.className = `fmk ${cls}`; d.style.transform = this._pos(i); this.markLayer.appendChild(d); };
    if (s.last) { mark(s.last.from, `last c${s.last.color}`); mark(s.last.to, `last c${s.last.color}`); }
    for (let c = 0; c < 4; c++) if (s.alive[c] && inCheck(s, c)) { const k = kingSquare(s.board, c); if (k >= 0) mark(k, 'check'); }
    if (this.sel != null) mark(this.sel, 'sel');
    for (const m of this.targets) mark(m.to, s.board[m.to] ? 'dot cap' : 'dot');
  }

  _sqAt(e) {
    const r = this.el.getBoundingClientRect();
    const vc = Math.floor(((e.clientX - r.left) / r.width) * N), vr = Math.floor(((e.clientY - r.top) / r.height) * N);
    for (let i = 0; i < N * N; i++) { const [a, b] = view(Math.floor(i / N), i % N, this.me); if (a === vr && b === vc) return valid(Math.floor(i / N), i % N) ? i : -1; }
    return -1;
  }

  _click(e) {
    const s = this.state;
    if (!s || s.status === 'over' || s.turn !== this.me || !s.alive[this.me]) return;
    const i = this._sqAt(e);
    if (i < 0) return;
    const t = this.targets.find((m) => m.to === i);
    if (t) { this.sel = null; this.targets = []; this._marks(); this.onMove?.(t.from, t.to); return; }
    const p = s.board[i];
    if (p && p.c === this.me && !p.dead) {
      this.sel = i;
      this.targets = legalMoves(s, this.me).filter((m) => m.from === i);
    } else { this.sel = null; this.targets = []; }
    this._marks();
  }
}
