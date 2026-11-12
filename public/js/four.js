// 4er-Schach (Jeder gegen jeden): Regeln – gemeinsam für Server und Browser.
// Brett 14×14 ohne die 3×3-Ecken. Reihenfolge: Rot (unten) → Blau (links) → Gelb (oben) → Grün (rechts).
// Wer matt oder patt ist (oder aufgibt / zu lange weg ist / keine Zeit mehr hat), scheidet aus;
// seine Figuren werden grau und bleiben als Hindernisse stehen (man kann sie schlagen). Der letzte Spieler gewinnt.
// 2 vs 2 (teams): Rot + Gelb gegen Blau + Grün. Partner können sich nicht schlagen und nicht Schach geben.
// Sobald ein Spieler ausscheidet, hat sein Team verloren.
// Vereinfachungen: keine Rochade, kein En passant, Könige können nicht geschlagen werden,
// Bauern werden auf der 8. Reihe (Brettmitte) automatisch zur Dame.

export const N = 14;
export const COLOR_NAMES = ['Rot', 'Blau', 'Gelb', 'Grün'];
export const COLOR_HEX = ['#ef4444', '#3b82f6', '#eab308', '#22c55e'];
export const valid = (r, c) => r >= 0 && r < N && c >= 0 && c < N && !((r < 3 || r > 10) && (c < 3 || c > 10));
export const sqName = (i) => `${'abcdefghijklmn'[i % N]}${N - Math.floor(i / N)}`;

const FWD = [[-1, 0], [0, 1], [1, 0], [0, -1]];
const START = [(r) => r === 12, (r, c) => c === 1, (r) => r === 1, (r, c) => c === 12];
const PROMO = [(r) => r === 6, (r, c) => c === 7, (r) => r === 7, (r, c) => c === 6];
const KN = [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]];
const DIAG = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
const ORTH = [[-1, 0], [1, 0], [0, -1], [0, 1]];
export const VALUE = { p: 1, n: 3, b: 3.2, r: 5, q: 9, k: 0 };

export const TEAM_NAMES = ['Rot & Gelb', 'Blau & Grün'];
export const teamOf = (c) => c % 2;
export const allied = (state, a, b) => a === b || (!!state.teams && a % 2 === b % 2);

export function newState({ teams = false } = {}) {
  const board = new Array(N * N).fill(null);
  const put = (r, c, t, col) => { board[r * N + c] = { t, c: col }; };
  const red = ['r', 'n', 'b', 'q', 'k', 'b', 'n', 'r'];
  const yellow = ['r', 'n', 'b', 'k', 'q', 'b', 'n', 'r'];
  const blue = ['r', 'n', 'b', 'k', 'q', 'b', 'n', 'r'];   // von unten nach oben
  const green = ['r', 'n', 'b', 'q', 'k', 'b', 'n', 'r'];  // von unten nach oben
  for (let i = 0; i < 8; i++) {
    put(13, 3 + i, red[i], 0); put(12, 3 + i, 'p', 0);
    put(0, 3 + i, yellow[i], 2); put(1, 3 + i, 'p', 2);
    put(10 - i, 0, blue[i], 1); put(10 - i, 1, 'p', 1);
    put(10 - i, 13, green[i], 3); put(10 - i, 12, 'p', 3);
  }
  return { board, turn: 0, alive: [true, true, true, true], out: [], ply: 0, last: null, teams: !!teams };
}

const at = (board, r, c) => (valid(r, c) ? board[r * N + c] : undefined);

// Wird Feld sq von einer lebenden Figur der Farbe color angegriffen?
export function attackedBy(board, sq, color) {
  const r = Math.floor(sq / N), c = sq % N;
  const live = (p, types) => p && p.c === color && !p.dead && types.includes(p.t);
  for (const [a, b] of KN) if (live(at(board, r + a, c + b), 'n')) return true;
  for (const [a, b] of DIAG) if (live(at(board, r + a, c + b), 'k')) return true;
  for (const [a, b] of ORTH) if (live(at(board, r + a, c + b), 'k')) return true;
  const [dr, dc] = FWD[color];
  const perp = dr === 0 ? [[-1, 0], [1, 0]] : [[0, -1], [0, 1]];
  for (const [a, b] of perp) if (live(at(board, r - dr - a, c - dc - b), 'p')) return true;
  for (const [dirs, types] of [[DIAG, 'bq'], [ORTH, 'rq']]) {
    for (const [a, b] of dirs) {
      let rr = r + a, cc = c + b;
      while (valid(rr, cc)) {
        const q = board[rr * N + cc];
        if (q) { if (live(q, types)) return true; break; }
        rr += a; cc += b;
      }
    }
  }
  return false;
}

export function kingSquare(board, color) {
  for (let i = 0; i < N * N; i++) { const p = board[i]; if (p && p.t === 'k' && p.c === color && !p.dead) return i; }
  return -1;
}

export function inCheck(state, color) {
  const k = kingSquare(state.board, color);
  if (k < 0) return false;
  for (let o = 0; o < 4; o++) if (!allied(state, o, color) && state.alive[o] && attackedBy(state.board, k, o)) return true;
  return false;
}

function pseudo(state, color) {
  const board = state.board;
  const out = [];
  const enemy = (q) => q.dead || !allied(state, q.c, color);
  const target = (from, r, c) => {
    if (!valid(r, c)) return 'stop';
    const q = board[r * N + c];
    if (!q) { out.push({ from, to: r * N + c }); return 'go'; }
    if (enemy(q) && q.t !== 'k') out.push({ from, to: r * N + c });
    return 'stop';
  };
  for (let i = 0; i < N * N; i++) {
    const p = board[i];
    if (!p || p.c !== color || p.dead) continue;
    const r = Math.floor(i / N), c = i % N;
    if (p.t === 'p') {
      const [dr, dc] = FWD[color];
      const r1 = r + dr, c1 = c + dc;
      if (valid(r1, c1) && !board[r1 * N + c1]) {
        out.push({ from: i, to: r1 * N + c1 });
        const r2 = r1 + dr, c2 = c1 + dc;
        if (START[color](r, c) && valid(r2, c2) && !board[r2 * N + c2]) out.push({ from: i, to: r2 * N + c2 });
      }
      const perp = dr === 0 ? [[-1, 0], [1, 0]] : [[0, -1], [0, 1]];
      for (const [a, b] of perp) {
        const q = at(board, r1 + a, c1 + b);
        if (q && enemy(q) && q.t !== 'k') out.push({ from: i, to: (r1 + a) * N + (c1 + b) });
      }
    } else if (p.t === 'n') {
      for (const [a, b] of KN) target(i, r + a, c + b);
    } else if (p.t === 'k') {
      for (const [a, b] of [...DIAG, ...ORTH]) target(i, r + a, c + b);
    } else {
      const dirs = p.t === 'b' ? DIAG : p.t === 'r' ? ORTH : [...DIAG, ...ORTH];
      for (const [a, b] of dirs) { let rr = r + a, cc = c + b; while (target(i, rr, cc) === 'go') { rr += a; cc += b; } }
    }
  }
  for (const m of out) {
    const p = board[m.from];
    if (p.t === 'p' && PROMO[color](Math.floor(m.to / N), m.to % N)) m.promo = 'q';
  }
  return out;
}

export function make(state, m) {
  const b = state.board;
  const undo = { m, piece: b[m.from], captured: b[m.to] };
  b[m.to] = m.promo ? { t: m.promo, c: b[m.from].c } : b[m.from];
  b[m.from] = null;
  return undo;
}
export function unmake(state, u) {
  state.board[u.m.from] = u.piece;
  state.board[u.m.to] = u.captured;
}

export function legalMoves(state, color) {
  if (!state.alive[color]) return [];
  const res = [];
  for (const m of pseudo(state, color)) {
    const u = make(state, m);
    if (!inCheck(state, color)) res.push(m);
    unmake(state, u);
  }
  return res;
}

export const aliveCount = (state) => state.alive.filter(Boolean).length;
export const nextColor = (state, from) => { for (let k = 1; k <= 4; k++) { const c = (from + k) % 4; if (state.alive[c]) return c; } return from; };

// Spieler ausscheiden lassen: Figuren werden grau, König verschwindet
export function eliminate(state, color, reason) {
  if (!state.alive[color]) return;
  state.alive[color] = false;
  state.out.push({ color, reason, ply: state.ply });
  for (let i = 0; i < N * N; i++) {
    const p = state.board[i];
    if (p && p.c === color) { if (p.t === 'k') state.board[i] = null; else p.dead = true; }
  }
}

// Nach einem Zug/Ausscheiden: nächsten Spieler finden; wer nicht ziehen kann, scheidet aus
// Ende: im 2 vs 2 sobald einer raus ist, sonst wenn nur noch einer übrig ist
export const finished = (state) => (state.teams ? state.alive.some((a) => !a) : aliveCount(state) <= 1);
export const winningTeam = (state) => (!state.teams ? -1 : state.alive[0] && state.alive[2] ? 0 : state.alive[1] && state.alive[3] ? 1 : -1);

export function settle(state, events = []) {
  while (!finished(state)) {
    const c = state.turn;
    if (!state.alive[c]) { state.turn = nextColor(state, c); continue; }
    if (legalMoves(state, c).length) break;
    const mate = inCheck(state, c);
    eliminate(state, c, mate ? 'checkmate' : 'stalemate');
    events.push({ type: 'out', color: c, reason: mate ? 'checkmate' : 'stalemate' });
    state.turn = nextColor(state, c);
  }
  if (finished(state)) { state.over = true; if (state.teams) state.winTeam = winningTeam(state); }
  return events;
}

// Kompletter Zug inkl. Prüfung, Schach-Ereignissen und Weitergabe
export function play(state, color, from, to) {
  if (state.over || state.turn !== color) return null;
  const m = legalMoves(state, color).find((x) => x.from === from && x.to === to);
  if (!m) return null;
  const cap = state.board[m.to];
  make(state, m);
  state.ply++;
  state.last = { from, to, color };
  const events = [];
  if (cap) events.push({ type: 'capture', piece: cap.t, color: cap.c, dead: !!cap.dead });
  if (m.promo) events.push({ type: 'promo' });
  for (let o = 0; o < 4; o++) if (o !== color && state.alive[o] && inCheck(state, o)) events.push({ type: 'check', color: o });
  if (state.teams && finished(state)) { state.over = true; state.winTeam = winningTeam(state); return { move: m, events }; }
  state.turn = nextColor(state, color);
  settle(state, events);
  return { move: m, events };
}

// Einfacher Bot: nimmt Material, gibt Schach/Matt, vermeidet hängende Figuren, entwickelt ins Zentrum
export function botMove(state, color) {
  const moves = legalMoves(state, color);
  if (!moves.length) return null;
  const b = state.board;
  const opps = [0, 1, 2, 3].filter((o) => !allied(state, o, color) && state.alive[o]);
  let best = moves[0], bestS = -Infinity;
  for (const m of moves) {
    const piece = b[m.from], cap = b[m.to];
    let s = cap ? VALUE[cap.t] * (cap.dead ? 0.35 : 1) : 0;
    if (m.promo) s += 8;
    const r = Math.floor(m.to / N), c = m.to % N;
    s += (7 - Math.max(Math.abs(r - 6.5), Math.abs(c - 6.5))) * 0.03;
    const u = make(state, m);
    if (opps.some((o) => attackedBy(b, m.to, o))) {
      const defended = attackedBy(b, m.to, color);
      s -= VALUE[(m.promo ? { t: 'q' } : piece).t] * (defended ? 0.45 : 0.95);
    }
    for (const o of opps) {
      if (inCheck(state, o)) {
        s += 0.5;
        if (!legalMoves(state, o).length) s += 40; // Matt!
      }
    }
    unmake(state, u);
    s += Math.random() * 0.25;
    if (s > bestS) { bestS = s; best = m; }
  }
  return best;
}
