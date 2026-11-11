import { Chess } from '../vendor/chess.js';
import { pieceURL } from './pieces.js';
import { BOARDS } from './catalog.js';

const FILES = 'abcdefgh';

export function applyBoardTheme(el, id) {
  const t = BOARDS.find((b) => b.id === id) || BOARDS[0];
  el.style.setProperty('--light', t.light);
  el.style.setProperty('--dark', t.dark);
  el.style.setProperty('--frame', t.frame);
  el.style.setProperty('--last', t.last);
  el.style.setProperty('--overlay', t.overlay || 'none');
  el.style.setProperty('--grid', t.grid || 'transparent');
  el.classList.toggle('stars', !!t.stars);
  el.dataset.theme = t.id;
}

export class Board {
  constructor(el, { onMove, canMove } = {}) {
    this.el = el;
    this.onMove = onMove;
    this.canMove = canMove || (() => false);
    this.chess = new Chess();
    this.orientation = 'w';
    this.skins = { w: 'klassisch', b: 'klassisch' };
    this.pieceEls = new Map();
    this.selected = null;
    this.lastMove = null;
    this.premove = null;
    el.classList.add('board');
    el.innerHTML = '<div class="b-squares"></div><div class="b-hints"></div><div class="b-pieces"></div><div class="b-coords"></div>';
    this.sqLayer = el.querySelector('.b-squares');
    this.hintLayer = el.querySelector('.b-hints');
    this.pieceLayer = el.querySelector('.b-pieces');
    this.coordLayer = el.querySelector('.b-coords');
    for (let i = 0; i < 64; i++) this.sqLayer.appendChild(document.createElement('div'));
    this._layoutSquares();
    el.addEventListener('pointerdown', (e) => this._down(e));
    window.addEventListener('pointermove', (e) => this._move(e));
    window.addEventListener('pointerup', (e) => this._up(e));
    el.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  setOrientation(c) { this.orientation = c; this._layoutSquares(); this._render(false); }
  setSkins(skins) { this.skins = { ...skins }; for (const [sq, p] of this.pieceEls) p.el.style.backgroundImage = pieceURL(p.type, p.color, this.skins[p.color]); }
  setTheme(id) { applyBoardTheme(this.el, id); }

  _xy(sq) {
    const f = sq.charCodeAt(0) - 97, r = +sq[1] - 1;
    return this.orientation === 'w' ? [f, 7 - r] : [7 - f, r];
  }
  _sqAt(x, y) {
    if (x < 0 || y < 0 || x > 7 || y > 7) return null;
    return this.orientation === 'w' ? FILES[x] + (8 - y) : FILES[7 - x] + (y + 1);
  }

  _layoutSquares() {
    const cells = this.sqLayer.children;
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
      const sq = this._sqAt(x, y), d = cells[y * 8 + x];
      d.className = 'sq ' + ((x + y) % 2 ? 'dark' : 'light');
      d.dataset.sq = sq;
    }
    let html = '';
    for (let i = 0; i < 8; i++) {
      const file = this.orientation === 'w' ? FILES[i] : FILES[7 - i];
      const rank = this.orientation === 'w' ? 8 - i : i + 1;
      html += `<span class="cf ${i % 2 ? 'on-dark' : 'on-light'}" style="left:${i * 12.5}%">${file}</span>`;
      html += `<span class="cr ${i % 2 ? 'on-light' : 'on-dark'}" style="top:${i * 12.5}%">${rank}</span>`;
    }
    this.coordLayer.innerHTML = html;
    this._highlights();
  }

  _place(el, sq) { const [x, y] = this._xy(sq); el.style.transform = `translate(${x * 100}%, ${y * 100}%)`; }

  load(fen, lastMove = null, animate = true) {
    this.chess.load(fen);
    if (!animate) { this.pieceLayer.innerHTML = ''; this.pieceEls = new Map(); } // frischer Aufbau (neues Spiel)
    this.lastMove = lastMove;
    this.selected = null;
    this._render(animate);
  }

  get fen() { return this.chess.fen(); }

  _render(animate) {
    const next = new Map();
    const board = this.chess.board();
    for (const row of board) for (const p of row) if (p) next.set(p.square, p);
    const old = this.pieceEls;
    const keep = new Map();
    const orphan = [];
    for (const [sq, p] of old) {
      const n = next.get(sq);
      if (n && n.type === p.type && n.color === p.color) {
        p.el.classList.remove('captured');
        if (!animate) p.el.classList.add('no-anim');
        this._place(p.el, sq); // auch nach Brettdrehung richtig positionieren
        keep.set(sq, p);
      }
      else orphan.push([sq, p]);
    }
    const created = [];
    const orphanSq = (p) => p._from;
    for (const [sq, n] of next) {
      if (keep.has(sq)) continue;
      // passende verwaiste Figur suchen (bevorzugt vom letzten Zug)
      let bestI = -1, bestD = 99;
      orphan.forEach(([osq, p], i) => {
        if (p.type !== n.type || p.color !== n.color) return;
        const d = osq === this.lastMove?.from ? -1 : Math.abs(osq.charCodeAt(0) - sq.charCodeAt(0)) + Math.abs(+osq[1] - +sq[1]);
        if (d < bestD) { bestD = d; bestI = i; }
      });
      if (bestI >= 0) {
        const [osq, p] = orphan.splice(bestI, 1)[0];
        p._from = osq;
        p.el.classList.toggle('no-anim', !animate || orphanSq(p) === this._instant);
        this._place(p.el, sq);
        keep.set(sq, p);
      } else {
        const el = document.createElement('div');
        el.className = 'piece' + (animate ? ' fade-in' : '');
        el.style.backgroundImage = pieceURL(n.type, n.color, this.skins[n.color]);
        el.classList.add('no-anim');
        this._place(el, sq);
        this.pieceLayer.appendChild(el);
        keep.set(sq, { el, type: n.type, color: n.color });
        created.push(el);
      }
    }
    for (const [, p] of orphan) {
      if (animate) { p.el.classList.add('captured'); const el = p.el; setTimeout(() => el.remove(), 260); }
      else p.el.remove();
    }
    this.pieceEls = keep;
    this._instant = null;
    requestAnimationFrame(() => requestAnimationFrame(() => { for (const p of keep.values()) p.el.classList.remove('no-anim'); }));
    if (!animate) for (const p of keep.values()) p.el.classList.add('no-anim');
    this._highlights();
  }

  _highlights() {
    for (const d of this.sqLayer.children) {
      const sq = d.dataset.sq;
      d.classList.toggle('last', !!this.lastMove && (this.lastMove.from === sq || this.lastMove.to === sq));
      d.classList.toggle('sel', this.selected === sq);
      d.classList.remove('check');
    }
    if (this.chess.inCheck()) {
      const t = this.chess.turn();
      for (const row of this.chess.board()) for (const p of row) if (p && p.type === 'k' && p.color === t) this.sqLayer.querySelector(`[data-sq="${p.square}"]`).classList.add('check');
    }
    this.hintLayer.innerHTML = '';
    if (this.selected) {
      for (const m of this.chess.moves({ square: this.selected, verbose: true })) {
        if (m.promotion && m.promotion !== 'q') continue;
        const h = document.createElement('div');
        h.className = 'hint' + (m.captured ? ' cap' : '');
        const [x, y] = this._xy(m.to);
        h.style.transform = `translate(${x * 100}%, ${y * 100}%)`;
        this.hintLayer.appendChild(h);
      }
    }
  }

  _pointSq(e) {
    const r = this.el.getBoundingClientRect();
    return this._sqAt(Math.floor((e.clientX - r.left) / (r.width / 8)), Math.floor((e.clientY - r.top) / (r.height / 8)));
  }

  _isMine(sq) {
    const p = this.chess.get(sq);
    return p && p.color === this.chess.turn() && this.canMove(p.color);
  }

  _down(e) {
    if (e.button !== 0) return;
    const sq = this._pointSq(e);
    if (!sq) return;
    if (this.selected && this.selected !== sq && this._legal(this.selected, sq)) {
      this._try(this.selected, sq);
      return;
    }
    if (this._isMine(sq)) {
      e.preventDefault();
      this.selected = sq;
      this._highlights();
      const p = this.pieceEls.get(sq);
      if (p) {
        const r = this.el.getBoundingClientRect();
        this.drag = { sq, el: p.el, r, moved: false, sx: e.clientX, sy: e.clientY };
        p.el.classList.add('dragging', 'no-anim');
        this._dragTo(e);
      }
    } else {
      this.selected = null;
      this._highlights();
    }
  }

  _dragTo(e) {
    const d = this.drag, size = d.r.width / 8;
    const x = e.clientX - d.r.left - size / 2, y = e.clientY - d.r.top - size / 2;
    d.el.style.transform = `translate(${x}px, ${y}px) scale(1.12)`;
  }

  _move(e) {
    if (!this.drag) return;
    if (Math.abs(e.clientX - this.drag.sx) + Math.abs(e.clientY - this.drag.sy) > 4) this.drag.moved = true;
    this._dragTo(e);
  }

  _up(e) {
    const d = this.drag;
    if (!d) return;
    this.drag = null;
    d.el.classList.remove('dragging');
    const to = this._pointSq(e);
    if (to && to !== d.sq && this._legal(d.sq, to)) {
      this._place(d.el, d.sq);
      this._try(d.sq, to, true);
    } else {
      this._place(d.el, d.sq);
      requestAnimationFrame(() => d.el.classList.remove('no-anim'));
    }
  }

  _legal(from, to) { return this.chess.moves({ square: from, verbose: true }).some((m) => m.to === to); }

  async _try(from, to, dropped = false) {
    const moves = this.chess.moves({ square: from, verbose: true }).filter((m) => m.to === to);
    if (!moves.length) return;
    let promotion;
    if (moves[0].promotion) {
      promotion = await this._askPromotion(to, moves[0].color);
      if (!promotion) { this.selected = null; this._highlights(); return; }
    }
    this.selected = null;
    const m = this.chess.move({ from, to, promotion });
    this.lastMove = { from, to };
    if (dropped) this._instant = from;
    this._render(true);
    this.onMove?.({ from, to, promotion, san: m.san, captured: m.captured, flags: m.flags, check: this.chess.inCheck() });
  }

  _askPromotion(sq, color) {
    return new Promise((resolve) => {
      const [x, y] = this._xy(sq);
      const box = document.createElement('div');
      box.className = 'promo';
      box.style.left = `${x * 12.5}%`;
      box.style.top = y === 0 ? '0' : 'auto';
      box.style.bottom = y === 0 ? 'auto' : '0';
      for (const t of ['q', 'r', 'b', 'n']) {
        const b = document.createElement('button');
        b.style.backgroundImage = pieceURL(t, color, this.skins[color]);
        b.onpointerdown = (e) => { e.stopPropagation(); box.remove(); resolve(t); };
        box.appendChild(b);
      }
      const cancel = (e) => { if (!box.contains(e.target)) { box.remove(); window.removeEventListener('pointerdown', cancel, true); resolve(null); } };
      setTimeout(() => window.addEventListener('pointerdown', cancel, true));
      this.el.appendChild(box);
    });
  }

  kingSquare(color) {
    for (const row of this.chess.board()) for (const p of row) if (p && p.type === 'k' && p.color === color) return p.square;
    return null;
  }
}

// Kleine statische Brett-Vorschau (für Shop & Abstimmung)
export function miniBoard(themeId, skins = { w: 'klassisch', b: 'klassisch' }, fen = 'r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R') {
  const el = document.createElement('div');
  el.className = 'mini-board';
  applyBoardTheme(el, themeId);
  const rows = fen.split(' ')[0].split('/');
  let html = '';
  rows.forEach((row, y) => {
    let x = 0;
    for (const ch of row) {
      if (/\d/.test(ch)) { for (let i = 0; i < +ch; i++, x++) html += `<i class="${(x + y) % 2 ? 'dark' : 'light'}"></i>`; continue; }
      const color = ch === ch.toUpperCase() ? 'w' : 'b';
      html += `<i class="${(x + y) % 2 ? 'dark' : 'light'}" style="--p:${pieceURL(ch.toLowerCase(), color, skins[color]).replace(/"/g, '&quot;')}"></i>`;
      x++;
    }
  });
  el.innerHTML = html;
  return el;
}
