import express from 'express';
import http from 'http';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { Server } from 'socket.io';
import { Chess } from 'chess.js';
import { REWARDS, BOTS, findItem, AVATAR_EMOJIS, AVATAR_COLORS } from './public/js/catalog.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;
const DB_FILE = process.env.DB_FILE || path.join(__dirname, 'data', 'db.json');
const VOTE_MS = 12000;
const RECONNECT_MS = 45000;

// ---------------------------------------------------------------- Datenbank (JSON-Datei)
let db = { users: {} };
try { db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); } catch { /* neue DB */ }
db.users ||= {};
let saveTimer = null;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });
    const tmp = DB_FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(db));
    fs.renameSync(tmp, DB_FILE);
  }, 400);
}

const byToken = new Map();
const byCode = new Map();
for (const u of Object.values(db.users)) { byToken.set(u.token, u); byCode.set(u.code, u); }

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const digits = (n) => Array.from({ length: n }, (_, i) => (i === 0 ? 1 + crypto.randomInt(9) : crypto.randomInt(10))).join('');

function createUser() {
  let code; do code = digits(8); while (byCode.has(code));
  const u = {
    id: crypto.randomUUID(),
    token: crypto.randomBytes(24).toString('hex'),
    code,
    name: 'Spieler' + (1000 + crypto.randomInt(9000)),
    avatar: { type: 'emoji', value: pick(AVATAR_EMOJIS), color: pick(AVATAR_COLORS) },
    coins: REWARDS.start,
    rating: 1200,
    stats: { games: 0, wins: 0, losses: 0, draws: 0, botWins: 0, botGames: 0, mates: 0 },
    owned: { board: ['klassisch'], pieces: ['klassisch'], finisher: ['klassisch'] },
    equipped: { board: 'klassisch', pieces: 'klassisch', finisher: 'klassisch' },
    history: [],
    createdAt: Date.now(),
  };
  db.users[u.id] = u; byToken.set(u.token, u); byCode.set(u.code, u);
  save();
  return u;
}

const pub = (u) => ({ id: u.id, name: u.name, avatar: u.avatar, rating: u.rating, equipped: u.equipped, stats: { games: u.stats.games, wins: u.stats.wins } });
const priv = (u) => ({ ...pub(u), code: u.code, coins: u.coins, owned: u.owned, stats: u.stats, history: u.history.slice(0, 30) });

// ---------------------------------------------------------------- Server
const app = express();
app.use('/vendor/chess.js', (req, res) => res.sendFile(path.join(__dirname, 'node_modules/chess.js/dist/esm/chess.js')));
app.use('/vendor/three', express.static(path.join(__dirname, 'node_modules/three/build')));
app.use('/vendor/three-jsm', express.static(path.join(__dirname, 'node_modules/three/examples/jsm')));
app.use(express.static(path.join(__dirname, 'public')));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

const server = http.createServer(app);
const io = new Server(server, { maxHttpBufferSize: 400_000 });

const online = new Map();      // userId -> socket
const games = new Map();       // gameId -> game
const userGame = new Map();    // userId -> gameId
const rooms = new Map();       // 6-stelliger Code -> { code, hostId, timeMs }
const challenges = new Map();  // id -> { fromId, toId, timeMs }
let queue = [];                // [{ userId, since }]

const sockOf = (uid) => online.get(uid);
const emitTo = (uid, ev, data) => sockOf(uid)?.emit(ev, data);

function broadcastStats() {
  io.emit('stats', { online: online.size, playing: [...games.values()].filter((g) => g.status !== 'over').length * 2, queue: queue.length });
}
setInterval(broadcastStats, 5000);

// ---------------------------------------------------------------- Spiele
function clockState(g) {
  const c = { w: g.clock.w, b: g.clock.b };
  if (g.status === 'playing' && g.timeMs && g.started) c[g.chess.turn()] -= Date.now() - g.lastTick;
  return { w: Math.max(0, c.w), b: Math.max(0, c.b), running: g.status === 'playing' && g.started ? g.chess.turn() : null, unlimited: !g.timeMs };
}

function gamePayload(g, uid) {
  const hist = g.chess.history({ verbose: true }).map((m) => ({ san: m.san, from: m.from, to: m.to }));
  return {
    id: g.id, fen: g.chess.fen(), moves: hist, status: g.status, board: g.board,
    you: g.players.w === uid ? 'w' : 'b',
    players: { w: pub(db.users[g.players.w]), b: pub(db.users[g.players.b]) },
    skins: { w: db.users[g.players.w].equipped.pieces, b: db.users[g.players.b].equipped.pieces },
    clock: clockState(g), timeMs: g.timeMs, drawOffer: g.drawOffer, boardDecision: g.boardDecision,
  };
}

function startMatch(aId, bId, timeMs, source) {
  if (aId === bId || userGame.has(aId) || userGame.has(bId)) return false;
  queue = queue.filter((q) => q.userId !== aId && q.userId !== bId);
  for (const [code, r] of rooms) if (r.hostId === aId || r.hostId === bId) rooms.delete(code);
  const flip = Math.random() < 0.5;
  const g = {
    id: crypto.randomUUID(), source,
    players: { w: flip ? aId : bId, b: flip ? bId : aId },
    chess: new Chess(), timeMs, clock: { w: timeMs, b: timeMs }, lastTick: Date.now(), started: false,
    status: 'vote', votes: {}, board: null, drawOffer: null, disconnect: {},
  };
  games.set(g.id, g); userGame.set(aId, g.id); userGame.set(bId, g.id);
  const A = db.users[aId], B = db.users[bId];
  if (A.equipped.board === B.equipped.board) {
    beginGame(g, A.equipped.board, 'gleich');
  } else {
    g.voteDeadline = Date.now() + VOTE_MS;
    const options = [{ board: A.equipped.board, by: pub(A) }, { board: B.equipped.board, by: pub(B) }];
    g.voteOptions = options;
    for (const uid of [aId, bId]) emitTo(uid, 'match:vote', { gameId: g.id, options, deadline: g.voteDeadline, duration: VOTE_MS, players: { w: pub(db.users[g.players.w]), b: pub(db.users[g.players.b]) }, you: g.players.w === uid ? 'w' : 'b' });
    g.voteTimer = setTimeout(() => resolveVote(g), VOTE_MS + 300);
  }
  broadcastStats();
  return true;
}

function resolveVote(g) {
  if (g.status !== 'vote') return;
  clearTimeout(g.voteTimer);
  const vals = Object.values(g.votes);
  let board, decision;
  if (vals.length === 2 && vals[0] === vals[1]) { board = vals[0]; decision = 'einig'; }
  else if (vals.length === 1) { board = vals[0]; decision = 'einzige Stimme'; }
  else { board = pick(vals.length ? vals : g.voteOptions.map((o) => o.board)); decision = 'zufall'; }
  beginGame(g, board, decision);
}

function beginGame(g, board, decision) {
  g.board = board; g.boardDecision = decision; g.status = 'playing'; g.lastTick = Date.now();
  for (const c of ['w', 'b']) emitTo(g.players[c], 'game:start', gamePayload(g, g.players[c]));
}

function opponentOf(g, uid) { return g.players.w === uid ? g.players.b : g.players.w; }

function sendState(g, extra = {}) {
  for (const c of ['w', 'b']) {
    const uid = g.players[c];
    const last = g.chess.history({ verbose: true }).at(-1);
    emitTo(uid, 'game:state', { id: g.id, fen: g.chess.fen(), lastMove: last ? { from: last.from, to: last.to, san: last.san } : null, clock: clockState(g), drawOffer: g.drawOffer, ...extra });
  }
}

function elo(ra, rb, score) {
  const ea = 1 / (1 + 10 ** ((rb - ra) / 400));
  return Math.round(32 * (score - ea));
}

function endGame(g, result, reason) {
  if (g.status === 'over') return;
  if (g.status === 'playing' && g.timeMs && g.started) { g.clock[g.chess.turn()] -= Date.now() - g.lastTick; }
  g.status = 'over';
  clearTimeout(g.voteTimer);
  for (const t of Object.values(g.disconnect)) clearTimeout(t);
  const W = db.users[g.players.w], B = db.users[g.players.b];
  const sW = result === 'w' ? 1 : result === 'b' ? 0 : 0.5;
  const dW = elo(W.rating, B.rating, sW), dB = elo(B.rating, W.rating, 1 - sW);
  const winner = result === 'w' ? W : result === 'b' ? B : null;
  const finisher = reason === 'checkmate' && winner ? winner.equipped.finisher : null;
  const plies = g.chess.history().length;
  for (const [u, color, d, opp] of [[W, 'w', dW, B], [B, 'b', dB, W]]) {
    const outcome = result === 'draw' ? 'draw' : result === color ? 'win' : 'loss';
    let coins = outcome === 'win' ? REWARDS.win : outcome === 'draw' ? REWARDS.draw : REWARDS.loss;
    if (plies < 4 && reason !== 'checkmate') coins = outcome === 'win' ? Math.round(REWARDS.win / 4) : 0; // Schutz gegen Farming
    u.coins += coins; u.rating = Math.max(100, u.rating + d);
    u.stats.games++; u.stats[outcome === 'win' ? 'wins' : outcome === 'loss' ? 'losses' : 'draws']++;
    if (outcome === 'win' && reason === 'checkmate') u.stats.mates++;
    u.history.unshift({ type: 'online', opponent: opp.name, oppAvatar: opp.avatar, outcome, reason, coins, rating: d, moves: plies, at: Date.now() });
    u.history = u.history.slice(0, 50);
    emitTo(u.id, 'game:over', {
      id: g.id, result, reason, outcome, coins, ratingChange: d, finisher,
      winnerName: winner?.name || null, fen: g.chess.fen(), board: g.board,
      skins: { w: W.equipped.pieces, b: B.equipped.pieces }, profile: priv(u),
    });
  }
  save();
  userGame.delete(W.id); userGame.delete(B.id);
  setTimeout(() => games.delete(g.id), 60_000);
  broadcastStats();
}

function checkGameEnd(g) {
  const c = g.chess;
  if (c.isCheckmate()) return endGame(g, c.turn() === 'w' ? 'b' : 'w', 'checkmate');
  if (c.isStalemate()) return endGame(g, 'draw', 'stalemate');
  if (c.isInsufficientMaterial()) return endGame(g, 'draw', 'insufficient');
  if (c.isThreefoldRepetition()) return endGame(g, 'draw', 'repetition');
  if (c.isDraw()) return endGame(g, 'draw', 'fifty');
}

setInterval(() => {
  const now = Date.now();
  for (const g of games.values()) {
    if (g.status !== 'playing' || !g.timeMs || !g.started) continue;
    const t = g.chess.turn();
    if (g.clock[t] - (now - g.lastTick) <= 0) {
      g.clock[t] = 0; g.lastTick = now;
      endGame(g, t === 'w' ? 'b' : 'w', 'timeout');
    }
  }
}, 200);

// ---------------------------------------------------------------- Sockets
const clean = (s, n) => String(s ?? '').replace(/[<>\u0000-\u001f]/g, '').trim().slice(0, n);
const ALLOWED_TIMES = [0, 60_000, 180_000, 300_000, 600_000, 900_000];

io.on('connection', (socket) => {
  let user = null;
  const need = (fn) => (...args) => { if (user) try { fn(...args); } catch (e) { console.error(e); } };

  socket.on('auth', ({ token } = {}, ack) => {
    user = byToken.get(token) || createUser();
    const old = online.get(user.id);
    if (old && old.id !== socket.id) { old.emit('session:replaced'); old.disconnect(true); }
    online.set(user.id, socket);
    ack?.({ token: user.token, profile: priv(user) });
    // Laufendes Spiel fortsetzen
    const gid = userGame.get(user.id);
    const g = gid && games.get(gid);
    if (g) {
      if (g.disconnect[user.id]) { clearTimeout(g.disconnect[user.id]); delete g.disconnect[user.id]; emitTo(opponentOf(g, user.id), 'game:opponent', { online: true }); }
      if (g.status === 'playing') socket.emit('game:start', { ...gamePayload(g, user.id), resumed: true });
      else if (g.status === 'vote') socket.emit('match:vote', { gameId: g.id, options: g.voteOptions, deadline: g.voteDeadline, duration: VOTE_MS, players: { w: pub(db.users[g.players.w]), b: pub(db.users[g.players.b]) }, you: g.players.w === user.id ? 'w' : 'b', votes: g.votes });
    }
    broadcastStats();
  });

  socket.on('profile:update', need(({ name, avatar } = {}, ack) => {
    if (name !== undefined) {
      const n = clean(name, 20);
      if (n.length < 2) return ack?.({ error: 'Der Name braucht mindestens 2 Zeichen.' });
      user.name = n;
    }
    if (avatar) {
      if (avatar.type === 'emoji' && AVATAR_EMOJIS.includes(avatar.value) && /^#[0-9a-f]{6}$/i.test(avatar.color)) user.avatar = { type: 'emoji', value: avatar.value, color: avatar.color };
      else if (avatar.type === 'image' && typeof avatar.value === 'string' && /^data:image\/(png|jpeg|webp);base64,/.test(avatar.value) && avatar.value.length < 300_000) user.avatar = { type: 'image', value: avatar.value };
      else return ack?.({ error: 'Ungültiges Profilbild.' });
    }
    save();
    ack?.({ profile: priv(user) });
  }));

  socket.on('shop:buy', need(({ kind, id } = {}, ack) => {
    const item = findItem(kind, id);
    if (!item) return ack?.({ error: 'Unbekannter Artikel.' });
    if (user.owned[kind].includes(id)) return ack?.({ error: 'Schon in deinem Besitz.' });
    if (user.coins < item.price) return ack?.({ error: `Dir fehlen ${item.price - user.coins} Münzen.` });
    user.coins -= item.price; user.owned[kind].push(id); user.equipped[kind] = id;
    save(); ack?.({ profile: priv(user) });
  }));

  socket.on('shop:equip', need(({ kind, id } = {}, ack) => {
    if (!findItem(kind, id) || !user.owned[kind]?.includes(id)) return ack?.({ error: 'Nicht in deinem Besitz.' });
    user.equipped[kind] = id; save(); ack?.({ profile: priv(user) });
  }));

  // --- Einladungscode (6-stellig, zufällig)
  socket.on('room:create', need(({ timeMs = 600_000 } = {}, ack) => {
    if (userGame.has(user.id)) return ack?.({ error: 'Du bist bereits in einem Spiel.' });
    for (const [c, r] of rooms) if (r.hostId === user.id) rooms.delete(c);
    let code; do code = digits(6); while (rooms.has(code));
    rooms.set(code, { code, hostId: user.id, timeMs: ALLOWED_TIMES.includes(timeMs) ? timeMs : 600_000, at: Date.now() });
    ack?.({ code });
  }));
  socket.on('room:cancel', need(() => { for (const [c, r] of rooms) if (r.hostId === user.id) rooms.delete(c); }));

  socket.on('code:join', need(({ code } = {}, ack) => {
    code = String(code || '').replace(/\D/g, '');
    if (userGame.has(user.id)) return ack?.({ error: 'Du bist bereits in einem Spiel.' });
    const room = rooms.get(code);
    if (room) {
      if (room.hostId === user.id) return ack?.({ error: 'Das ist dein eigener Code – teile ihn mit einem Freund.' });
      if (!online.has(room.hostId)) { rooms.delete(code); return ack?.({ error: 'Der Gastgeber ist nicht mehr online.' }); }
      rooms.delete(code);
      startMatch(room.hostId, user.id, room.timeMs, 'invite');
      return ack?.({ ok: true });
    }
    const target = byCode.get(code);
    if (target) {
      if (target.id === user.id) return ack?.({ error: 'Das ist dein eigener Spielercode.' });
      if (!online.has(target.id)) return ack?.({ error: `${target.name} ist gerade offline.` });
      if (userGame.has(target.id)) return ack?.({ error: `${target.name} spielt gerade.` });
      const id = crypto.randomUUID();
      challenges.set(id, { fromId: user.id, toId: target.id, timeMs: 600_000 });
      setTimeout(() => challenges.delete(id), 60_000);
      emitTo(target.id, 'challenge:incoming', { id, from: pub(user) });
      return ack?.({ challenged: target.name });
    }
    ack?.({ error: 'Kein Spiel oder Spieler mit diesem Code gefunden.' });
  }));

  socket.on('challenge:respond', need(({ id, accept } = {}) => {
    const ch = challenges.get(id);
    if (!ch || ch.toId !== user.id) return;
    challenges.delete(id);
    if (!accept) return emitTo(ch.fromId, 'toast', { type: 'warn', text: `${user.name} hat deine Herausforderung abgelehnt.` });
    if (!online.has(ch.fromId)) return socket.emit('toast', { type: 'warn', text: 'Der Herausforderer ist nicht mehr online.' });
    if (!startMatch(ch.fromId, user.id, ch.timeMs, 'challenge')) socket.emit('toast', { type: 'warn', text: 'Spiel konnte nicht gestartet werden.' });
  }));

  // --- Zufälliges Match
  socket.on('queue:join', need((_, ack) => {
    if (userGame.has(user.id)) return ack?.({ error: 'Du bist bereits in einem Spiel.' });
    queue = queue.filter((q) => q.userId !== user.id && online.has(q.userId));
    // Gegner mit möglichst ähnlicher Wertung
    let best = null;
    for (const q of queue) {
      const diff = Math.abs(db.users[q.userId].rating - user.rating);
      if (!best || diff < best.diff) best = { q, diff };
    }
    if (best) { ack?.({ ok: true, matched: true }); startMatch(best.q.userId, user.id, 600_000, 'random'); return; }
    queue.push({ userId: user.id, since: Date.now() });
    ack?.({ ok: true });
    broadcastStats();
  }));
  socket.on('queue:leave', need(() => { queue = queue.filter((q) => q.userId !== user.id); broadcastStats(); }));

  // --- Brett-Abstimmung
  socket.on('match:vote', need(({ gameId, board } = {}) => {
    const g = games.get(gameId);
    if (!g || g.status !== 'vote' || !Object.values(g.players).includes(user.id)) return;
    if (!g.voteOptions.some((o) => o.board === board)) return;
    g.votes[user.id] = board;
    for (const uid of Object.values(g.players)) emitTo(uid, 'match:voteUpdate', { gameId, votes: g.votes });
    if (Object.keys(g.votes).length === 2) setTimeout(() => resolveVote(g), 900);
  }));

  // --- Spielzüge
  const myGame = () => { const g = games.get(userGame.get(user.id)); return g && g.status === 'playing' ? g : null; };

  socket.on('game:move', need(({ from, to, promotion } = {}, ack) => {
    const g = myGame();
    if (!g) return ack?.({ error: 'Kein aktives Spiel.' });
    const color = g.players.w === user.id ? 'w' : 'b';
    if (g.chess.turn() !== color) return ack?.({ error: 'Du bist nicht am Zug.', fen: g.chess.fen() });
    let m;
    try { m = g.chess.move({ from, to, promotion: promotion || 'q' }); } catch { m = null; }
    if (!m) return ack?.({ error: 'Ungültiger Zug.', fen: g.chess.fen() });
    const now = Date.now();
    if (g.started && g.timeMs) g.clock[color] -= now - g.lastTick;
    if (!g.started && g.chess.history().length >= 2) g.started = true; // Uhr läuft ab dem 2. Zug
    g.lastTick = now;
    if (g.drawOffer && g.drawOffer !== color) g.drawOffer = null;
    ack?.({ ok: true });
    sendState(g, { san: m.san, flags: m.flags, captured: m.captured, check: g.chess.inCheck() });
    checkGameEnd(g);
  }));

  socket.on('game:resign', need(() => { const g = myGame(); if (g) endGame(g, g.players.w === user.id ? 'b' : 'w', 'resign'); }));
  socket.on('game:draw', need(({ action } = {}) => {
    const g = myGame(); if (!g) return;
    const color = g.players.w === user.id ? 'w' : 'b';
    if (action === 'offer' && !g.drawOffer) { g.drawOffer = color; sendState(g); }
    else if (action === 'accept' && g.drawOffer && g.drawOffer !== color) endGame(g, 'draw', 'agreement');
    else if (action === 'decline' && g.drawOffer && g.drawOffer !== color) { g.drawOffer = null; sendState(g, { drawDeclined: true }); }
  }));
  socket.on('game:emote', need(({ emote } = {}) => {
    const g = myGame(); if (!g) return;
    const allowed = ['👍', '😮', '😂', '🔥', '🤝', '😅', '👑', 'GG'];
    if (allowed.includes(emote)) emitTo(opponentOf(g, user.id), 'game:emote', { emote });
  }));

  // --- Bot-Ergebnisse (serverseitig nachgespielt)
  socket.on('bot:finish', need(({ botId, color, moves, resigned } = {}, ack) => {
    const bot = BOTS.find((b) => b.id === botId);
    if (!bot || !['w', 'b'].includes(color) || !Array.isArray(moves) || moves.length > 600) return ack?.({ error: 'Ungültig.' });
    const now = Date.now();
    if (user.lastBotAt && now - user.lastBotAt < 8000) return ack?.({ error: 'Zu schnell.' });
    const c = new Chess();
    try { for (const m of moves) if (!c.move({ from: m.from, to: m.to, promotion: m.promotion })) throw 0; } catch { return ack?.({ error: 'Partie ungültig.' }); }
    let outcome = null, reason = null;
    if (c.isCheckmate()) { outcome = c.turn() === color ? 'loss' : 'win'; reason = 'checkmate'; }
    else if (c.isDraw() || c.isStalemate()) { outcome = 'draw'; reason = 'draw'; }
    else if (resigned) { outcome = 'loss'; reason = 'resign'; }
    else return ack?.({ error: 'Partie nicht beendet.' });
    let coins = 0;
    if (outcome === 'win') coins = bot.reward;
    else if (outcome === 'draw') coins = Math.round(bot.reward / 3);
    else if (moves.length >= 10) coins = REWARDS.botLoss;
    user.lastBotAt = now;
    user.coins += coins;
    user.stats.botGames++;
    if (outcome === 'win') { user.stats.botWins++; user.stats.mates++; }
    user.history.unshift({ type: 'bot', opponent: bot.name, oppAvatar: { type: 'emoji', value: bot.avatar, color: bot.color }, outcome, reason, coins, rating: 0, moves: moves.length, at: now });
    user.history = user.history.slice(0, 50);
    save();
    ack?.({ coins, outcome, profile: priv(user) });
  }));

  socket.on('leaderboard', (_, ack) => {
    const list = Object.values(db.users).filter((u) => u.stats.games > 0 || u.stats.botWins > 0)
      .sort((a, b) => b.rating - a.rating || b.stats.wins - a.stats.wins).slice(0, 50)
      .map((u) => ({ ...pub(u), online: online.has(u.id), losses: u.stats.losses, draws: u.stats.draws, botWins: u.stats.botWins }));
    ack?.({ list });
  });

  socket.on('disconnect', () => {
    if (!user || online.get(user.id) !== socket) return;
    online.delete(user.id);
    queue = queue.filter((q) => q.userId !== user.id);
    for (const [c, r] of rooms) if (r.hostId === user.id) rooms.delete(c);
    const g = games.get(userGame.get(user.id));
    if (g && g.status !== 'over') {
      const uid = user.id;
      emitTo(opponentOf(g, uid), 'game:opponent', { online: false, deadline: Date.now() + RECONNECT_MS });
      g.disconnect[uid] = setTimeout(() => {
        if (g.status === 'vote') { resolveVote(g); }
        if (g.status === 'playing') endGame(g, g.players.w === uid ? 'b' : 'w', 'abandon');
      }, RECONNECT_MS);
    }
    broadcastStats();
  });
});

server.listen(PORT, () => console.log(`♞ SchachArena läuft auf http://localhost:${PORT}`));
