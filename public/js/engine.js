// Schach-Engine für die Bots: 10x12-Mailbox, Alpha-Beta mit Quiescence,
// iterativer Vertiefung, Transpositionstabelle, Killer-Zügen und History-Heuristik.

const EMPTY = 0, OFF = 7;
const P = 1, N = 2, B = 3, R = 4, Q = 5, K = 6;
const VALUE = [0, 100, 320, 335, 500, 950, 0];
const PHASE_W = [0, 0, 1, 1, 2, 4, 0];
const MATE = 100000;

const N_OFF = [-21, -19, -12, -8, 8, 12, 19, 21];
const B_OFF = [-11, -9, 9, 11];
const R_OFF = [-10, -1, 1, 10];
const K_OFF = [-11, -10, -9, -1, 1, 9, 10, 11];

// Tabellen aus Sicht von Weiß, Index 0 = a8 ... 63 = h1
const PST = {
  [P]: [0,0,0,0,0,0,0,0, 60,60,60,60,60,60,60,60, 15,15,25,35,35,25,15,15, 5,5,12,28,28,12,5,5, 0,0,5,22,22,5,0,0, 5,-4,-8,2,2,-8,-4,5, 5,10,10,-22,-22,10,10,5, 0,0,0,0,0,0,0,0],
  [N]: [-50,-40,-30,-30,-30,-30,-40,-50, -40,-20,0,0,0,0,-20,-40, -30,0,10,15,15,10,0,-30, -30,5,15,20,20,15,5,-30, -30,0,15,20,20,15,0,-30, -30,5,12,15,15,12,5,-30, -40,-20,0,5,5,0,-20,-40, -50,-35,-30,-30,-30,-30,-35,-50],
  [B]: [-20,-10,-10,-10,-10,-10,-10,-20, -10,0,0,0,0,0,0,-10, -10,0,5,10,10,5,0,-10, -10,5,5,10,10,5,5,-10, -10,0,10,10,10,10,0,-10, -10,10,10,10,10,10,10,-10, -10,8,0,0,0,0,8,-10, -20,-10,-12,-10,-10,-12,-10,-20],
  [R]: [0,0,0,0,0,0,0,0, 8,12,12,12,12,12,12,8, -5,0,0,0,0,0,0,-5, -5,0,0,0,0,0,0,-5, -5,0,0,0,0,0,0,-5, -5,0,0,0,0,0,0,-5, -5,0,0,0,0,0,0,-5, 0,0,2,7,7,5,0,0],
  [Q]: [-20,-10,-10,-5,-5,-10,-10,-20, -10,0,0,0,0,0,0,-10, -10,0,5,5,5,5,0,-10, -5,0,5,5,5,5,0,-5, 0,0,5,5,5,5,0,-5, -10,5,5,5,5,5,0,-10, -10,0,5,0,0,0,0,-10, -20,-10,-10,-5,-5,-10,-10,-20],
  [K]: [-30,-40,-40,-50,-50,-40,-40,-30, -30,-40,-40,-50,-50,-40,-40,-30, -30,-40,-40,-50,-50,-40,-40,-30, -30,-40,-40,-50,-50,-40,-40,-30, -20,-30,-30,-40,-40,-30,-30,-20, -10,-20,-20,-20,-20,-20,-20,-10, 15,15,0,-5,-5,0,15,15, 20,30,10,0,0,10,30,20],
};
const K_END = [-50,-40,-30,-20,-20,-30,-40,-50, -30,-20,-10,0,0,-10,-20,-30, -30,-10,20,30,30,20,-10,-30, -30,-10,30,40,40,30,-10,-30, -30,-10,30,40,40,30,-10,-30, -30,-10,20,30,30,20,-10,-30, -30,-30,0,0,0,0,-30,-30, -50,-30,-30,-30,-30,-30,-30,-50];
const P_END = [0,0,0,0,0,0,0,0, 120,120,120,120,120,120,120,120, 70,70,70,70,70,70,70,70, 40,40,40,40,40,40,40,40, 20,20,20,20,20,20,20,20, 8,8,8,8,8,8,8,8, 0,0,0,0,0,0,0,0, 0,0,0,0,0,0,0,0];

// Index-Umrechnung
const TO64 = new Int8Array(120).fill(-1);
const TO120 = new Int8Array(64);
for (let r = 0; r < 8; r++) for (let f = 0; f < 8; f++) {
  const s120 = 21 + f + r * 10; // r=0 -> Reihe 8
  TO64[s120] = r * 8 + f;
  TO120[r * 8 + f] = s120;
}
const sqName = (s) => { const i = TO64[s]; return 'abcdefgh'[i % 8] + (8 - Math.floor(i / 8)); };
const nameSq = (n) => TO120[(8 - +n[1]) * 8 + (n.charCodeAt(0) - 97)];
const mirror = (i) => (7 - (i >> 3)) * 8 + (i & 7);

// Zobrist (zwei 32-Bit-Hälften)
let seed = 0x9e3779b9;
const rnd = () => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return seed >>> 0; };
const ZP = [new Uint32Array(13 * 120), new Uint32Array(13 * 120)];
for (let i = 0; i < 13 * 120; i++) { ZP[0][i] = rnd(); ZP[1][i] = rnd(); }
const ZSIDE = [rnd(), rnd()];
const ZCAST = [new Uint32Array(16), new Uint32Array(16)];
const ZEP = [new Uint32Array(120), new Uint32Array(120)];
for (let i = 0; i < 16; i++) { ZCAST[0][i] = rnd(); ZCAST[1][i] = rnd(); }
for (let i = 0; i < 120; i++) { ZEP[0][i] = rnd(); ZEP[1][i] = rnd(); }
const pIdx = (pc, sq) => (pc + 6) * 120 + sq;

const CASTLE_MASK = new Uint8Array(120).fill(15);
CASTLE_MASK[nameSq('e1')] = 15 & ~3; CASTLE_MASK[nameSq('h1')] = 15 & ~1; CASTLE_MASK[nameSq('a1')] = 15 & ~2;
CASTLE_MASK[nameSq('e8')] = 15 & ~12; CASTLE_MASK[nameSq('h8')] = 15 & ~4; CASTLE_MASK[nameSq('a8')] = 15 & ~8;

// Zug-Kodierung: from | to<<7 | promo<<14 | flag<<17  (flag: 1 = en passant, 2 = Rochade, 4 = Doppelschritt)
const mv = (f, t, pr = 0, fl = 0) => f | (t << 7) | (pr << 14) | (fl << 17);
const mFrom = (m) => m & 127, mTo = (m) => (m >> 7) & 127, mPro = (m) => (m >> 14) & 7, mFlag = (m) => (m >> 17) & 7;

const TT_SIZE = 1 << 20, TT_MASK = TT_SIZE - 1;

export class Engine {
  constructor() {
    this.b = new Int8Array(120);
    this.ttKey = new Uint32Array(TT_SIZE);
    this.ttMove = new Int32Array(TT_SIZE);
    this.ttScore = new Int32Array(TT_SIZE);
    this.ttDepth = new Int8Array(TT_SIZE);
    this.ttFlag = new Int8Array(TT_SIZE);
    this.history = new Int32Array(120 * 120);
    this.killers = new Int32Array(128 * 2);
    this.repHist = [];
  }

  load(fen, previousFens = []) {
    this.repHist = [];
    for (const f of previousFens) { this._parse(f); this.repHist.push(this.h0); }
    this._parse(fen);
    this.ply = 0;
    this.stack = [];
    this.posHist = this.repHist.slice();
  }

  _parse(fen) {
    const b = this.b; b.fill(OFF);
    for (let i = 0; i < 64; i++) b[TO120[i]] = EMPTY;
    const [pos, side, cast, ep, half] = fen.split(' ');
    let i = 0;
    for (const ch of pos) {
      if (ch === '/') continue;
      if (/\d/.test(ch)) { i += +ch; continue; }
      const lower = ch.toLowerCase();
      const t = 'xpnbrqk'.indexOf(lower);
      b[TO120[i]] = ch === lower ? -t : t;
      i++;
    }
    this.side = side === 'w' ? 1 : -1;
    this.castle = (cast.includes('K') ? 1 : 0) | (cast.includes('Q') ? 2 : 0) | (cast.includes('k') ? 4 : 0) | (cast.includes('q') ? 8 : 0);
    this.ep = ep && ep !== '-' ? nameSq(ep) : 0;
    this.half = +half || 0;
    this.kings = [0, 0];
    for (let s = 21; s < 99; s++) { if (b[s] === K) this.kings[0] = s; else if (b[s] === -K) this.kings[1] = s; }
    this._rehash();
  }

  _rehash() {
    let h0 = 0, h1 = 0;
    for (let s = 21; s < 99; s++) { const pc = this.b[s]; if (pc && pc !== OFF) { h0 ^= ZP[0][pIdx(pc, s)]; h1 ^= ZP[1][pIdx(pc, s)]; } }
    if (this.side === -1) { h0 ^= ZSIDE[0]; h1 ^= ZSIDE[1]; }
    h0 ^= ZCAST[0][this.castle]; h1 ^= ZCAST[1][this.castle];
    if (this.ep) { h0 ^= ZEP[0][this.ep]; h1 ^= ZEP[1][this.ep]; }
    this.h0 = h0 >>> 0; this.h1 = h1 >>> 0;
  }

  attacked(sq, by) { // by: 1 = Weiß greift an, -1 = Schwarz
    const b = this.b;
    // Bauern
    if (by === 1) { if (b[sq + 9] === P || b[sq + 11] === P) return true; }
    else { if (b[sq - 9] === -P || b[sq - 11] === -P) return true; }
    for (const o of N_OFF) if (b[sq + o] === N * by) return true;
    for (const o of K_OFF) if (b[sq + o] === K * by) return true;
    for (const o of B_OFF) {
      let s = sq + o;
      while (b[s] === EMPTY) s += o;
      if (b[s] === B * by || b[s] === Q * by) return true;
    }
    for (const o of R_OFF) {
      let s = sq + o;
      while (b[s] === EMPTY) s += o;
      if (b[s] === R * by || b[s] === Q * by) return true;
    }
    return false;
  }

  inCheck(side = this.side) { return this.attacked(this.kings[side === 1 ? 0 : 1], -side); }

  gen(capsOnly = false) {
    const b = this.b, us = this.side, out = [];
    const fwd = us === 1 ? -10 : 10;
    const startRank = us === 1 ? [81, 88] : [31, 38];
    const promoRank = us === 1 ? [21, 28] : [91, 98];
    for (let s = 21; s < 99; s++) {
      const pc = b[s];
      if (pc === EMPTY || pc === OFF || Math.sign(pc) !== us) continue;
      const t = pc * us;
      if (t === P) {
        const one = s + fwd;
        const isPromo = (x) => x >= promoRank[0] && x <= promoRank[1];
        if (b[one] === EMPTY) {
          if (isPromo(one)) { for (const pr of [Q, N, R, B]) out.push(mv(s, one, pr)); }
          else if (!capsOnly) {
            out.push(mv(s, one));
            const two = one + fwd;
            if (s >= startRank[0] && s <= startRank[1] && b[two] === EMPTY) out.push(mv(s, two, 0, 4));
          }
        }
        for (const d of [fwd - 1, fwd + 1]) {
          const c = s + d, tgt = b[c];
          if (tgt !== OFF && tgt !== EMPTY && Math.sign(tgt) === -us) {
            if (isPromo(c)) { for (const pr of [Q, N, R, B]) out.push(mv(s, c, pr)); }
            else out.push(mv(s, c));
          } else if (c === this.ep && this.ep) out.push(mv(s, c, 0, 1));
        }
        continue;
      }
      const slide = t === B || t === R || t === Q;
      const offs = t === N ? N_OFF : t === B ? B_OFF : t === R ? R_OFF : K_OFF;
      for (const o of offs) {
        let c = s + o;
        while (true) {
          const tgt = b[c];
          if (tgt === OFF) break;
          if (tgt === EMPTY) { if (!capsOnly) out.push(mv(s, c)); }
          else { if (Math.sign(tgt) === -us) out.push(mv(s, c)); break; }
          if (!slide) break;
          c += o;
        }
      }
      if (t === K && !capsOnly) {
        if (us === 1 && s === 95) {
          if ((this.castle & 1) && b[96] === EMPTY && b[97] === EMPTY && b[98] === R && !this.attacked(95, -1) && !this.attacked(96, -1) && !this.attacked(97, -1)) out.push(mv(95, 97, 0, 2));
          if ((this.castle & 2) && b[94] === EMPTY && b[93] === EMPTY && b[92] === EMPTY && b[91] === R && !this.attacked(95, -1) && !this.attacked(94, -1) && !this.attacked(93, -1)) out.push(mv(95, 93, 0, 2));
        } else if (us === -1 && s === 25) {
          if ((this.castle & 4) && b[26] === EMPTY && b[27] === EMPTY && b[28] === -R && !this.attacked(25, 1) && !this.attacked(26, 1) && !this.attacked(27, 1)) out.push(mv(25, 27, 0, 2));
          if ((this.castle & 8) && b[24] === EMPTY && b[23] === EMPTY && b[22] === EMPTY && b[21] === -R && !this.attacked(25, 1) && !this.attacked(24, 1) && !this.attacked(23, 1)) out.push(mv(25, 23, 0, 2));
        }
      }
    }
    return out;
  }

  _zx(pc, sq) { this.h0 ^= ZP[0][pIdx(pc, sq)]; this.h1 ^= ZP[1][pIdx(pc, sq)]; }

  make(m) {
    const b = this.b, f = mFrom(m), t = mTo(m), pr = mPro(m), fl = mFlag(m);
    const pc = b[f], us = this.side;
    let cap = b[t], capSq = t;
    if (fl === 1) { capSq = t - (us === 1 ? -10 : 10); cap = b[capSq]; }
    this.stack.push({ m, cap, capSq, castle: this.castle, ep: this.ep, half: this.half, h0: this.h0, h1: this.h1 });
    this.posHist.push(this.h0);
    if (this.ep) { this.h0 ^= ZEP[0][this.ep]; this.h1 ^= ZEP[1][this.ep]; }
    this.h0 ^= ZCAST[0][this.castle]; this.h1 ^= ZCAST[1][this.castle];
    if (cap) { this._zx(cap, capSq); b[capSq] = EMPTY; }
    this._zx(pc, f); b[f] = EMPTY;
    const placed = pr ? pr * us : pc;
    b[t] = placed; this._zx(placed, t);
    if (fl === 2) {
      let rf, rt;
      if (t === 97) { rf = 98; rt = 96; } else if (t === 93) { rf = 91; rt = 94; } else if (t === 27) { rf = 28; rt = 26; } else { rf = 21; rt = 24; }
      const rk = b[rf]; b[rf] = EMPTY; b[rt] = rk; this._zx(rk, rf); this._zx(rk, rt);
    }
    if (pc * us === K) this.kings[us === 1 ? 0 : 1] = t;
    this.castle &= CASTLE_MASK[f] & CASTLE_MASK[t];
    this.ep = fl === 4 ? (f + t) >> 1 : 0;
    this.half = (pc * us === P || cap) ? 0 : this.half + 1;
    this.h0 ^= ZCAST[0][this.castle]; this.h1 ^= ZCAST[1][this.castle];
    if (this.ep) { this.h0 ^= ZEP[0][this.ep]; this.h1 ^= ZEP[1][this.ep]; }
    this.h0 ^= ZSIDE[0]; this.h1 ^= ZSIDE[1];
    this.h0 >>>= 0; this.h1 >>>= 0;
    this.side = -us;
    this.ply++;
    // Legalität: eigener König darf nicht im Schach stehen
    if (this.attacked(this.kings[us === 1 ? 0 : 1], -us)) { this.unmake(); return false; }
    return true;
  }

  unmake() {
    const u = this.stack.pop();
    this.posHist.pop();
    const b = this.b, m = u.m, f = mFrom(m), t = mTo(m), pr = mPro(m), fl = mFlag(m);
    this.side = -this.side; this.ply--;
    const us = this.side;
    const moved = b[t];
    b[f] = pr ? P * us : moved;
    b[t] = EMPTY;
    if (u.cap) b[u.capSq] = u.cap;
    if (fl === 2) {
      let rf, rt;
      if (t === 97) { rf = 98; rt = 96; } else if (t === 93) { rf = 91; rt = 94; } else if (t === 27) { rf = 28; rt = 26; } else { rf = 21; rt = 24; }
      b[rf] = b[rt]; b[rt] = EMPTY;
    }
    if (b[f] * us === K) this.kings[us === 1 ? 0 : 1] = f;
    this.castle = u.castle; this.ep = u.ep; this.half = u.half; this.h0 = u.h0; this.h1 = u.h1;
  }

  legalMoves() {
    const out = [];
    for (const m of this.gen()) { if (this.make(m)) { this.unmake(); out.push(m); } }
    return out;
  }

  evaluate() { // aus Sicht der Seite am Zug
    const b = this.b;
    let mg = 0, eg = 0, phase = 0, wb = 0, bb = 0;
    for (let i = 0; i < 64; i++) {
      const pc = b[TO120[i]];
      if (!pc) continue;
      const t = pc > 0 ? pc : -pc;
      const idx = pc > 0 ? i : mirror(i);
      phase += PHASE_W[t];
      let vm = VALUE[t], ve = VALUE[t];
      if (t === K) { vm += PST[K][idx]; ve += K_END[idx]; }
      else if (t === P) { vm += PST[P][idx]; ve += P_END[idx]; }
      else { vm += PST[t][idx]; ve += PST[t][idx]; }
      if (t === B) { if (pc > 0) wb++; else bb++; }
      if (pc > 0) { mg += vm; eg += ve; } else { mg -= vm; eg -= ve; }
    }
    if (wb >= 2) { mg += 30; eg += 45; }
    if (bb >= 2) { mg -= 30; eg -= 45; }
    phase = Math.min(phase, 24);
    const score = (mg * phase + eg * (24 - phase)) / 24;
    return (score | 0) * this.side;
  }

  isRepetition() {
    const h = this.h0, hist = this.posHist;
    for (let i = hist.length - 2, n = 0; i >= 0 && n < this.half; i -= 2, n += 2) if (hist[i] === h) return true;
    return false;
  }

  _order(moves, ttMove, ply) {
    const b = this.b, scores = new Int32Array(moves.length);
    for (let i = 0; i < moves.length; i++) {
      const m = moves[i];
      if (m === ttMove) { scores[i] = 1e7; continue; }
      const t = mTo(m), cap = b[t];
      let s = 0;
      if (cap) s = 1e6 + Math.abs(VALUE[Math.abs(cap)]) * 10 - Math.abs(b[mFrom(m)]);
      else if (mFlag(m) === 1) s = 1e6 + 1000;
      if (mPro(m)) s += 9e5 + mPro(m);
      if (!s) {
        if (m === this.killers[ply * 2]) s = 8e5;
        else if (m === this.killers[ply * 2 + 1]) s = 7e5;
        else s = this.history[mFrom(m) * 120 + t];
      }
      scores[i] = s;
    }
    const idx = [...moves.keys()].sort((a, c) => scores[c] - scores[a]);
    return idx.map((i) => moves[i]);
  }

  quiesce(alpha, beta, qd) {
    this.nodes++;
    if ((this.nodes & 2047) === 0 && performance.now() > this.deadline) throw 'timeout';
    const stand = this.evaluate();
    if (stand >= beta) return beta;
    if (stand > alpha) alpha = stand;
    if (qd > 6) return alpha;
    const moves = this._order(this.gen(true), 0, 0);
    for (const m of moves) {
      if (!this.make(m)) continue;
      const sc = -this.quiesce(-beta, -alpha, qd + 1);
      this.unmake();
      if (sc >= beta) return beta;
      if (sc > alpha) alpha = sc;
    }
    return alpha;
  }

  search(depth, alpha, beta, ply) {
    this.nodes++;
    if ((this.nodes & 2047) === 0 && performance.now() > this.deadline) throw 'timeout';
    if (ply > 0 && (this.half >= 100 || this.isRepetition())) return 0;
    const check = this.inCheck();
    if (check) depth++;
    if (depth <= 0) return this.quiesce(alpha, beta, 0);

    const ti = this.h1 & TT_MASK;
    let ttMove = 0;
    if (this.ttKey[ti] === this.h0) {
      ttMove = this.ttMove[ti];
      if (ply > 0 && this.ttDepth[ti] >= depth) {
        const s = this.ttScore[ti], fl = this.ttFlag[ti];
        if (fl === 0) return s;
        if (fl === 1 && s >= beta) return s;
        if (fl === 2 && s <= alpha) return s;
      }
    }

    // Null-Move-Pruning
    if (!check && depth >= 3 && ply > 0 && this._hasPieces()) {
      const saveEp = this.ep;
      if (this.ep) { this.h0 ^= ZEP[0][this.ep]; this.h1 ^= ZEP[1][this.ep]; }
      this.ep = 0; this.side = -this.side; this.h0 = (this.h0 ^ ZSIDE[0]) >>> 0; this.h1 = (this.h1 ^ ZSIDE[1]) >>> 0;
      this.posHist.push(-1);
      let sc;
      try { sc = -this.search(depth - 3, -beta, -beta + 1, ply + 1); }
      finally {
        this.posHist.pop();
        this.side = -this.side; this.h0 = (this.h0 ^ ZSIDE[0]) >>> 0; this.h1 = (this.h1 ^ ZSIDE[1]) >>> 0;
        this.ep = saveEp; if (saveEp) { this.h0 = (this.h0 ^ ZEP[0][saveEp]) >>> 0; this.h1 = (this.h1 ^ ZEP[1][saveEp]) >>> 0; }
      }
      if (sc >= beta) return beta;
    }

    const moves = this._order(this.gen(), ttMove, ply);
    let best = -MATE * 2, bestMove = 0, legal = 0;
    const a0 = alpha;
    for (const m of moves) {
      if (!this.make(m)) continue;
      legal++;
      let sc;
      // Zufallsbonus an der Wurzel: Suchfenster vorher verschieben, sonst würden
      // ungenaue Fail-Low-Grenzen plus Bonus einen schlechten Zug „gewinnen“ lassen
      const nz = ply === 0 && this.rootNoise ? (this.rootNoise.get(m) || 0) : 0;
      const a = alpha - nz, bta = beta - nz;
      if (legal === 1) sc = -this.search(depth - 1, -bta, -a, ply + 1);
      else {
        // Late Move Reduction für ruhige Züge
        const quiet = !this.stack[this.stack.length - 1].cap && !mPro(m);
        const red = quiet && legal > 4 && depth >= 3 && !check ? 1 : 0;
        sc = -this.search(depth - 1 - red, -a - 1, -a, ply + 1);
        if (sc > a && sc < bta) sc = -this.search(depth - 1, -bta, -a, ply + 1);
      }
      this.unmake();
      sc += nz;
      if (sc > best) { best = sc; bestMove = m; if (ply === 0) this.rootBest = m; }
      if (sc > alpha) alpha = sc;
      if (alpha >= beta) {
        if (!this.b[mTo(m)]) {
          if (this.killers[ply * 2] !== m) { this.killers[ply * 2 + 1] = this.killers[ply * 2]; this.killers[ply * 2] = m; }
          this.history[mFrom(m) * 120 + mTo(m)] += depth * depth;
        }
        break;
      }
    }
    if (!legal) return check ? -MATE + ply : 0;
    this.ttKey[ti] = this.h0; this.ttMove[ti] = bestMove; this.ttScore[ti] = best; this.ttDepth[ti] = depth;
    this.ttFlag[ti] = best >= beta ? 1 : best <= a0 ? 2 : 0;
    return best;
  }

  _hasPieces() {
    const us = this.side;
    for (let s = 21; s < 99; s++) { const t = this.b[s] * us; if (t > 1 && t < 6) return true; }
    return false;
  }

  // Liefert {from, to, promotion, score, depth}
  // Kleinster Wert einer Figur von `by`, die das Feld angreift (0 = keine)
  minAttacker(sq, by) {
    const b = this.b;
    if (by === 1 ? (b[sq + 9] === P || b[sq + 11] === P) : (b[sq - 9] === -P || b[sq - 11] === -P)) return VALUE[P];
    for (const o of N_OFF) if (b[sq + o] === N * by) return VALUE[N];
    let best = 0;
    const consider = (v) => { if (!best || v < best) best = v; };
    for (const o of B_OFF) { let s = sq + o; while (b[s] === EMPTY) s += o; if (b[s] === B * by) consider(VALUE[B]); else if (b[s] === Q * by) consider(VALUE[Q]); }
    for (const o of R_OFF) { let s = sq + o; while (b[s] === EMPTY) s += o; if (b[s] === R * by) consider(VALUE[R]); else if (b[s] === Q * by) consider(VALUE[Q]); }
    if (best) return best;
    for (const o of K_OFF) if (b[sq + o] === K * by) return 20000;
    return 0;
  }

  // Grobe Bewertung jedes Wurzelzugs (1 Halbzug + Schlagabtausch), aus Sicht des Ziehenden
  rootScan(legal) {
    return legal.map((m) => {
      this.make(m);
      let sc;
      if (!this.legalMoves().length) sc = this.inCheck() ? MATE : 0;
      else { try { sc = -this.quiesce(-MATE * 2, MATE * 2, 0); } catch { sc = -this.evaluate(); } }
      this.unmake();
      return { m, sc };
    });
  }

  // Liefert {from, to, promotion, score, depth}
  // blunder: Wahrscheinlichkeit für einen „menschlichen“ Fehlzug – aber nur aus Zügen,
  // die höchstens `margin` Centipawns schlechter sind (keine völlig sinnlosen Züge mehr)
  think({ maxDepth = 4, timeMs = 1500, noise = 0, blunder = 0, margin = 200, full = false } = {}) {
    const legal = this.legalMoves();
    if (!legal.length) return null;
    const toObj = (m, extra = {}) => ({ from: sqName(mFrom(m)), to: sqName(mTo(m)), promotion: mPro(m) ? ' pnbrqk'[mPro(m)] : undefined, ...extra });
    const base = this.stack.length;
    this.killers.fill(0); this.history.fill(0);
    this.nodes = 0;
    if (Math.random() < blunder) {
      this.deadline = performance.now() + 5000;
      const scored = this.rootScan(legal);
      const top = Math.max(...scored.map((s) => s.sc));
      const ok = scored.filter((s) => s.sc >= top - margin);
      const pick = ok[(Math.random() * ok.length) | 0];
      return toObj(pick.m, { random: true, score: pick.sc, depth: 1 });
    }
    this.rootNoise = noise ? new Map(legal.map((m) => [m, ((Math.random() * 2 - 1) * noise) | 0])) : null;
    this.deadline = performance.now() + timeMs;
    let best = legal[0], bestScore = 0, reached = 0;
    for (let d = 1; d <= Math.max(1, maxDepth); d++) {
      this.rootBest = 0;
      try {
        const sc = this.search(d, -MATE * 2, MATE * 2, 0);
        if (this.rootBest) { best = this.rootBest; bestScore = sc; reached = d; }
        if (Math.abs(sc) > MATE - 100) break;
      } catch (e) {
        if (e !== 'timeout') throw e;
        // Stack bis zum Ausgangspunkt zurückspulen
        while (this.stack.length > base) this.unmake();
        break;
      }
      // normale Bots hören früh auf; Hugo nutzt die ganze Zeit für eine tiefere Suche
      if (performance.now() > this.deadline - timeMs * (full ? 0.08 : 0.45)) break;
    }
    this.rootNoise = null;
    return toObj(best, { score: bestScore, depth: reached, nodes: this.nodes });
  }

  // Zug-Analyse: Wie gut war `move` im Vergleich zum besten Zug? Ist es ein Opfer?
  analyze(fenBefore, move, history = [], timeMs = 300) {
    const clampSc = (s) => (s > MATE - 1000 ? 3000 : s < -(MATE - 1000) ? -3000 : s);
    this.load(fenBefore, history);
    const best = this.think({ maxDepth: 30, timeMs });
    if (!best) return null;
    const bestScore = clampSc(best.score);
    const legal = this.legalMoves();
    const m = legal.find((x) => sqName(mFrom(x)) === move.from && sqName(mTo(x)) === move.to && (!mPro(x) || ' pnbrqk'[mPro(x)] === (move.promotion || 'q')));
    if (!m) return null;
    const isBest = best.from === move.from && best.to === move.to;
    const moved = Math.abs(this.b[mFrom(m)]);
    const captured = mFlag(m) === 1 ? P : Math.abs(this.b[mTo(m)]);
    this.make(m);
    let after;
    if (!this.legalMoves().length) after = this.inCheck() ? 3000 : 0;
    else { const r = this.think({ maxDepth: 30, timeMs }); after = -clampSc(r.score); }
    // Opfer: die gezogene Figur steht angegriffen und geht für weniger als ihren Wert verloren
    const to = mTo(m), opp = this.side;
    const att = this.minAttacker(to, opp);
    const defended = this.attacked(to, -opp);
    const net = VALUE[moved] - (VALUE[captured] || 0);
    const sacrifice = moved !== P && moved !== K && att > 0 && net >= 200 && (!defended || att < VALUE[moved] - 50);
    this.unmake();
    const loss = isBest ? 0 : Math.max(0, bestScore - after);
    return { bestScore, after, loss, isBest, sacrifice, best: { from: best.from, to: best.to } };
  }
}
