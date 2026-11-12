import express from 'express';
import http from 'http';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { Server } from 'socket.io';
import compression from 'compression';
import { Chess } from 'chess.js';
import { REWARDS, BOTS, BUNDLES, findItem, bundlePrice, pieceLook, AVATAR_EMOJIS, AVATAR_COLORS, PROFILE_OPTIONS, DEFAULT_CUSTOM, MUSIC_MAX_BYTES } from './public/js/catalog.js';
import { checkUsername, badWord, badChat } from './public/js/censor.js';
import { VERSION } from './public/js/version.js';
import * as Four from './public/js/four.js';
import { setupAdmin } from './server-admin.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;
const DB_FILE = process.env.DB_FILE || path.join(__dirname, 'data', 'db.json');
const VOTE_MS = 12000;
const RECONNECT_MS = Number(process.env.RECONNECT_MS) || 180_000; // 3 Minuten ohne Verbindung -> automatisch aufgegeben (Spiel ist so lange pausiert)
const LAG_MS = 14_000;        // so lange ohne Lebenszeichen gilt eine Verbindung als hängend
const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const VARIANTS = { queens: 'qqqqkqqq/qqqqqqqq/8/8/8/8/QQQQQQQQ/QQQQKQQQ w - - 0 1' }; // Queen-Modus: alles Damen außer den Königen
const RESTORE_MS = 90_000;      // nach einem Update: so lange haben beide Zeit, zurückzukommen
const BOOT = Date.now();
const freshBoot = () => Date.now() - BOOT < 20 * 60_000;

// ---------------------------------------------------------------- Datenbank
// Mit MONGODB_URI (z. B. kostenloses MongoDB Atlas) bleiben alle Profile bei Updates erhalten.
// Ohne MONGODB_URI wird eine JSON-Datei benutzt (geht bei Render-Free bei jedem Update verloren).
const MONGO_URI = process.env.MONGODB_URI;
let db = { users: {} };
let mongoUsers = null, mongoMusic = null, mongoGames = null, mongoChats = null, mongoMatches = null, mongoGroups = null;
const INSTANCE = crypto.randomUUID(); // jede Server-Instanz hat eine eigene Kennung
const lastSaved = new Map(); // userId -> zuletzt gespeicherter JSON-Stand

async function loadDb() {
  if (MONGO_URI) {
    const { MongoClient } = await import('mongodb');
    const client = new MongoClient(MONGO_URI, { serverSelectionTimeoutMS: 15000 });
    await client.connect();
    mongoUsers = client.db(process.env.MONGODB_DB || 'schacharena').collection('users');
    mongoMusic = client.db(process.env.MONGODB_DB || 'schacharena').collection('music');
    mongoGames = client.db(process.env.MONGODB_DB || 'schacharena').collection('games');
    mongoChats = client.db(process.env.MONGODB_DB || 'schacharena').collection('chats');
    mongoMatches = client.db(process.env.MONGODB_DB || 'schacharena').collection('matches');
    mongoGroups = client.db(process.env.MONGODB_DB || 'schacharena').collection('groups');
    await mongoGroups.createIndex({ id: 1 }, { unique: true });
    db.groups = {};
    for (const doc of await mongoGroups.find({}).toArray()) { const { _id, ...gr } = doc; db.groups[gr.id] = gr; }
    await mongoMatches.createIndex({ id: 1 }, { unique: true });
    await mongoMatches.createIndex({ at: -1 });
    await mongoMatches.createIndex({ uids: 1 });
    await mongoChats.createIndex({ id: 1 }, { unique: true });
    await mongoGames.createIndex({ id: 1 }, { unique: true });
    await mongoGames.createIndex({ uids: 1 });
    await mongoMusic.createIndex({ id: 1 }, { unique: true });
    await mongoUsers.createIndex({ id: 1 }, { unique: true });
    for (const doc of await mongoUsers.find({}).toArray()) {
      const { _id, ...u } = doc;
      db.users[u.id] = u;
      lastSaved.set(u.id, JSON.stringify(u));
    }
    console.log(`✅ MongoDB verbunden – ${Object.keys(db.users).length} Spieler geladen`);
  } else {
    try { db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); } catch { /* neue DB */ }
    db.users ||= {};
    db.music ||= {};
    db.chats ||= {};
    db.matches ||= [];
    db.groups ||= {};
    console.log(`⚠️  Keine MONGODB_URI gesetzt – speichere in ${DB_FILE} (geht bei Render-Free bei Updates verloren)`);
  }
}

let saveTimer = null, saving = false, saveAgain = false;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(flush, 400);
}
async function flush() {
  clearTimeout(saveTimer);
  if (!mongoUsers) {
    fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });
    const tmp = DB_FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(db));
    fs.renameSync(tmp, DB_FILE);
    return;
  }
  if (saving) { saveAgain = true; return; }
  saving = true;
  try {
    const ops = [], pending = [];
    for (const u of Object.values(db.users)) {
      const json = JSON.stringify(u);
      if (lastSaved.get(u.id) === json) continue;
      ops.push({ replaceOne: { filter: { id: u.id }, replacement: JSON.parse(json), upsert: true } });
      pending.push([u.id, json]);
    }
    if (ops.length) {
      await mongoUsers.bulkWrite(ops, { ordered: false });
      for (const [id, json] of pending) lastSaved.set(id, json);
    }
  } catch (e) {
    console.error('Speichern in MongoDB fehlgeschlagen, neuer Versuch gleich:', e.message);
    setTimeout(save, 3000);
  } finally {
    saving = false;
    if (saveAgain) { saveAgain = false; save(); }
  }
}
// Render beendet den alten Server bei jedem Update mit SIGTERM: vorher alles speichern
for (const sig of ['SIGTERM', 'SIGINT']) {
  process.on(sig, async () => {
    try { io.emit('server:restarting'); } catch { /* egal */ }
    try { await persistAllGames(); } catch (e) { console.error('Partien konnten nicht gespeichert werden:', e.message); }
    try { await flush(); } catch { /* egal */ }
    process.exit(0);
  });
}

const byToken = new Map();
const byCode = new Map();

const byName = new Map(); // benutzername (klein) -> user
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const digits = (n) => Array.from({ length: n }, (_, i) => (i === 0 ? 1 + crypto.randomInt(9) : crypto.randomInt(10))).join('');
const nameKey = (n) => String(n || '').trim().toLowerCase();
function freeGuestName() {
  let n; do n = 'Spieler' + (1000 + crypto.randomInt(90000)); while (byName.has(nameKey(n)));
  return n;
}
function setName(u, n) {
  if (byName.get(nameKey(u.name)) === u) byName.delete(nameKey(u.name));
  u.name = n; byName.set(nameKey(n), u);
}

// Passwörter: scrypt mit Salt, nie im Klartext gespeichert
function hashPw(pw) {
  const salt = crypto.randomBytes(16).toString('hex');
  return `${salt}:${crypto.scryptSync(pw, salt, 64).toString('hex')}`;
}
function checkPw(pw, stored) {
  if (!stored) return false;
  const [salt, h] = stored.split(':');
  const a = Buffer.from(h, 'hex'), b = crypto.scryptSync(String(pw), salt, 64);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function createUser() {
  let code; do code = digits(8); while (byCode.has(code));
  const u = {
    id: crypto.randomUUID(),
    token: crypto.randomBytes(24).toString('hex'),
    code,
    name: freeGuestName(),
    avatar: { type: 'emoji', value: pick(AVATAR_EMOJIS), color: pick(AVATAR_COLORS) },
    coins: adminApi.startCoins(REWARDS.start),
    rating: 0,
    eloV2: true,
    stats: { games: 0, wins: 0, losses: 0, draws: 0, botWins: 0, botGames: 0, mates: 0 },
    owned: { board: ['klassisch'], pieces: ['klassisch'], finisher: ['klassisch'], shape: ['klassisch'] },
    equipped: { board: 'klassisch', pieces: 'klassisch', finisher: 'klassisch', shape: 'klassisch' },
    history: [],
    createdAt: Date.now(),
  };
  db.users[u.id] = u; byToken.set(u.token, u); byCode.set(u.code, u); byName.set(nameKey(u.name), u);
  save();
  return u;
}

// Einmalige Umstellung bestehender Profile: Elo startet bei 0, Namen eindeutig & sauber
function migrateUsers() {
  for (const u of Object.values(db.users)) {
    if (!u.eloV2) { u.rating = 0; u.eloV2 = true; }
    ensureShape(u);
    let n = String(u.name || '').trim().replace(/\s+/g, '_');
    if (checkUsername(n) || byName.has(nameKey(n))) n = freeGuestName();
    u.name = n; byName.set(nameKey(n), u);
  }
  save();
}

// Figuren-Formen (seit 1.15): ältere Profile bekommen die klassische Form
function ensureShape(u) {
  if (!u?.owned) return u;
  if (!Array.isArray(u.owned.shape)) u.owned.shape = ['klassisch'];
  if (!u.equipped.shape || !u.owned.shape.includes(u.equipped.shape)) u.equipped.shape = 'klassisch';
  return u;
}
const pub = (u) => ({ id: u.id, name: u.name, avatar: u.avatar, rating: u.rating, equipped: u.equipped, registered: !!u.pass, stats: { games: u.stats.games, wins: u.stats.wins }, style: styleOf(u) });
const styleOf = (u) => { const c = customOf(u); return { frame: c.frame, nameFx: c.nameFx, banner: c.banner === 'bild' ? 'standard' : c.banner, accent: c.accent, admin: isAdmin(u) }; };
// Admins: per Spielercode (fest, nicht änderbar). Weitere über ADMIN_CODES="code1,code2" bei Render.
const ADMIN_CODES = new Set(String(process.env.ADMIN_CODES || '58525408').split(',').map((s) => s.trim()).filter(Boolean));
const isAdmin = (u) => !!u && ADMIN_CODES.has(u.code);
// Profil-Studio: gespeicherte Einstellungen säubern (nur erlaubte Werte)
const allowed = (k) => PROFILE_OPTIONS[k].map((o) => (Array.isArray(o) ? o[0] : o));
function customOf(u) {
  const c = { ...DEFAULT_CUSTOM, ...(u.custom || {}) };
  for (const k of ['banner', 'frame', 'nameFx', 'particles', 'accent']) if (!allowed(k).includes(c[k])) c[k] = DEFAULT_CUSTOM[k];
  if (c.showcase && !u.owned.finisher.includes(c.showcase)) c.showcase = null;
  if (c.nameFx === 'admin' && !isAdmin(u)) c.nameFx = 'keiner';
  return c;
}
const musicMeta = (u) => (u.music ? { title: u.music.title, volume: u.music.volume, at: u.music.at } : null);
const priv = (u) => ({ ...pub(u), code: u.code, coins: u.coins, owned: u.owned, stats: u.stats, history: u.history.slice(0, 30), admin: isAdmin(u), custom: customOf(u), playMs: u.playMs || 0, music: musicMeta(u) });
// Öffentliches Profil (zum Anklicken in Rangliste / Match)
const publicProfile = (u) => ({
  custom: customOf(u), playMs: u.playMs || 0, music: musicMeta(u), inventory: customOf(u).showInventory ? u.owned : null,
  ...pub(u), stats: { ...u.stats }, createdAt: u.createdAt, online: online.has(u.id),
  history: u.history.slice(0, 8).map((h) => ({ type: h.type, opponent: h.opponent, oppAvatar: h.oppAvatar, outcome: h.outcome, reason: h.reason, rating: h.rating, at: h.at })),
});

// ---------------------------------------------------------------- Profilsongs (eigene Sammlung, damit Profile klein bleiben)
async function musicGet(id) {
  if (mongoUsers) { const d = await mongoMusic.findOne({ id }); return d ? d.data : null; }
  return db.music?.[id] || null;
}
async function musicSet(id, data) {
  if (mongoUsers) await mongoMusic.replaceOne({ id }, { id, data }, { upsert: true });
  else { db.music[id] = data; save(); }
}
async function musicDel(id) {
  if (mongoUsers) await mongoMusic.deleteOne({ id });
  else { delete db.music[id]; save(); }
}

// Spielzeit: jede Minute bekommt jeder, der online ist, eine Minute gutgeschrieben
setInterval(() => {
  let changed = false;
  for (const uid of online.keys()) { const u = db.users[uid]; if (u) { u.playMs = (u.playMs || 0) + 60_000; changed = true; } }
  if (changed) save();
}, 60_000);

// ---------------------------------------------------------------- Server
const app = express();
// gzip für JS/CSS (Three.js wird dadurch ~4× kleiner) – Musik ist schon komprimiert
app.use(compression({ filter: (req, res) => !req.path.startsWith('/music/') && compression.filter(req, res) }));
// Bibliotheken ändern sich nur mit neuen Paketversionen: lange im Browser zwischenspeichern
const LONG = { maxAge: '7d' };
app.use('/vendor/chess.js', (req, res) => res.sendFile(path.join(__dirname, 'node_modules/chess.js/dist/esm/chess.js'), LONG));
app.use('/vendor/three', express.static(path.join(__dirname, 'node_modules/three/build'), LONG));
app.use('/vendor/three-jsm', express.static(path.join(__dirname, 'node_modules/three/examples/jsm'), LONG));

// Profilsongs als normale Audiodatei (mit Range-Unterstützung, wichtig für iPad/Safari).
// Läuft getrennt vom Socket – so blockiert ein großer Song nie das Laden von Profilen.
const musicCache = new Map(); // `${id}:${at}` -> { buf, mime }
app.get('/music/:id', async (req, res) => {
  const u = db.users[req.params.id];
  if (!u?.music) return res.sendStatus(404);
  const key = `${u.id}:${u.music.at}`;
  let m = musicCache.get(key);
  if (!m) {
    const data = await musicGet(u.id).catch(() => null);
    if (!data) return res.sendStatus(404);
    const mime = data.slice(5, data.indexOf(';'));
    m = { buf: Buffer.from(data.slice(data.indexOf(',') + 1), 'base64'), mime: mime === 'audio/mp3' ? 'audio/mpeg' : mime };
    for (const k of musicCache.keys()) if (k.startsWith(u.id + ':')) musicCache.delete(k);
    musicCache.set(key, m);
    while (musicCache.size > 8) musicCache.delete(musicCache.keys().next().value);
  }
  const total = m.buf.length;
  res.set({ 'Content-Type': m.mime, 'Accept-Ranges': 'bytes', 'Cache-Control': 'public, max-age=604800, immutable' });
  const r = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '');
  if (r && (r[1] || r[2])) {
    let start, end;
    if (r[1]) { start = +r[1]; end = r[2] ? Math.min(+r[2], total - 1) : total - 1; }
    else { start = Math.max(0, total - +r[2]); end = total - 1; }
    if (start >= total || start > end) { res.set('Content-Range', `bytes */${total}`); return res.sendStatus(416); }
    res.status(206).set({ 'Content-Range': `bytes ${start}-${end}/${total}`, 'Content-Length': end - start + 1 });
    return res.end(m.buf.subarray(start, end + 1));
  }
  res.set('Content-Length', total);
  res.end(m.buf);
});
app.use(express.static(path.join(__dirname, 'public')));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

const server = http.createServer(app);
// schnellere Erkennung von Verbindungsabbrüchen (z. B. iPad-Tab im Hintergrund)
const io = new Server(server, { maxHttpBufferSize: 5_000_000, pingInterval: 10_000, pingTimeout: 9_000 });

const online = new Map();      // userId -> socket
const games = new Map();       // gameId -> game
const userGame = new Map();    // userId -> gameId
const rooms = new Map();       // 6-stelliger Code -> { code, hostId, timeMs }
const challenges = new Map();  // id -> { fromId, toId, timeMs }
let queue = [];                // [{ userId, since }]

const sockOf = (uid) => online.get(uid);
const emitTo = (uid, ev, data) => sockOf(uid)?.emit(ev, data);

// Live zuschauen: nur Zufallsmatches (private Lobbys bleiben privat)
const liveGames = () => [...games.values()].filter((g) => g.status === 'playing' && g.source === 'random');
const watchRoom = (g) => `watch:${g.id}`;
const watcherCount = (g) => io.sockets.adapter.rooms.get(watchRoom(g))?.size || 0;
function emitWatchers(g) {
  const n = watcherCount(g);
  for (const c of ['w', 'b']) emitTo(g.players[c], 'game:watchers', { id: g.id, n });
  io.to(watchRoom(g)).emit('game:watchers', { id: g.id, n });
}

// Bilanz gegen einzelne Gegner (für Admins sichtbar)
function addVs(u, h) {
  const box = h.type === 'bot' ? (u.vsBot ||= {}) : h.type === 'online' ? (u.vs ||= {}) : null;
  if (!box) return;
  const key = h.type === 'bot' ? h.opponent : (h.oppId || `name:${h.opponent}`);
  const e = (box[key] ||= { name: h.opponent, w: 0, l: 0, d: 0, elo: 0, unrated: 0, last: 0 });
  e.name = h.opponent;
  e[h.outcome === 'win' ? 'w' : h.outcome === 'loss' ? 'l' : 'd']++;
  e.elo += h.rating || 0;
  if (h.unrated) e.unrated++;
  e.last = Math.max(e.last, h.at || 0);
}
// Ältere Spieler: Bilanz einmalig aus dem Verlauf (letzte 50 Partien) nachbauen
function ensureVs(u) {
  if (u.vs) return;
  u.vs = {}; u.vsBot = {};
  for (const h of [...u.history].reverse()) addVs(u, h);
}

function broadcastStats() {
  io.emit('stats', { live: liveGames().length, online: online.size, playing: [...games.values()].filter((g) => g.status !== 'over').length * 2 + [...games4.values()].filter((g) => g.status === 'playing').reduce((s, g) => s + g.humans, 0), queue: queue.length, queueBy: Object.fromEntries(RANDOM_TIMES.map((t) => [t, queue.filter((q) => (q.timeMs || 600_000) === t).length])) });
}
setInterval(broadcastStats, 5000);

// ---------------------------------------------------------------- Spiele
function clockState(g) {
  const c = { w: g.clock.w, b: g.clock.b };
  if (g.status === 'playing' && g.timeMs && g.started && !g.paused) c[g.chess.turn()] -= Date.now() - g.lastTick;
  return { w: Math.max(0, c.w), b: Math.max(0, c.b), running: g.status === 'playing' && g.started && !g.paused ? g.chess.turn() : null, unlimited: !g.timeMs, paused: !!g.paused };
}

function gamePayload(g, uid) {
  const hist = g.chess.history({ verbose: true }).map((m) => ({ san: m.san, from: m.from, to: m.to }));
  return {
    id: g.id, fen: g.chess.fen(), moves: hist, status: g.status, board: g.board,
    you: g.players.w === uid ? 'w' : 'b',
    players: { w: pub(db.users[g.players.w]), b: pub(db.users[g.players.b]) },
    skins: { w: pieceLook(db.users[g.players.w].equipped), b: pieceLook(db.users[g.players.b].equipped) },
    clock: clockState(g), timeMs: g.timeMs, drawOffer: g.drawOffer, boardDecision: g.boardDecision,
    variant: g.variant || null, startFen: g.startFen || null,
  };
}

function startMatch(aId, bId, timeMs, source, variant = null) {
  if (aId === bId || userGame.has(aId) || userGame.has(bId) || fourBusy(aId) || fourBusy(bId)) return false;
  queue = queue.filter((q) => q.userId !== aId && q.userId !== bId);
  for (const [code, r] of rooms) if (r.hostId === aId || r.hostId === bId) rooms.delete(code);
  const flip = Math.random() < 0.5;
  const g = {
    id: crypto.randomUUID(), source, createdAt: Date.now(),
    players: { w: flip ? aId : bId, b: flip ? bId : aId },
    chess: new Chess(VARIANTS[variant] || START_FEN), variant: VARIANTS[variant] ? variant : null, startFen: VARIANTS[variant] || null,
    timeMs, clock: { w: timeMs, b: timeMs }, lastTick: Date.now(), started: false,
    status: 'vote', votes: {}, board: null, drawOffer: null, disconnect: {}, moveTimes: { w: [], b: [] },
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
  g.board = board; g.boardDecision = decision; g.status = 'playing'; g.lastTick = g.lastMoveAt = Date.now();
  for (const c of ['w', 'b']) emitTo(g.players[c], 'game:start', gamePayload(g, g.players[c]));
  persistGame(g);
}

function opponentOf(g, uid) { return g.players.w === uid ? g.players.b : g.players.w; }

function sendState(g, extra = {}) {
  const last = g.chess.history({ verbose: true }).at(-1);
  const payload = { id: g.id, fen: g.chess.fen(), lastMove: last ? { from: last.from, to: last.to, san: last.san } : null, clock: clockState(g), drawOffer: g.drawOffer, ...extra };
  for (const c of ['w', 'b']) emitTo(g.players[c], 'game:state', payload);
  io.to(watchRoom(g)).emit('game:state', payload);
  persistGame(g);
}

function elo(ra, rb, score) {
  const ea = 1 / (1 + 10 ** ((rb - ra) / 400));
  return Math.round(32 * (score - ea));
}

// ---------------------------------------------------------------- Fair-Play-Check (gegen Elo-/Münz-Farming)
// Liefert einen Grund, wenn die Partie nicht gewertet werden darf – sonst null.
const MAT = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
function material(fen) {
  const m = { w: 0, b: 0 };
  for (const ch of fen.split(' ')[0]) { const l = ch.toLowerCase(); if (MAT[l] != null) m[ch === l ? 'b' : 'w'] += MAT[l]; }
  return m;
}
function fairPlay(g, result, reason) {
  if (reason === 'abandon') return null; // Verlassen hat eigene Regel (nur der Verlasser verliert)
  const plies = g.chess.history().length;
  if (Math.min(Math.ceil(plies / 2), Math.floor(plies / 2)) < 3) return 'Zu kurz – jeder muss mindestens 3 Züge machen.';
  if (reason === 'agreement' && plies < 20) return 'Remis zu früh vereinbart.';
  if (reason === 'repetition' && plies < 16) return 'Absichtliche Zugwiederholung.';
  const start = material(g.startFen || START_FEN), end = material(g.chess.fen());
  const lost = { w: start.w - end.w, b: start.b - end.b };
  if (result === 'w' || result === 'b') {
    const loser = result === 'w' ? 'b' : 'w';
    if (reason === 'timeout' && plies < 20) return 'Zu früh auf Zeit verloren.';
    // Früh aufgegeben, obwohl man gar nicht schlechter stand
    if (reason === 'resign' && plies < 24 && end[loser] >= end[result] - 1) return 'Aufgegeben, obwohl die Stellung noch offen war.';
    // Figuren verschenkt: Verlierer gibt im Eiltempo massig Material her, der Gewinner fast nichts
    const times = g.moveTimes?.[loser] || [];
    const avg = times.length ? times.reduce((a, b) => a + b, 0) / times.length : Infinity;
    if (lost[loser] >= 15 && lost[result] <= 2 && plies < 40 && avg < 2500) return 'Figuren wurden absichtlich verschenkt.';
  }
  // Immer wieder dieselben zwei mit schnellen/aufgegebenen Partien
  const W = db.users[g.players.w], B = db.users[g.players.b];
  const recent = W.history.filter((h) => h.type === 'online' && h.oppId === B.id && Date.now() - h.at < 2 * 3600_000);
  const fishy = recent.filter((h) => h.unrated || h.reason === 'resign' || h.reason === 'agreement' || h.moves < 16).length;
  if ((reason === 'resign' || reason === 'agreement' || plies < 16) && fishy >= 2) return 'Zu viele schnelle Partien gegeneinander – bitte richtig spielen.';
  return null;
}

function endGame(g, result, reason) {
  if (g.status === 'over') return;
  if (g.status === 'playing' && g.timeMs && g.started && !g.paused) { g.clock[g.chess.turn()] -= Date.now() - g.lastTick; }
  g.status = 'over';
  clearTimeout(g.voteTimer);
  for (const t of Object.values(g.disconnect)) clearTimeout(t);
  const W = db.users[g.players.w], B = db.users[g.players.b];
  const sW = result === 'w' ? 1 : result === 'b' ? 0 : 0.5;
  const dW = elo(W.rating, B.rating, sW), dB = elo(B.rating, W.rating, 1 - sW);
  const winner = result === 'w' ? W : result === 'b' ? B : null;
  const finisher = reason === 'checkmate' && winner ? winner.equipped.finisher : null;
  const plies = g.chess.history().length;
  const unrated = fairPlay(g, result, reason) || (reason === 'abandon' ? null : adminApi.precheck(W, B, result));
  const rBefore = { w: W.rating, b: B.rating };
  if (unrated) console.log(`⚖️ nicht gewertet (${W.name} – ${B.name}): ${unrated}`);
  for (const [u, color, d0, opp] of [[W, 'w', dW, B], [B, 'b', dB, W]]) {
    const outcome = result === 'draw' ? 'draw' : result === color ? 'win' : 'loss';
    let d = g.variant ? 0 : d0; // Spaß-Varianten (Queen-Modus) zählen nicht für Elo
    let coins = adminApi.coins(outcome === 'win' ? REWARDS.win : outcome === 'draw' ? REWARDS.draw : REWARDS.loss);
    if (unrated) { d = 0; coins = 0; }
    if (reason === 'abandon') {
      // Verlassen: wer geht, verliert Elo (keine Münzen) – wer bleibt, bekommt nichts (keine Änderung)
      coins = 0;
      if (outcome === 'win') d = 0;
    }
    const before = u.rating;
    u.coins += coins; u.rating = Math.max(0, u.rating + d);
    d = u.rating - before; // bei 0 Elo kann man nicht weiter fallen
    (g.arch ||= {})[color] = { id: u.id, name: u.name, ratingBefore: before, d, coins, outcome, counted: !(reason === 'abandon' && outcome === 'win') && !unrated, mate: outcome === 'win' && reason === 'checkmate' && !unrated };
    if (!(reason === 'abandon' && outcome === 'win') && !unrated) {
      u.stats.games++; u.stats[outcome === 'win' ? 'wins' : outcome === 'loss' ? 'losses' : 'draws']++;
    }
    if (outcome === 'win' && reason === 'checkmate' && !unrated) u.stats.mates++;
    ensureVs(u);
    const hEntry = { type: 'online', matchId: g.id, myRating: rBefore[color], oppRating: rBefore[color === 'w' ? 'b' : 'w'], opponent: opp.name, oppId: opp.id, oppAvatar: opp.avatar, outcome, reason, coins, rating: d, moves: plies, at: Date.now(), ...(unrated ? { unrated } : {}), ...(g.variant ? { variant: g.variant } : {}) };
    addVs(u, hEntry);
    u.history.unshift(hEntry);
    u.history = u.history.slice(0, 50);
    emitTo(u.id, 'game:over', {
      id: g.id, result, reason, outcome, coins, ratingChange: d, finisher, unrated, variant: g.variant || null,
      winnerName: winner?.name || null, fen: g.chess.fen(), board: g.board,
      skins: { w: pieceLook(W.equipped), b: pieceLook(B.equipped) }, profile: priv(u),
    });
  }
  try { adminApi.afterOnline(g, result, W, B); } catch (e) { console.error('Anti-Cheat:', e.message); }
  archiveMatch({
    id: g.id, type: 'online', source: g.source, variant: g.variant || null, startFen: g.startFen || null, at: Date.now(), startedAt: g.createdAt || null,
    timeMs: g.timeMs, board: g.board, result, reason, unrated: unrated || null, plies, moves: g.chess.history(),
    uids: [W.id, B.id], players: g.arch, winnerName: winner?.name || null,
  });
  {
    io.to(watchRoom(g)).emit('game:over', {
      id: g.id, result, reason, spectator: true, finisher, winnerName: winner?.name || null, fen: g.chess.fen(), board: g.board,
      skins: { w: pieceLook(W.equipped), b: pieceLook(B.equipped) }, players: { w: pub(W), b: pub(B) },
    });
    io.in(watchRoom(g)).socketsLeave(watchRoom(g));
  }
  save();
  unpersistGame(g);
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

// ---------------------------------------------------------------- 4er-Schach (Jeder gegen jeden)
const FOUR_REWARDS = [300, 120, 60, 25];            // Münzen für Platz 1–4
const TEAM_REWARDS = [220, 30];                     // 2 vs 2: Siegerteam / Verliererteam (je Spieler)
const FOUR_BOT_FACTOR = [0, 1 / 3, 0.5, 0.75, 1];   // weniger Münzen, je mehr Bots mitspielen
const FOUR_BOTS = [['Robo-Rudi', '🤖'], ['Kalle Kalkül', '🧮'], ['Turbo-Tina', '⚡'], ['Pixel-Paul', '👾'], ['Byte-Berta', '💾'], ['Captain Chip', '🦾']];
const FOUR_ABANDON_MS = 60_000;
const lobbies4 = new Map();  // Code -> { code, hostId, seats: [userId], timeMs }
const games4 = new Map();    // id -> Spiel
const userFour = new Map();  // userId -> id
const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = crypto.randomInt(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const fourGameOf = (uid) => games4.get(userFour.get(uid));
const fourColorOf = (g, uid) => g.players.findIndex((p) => p.uid === uid);
// Spielt der Spieler gerade noch aktiv 4er-Schach (oder sitzt in einer Lobby)?
function fourBusy(uid) {
  const g = fourGameOf(uid);
  if (g && g.status === 'playing' && g.state.alive[fourColorOf(g, uid)]) return true;
  for (const l of lobbies4.values()) if (l.seats.includes(uid)) return true;
  return false;
}
const lobbyPayload = (l) => ({ code: l.code, host: l.hostId, timeMs: l.timeMs, teams: !!l.teams, side: l.side || {}, players: l.seats.map((id) => pub(db.users[id])) });
const FOUR_TIMES = [60_000, 180_000, 300_000, 600_000, 900_000];
const fourTime = (t) => (FOUR_TIMES.includes(t) ? t : 300_000);
// 2 vs 2: freien Platz im kleineren Team suchen (je Team höchstens 2)
function lobbySide(l) {
  const n = [0, 1].map((t) => l.seats.filter((id) => l.side[id] === t).length);
  return n[0] <= n[1] ? (n[0] < 2 ? 0 : 1) : (n[1] < 2 ? 1 : 0);
}
function createFourLobby(user, timeMs, teams) {
  if (banErr(user)) return { error: banErr(user) };
  if (userGame.has(user.id) || fourBusy(user.id)) return { error: 'Du bist bereits in einem Spiel oder einer Lobby.' };
  let code; do code = digits(6); while (rooms.has(code) || lobbies4.has(code));
  const l = { code, hostId: user.id, seats: [user.id], timeMs: fourTime(timeMs), teams: !!teams, side: { [user.id]: 0 } };
  lobbies4.set(code, l);
  return { lobby: lobbyPayload(l) };
}
function emitLobby(l, extra = {}) { for (const id of l.seats) emitTo(id, 'four:lobby', { ...lobbyPayload(l), ...extra }); }
function leaveLobby(uid) {
  for (const [code, l] of lobbies4) {
    if (!l.seats.includes(uid)) continue;
    if (l.hostId === uid) { lobbies4.delete(code); for (const id of l.seats) if (id !== uid) emitTo(id, 'four:lobby', { closed: true }); }
    else { l.seats = l.seats.filter((x) => x !== uid); delete l.side?.[uid]; emitLobby(l); }
  }
}

function fourPlayers(g) {
  return g.players.map((p) => (p.uid
    ? { ...pub(db.users[p.uid]), online: online.has(p.uid) }
    : { name: p.bot.name, avatar: { type: 'emoji', value: p.bot.avatar, color: 'rgba(255,255,255,.08)' }, bot: true, rating: '' }));
}
function fourClock(g) {
  const c = [...g.clock];
  if (g.status === 'playing') c[g.state.turn] -= Date.now() - g.lastTick;
  return c.map((x) => Math.max(0, x));
}
const fourPayload = (g, uid, extra = {}) => ({
  id: g.id, board: g.state.board, turn: g.state.turn, alive: g.state.alive, out: g.state.out, last: g.state.last, ply: g.state.ply,
  players: fourPlayers(g), clock: fourClock(g), timeMs: g.timeMs, you: uid ? fourColorOf(g, uid) : -1, status: g.status,
  teams: !!g.state.teams, winTeam: g.state.winTeam ?? -1, ...extra,
});
function fourBroadcast(g, ev, extra = {}) { for (const p of g.players) if (p.uid && userFour.get(p.uid) === g.id) emitTo(p.uid, ev, fourPayload(g, p.uid, extra)); }

function startFour(humanIds, timeMs, { teams = false, side = {} } = {}) {
  let seats;
  if (teams) {
    // Team 0 (Rot & Gelb) sitzt auf 0 und 2, Team 1 (Blau & Grün) auf 1 und 3
    seats = [null, null, null, null];
    for (const t of [0, 1]) {
      const ids = shuffle(humanIds.filter((id) => (side[id] ?? 0) === t)).slice(0, 2);
      shuffle([t, t + 2]).forEach((c, i) => { seats[c] = ids[i] || null; });
    }
  } else seats = shuffle([...humanIds, ...Array(4 - humanIds.length).fill(null)]);
  humanIds = seats.filter(Boolean);
  const botNames = shuffle([...FOUR_BOTS]);
  const g = {
    id: crypto.randomUUID(), state: Four.newState({ teams }), timeMs, clock: [timeMs, timeMs, timeMs, timeMs], lastTick: Date.now(),
    status: 'playing', disconnect: {}, moves: [0, 0, 0, 0], humans: humanIds.length,
    players: seats.map((uid) => (uid ? { uid } : { bot: { name: botNames.pop()[0], avatar: null } })),
  };
  // Bot-Avatare passend zum Namen
  for (const pl of g.players) if (pl.bot) pl.bot.avatar = FOUR_BOTS.find(([n]) => n === pl.bot.name)[1];
  games4.set(g.id, g);
  for (const uid of humanIds) {
    userFour.set(uid, g.id);
    queue = queue.filter((q) => q.userId !== uid);
    for (const [code, r] of rooms) if (r.hostId === uid) rooms.delete(code);
  }
  fourBroadcast(g, 'four:start');
  scheduleFourBot(g);
  broadcastStats();
  return g;
}

function scheduleFourBot(g) {
  clearTimeout(g.botTimer);
  if (g.status !== 'playing') return;
  const c = g.state.turn;
  if (!g.players[c].bot) return;
  g.botTimer = setTimeout(() => {
    if (g.status !== 'playing' || g.state.turn !== c) return;
    const m = Four.botMove(g.state, c);
    if (!m) return;
    const res = Four.play(g.state, c, m.from, m.to);
    if (res) fourAfterMove(g, c, res);
  }, 650 + crypto.randomInt(700));
}

const FOUR_QUIET = 160; // so viele Halbzüge ohne Schlagen -> Ende, Material entscheidet
const fourHumansAlive = (g) => g.players.some((p, c) => p.uid && g.state.alive[c]);
function fourMaterial(g, c) { let m = 0; for (const p of g.state.board) if (p && p.c === c && !p.dead) m += Four.VALUE[p.t]; return m; }
// Ende nach Punkten: wer am wenigsten Material hat, scheidet zuerst aus
function fourByMaterial(g) {
  if (g.state.teams) {
    // 2 vs 2: das Team mit weniger Material verliert
    const tm = [0, 1].map((t) => fourMaterial(g, t) + fourMaterial(g, t + 2));
    const lose = tm[0] < tm[1] ? 0 : tm[1] < tm[0] ? 1 : crypto.randomInt(2);
    const c = fourMaterial(g, lose) <= fourMaterial(g, lose + 2) ? lose : lose + 2;
    (g.log ||= []).push({ t: 'x', c, reason: 'points' });
    Four.eliminate(g.state, c, 'points');
    g.state.over = true; g.state.winTeam = 1 - lose;
    return;
  }
  const alive = [0, 1, 2, 3].filter((c) => g.state.alive[c]).sort((a, b) => fourMaterial(g, a) - fourMaterial(g, b));
  for (const c of alive.slice(0, -1)) { (g.log ||= []).push({ t: 'x', c, reason: 'points' }); Four.eliminate(g.state, c, 'points'); }
  g.state.over = true;
}
// Kein Mensch mehr dabei: Rest sofort ausspielen statt minutenlang Bots zuzuschauen
function fourFastForward(g) {
  let n = 0;
  while (!g.state.over && n++ < 800 && (g.quiet || 0) < FOUR_QUIET) {
    const c = g.state.turn, m = Four.botMove(g.state, c);
    if (!m) break;
    const res = Four.play(g.state, c, m.from, m.to);
    if (!res) break;
    (g.log ||= []).push({ t: 'm', c, from: m.from, to: m.to });
    g.quiet = res.events.some((e) => e.type === 'capture') ? 0 : (g.quiet || 0) + 1;
  }
  if (!g.state.over) fourByMaterial(g);
  endFour(g);
}
function fourAfterMove(g, color, res) {
  (g.log ||= []).push({ t: 'm', c: color, from: res.move.from, to: res.move.to });
  const now = Date.now();
  g.clock[color] -= now - g.lastTick; g.lastTick = now; g.moves[color]++;
  g.quiet = res.events.some((e) => e.type === 'capture') ? 0 : (g.quiet || 0) + 1;
  if (g.quiet >= FOUR_QUIET && !g.state.over) { fourByMaterial(g); res.events.push({ type: 'points' }); }
  fourBroadcast(g, 'four:state', { events: res.events, move: { from: res.move.from, to: res.move.to, color } });
  if (g.state.over) return endFour(g);
  if (!fourHumansAlive(g)) return fourFastForward(g);
  scheduleFourBot(g);
}

function fourEliminate(g, color, reason) {
  if (g.status !== 'playing' || !g.state.alive[color]) return;
  const now = Date.now();
  g.clock[g.state.turn] -= now - g.lastTick; g.lastTick = now;
  const wasTurn = g.state.turn === color;
  (g.log ||= []).push({ t: 'x', c: color, reason });
  Four.eliminate(g.state, color, reason);
  const events = [{ type: 'out', color, reason }];
  if (wasTurn) g.state.turn = Four.nextColor(g.state, color);
  Four.settle(g.state, events);
  clearTimeout(g.disconnect[g.players[color].uid]);
  fourBroadcast(g, 'four:state', { events });
  if (g.state.over) return endFour(g);
  if (!fourHumansAlive(g)) return fourFastForward(g);
  scheduleFourBot(g);
}

function endFour(g) {
  if (g.status === 'over') return;
  g.status = 'over';
  clearTimeout(g.botTimer);
  for (const t of Object.values(g.disconnect)) clearTimeout(t);
  const teams = !!g.state.teams;
  const winTeam = teams ? (g.state.winTeam ?? Four.winningTeam(g.state)) : -1;
  const winner = teams ? -1 : g.state.alive.findIndex(Boolean);
  const ranking = teams
    ? [winTeam, winTeam + 2, 1 - winTeam, 3 - winTeam].filter((c) => c >= 0 && c < 4)
    : [winner, ...g.state.out.map((o) => o.color).reverse()].filter((c) => c >= 0);
  const placeOf = (c, i) => (teams ? (c % 2 === winTeam ? 1 : 2) : i + 1);
  const reasons = Object.fromEntries(g.state.out.map((o) => [o.color, o.reason]));
  const players = fourPlayers(g);
  const table = ranking.map((c, i) => ({ color: c, place: placeOf(c, i), name: players[c].name, bot: !!players[c].bot, reason: reasons[c] || null }));
  const factor = FOUR_BOT_FACTOR[g.humans] || 0;
  for (const [place, c] of ranking.entries()) {
    const uid = g.players[c].uid;
    if (!uid) continue;
    const u = db.users[uid];
    // Fair-Play: mindestens 16 Halbzüge insgesamt und 3 eigene Züge
    const unrated = g.state.ply < 16 ? 'Zu kurz – die Partie hatte zu wenige Züge.' : g.moves[c] < 3 ? 'Du hast weniger als 3 Züge gemacht.' : null;
    const pl = placeOf(c, place), won = pl === 1;
    const base = teams ? TEAM_REWARDS[won ? 0 : 1] : FOUR_REWARDS[place];
    const coins = unrated ? 0 : adminApi.coins(Math.round((base * factor) / 5) * 5);
    u.coins += coins;
    const sk = teams ? 'teams' : 'four';
    if (!unrated) { u.stats[sk] ||= { games: 0, wins: 0 }; u.stats[sk].games++; if (won) u.stats[sk].wins++; }
    (g.arch ||= {})[c] = { coins, counted: !unrated, win: won };
    u.history.unshift({ type: 'four', teams, opponent: teams ? '2 vs 2' : '4er-Schach', oppAvatar: { type: 'emoji', value: teams ? '🤝' : '👥', color: '#334' }, outcome: won ? 'win' : 'loss', reason: teams ? (won ? 'team-win' : 'team-loss') : (won ? 'four-win' : 'four-place'), place: pl, coins, rating: 0, moves: g.state.ply, at: Date.now(), ...(unrated ? { unrated } : {}), matchId: g.id });
    u.history = u.history.slice(0, 50);
    emitTo(uid, 'four:over', { ...fourPayload(g, uid), ranking: table, place: pl, coins, unrated, profile: priv(u), bots: 4 - g.humans, matchId: g.id });
  }
  try { adminApi.afterFour(g); } catch (e) { console.error('Anti-Cheat:', e.message); }
  archiveMatch({
    id: g.id, type: 'four', teams, winTeam, at: Date.now(), timeMs: g.timeMs, humans: g.humans, plies: g.state.ply, log: g.log || [],
    uids: g.players.filter((p) => p.uid).map((p) => p.uid),
    players: g.players.map((p, c) => ({ color: c, uid: p.uid || null, name: players[c].name, bot: !!p.bot, place: placeOf(c, ranking.indexOf(c)), reason: reasons[c] || null, ...(g.arch?.[c] || {}) })),
  });
  save();
  for (const p of g.players) if (p.uid && userFour.get(p.uid) === g.id) userFour.delete(p.uid);
  setTimeout(() => games4.delete(g.id), 60_000);
  broadcastStats();
}

setInterval(() => {
  const now = Date.now();
  for (const g of games4.values()) {
    if (g.status !== 'playing') continue;
    const t = g.state.turn;
    if (g.clock[t] - (now - g.lastTick) <= 0) fourEliminate(g, t, 'timeout');
  }
}, 250);

setInterval(() => {
  const now = Date.now();
  for (const g of games.values()) {
    if (g.status !== 'playing' || !g.timeMs || !g.started || g.paused) continue;
    if (!online.has(g.players.w) && !online.has(g.players.b)) continue; // beide weg: Abbruch-Regel greift
    const t = g.chess.turn();
    if (g.clock[t] - (now - g.lastTick) <= 0) {
      g.clock[t] = 0; g.lastTick = now;
      endGame(g, t === 'w' ? 'b' : 'w', 'timeout');
    }
  }
}, 200);

// Hängende Verbindungen erkennen (Socket noch offen, aber keine Antwort mehr, z. B. iPad im Hintergrund)
setInterval(() => {
  const now = Date.now();
  for (const g of games.values()) {
    if (g.status !== 'playing') continue;
    g.lag ||= {};
    for (const c of ['w', 'b']) {
      const uid = g.players[c], sock = online.get(uid);
      const laggy = !!sock && now - (sock.data.lastSeen || now) > LAG_MS;
      if (laggy !== !!g.lag[uid]) {
        g.lag[uid] = laggy;
        emitTo(opponentOf(g, uid), 'game:lag', { id: g.id, laggy, name: db.users[uid]?.name });
      }
    }
  }
}, 3000);

// ---------------------------------------------------------------- Updates ohne Spielabbruch
// Jede laufende Partie wird nach jedem Zug in der Datenbank gespeichert (mit "owner" = Server-Instanz).
// Verbindet sich ein Spieler nach einem Update mit dem neuen Server, übernimmt dieser die Partie.
// Der alte Server merkt beim nächsten Speichern bzw. vor einer Abbruch-Wertung, dass sie ihm nicht mehr gehört.
function snapshot(g) {
  const clock = { ...g.clock };
  if (g.status === 'playing' && g.timeMs && g.started && !g.paused) clock[g.chess.turn()] -= Date.now() - g.lastTick;
  return {
    id: g.id, uids: [g.players.w, g.players.b], source: g.source, players: g.players, moves: g.chess.history(), startFen: g.startFen || null, variant: g.variant || null,
    timeMs: g.timeMs, clock, started: g.started, board: g.board, boardDecision: g.boardDecision, drawOffer: g.drawOffer,
    owner: INSTANCE, updatedAt: Date.now(),
  };
}
function persistGame(g) {
  if (g.status !== 'playing' || g.lost) return g.persist;
  const doc = snapshot(g);
  g.persist = (g.persist || Promise.resolve()).then(async () => {
    if (g.lost) return;
    if (!mongoGames) { db.games ||= {}; db.games[g.id] = doc; save(); return; }
    try { await mongoGames.replaceOne({ id: g.id, owner: INSTANCE }, doc, { upsert: true }); }
    catch (e) { if (e.code === 11000) lostGame(g); else console.error('Partie speichern:', e.message); }
  });
  return g.persist;
}
function unpersistGame(g) {
  g.persist = (g.persist || Promise.resolve()).then(async () => {
    if (g.lost) return;
    if (!mongoGames) { if (db.games?.[g.id]) { delete db.games[g.id]; save(); } return; }
    await mongoGames.deleteOne({ id: g.id, owner: INSTANCE }).catch(() => {});
  });
}
async function persistAllGames() {
  const list = [...games.values()].filter((g) => g.status === 'playing');
  await Promise.all(list.map((g) => persistGame(g)));
  if (list.length) console.log(`♻️ ${list.length} laufende Partie(n) gespeichert`);
}
// Gehört die Partie noch diesem Server? (Nach einem Update evtl. schon vom neuen übernommen)
async function stillMine(g) {
  if (!mongoGames) return true;
  try { const d = await mongoGames.findOne({ id: g.id }); return !d || d.owner === INSTANCE; } catch { return true; }
}
// Partie ist jetzt auf einem anderen Server: hier ohne Wertung vergessen, Spieler neu verbinden lassen
function lostGame(g) {
  if (g.lost) return;
  g.lost = true; g.status = 'over';
  clearTimeout(g.voteTimer);
  for (const t of Object.values(g.disconnect)) clearTimeout(t);
  for (const uid of [g.players.w, g.players.b]) { if (userGame.get(uid) === g.id) userGame.delete(uid); emitTo(uid, 'server:reconnect'); }
  games.delete(g.id);
  console.log('↪️ Partie wurde von einem neuen Server übernommen:', g.id);
}

// Nach einem Update: laufende Partie dieses Spielers aus der Datenbank übernehmen
async function adoptGameFor(uid) {
  if (userGame.has(uid)) return;
  let doc = mongoGames ? await mongoGames.findOne({ uids: uid }) : Object.values(db.games || {}).find((d) => d.uids?.includes(uid));
  if (!doc) return;
  const { _id, ...d } = doc;
  const drop = async () => { if (mongoGames) await mongoGames.deleteOne({ id: d.id, owner: d.owner }).catch(() => {}); else { delete db.games[d.id]; save(); } };
  if (Date.now() - d.updatedAt > 6 * 3600_000 || games.has(d.id) || d.owner === INSTANCE) return drop(); // alt oder schon beendet
  const { w, b } = d.players;
  if (!db.users[w] || !db.users[b] || userGame.has(w) || userGame.has(b)) return;
  const chess = new Chess(d.startFen || START_FEN);
  try { for (const m of d.moves) chess.move(m); } catch { return drop(); }
  if (mongoGames) {
    const r = await mongoGames.replaceOne({ id: d.id, owner: d.owner }, { ...d, owner: INSTANCE, updatedAt: Date.now() });
    if (!r?.matchedCount) return; // jemand anderes war schneller
  } else { db.games[d.id] = { ...d, owner: INSTANCE }; }
  if (userGame.has(w) || userGame.has(b)) return;
  const g = {
    id: d.id, source: d.source, players: d.players, chess, timeMs: d.timeMs,
    clock: { w: Math.max(1000, d.clock.w), b: Math.max(1000, d.clock.b) }, lastTick: Date.now(), started: d.started,
    status: 'playing', votes: {}, board: d.board, boardDecision: d.boardDecision, drawOffer: d.drawOffer,
    variant: d.variant || null, startFen: d.startFen || null, moveTimes: { w: [], b: [] }, lastMoveAt: Date.now(),
    disconnect: {}, paused: true, restored: true, waitUntil: Date.now() + RESTORE_MS,
  };
  g.deadline = { [w]: g.waitUntil, [b]: g.waitUntil };
  games.set(g.id, g); userGame.set(w, g.id); userGame.set(b, g.id);
  for (const p of [w, b]) if (p !== uid && !online.has(p)) g.disconnect[p] = setTimeout(() => onAbsent(g, p), RESTORE_MS);
  console.log('♻️ Partie nach Update übernommen:', g.id);
}

// Spieler ist (zu lange) weg: Abbruch-Regel – aber nur, wenn die Partie noch hier läuft
async function onAbsent(g, uid) {
  delete g.disconnect[uid];
  if (g.status === 'vote') resolveVote(g);
  if (g.status !== 'playing') return;
  if (!(await stillMine(g))) return lostGame(g);
  if (g.status !== 'playing' || online.has(uid)) return;
  const opp = opponentOf(g, uid);
  if (!online.has(opp)) {
    // beide weg: ohne Wertung beenden
    g.status = 'over';
    for (const t of Object.values(g.disconnect)) clearTimeout(t);
    userGame.delete(g.players.w); userGame.delete(g.players.b); games.delete(g.id);
    unpersistGame(g);
    return;
  }
  endGame(g, g.players.w === uid ? 'b' : 'w', 'abandon');
}

// Verbindung weg: Spiel pausieren, Uhr anhalten
function pauseGame(g, { uid = null, lostAt = 0 } = {}) {
  if (g.paused || g.status !== 'playing') return;
  const now = Date.now();
  // Abbruch wird erst nach einigen Sekunden bemerkt: lief die Uhr des Weggefallenen, zählt nur die Zeit bis zu seinem letzten Lebenszeichen
  let until = now;
  if (uid && lostAt && g.players[g.chess.turn()] === uid) until = Math.max(g.lastTick, Math.min(now, lostAt + 1000));
  if (g.started && g.timeMs) g.clock[g.chess.turn()] -= until - g.lastTick;
  g.paused = true; g.lastTick = now;
  sendState(g);
}
function resumeIfReady(g) {
  if (!g.paused || !online.has(g.players.w) || !online.has(g.players.b)) return;
  g.paused = false; g.lastTick = g.lastMoveAt = Date.now();
  sendState(g, { resumed: true });
}

// Ein Spieler, der gerade noch auf dem alten Server war, hat dort evtl. neuere Daten (Münzen, Elo …)
const refreshedUsers = new Set();
async function refreshFromDb(u) {
  if (!mongoUsers || !freshBoot() || refreshedUsers.has(u.id)) return;
  refreshedUsers.add(u.id);
  if (lastSaved.get(u.id) !== JSON.stringify(u)) return; // hier schon geändert – nicht überschreiben
  const doc = await mongoUsers.findOne({ id: u.id });
  if (!doc) return;
  const { _id, ...fresh } = doc;
  const json = JSON.stringify(fresh);
  if (json === lastSaved.get(u.id)) return;
  if (byName.get(nameKey(u.name)) === u) byName.delete(nameKey(u.name));
  for (const k of Object.keys(u)) delete u[k];
  Object.assign(u, fresh);
  byName.set(nameKey(u.name), u);
  lastSaved.set(u.id, json);
}
// Token unbekannt? Vielleicht wurde das Konto gerade erst auf dem alten Server angelegt.
async function userByToken(token) {
  if (!token || typeof token !== 'string') return null;
  let u = byToken.get(token);
  if (u || !mongoUsers) return u || null;
  const doc = await mongoUsers.findOne({ token });
  if (!doc) return null;
  const { _id, ...fresh } = doc;
  if (db.users[fresh.id]) return db.users[fresh.id];
  db.users[fresh.id] = fresh; lastSaved.set(fresh.id, JSON.stringify(fresh));
  byToken.set(fresh.token, fresh); byCode.set(fresh.code, fresh); byName.set(nameKey(fresh.name), fresh);
  refreshedUsers.add(fresh.id);
  return fresh;
}

// ---------------------------------------------------------------- Match-Archiv (für Admins: alle Partien, Replays, Annullieren)
async function archiveMatch(doc) {
  try {
    if (mongoMatches) await mongoMatches.replaceOne({ id: doc.id }, doc, { upsert: true });
    else { db.matches ||= []; db.matches.unshift(doc); if (db.matches.length > 3000) db.matches.length = 3000; save(); }
  } catch (e) { console.error('Archiv:', e.message); }
}
async function matchGet(id) {
  if (mongoMatches) { const d = await mongoMatches.findOne({ id }); if (d) delete d._id; return d; }
  return (db.matches || []).find((m) => m.id === id) || null;
}
async function matchUpdate(doc) {
  if (mongoMatches) await mongoMatches.replaceOne({ id: doc.id }, doc, { upsert: true });
  else { const i = db.matches.findIndex((m) => m.id === doc.id); if (i >= 0) db.matches[i] = doc; save(); }
}
async function matchList({ uids = null, type = null, before = null, limit = 40 } = {}) {
  if (mongoMatches) {
    const q = {};
    if (uids) q.uids = { $in: uids };
    if (type) q.type = type;
    if (before) q.at = { $lt: before };
    return (await mongoMatches.find(q, { projection: { moves: 0, log: 0, _id: 0 } }).sort({ at: -1 }).limit(limit).toArray());
  }
  return (db.matches || []).filter((m) => (!uids || m.uids.some((u) => uids.includes(u))) && (!type || m.type === type) && (!before || m.at < before))
    .slice(0, limit).map(({ moves, log, ...rest }) => rest);
}
async function matchCounts() {
  const day = new Date(); day.setHours(0, 0, 0, 0);
  if (mongoMatches) {
    try { return { total: await mongoMatches.countDocuments({}), today: await mongoMatches.countDocuments({ at: { $gte: day.getTime() } }) }; } catch { return { total: null, today: null }; }
  }
  const all = db.matches || [];
  return { total: all.length, today: all.filter((m) => m.at >= day.getTime()).length };
}

// Sperren: gesperrte Spieler dürfen nicht online spielen und nicht chatten
const banInfo = (u) => (u?.ban && (u.ban.until === -1 || u.ban.until > Date.now()) ? { until: u.ban.until, reason: u.ban.reason || '' } : null);
function banErr(u) {
  const b = banInfo(u);
  if (!b) return null;
  const bis = b.until === -1 ? 'auf Dauer' : `bis ${new Date(b.until).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Berlin' })}`;
  return `⛔ Du bist ${bis} gesperrt${b.reason ? ` (${b.reason})` : ''}. Bots und Training gehen weiter.`;
}

// Partie annullieren: Elo, Münzen und Statistik bei allen Beteiligten zurücknehmen
async function annulMatch(m, byName) {
  const touched = [];
  const revert = (uid, { d = 0, coins = 0 } = {}, statsFn) => {
    const u = db.users[uid]; if (!u) return;
    u.rating = Math.max(0, u.rating - d); u.coins = Math.max(0, u.coins - coins);
    statsFn?.(u);
    touched.push({ u, d, coins });
  };
  if (m.type === 'online') {
    for (const pl of Object.values(m.players || {})) revert(pl.id, pl, (u) => {
      if (!pl.counted) return;
      u.stats.games = Math.max(0, u.stats.games - 1);
      const k = pl.outcome === 'win' ? 'wins' : pl.outcome === 'loss' ? 'losses' : 'draws';
      u.stats[k] = Math.max(0, u.stats[k] - 1);
      if (pl.mate) u.stats.mates = Math.max(0, u.stats.mates - 1);
    });
  } else if (m.type === 'four') {
    for (const pl of m.players || []) if (pl.uid) revert(pl.uid, { coins: pl.coins || 0 }, (u) => { if (pl.counted && u.stats.four) { u.stats.four.games = Math.max(0, u.stats.four.games - 1); if (pl.win) u.stats.four.wins = Math.max(0, u.stats.four.wins - 1); } });
  } else if (m.type === 'bot') {
    const pl = m.players.user;
    revert(pl.id, { coins: pl.coins || 0 }, (u) => { u.stats.botGames = Math.max(0, u.stats.botGames - 1); if (pl.outcome === 'win') { u.stats.botWins = Math.max(0, u.stats.botWins - 1); u.stats.mates = Math.max(0, u.stats.mates - 1); } });
  }
  m.annulled = { at: Date.now(), by: byName };
  await matchUpdate(m);
  save();
  for (const t of touched) {
    emitTo(t.u.id, 'profile:refresh', { profile: priv(t.u) });
    if (t.d || t.coins) emitTo(t.u.id, 'toast', { type: 'warn', text: `⚖️ Ein Admin hat eine Partie annulliert: ${t.d ? `${t.d > 0 ? '−' : '+'}${Math.abs(t.d)} Elo` : ''}${t.d && t.coins ? ', ' : ''}${t.coins ? `${t.coins > 0 ? '−' : '+'}${Math.abs(t.coins)} Münzen` : ''}.` });
  }
  console.log(`[admin] ${byName} hat Partie ${m.id} (${m.type}) annulliert`);
  return touched;
}

// ---------------------------------------------------------------- Freunde & Chat
const MAX_FRIENDS = 200, CHAT_KEEP = 200, CHAT_LEN = 300;
const social = (u) => { u.friends ||= []; u.freqIn ||= []; u.freqOut ||= []; u.unread ||= {}; return u; };
const chatKey = (a, b) => [a, b].sort().join(':');
const chatCache = new Map(); // key -> [{ from, text, at }]
async function chatLoad(key) {
  if (chatCache.has(key)) return chatCache.get(key);
  let msgs = [];
  if (mongoChats) { const d = await mongoChats.findOne({ id: key }); msgs = d?.msgs || []; }
  else msgs = db.chats?.[key] || [];
  chatCache.set(key, msgs);
  if (chatCache.size > 500) chatCache.delete(chatCache.keys().next().value);
  return msgs;
}
async function chatStore(key, msgs) {
  chatCache.set(key, msgs);
  if (mongoChats) await mongoChats.replaceOne({ id: key }, { id: key, msgs }, { upsert: true });
  else { db.chats ||= {}; db.chats[key] = msgs; save(); }
}
const friendInfo = (me, f) => ({ ...pub(f), online: online.has(f.id), unread: social(me).unread[f.id] || 0 });
function socialSummary(u) {
  social(u);
  const gun = Object.entries(u.gunread || {}).filter(([gid]) => db.groups?.[gid]?.members.includes(u.id)).reduce((a, [, n]) => a + n, 0);
  return { unread: Object.values(u.unread).reduce((a, b) => a + b, 0) + gun, requests: u.freqIn.length };
}

// ---------------------------------------------------------------- Gruppen (Gruppenchat mit mehreren Freunden)
const MAX_GROUP = 12, MAX_GROUPS = 20;
async function groupSave(gr) {
  db.groups[gr.id] = gr;
  if (mongoGroups) await mongoGroups.replaceOne({ id: gr.id }, { ...gr }, { upsert: true }).catch((e) => console.error('Gruppe speichern:', e.message));
  else save();
}
async function groupDelete(id) {
  delete db.groups[id];
  if (mongoGroups) await mongoGroups.deleteOne({ id }).catch(() => {});
  else { delete db.chats?.['g:' + id]; save(); }
  if (mongoChats) await mongoChats.deleteOne({ id: 'g:' + id }).catch(() => {});
  chatCache.delete('g:' + id);
}
const myGroups = (u) => Object.values(db.groups || {}).filter((gr) => gr.members.includes(u.id));
const groupInfo = (u, gr) => ({
  id: gr.id, name: gr.name, owner: gr.owner, createdAt: gr.createdAt, last: gr.last || null,
  members: gr.members.map((id) => db.users[id]).filter(Boolean).map((m) => ({ ...pub(m), online: online.has(m.id) })),
  unread: (u.gunread || {})[gr.id] || 0,
});
// Nachricht in die Gruppe (auch System-Nachrichten und Spiel-Einladungen)
async function groupPost(gr, msg, exceptId = null) {
  const key = 'g:' + gr.id;
  const msgs = [...await chatLoad(key), msg].slice(-CHAT_KEEP);
  await chatStore(key, msgs);
  gr.last = { at: msg.at, text: msg.text, name: msg.name || null };
  await groupSave(gr);
  for (const id of gr.members) {
    if (id === exceptId) continue;
    const m = db.users[id]; if (!m) continue;
    (m.gunread ||= {})[gr.id] = (m.gunread[gr.id] || 0) + 1;
    emitTo(id, 'group:msg', { group: { id: gr.id, name: gr.name }, msg, ...socialSummary(m) });
  }
  save();
}
const groupUpdate = (gr, extra = {}) => { for (const id of gr.members) emitTo(id, 'group:update', { id: gr.id, ...extra }); };
// Freunde informieren, wenn jemand online/offline geht
function notifyFriends(u, isOnline) {
  for (const id of social(u).friends) emitTo(id, 'friend:status', { id: u.id, online: isOnline });
}
const relation = (me, other) => {
  social(me);
  if (me.friends.includes(other.id)) return 'friend';
  if (me.freqOut.includes(other.id)) return 'sent';
  if (me.freqIn.includes(other.id)) return 'received';
  return 'none';
};
function makeFriends(a, b) {
  social(a); social(b);
  for (const [x, y] of [[a, b], [b, a]]) {
    x.freqIn = x.freqIn.filter((id) => id !== y.id);
    x.freqOut = x.freqOut.filter((id) => id !== y.id);
    if (!x.friends.includes(y.id)) x.friends.push(y.id);
  }
}

// ---------------------------------------------------------------- Sockets
const clean = (s, n) => String(s ?? '').replace(/[<>\u0000-\u001f]/g, '').trim().slice(0, n);
const ALLOWED_TIMES = [0, 60_000, 180_000, 300_000, 600_000, 900_000];
const pickTime = (t, fallback = 600_000) => (ALLOWED_TIMES.includes(t) ? t : fallback);
const RANDOM_TIMES = [60_000, 180_000, 300_000, 600_000, 900_000]; // Zufallsmatch: immer mit Uhr

// Spieler per 8-stelligem Code, Name oder ID finden (Admin)
function findTarget(q) {
  const s = String(q || '').trim();
  if (/^\d{8}$/.test(s)) return byCode.get(s) || null;
  return db.users[s] || byName.get(nameKey(s.replace(/^@/, ''))) || null;
}
// Partie ohne Wertung abbrechen (Admin)
function abortGame(g) {
  if (g.status === 'over') return;
  g.status = 'over';
  clearTimeout(g.voteTimer);
  for (const t of Object.values(g.disconnect)) clearTimeout(t);
  for (const c of ['w', 'b']) { emitTo(g.players[c], 'game:cancelled', { byAdmin: true }); userGame.delete(g.players[c]); }
  io.to(watchRoom(g)).emit('toast', { type: 'warn', text: 'Die Partie wurde von einem Admin abgebrochen.' });
  unpersistGame(g);
  setTimeout(() => games.delete(g.id), 5000);
  broadcastStats();
}
function abortFour(g) {
  g.status = 'over';
  clearTimeout(g.botTimer);
  for (const t of Object.values(g.disconnect)) clearTimeout(t);
  for (const p of g.players) if (p.uid) { emitTo(p.uid, 'toast', { type: 'warn', text: 'Das Spiel wurde von einem Admin abgebrochen (ohne Wertung).' }); emitTo(p.uid, 'four:lobby', { closed: true, started: true }); if (userFour.get(p.uid) === g.id) userFour.delete(p.uid); }
  setTimeout(() => games4.delete(g.id), 5000);
  broadcastStats();
}
function forceName(u, name) {
  const n = name ? clean(name, 16) : freeGuestName();
  const err = checkUsername(n);
  if (err) return { error: err };
  const other = byName.get(nameKey(n));
  if (other && other !== u) return { error: 'Dieser Benutzername ist schon vergeben.' };
  setName(u, n);
  return { ok: true };
}
const adminApi = setupAdmin({
  getDb: () => db, online, games, games4, lobbies4, rooms, io, save, flush, emitTo, pub, priv, isAdmin, banInfo, findTarget, matchList, matchGet, annulMatch,
  chatLoad, chatStore, groupDelete, groupSave, setName, hashPw, VERSION, mongo: () => !!mongoUsers, endGame, abortGame, abortFour, forceName,
  getQueue: () => queue, setQueue: (q) => { queue = q; broadcastStats(); },
});

io.on('connection', (socket) => {
  let user = null;
  // letztes Lebenszeichen (auch Ping-Antworten) – für faire Uhr bei Verbindungsabbruch
  socket.data.lastSeen = Date.now();
  socket.conn.on('packet', () => { socket.data.lastSeen = Date.now(); });
  const need = (fn) => (...args) => { if (user) try { fn(...args); } catch (e) { console.error(e); } };

  socket.on('auth', async ({ token } = {}, ack) => {
    let u = null;
    try { u = await userByToken(token); if (u) { await refreshFromDb(u); await adoptGameFor(u.id); } } catch (e) { console.error('auth:', e.message); }
    if (!socket.connected) return;
    user = ensureShape(u || createUser());
    const old = online.get(user.id);
    if (old && old.id !== socket.id) { old.emit('session:replaced'); old.disconnect(true); }
    online.set(user.id, socket);
    adminApi.onConnect(socket, user);
    ack?.({ settings: adminApi.publicSettings(), token: user.token, profile: priv(user), version: VERSION, gameId: userGame.get(user.id) || null, social: socialSummary(user), ban: banInfo(user) });
    notifyFriends(user, true);
    // Laufendes 4er-Spiel fortsetzen
    const g4 = fourGameOf(user.id);
    if (g4 && g4.status === 'playing') {
      clearTimeout(g4.disconnect[user.id]); delete g4.disconnect[user.id];
      socket.emit('four:start', { ...fourPayload(g4, user.id), resumed: true });
      fourBroadcast(g4, 'four:state', { events: [] });
    }
    // Laufendes Spiel fortsetzen
    const gid = userGame.get(user.id);
    const g = gid && games.get(gid);
    if (g) {
      if (g.disconnect[user.id]) { clearTimeout(g.disconnect[user.id]); delete g.disconnect[user.id]; emitTo(opponentOf(g, user.id), 'game:opponent', { online: true }); }
      if (g.status === 'playing') {
        socket.emit('game:start', { ...gamePayload(g, user.id), resumed: true });
        const opp = opponentOf(g, user.id);
        if (g.paused && !online.has(opp)) socket.emit('game:opponent', { online: false, deadline: g.deadline?.[opp] || g.waitUntil, paused: true, update: !!g.restored });
        resumeIfReady(g);
      }
      else if (g.status === 'vote') socket.emit('match:vote', { gameId: g.id, options: g.voteOptions, deadline: g.voteDeadline, duration: VOTE_MS, players: { w: pub(db.users[g.players.w]), b: pub(db.users[g.players.b]) }, you: g.players.w === user.id ? 'w' : 'b', votes: g.votes });
    }
    broadcastStats();
  });

  socket.on('profile:update', need(({ name, avatar } = {}, ack) => {
    if (name !== undefined) {
      const n = clean(name, 16);
      const err = checkUsername(n);
      if (err) return ack?.({ error: err });
      const other = byName.get(nameKey(n));
      if (other && other !== user) return ack?.({ error: 'Dieser Benutzername ist schon vergeben.' });
      setName(user, n);
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
    const cost = adminApi.price(item.price);
    if (user.coins < cost) return ack?.({ error: `Dir fehlen ${cost - user.coins} Münzen.` });
    user.coins -= cost; user.owned[kind].push(id); user.equipped[kind] = id;
    save(); ack?.({ profile: priv(user) });
  }));

  socket.on('shop:equip', need(({ kind, id } = {}, ack) => {
    if (!findItem(kind, id) || !user.owned[kind]?.includes(id)) return ack?.({ error: 'Nicht in deinem Besitz.' });
    user.equipped[kind] = id; save(); ack?.({ profile: priv(user) });
  }));

  // --- Bundles: alle fehlenden Teile auf einmal, mit Rabatt
  socket.on('shop:bundle', need(({ id } = {}, ack) => {
    const bundle = BUNDLES.find((b) => b.id === id);
    if (!bundle) return ack?.({ error: 'Unbekanntes Paket.' });
    const bp = bundlePrice(bundle, user.owned), missing = bp.missing, price = adminApi.price(bp.price);
    if (!missing.length) return ack?.({ error: 'Du besitzt schon alles aus diesem Paket.' });
    if (user.coins < price) return ack?.({ error: `Dir fehlen ${price - user.coins} Münzen.` });
    user.coins -= price;
    for (const [k, itemId] of bundle.items) { if (!user.owned[k].includes(itemId)) user.owned[k].push(itemId); user.equipped[k] = itemId; }
    save(); ack?.({ profile: priv(user), price });
  }));

  // --- Konten: Registrieren (Gastprofil wird zum Konto), Anmelden, Passwort ändern
  const fails = { n: 0, since: Date.now() };
  const limited = () => {
    if (Date.now() - fails.since > 10 * 60_000) { fails.n = 0; fails.since = Date.now(); }
    return fails.n >= 6;
  };
  const checkPassword = (pw) => (typeof pw !== 'string' || pw.length < 6 || pw.length > 64 ? 'Das Passwort braucht 6–64 Zeichen.' : null);

  socket.on('account:register', need(({ username, password } = {}, ack) => {
    if (user.pass) return ack?.({ error: 'Du bist schon mit einem Konto angemeldet. Melde dich zuerst ab.' });
    const n = clean(username, 16);
    const err = checkUsername(n) || checkPassword(password);
    if (err) return ack?.({ error: err });
    const other = byName.get(nameKey(n));
    if (other && other !== user) return ack?.({ error: 'Dieser Benutzername ist schon vergeben.' });
    setName(user, n);
    user.pass = hashPw(password);
    save();
    ack?.({ profile: priv(user) });
  }));

  socket.on('account:login', need(({ username, password } = {}, ack) => {
    if (limited()) return ack?.({ error: 'Zu viele Fehlversuche. Warte ein paar Minuten.' });
    const target = byName.get(nameKey(username));
    if (!target || !target.pass || !checkPw(password, target.pass)) {
      fails.n++;
      return ack?.({ error: 'Benutzername oder Passwort ist falsch.' });
    }
    fails.n = 0;
    ack?.({ token: target.token });
  }));

  socket.on('account:password', need(({ old, password } = {}, ack) => {
    const err = checkPassword(password);
    if (err) return ack?.({ error: err });
    if (user.pass && !checkPw(old || '', user.pass)) { fails.n++; return ack?.({ error: 'Das alte Passwort stimmt nicht.' }); }
    user.pass = hashPw(password);
    save();
    ack?.({ profile: priv(user) });
  }));

  // --- Profil eines anderen Spielers ansehen
  // --- Admin-Menü: Spieler suchen und Münzen geben/abziehen (nur für Admins, Server prüft jedes Mal)
  adminApi.register(socket, () => user, need);
  socket.on('admin:find', need(({ query } = {}, ack) => {
    if (!isAdmin(user)) return ack?.({ error: 'Keine Berechtigung.' });
    const t = findTarget(query);
    if (!t) return ack?.({ error: 'Kein Spieler mit diesem Code oder Namen gefunden.' });
    ack?.({ player: { ...pub(t), code: t.code, coins: t.coins, online: online.has(t.id), ban: banInfo(t) } });
  }));
  // ---------------- Admin-Panel
  const adminOnly = (fn) => need(async (data = {}, ack) => {
    if (!isAdmin(user)) return ack?.({ error: 'Keine Berechtigung.' });
    try { await fn(data, ack); } catch (e) { console.error('[admin]', e); ack?.({ error: 'Fehler: ' + e.message }); }
  });
  socket.on('admin:stats', adminOnly(async (_, ack) => {
    const all = Object.values(db.users);
    const day = new Date(); day.setHours(0, 0, 0, 0);
    const top = (key) => [...all].sort((a, b) => b[key] - a[key]).slice(0, 5).map((u) => ({ id: u.id, name: u.name, value: u[key] }));
    ack?.({
      users: all.length, registered: all.filter((u) => u.pass).length, newToday: all.filter((u) => u.createdAt >= day.getTime()).length,
      online: online.size, gamesNow: [...games.values()].filter((g) => g.status === 'playing').length, fourNow: [...games4.values()].filter((g) => g.status === 'playing').length,
      queue: queue.length, banned: all.filter((u) => banInfo(u)).length, coins: all.reduce((s, u) => s + (u.coins || 0), 0),
      matches: await matchCounts(), topCoins: top('coins'), topElo: top('rating'),
    });
  }));
  socket.on('admin:matches', adminOnly(async ({ q = '', type = '', before = null } = {}, ack) => {
    let uids = null;
    const qs = String(q || '').trim();
    if (qs) {
      const exact = findTarget(qs);
      uids = exact ? [exact.id] : Object.values(db.users).filter((u) => nameKey(u.name).includes(nameKey(qs))).slice(0, 30).map((u) => u.id);
      if (!uids.length) return ack?.({ list: [] });
    }
    const list = await matchList({ uids, type: ['online', 'four', 'bot'].includes(type) ? type : null, before: before ? Number(before) : null, limit: 40 });
    ack?.({ list });
  }));
  socket.on('admin:match', adminOnly(async ({ id } = {}, ack) => {
    const m = await matchGet(String(id || ''));
    ack?.(m ? { match: m } : { error: 'Partie nicht gefunden.' });
  }));
  socket.on('admin:annul', adminOnly(async ({ id } = {}, ack) => {
    const m = await matchGet(String(id || ''));
    if (!m) return ack?.({ error: 'Partie nicht gefunden.' });
    if (m.annulled) return ack?.({ error: 'Diese Partie wurde schon annulliert.' });
    await annulMatch(m, user.name);
    adminApi.log(user, 'annul', null, `Partie ${m.id} (${m.type})`);
    ack?.({ ok: true, match: m });
  }));
  socket.on('admin:ban', adminOnly(async ({ query, minutes = 60, reason = '' } = {}, ack) => {
    const t = findTarget(query);
    if (!t) return ack?.({ error: 'Spieler nicht gefunden.' });
    if (isAdmin(t)) return ack?.({ error: 'Admins kann man nicht sperren.' });
    const mins = Math.trunc(Number(minutes));
    t.ban = { until: mins > 0 ? Date.now() + mins * 60_000 : -1, reason: clean(reason, 80), by: user.name, at: Date.now() };
    queue = queue.filter((q) => q.userId !== t.id);
    save();
    emitTo(t.id, 'banned', banInfo(t));
    console.log(`[admin] ${user.name} sperrt ${t.name} (${mins > 0 ? mins + ' Min' : 'dauerhaft'})`);
    adminApi.log(user, 'ban', t, `${minutes ? minutes + ' Min.' : 'dauerhaft'}${reason ? ' – ' + reason : ''}`);
    ack?.({ player: { ...pub(t), code: t.code, coins: t.coins, online: online.has(t.id), ban: banInfo(t) } });
  }));
  socket.on('admin:unban', adminOnly(async ({ query } = {}, ack) => {
    const t = findTarget(query);
    if (!t) return ack?.({ error: 'Spieler nicht gefunden.' });
    delete t.ban; save();
    emitTo(t.id, 'banned', null);
    emitTo(t.id, 'toast', { type: 'good', text: '✅ Deine Sperre wurde aufgehoben.' });
    adminApi.log(user, 'unban', t);
    ack?.({ player: { ...pub(t), code: t.code, coins: t.coins, online: online.has(t.id), ban: null } });
  }));
  socket.on('admin:announce', adminOnly(async ({ text } = {}, ack) => {
    const msg = clean(text, 300);
    if (!msg) return ack?.({ error: 'Leere Ankündigung.' });
    io.emit('announce', { text: msg, by: user.name, at: Date.now() });
    console.log(`[admin] Ankündigung von ${user.name}: ${msg}`);
    adminApi.log(user, 'announce', null, text);
    ack?.({ ok: true, reached: online.size });
  }));
  socket.on('admin:live', adminOnly(async (_, ack) => {
    const two = [...games.values()].filter((g) => g.status === 'playing').map((g) => ({ id: g.id, type: 'online', source: g.source, variant: g.variant || null, moves: g.chess.history().length, players: { w: pub(db.users[g.players.w]), b: pub(db.users[g.players.b]) }, watchers: watcherCount(g) }));
    const four = [...games4.values()].filter((g) => g.status === 'playing').map((g) => ({ id: g.id, type: 'four', ply: g.state.ply, players: fourPlayers(g).map((p, c) => ({ name: p.name, bot: !!p.bot, alive: g.state.alive[c] })) }));
    ack?.({ two, four });
  }));

  // Admin: Profil mit Bilanz gegen jeden Gegner
  socket.on('admin:profile', need(({ id, query } = {}, ack) => {
    if (!isAdmin(user)) return ack?.({ error: 'Keine Berechtigung.' });
    const t = id ? db.users[id] : findTarget(query);
    if (!t) return ack?.({ error: 'Spieler nicht gefunden.' });
    ensureVs(t);
    const list = (box, isBot) => Object.entries(box || {}).map(([key, e]) => {
      const cur = !isBot && !key.startsWith('name:') ? db.users[key] : null;
      return { id: cur ? cur.id : null, name: cur ? cur.name : e.name, avatar: cur ? cur.avatar : null, code: cur ? cur.code : null, online: cur ? online.has(cur.id) : false, w: e.w, l: e.l, d: e.d, elo: e.elo, unrated: e.unrated, last: e.last };
    }).sort((a, b) => (b.w + b.l + b.d) - (a.w + a.l + a.d) || b.w - a.w);
    save();
    ack?.({ admin: { code: t.code, coins: t.coins, registered: !!t.pass, vs: list(t.vs, false), vsBot: list(t.vsBot, true), stats: t.stats } });
  }));
  socket.on('admin:clearProfile', need(async ({ query } = {}, ack) => {
    if (!isAdmin(user)) return ack?.({ error: 'Keine Berechtigung.' });
    const t = findTarget(query);
    if (!t) return ack?.({ error: 'Spieler nicht gefunden.' });
    await musicDel(t.id).catch(() => {});
    t.music = null; t.custom = { ...customOf(t), bio: '', bannerImg: null, banner: customOf(t).banner === 'bild' ? 'standard' : customOf(t).banner };
    console.log(`[admin] ${user.name} hat Song/Banner/Bio von ${t.name} (${t.code}) entfernt`);
    save(); emitTo(t.id, 'profile:refresh', { profile: priv(t) });
    adminApi.log(user, 'clear-profile', t, 'Song, Banner & Bio entfernt');
    ack?.({ ok: true });
  }));
  socket.on('admin:coins', need(({ query, amount } = {}, ack) => {
    if (!isAdmin(user)) return ack?.({ error: 'Keine Berechtigung.' });
    const t = findTarget(query);
    const n = Math.trunc(Number(amount));
    if (!t) return ack?.({ error: 'Kein Spieler mit diesem Code oder Namen gefunden.' });
    if (!Number.isFinite(n) || n === 0 || Math.abs(n) > 1_000_000) return ack?.({ error: 'Betrag muss zwischen -1.000.000 und 1.000.000 liegen (nicht 0).' });
    t.coins = Math.max(0, t.coins + n);
    console.log(`[admin] ${user.name} (${user.code}) -> ${t.name} (${t.code}): ${n > 0 ? '+' : ''}${n} Münzen, neu ${t.coins}`);
    save();
    // Empfänger sieht es sofort, falls online
    emitTo(t.id, 'profile:refresh', { profile: priv(t) });
    emitTo(t.id, 'toast', { type: 'good', text: n > 0 ? `🎁 Du hast ${n} Münzen von einem Admin bekommen!` : `Ein Admin hat ${-n} Münzen abgezogen.` });
    adminApi.log(user, 'coins', t, `${amount > 0 ? '+' : ''}${amount} Münzen`);
    ack?.({ player: { ...pub(t), code: t.code, coins: t.coins, online: online.has(t.id) }, profile: t === user ? priv(user) : undefined });
  }));

  // Admin: Elo geben/abziehen (amount) oder direkt setzen (set)
  socket.on('admin:elo', need(({ query, amount, set } = {}, ack) => {
    if (!isAdmin(user)) return ack?.({ error: 'Keine Berechtigung.' });
    const t = findTarget(query);
    if (!t) return ack?.({ error: 'Kein Spieler mit diesem Code oder Namen gefunden.' });
    const before = t.rating;
    if (set !== undefined && set !== null && set !== '') {
      const v = Math.trunc(Number(set));
      if (!Number.isFinite(v) || v < 0 || v > 5000) return ack?.({ error: 'Elo muss zwischen 0 und 5.000 liegen.' });
      t.rating = v;
    } else {
      const n = Math.trunc(Number(amount));
      if (!Number.isFinite(n) || n === 0 || Math.abs(n) > 5000) return ack?.({ error: 'Betrag muss zwischen -5.000 und 5.000 liegen (nicht 0).' });
      t.rating = Math.min(5000, Math.max(0, t.rating + n));
    }
    const d = t.rating - before;
    console.log(`[admin] ${user.name} (${user.code}) -> ${t.name} (${t.code}): Elo ${before} -> ${t.rating}`);
    save();
    emitTo(t.id, 'profile:refresh', { profile: priv(t) });
    if (d) emitTo(t.id, 'toast', { type: d > 0 ? 'good' : 'warn', text: d > 0 ? `🏆 Ein Admin hat dir ${d} Elo gegeben! (jetzt ${t.rating})` : `Ein Admin hat dir ${-d} Elo abgezogen (jetzt ${t.rating}).` });
    adminApi.log(user, 'elo', t, `${d >= 0 ? '+' : ''}${d} Elo (jetzt ${t.rating})`);
    ack?.({ player: { ...pub(t), code: t.code, coins: t.coins, online: online.has(t.id) }, change: d, profile: t === user ? priv(user) : undefined });
  }));

  // --- Profil-Studio
  socket.on('profile:custom', need(({ custom } = {}, ack) => {
    const c = { ...customOf(user) };
    const inp = custom || {};
    if (inp.nameFx === 'admin' && !isAdmin(user)) return ack?.({ error: 'Diese Schrift gibt es nur für Admins.' });
    for (const k of ['banner', 'frame', 'nameFx', 'particles', 'accent']) if (inp[k] !== undefined) { if (!allowed(k).includes(inp[k])) return ack?.({ error: 'Ungültige Auswahl.' }); c[k] = inp[k]; }
    if (inp.bio !== undefined) {
      const bio = clean(inp.bio, 80);
      if (bio && badWord(bio)) return ack?.({ error: 'Deine Bio enthält ein unerlaubtes Wort.' });
      c.bio = bio;
    }
    if (inp.showInventory !== undefined) c.showInventory = !!inp.showInventory;
    if (inp.showcase !== undefined) { if (inp.showcase && !user.owned.finisher.includes(inp.showcase)) return ack?.({ error: 'Diesen Finisher besitzt du nicht.' }); c.showcase = inp.showcase || null; }
    if (inp.bannerImg !== undefined) {
      if (inp.bannerImg === null) c.bannerImg = null;
      else if (typeof inp.bannerImg === 'string' && /^data:image\/(jpeg|png|webp);base64,/.test(inp.bannerImg) && inp.bannerImg.length < 400_000) c.bannerImg = inp.bannerImg;
      else return ack?.({ error: 'Bannerbild ungültig oder zu groß.' });
    }
    user.custom = c; save();
    ack?.({ profile: priv(user) });
  }));

  // --- Profilsong hochladen / entfernen / abspielen
  socket.on('profile:music', need(async ({ data, title, volume, remove } = {}, ack) => {
    try {
      if (remove) { await musicDel(user.id); user.music = null; save(); return ack?.({ profile: priv(user) }); }
      if (data !== undefined) {
        const ok = typeof data === 'string' && /^data:audio\/(mpeg|mp3|ogg|wav|x-wav|mp4|x-m4a|aac|webm);base64,/.test(data);
        if (!ok) return ack?.({ error: 'Bitte eine Audiodatei (MP3, OGG, M4A, WAV) hochladen.' });
        if (data.length > MUSIC_MAX_BYTES * 1.37 + 100) return ack?.({ error: 'Der Song ist zu groß (maximal 3 MB).' });
        await musicSet(user.id, data);
        user.music = { title: user.music?.title || 'Profilsong', volume: user.music?.volume ?? 0.6, at: Date.now() };
      }
      if (!user.music) return ack?.({ error: 'Lade zuerst einen Song hoch.' });
      if (title !== undefined) {
        const t = clean(title, 40);
        if (t && badWord(t)) return ack?.({ error: 'Der Titel enthält ein unerlaubtes Wort.' });
        user.music.title = t || 'Profilsong';
      }
      if (volume !== undefined) user.music.volume = Math.max(0, Math.min(1, Number(volume) || 0));
      save();
      ack?.({ profile: priv(user) });
    } catch (e) { console.error(e); ack?.({ error: 'Song konnte nicht gespeichert werden.' }); }
  }));
  socket.on('music:get', async ({ id } = {}, ack) => {
    try { const u = db.users[id]; if (!u?.music) return ack?.({ error: 'Kein Song.' }); ack?.({ data: await musicGet(id), title: u.music.title, volume: u.music.volume }); }
    catch { ack?.({ error: 'Song nicht verfügbar.' }); }
  });

  socket.on('profile:get', ({ id } = {}, ack) => {
    const u = db.users[id];
    ack?.(u ? { profile: publicProfile(u) } : { error: 'Spieler nicht gefunden.' });
  });

  // --- Einladungscode (6-stellig, zufällig)
  socket.on('room:create', need(({ timeMs = 600_000, variant = null } = {}, ack) => {
    { const blk = adminApi.playBlock('play'); if (blk) return ack?.({ error: blk }); }
    if (banErr(user)) return ack?.({ error: banErr(user) });
    if (userGame.has(user.id)) return ack?.({ error: 'Du bist bereits in einem Spiel.' });
    for (const [c, r] of rooms) if (r.hostId === user.id) rooms.delete(c);
    let code; do code = digits(6); while (rooms.has(code) || lobbies4.has(code));
    rooms.set(code, { code, hostId: user.id, timeMs: ALLOWED_TIMES.includes(timeMs) ? timeMs : 600_000, variant: VARIANTS[variant] ? variant : null, at: Date.now() });
    ack?.({ code, variant: VARIANTS[variant] ? variant : null });
  }));
  // --- Live zuschauen
  socket.on('live:list', (_, ack) => {
    ack?.({ list: liveGames().map((g) => ({ id: g.id, players: { w: pub(db.users[g.players.w]), b: pub(db.users[g.players.b]) }, moves: g.chess.history().length, timeMs: g.timeMs, watchers: watcherCount(g), board: g.board })) });
  });
  socket.on('watch:start', ({ id } = {}, ack) => {
    const g = games.get(id);
    if (!g || g.status !== 'playing' || (g.source !== 'random' && !isAdmin(user))) return ack?.({ error: 'Dieses Match läuft nicht mehr.' });
    if (user && (g.players.w === user.id || g.players.b === user.id)) return ack?.({ error: 'Das ist dein eigenes Spiel.' });
    for (const r of socket.rooms) if (r.startsWith('watch:')) socket.leave(r);
    socket.join(watchRoom(g));
    ack?.({ game: { ...gamePayload(g, null), you: 'w', spectator: true, watchers: watcherCount(g) } });
    emitWatchers(g);
  });
  socket.on('watch:stop', () => {
    for (const r of [...socket.rooms]) if (r.startsWith('watch:')) { socket.leave(r); const g = games.get(r.slice(6)); if (g) emitWatchers(g); }
  });
  socket.on('disconnecting', () => {
    for (const r of socket.rooms) if (r.startsWith('watch:')) { const g = games.get(r.slice(6)); if (g) setTimeout(() => emitWatchers(g), 50); }
  });

  // --- 4er-Schach
  socket.on('four:create', need(({ timeMs = 300_000, teams = false } = {}, ack) => {
    { const blk = adminApi.playBlock('four'); if (blk) return ack?.({ error: blk }); }
    ack?.(createFourLobby(user, timeMs, teams));
  }));
  // 2 vs 2: Team wechseln (wenn dort noch Platz ist)
  socket.on('four:team', need((_, ack) => {
    const l = [...lobbies4.values()].find((x) => x.seats.includes(user.id));
    if (!l?.teams) return ack?.({ error: 'Keine 2-vs-2-Lobby.' });
    const to = 1 - (l.side[user.id] ?? 0);
    if (l.seats.filter((id) => l.side[id] === to).length >= 2) return ack?.({ error: 'Das andere Team ist schon voll.' });
    l.side[user.id] = to; emitLobby(l); ack?.({ ok: true });
  }));
  socket.on('four:start', need((_, ack) => {
    const l = [...lobbies4.values()].find((x) => x.hostId === user.id);
    if (!l) return ack?.({ error: 'Keine Lobby gefunden.' });
    lobbies4.delete(l.code);
    const humans = l.seats.filter((id) => online.has(id));
    for (const id of l.seats) if (id !== user.id) emitTo(id, 'four:lobby', { closed: true, started: true });
    startFour(humans, l.timeMs, { teams: l.teams, side: l.side });
    ack?.({ ok: true });
  }));
  socket.on('four:solo', need(({ timeMs = 300_000, teams = false } = {}, ack) => {
    { const blk = adminApi.playBlock('four'); if (blk) return ack?.({ error: blk }); }
    if (banErr(user)) return ack?.({ error: banErr(user) });
    if (userGame.has(user.id) || fourBusy(user.id)) return ack?.({ error: 'Du bist bereits in einem Spiel oder einer Lobby.' });
    startFour([user.id], fourTime(timeMs), { teams: !!teams, side: { [user.id]: 0 } });
    ack?.({ ok: true });
  }));
  socket.on('four:leave', need(() => {
    leaveLobby(user.id);
    const g = fourGameOf(user.id);
    if (g) { const c = fourColorOf(g, user.id); if (g.state.alive[c]) fourEliminate(g, c, 'resign'); userFour.delete(user.id); }
  }));
  socket.on('four:move', need(({ from, to } = {}, ack) => {
    const g = fourGameOf(user.id);
    if (!g || g.status !== 'playing') return ack?.({ error: 'Kein 4er-Spiel aktiv.' });
    const c = fourColorOf(g, user.id);
    if (g.state.turn !== c) return ack?.({ error: 'Du bist nicht am Zug.' });
    const res = Four.play(g.state, c, Number(from), Number(to));
    if (!res) return ack?.({ error: 'Ungültiger Zug.' });
    ack?.({ ok: true });
    fourAfterMove(g, c, res);
  }));
  socket.on('four:resign', need(() => {
    const g = fourGameOf(user.id);
    if (g) fourEliminate(g, fourColorOf(g, user.id), 'resign');
  }));

  socket.on('room:cancel', need(() => { for (const [c, r] of rooms) if (r.hostId === user.id) rooms.delete(c); }));

  socket.on('code:join', need(({ code, timeMs } = {}, ack) => {
    { const blk = adminApi.playBlock('play'); if (blk) return ack?.({ error: blk }); }
    if (banErr(user)) return ack?.({ error: banErr(user) });
    code = String(code || '').replace(/\D/g, '');
    if (userGame.has(user.id)) return ack?.({ error: 'Du bist bereits in einem Spiel.' });
    const lob = lobbies4.get(code);
    if (lob) {
      if (lob.seats.includes(user.id)) return ack?.({ error: 'Du bist schon in dieser Lobby.' });
      if (fourBusy(user.id)) return ack?.({ error: 'Du bist schon in einem 4er-Spiel oder einer Lobby.' });
      if (lob.seats.length >= 4) return ack?.({ error: 'Die 4er-Lobby ist schon voll.' });
      if (lob.teams) lob.side[user.id] = lobbySide(lob);
      lob.seats.push(user.id);
      ack?.({ four: true, teams: !!lob.teams });
      if (lob.seats.length === 4) { lobbies4.delete(code); for (const id of lob.seats) emitTo(id, 'four:lobby', { closed: true, started: true }); startFour(lob.seats, lob.timeMs, { teams: lob.teams, side: lob.side }); }
      else emitLobby(lob);
      return;
    }
    const room = rooms.get(code);
    if (room) {
      if (room.hostId === user.id) return ack?.({ error: 'Das ist dein eigener Code – teile ihn mit einem Freund.' });
      if (!online.has(room.hostId)) { rooms.delete(code); return ack?.({ error: 'Der Gastgeber ist nicht mehr online.' }); }
      rooms.delete(code);
      startMatch(room.hostId, user.id, room.timeMs, 'invite', room.variant);
      return ack?.({ ok: true });
    }
    const target = byCode.get(code);
    if (target) {
      if (target.id === user.id) return ack?.({ error: 'Das ist dein eigener Spielercode.' });
      if (!online.has(target.id)) return ack?.({ error: `${target.name} ist gerade offline.` });
      if (userGame.has(target.id)) return ack?.({ error: `${target.name} spielt gerade.` });
      const id = crypto.randomUUID();
      const t = pickTime(timeMs);
      challenges.set(id, { fromId: user.id, toId: target.id, timeMs: t });
      setTimeout(() => challenges.delete(id), 60_000);
      emitTo(target.id, 'challenge:incoming', { id, from: pub(user), timeMs: t });
      return ack?.({ challenged: target.name });
    }
    ack?.({ error: 'Kein Spiel oder Spieler mit diesem Code gefunden.' });
  }));

  // --- Freunde & Chat
  socket.on('users:search', need(({ q } = {}, ack) => {
    const k = nameKey(clean(q, 20));
    if (k.length < 2) return ack?.({ list: [] });
    const list = Object.values(db.users)
      .filter((u) => u.id !== user.id && nameKey(u.name).includes(k))
      .sort((a, b) => (nameKey(a.name).startsWith(k) ? 0 : 1) - (nameKey(b.name).startsWith(k) ? 0 : 1) || (online.has(b.id) - online.has(a.id)) || b.rating - a.rating)
      .slice(0, 12)
      .map((u) => ({ ...pub(u), online: online.has(u.id), relation: relation(user, u) }));
    ack?.({ list });
  }));
  socket.on('friends:list', need((_, ack) => {
    social(user);
    const get = (ids) => ids.map((id) => db.users[id]).filter(Boolean);
    const friends = get(user.friends).map((f) => friendInfo(user, f)).sort((a, b) => (b.unread - a.unread) || (b.online - a.online) || a.name.localeCompare(b.name));
    ack?.({ friends, incoming: get(user.freqIn).map((u) => ({ ...pub(u), online: online.has(u.id) })), outgoing: get(user.freqOut).map((u) => ({ ...pub(u), online: online.has(u.id) })), ...socialSummary(user) });
  }));
  socket.on('friend:request', need(({ id } = {}, ack) => {
    if (banErr(user)) return ack?.({ error: banErr(user) });
    const t = db.users[id];
    if (!t || t.id === user.id) return ack?.({ error: 'Spieler nicht gefunden.' });
    social(user); social(t);
    const rel = relation(user, t);
    if (rel === 'friend') return ack?.({ error: `${t.name} ist schon dein Freund.` });
    if (rel === 'sent') return ack?.({ error: 'Anfrage wurde schon gesendet.' });
    if (rel === 'received') { // er hat dich schon gefragt -> direkt Freunde
      makeFriends(user, t); save();
      emitTo(t.id, 'friend:accepted', { by: { ...pub(user), online: true } });
      return ack?.({ ok: true, friends: true });
    }
    if (user.friends.length >= MAX_FRIENDS) return ack?.({ error: 'Du hast schon sehr viele Freunde.' });
    if (user.freqOut.length >= 50) return ack?.({ error: 'Zu viele offene Anfragen – warte, bis welche beantwortet werden.' });
    user.freqOut.push(t.id); t.freqIn.push(user.id);
    save();
    emitTo(t.id, 'friend:request', { from: { ...pub(user), online: true }, ...socialSummary(t) });
    ack?.({ ok: true });
  }));
  socket.on('friend:respond', need(({ id, accept } = {}, ack) => {
    const t = db.users[id];
    social(user);
    if (!t || !user.freqIn.includes(t.id)) return ack?.({ error: 'Keine Anfrage gefunden.' });
    social(t);
    if (accept) {
      makeFriends(user, t);
      emitTo(t.id, 'friend:accepted', { by: { ...pub(user), online: true } });
    } else {
      user.freqIn = user.freqIn.filter((x) => x !== t.id);
      t.freqOut = t.freqOut.filter((x) => x !== user.id);
    }
    save();
    ack?.({ ok: true, ...socialSummary(user) });
  }));
  socket.on('friend:cancel', need(({ id } = {}, ack) => {
    const t = db.users[id]; social(user);
    user.freqOut = user.freqOut.filter((x) => x !== id);
    if (t) social(t).freqIn = t.freqIn.filter((x) => x !== user.id);
    save(); ack?.({ ok: true });
  }));
  socket.on('friend:remove', need(({ id } = {}, ack) => {
    const t = db.users[id]; social(user);
    user.friends = user.friends.filter((x) => x !== id); delete user.unread[id];
    if (t) { social(t); t.friends = t.friends.filter((x) => x !== user.id); delete t.unread[user.id]; emitTo(t.id, 'friend:removed', { id: user.id }); }
    save(); ack?.({ ok: true });
  }));
  socket.on('chat:history', need(async ({ id } = {}, ack) => {
    const t = db.users[id];
    if (!t || !social(user).friends.includes(id)) return ack?.({ error: 'Ihr seid keine Freunde.' });
    try {
      const msgs = await chatLoad(chatKey(user.id, id));
      if (user.unread[id]) { delete user.unread[id]; save(); }
      ack?.({ friend: friendInfo(user, t), msgs: msgs.slice(-100), ...socialSummary(user) });
    } catch (e) { console.error(e); ack?.({ error: 'Chat konnte nicht geladen werden.' }); }
  }));
  socket.on('chat:read', need(({ id } = {}) => { if (social(user).unread[id]) { delete user.unread[id]; save(); } }));
  const sent = [];
  socket.on('chat:send', need(async ({ id, text } = {}, ack) => {
    if (banErr(user)) return ack?.({ error: banErr(user) });
    const t = db.users[id];
    if (!t || !social(user).friends.includes(id)) return ack?.({ error: 'Du kannst nur Freunden schreiben.' });
    { const blk = adminApi.chatBlock(user); if (blk) return ack?.({ error: blk }); }
    const msg = String(text ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, CHAT_LEN);
    if (!msg) return ack?.({ error: 'Leere Nachricht.' });
    if (badChat(msg)) { adminApi.blockedChat(user, msg, 'chat'); return ack?.({ error: 'Deine Nachricht enthält ein unerlaubtes Wort.' }); }
    const now = Date.now();
    while (sent.length && now - sent[0] > 10_000) sent.shift();
    if (sent.length >= 8) return ack?.({ error: 'Nicht so schnell – warte kurz.' });
    sent.push(now);
    try {
      const key = chatKey(user.id, id);
      const msgs = [...await chatLoad(key), { from: user.id, text: msg, at: now }].slice(-CHAT_KEEP);
      await chatStore(key, msgs);
      social(t).unread[user.id] = (t.unread[user.id] || 0) + 1;
      save();
      const m = { from: user.id, text: msg, at: now };
      emitTo(t.id, 'chat:msg', { from: { ...pub(user), online: true }, msg: m, ...socialSummary(t) });
      ack?.({ msg: m });
    } catch (e) { console.error(e); ack?.({ error: 'Nachricht konnte nicht gesendet werden.' }); }
  }));
  // --- Replays: eigene Partien aus dem Archiv
  socket.on('replays:list', need(async ({ before = null, type = null } = {}, ack) => {
    try {
      const list = await matchList({ uids: [user.id], before: typeof before === 'number' ? before : null, type: ['online', 'four', 'bot'].includes(type) ? type : null, limit: 30 });
      ack?.({ list });
    } catch (e) { console.error(e); ack?.({ error: 'Replays konnten nicht geladen werden.' }); }
  }));
  socket.on('replay:get', need(async ({ id } = {}, ack) => {
    try {
      const m = await matchGet(String(id || ''));
      if (!m || (!m.uids?.includes(user.id) && !isAdmin(user))) return ack?.({ error: 'Diese Partie gibt es nicht (mehr).' });
      ack?.({ match: m });
    } catch (e) { console.error(e); ack?.({ error: 'Replay konnte nicht geladen werden.' }); }
  }));

  // --- Gruppen
  const groupOf = (id) => { const gr = db.groups?.[String(id || '')]; return gr && gr.members.includes(user.id) ? gr : null; };
  const groupName = (n) => clean(n, 24).replace(/\s+/g, ' ');
  socket.on('groups:list', need((_, ack) => {
    ack?.({ groups: myGroups(user).map((gr) => groupInfo(user, gr)).sort((a, b) => (b.last?.at || b.createdAt) - (a.last?.at || a.createdAt)) });
  }));
  socket.on('group:create', need(async ({ name, members = [] } = {}, ack) => {
    if (banErr(user)) return ack?.({ error: banErr(user) });
    const n = groupName(name);
    if (n.length < 2) return ack?.({ error: 'Gib der Gruppe einen Namen (mind. 2 Zeichen).' });
    if (badChat(n) || badWord(n)) return ack?.({ error: 'Der Gruppenname enthält ein unerlaubtes Wort.' });
    if (myGroups(user).length >= MAX_GROUPS) return ack?.({ error: `Du bist schon in ${MAX_GROUPS} Gruppen.` });
    const ids = [...new Set((Array.isArray(members) ? members : []).map(String))].filter((id) => social(user).friends.includes(id) && db.users[id]);
    if (!ids.length) return ack?.({ error: 'Wähle mindestens einen Freund aus.' });
    if (ids.length + 1 > MAX_GROUP) return ack?.({ error: `Höchstens ${MAX_GROUP} Mitglieder pro Gruppe.` });
    const gr = { id: crypto.randomUUID(), name: n, owner: user.id, members: [user.id, ...ids], createdAt: Date.now() };
    await groupSave(gr);
    await groupPost(gr, { sys: true, text: `${user.name} hat die Gruppe „${n}“ erstellt.`, at: Date.now() }, user.id);
    for (const id of ids) emitTo(id, 'group:added', { group: { id: gr.id, name: gr.name }, by: pub(user) });
    ack?.({ group: groupInfo(user, gr) });
  }));
  socket.on('group:history', need(async ({ id } = {}, ack) => {
    const gr = groupOf(id);
    if (!gr) return ack?.({ error: 'Du bist nicht in dieser Gruppe.' });
    try {
      const msgs = await chatLoad('g:' + gr.id);
      if (user.gunread?.[gr.id]) { delete user.gunread[gr.id]; save(); }
      ack?.({ group: groupInfo(user, gr), msgs: msgs.slice(-100), ...socialSummary(user) });
    } catch (e) { console.error(e); ack?.({ error: 'Gruppe konnte nicht geladen werden.' }); }
  }));
  socket.on('group:read', need(({ id } = {}) => { if (user.gunread?.[id]) { delete user.gunread[id]; save(); } }));
  socket.on('group:send', need(async ({ id, text } = {}, ack) => {
    if (banErr(user)) return ack?.({ error: banErr(user) });
    const gr = groupOf(id);
    if (!gr) return ack?.({ error: 'Du bist nicht in dieser Gruppe.' });
    { const blk = adminApi.chatBlock(user); if (blk) return ack?.({ error: blk }); }
    const msg = String(text ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, CHAT_LEN);
    if (!msg) return ack?.({ error: 'Leere Nachricht.' });
    if (badChat(msg)) { adminApi.blockedChat(user, msg, 'chat'); return ack?.({ error: 'Deine Nachricht enthält ein unerlaubtes Wort.' }); }
    const now = Date.now();
    while (sent.length && now - sent[0] > 10_000) sent.shift();
    if (sent.length >= 8) return ack?.({ error: 'Nicht so schnell – warte kurz.' });
    sent.push(now);
    const m = { from: user.id, name: user.name, text: msg, at: now };
    try { await groupPost(gr, m, user.id); ack?.({ msg: m }); }
    catch (e) { console.error(e); ack?.({ error: 'Nachricht konnte nicht gesendet werden.' }); }
  }));
  socket.on('group:add', need(async ({ id, members = [] } = {}, ack) => {
    const gr = groupOf(id);
    if (!gr) return ack?.({ error: 'Du bist nicht in dieser Gruppe.' });
    const ids = [...new Set((Array.isArray(members) ? members : []).map(String))].filter((x) => social(user).friends.includes(x) && db.users[x] && !gr.members.includes(x));
    if (!ids.length) return ack?.({ error: 'Wähle mindestens einen Freund aus, der noch nicht dabei ist.' });
    if (gr.members.length + ids.length > MAX_GROUP) return ack?.({ error: `Höchstens ${MAX_GROUP} Mitglieder pro Gruppe.` });
    gr.members.push(...ids);
    await groupPost(gr, { sys: true, text: `${user.name} hat ${ids.map((x) => db.users[x].name).join(', ')} hinzugefügt.`, at: Date.now() }, user.id);
    for (const x of ids) emitTo(x, 'group:added', { group: { id: gr.id, name: gr.name }, by: pub(user) });
    groupUpdate(gr);
    ack?.({ group: groupInfo(user, gr) });
  }));
  socket.on('group:rename', need(async ({ id, name } = {}, ack) => {
    const gr = groupOf(id);
    if (!gr) return ack?.({ error: 'Du bist nicht in dieser Gruppe.' });
    const n = groupName(name);
    if (n.length < 2) return ack?.({ error: 'Der Name braucht mindestens 2 Zeichen.' });
    if (badChat(n) || badWord(n)) return ack?.({ error: 'Der Gruppenname enthält ein unerlaubtes Wort.' });
    gr.name = n;
    await groupPost(gr, { sys: true, text: `${user.name} hat die Gruppe in „${n}“ umbenannt.`, at: Date.now() }, user.id);
    groupUpdate(gr);
    ack?.({ group: groupInfo(user, gr) });
  }));
  socket.on('group:leave', need(async ({ id } = {}, ack) => {
    const gr = groupOf(id);
    if (!gr) return ack?.({ error: 'Du bist nicht in dieser Gruppe.' });
    gr.members = gr.members.filter((x) => x !== user.id);
    if (user.gunread) delete user.gunread[gr.id];
    if (!gr.members.length) { await groupDelete(gr.id); save(); return ack?.({ ok: true }); }
    if (gr.owner === user.id) gr.owner = gr.members[0];
    await groupPost(gr, { sys: true, text: `${user.name} hat die Gruppe verlassen.`, at: Date.now() });
    groupUpdate(gr);
    ack?.({ ok: true });
  }));
  // Aus der Gruppe heraus eine 2-vs-2- oder 4er-Lobby öffnen und alle einladen
  socket.on('group:play', need(async ({ id, teams = true, timeMs = 300_000 } = {}, ack) => {
    { const blk = adminApi.playBlock('four'); if (blk) return ack?.({ error: blk }); }
    const gr = groupOf(id);
    if (!gr) return ack?.({ error: 'Du bist nicht in dieser Gruppe.' });
    const r = createFourLobby(user, timeMs, teams);
    if (r.error) return ack?.(r);
    const mode = teams ? '2 vs 2' : '4er-Schach';
    const m = { from: user.id, name: user.name, text: `⚔️ ${mode}: Wer spielt mit? Code ${r.lobby.code}`, at: Date.now(), invite: { code: r.lobby.code, teams: !!teams, timeMs: r.lobby.timeMs } };
    await groupPost(gr, m, user.id);
    ack?.({ ...r, msg: m });
  }));

  // Freund direkt zu einer Partie herausfordern
  socket.on('friend:challenge', need(({ id, timeMs } = {}, ack) => {
    { const blk = adminApi.playBlock('play'); if (blk) return ack?.({ error: blk }); }
    if (banErr(user)) return ack?.({ error: banErr(user) });
    const t = db.users[id];
    if (!t || !social(user).friends.includes(id)) return ack?.({ error: 'Nur Freunde kannst du so herausfordern.' });
    if (userGame.has(user.id) || fourBusy(user.id)) return ack?.({ error: 'Du bist bereits in einem Spiel.' });
    if (!online.has(t.id)) return ack?.({ error: `${t.name} ist gerade offline.` });
    if (userGame.has(t.id) || fourBusy(t.id)) return ack?.({ error: `${t.name} spielt gerade.` });
    const cid = crypto.randomUUID();
    const tm = pickTime(timeMs);
    challenges.set(cid, { fromId: user.id, toId: t.id, timeMs: tm });
    setTimeout(() => challenges.delete(cid), 60_000);
    emitTo(t.id, 'challenge:incoming', { id: cid, from: pub(user), timeMs: tm });
    ack?.({ ok: true });
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
  socket.on('queue:join', need(({ timeMs } = {}, ack) => {
    { const blk = adminApi.playBlock('random'); if (blk) return ack?.({ error: blk }); }
    if (banErr(user)) return ack?.({ error: banErr(user) });
    if (userGame.has(user.id)) return ack?.({ error: 'Du bist bereits in einem Spiel.' });
    const t = RANDOM_TIMES.includes(timeMs) ? timeMs : 600_000;
    queue = queue.filter((q) => q.userId !== user.id && online.has(q.userId));
    // Gegner mit derselben Bedenkzeit und möglichst ähnlicher Wertung
    let best = null;
    for (const q of queue) {
      if ((q.timeMs || 600_000) !== t) continue;
      const diff = Math.abs(db.users[q.userId].rating - user.rating);
      if (!best || diff < best.diff) best = { q, diff };
    }
    if (best) { ack?.({ ok: true, matched: true }); startMatch(best.q.userId, user.id, t, 'random'); return; }
    queue.push({ userId: user.id, since: Date.now(), timeMs: t });
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
    if (g.paused) return ack?.({ error: 'Das Spiel ist pausiert – warte, bis dein Gegner wieder da ist.', fen: g.chess.fen() });
    if (g.chess.turn() !== color) return ack?.({ error: 'Du bist nicht am Zug.', fen: g.chess.fen() });
    let m;
    try { m = g.chess.move({ from, to, promotion: promotion || 'q' }); } catch { m = null; }
    if (!m) return ack?.({ error: 'Ungültiger Zug.', fen: g.chess.fen() });
    const now = Date.now();
    (g.moveTimes ||= { w: [], b: [] })[color].push(now - (g.lastMoveAt || g.lastTick));
    g.lastMoveAt = now;
    if (g.started && g.timeMs) g.clock[color] -= now - g.lastTick;
    if (!g.started && g.chess.history().length >= 2) g.started = true; // Uhr läuft ab dem 2. Zug
    g.lastTick = now;
    if (g.drawOffer && g.drawOffer !== color) g.drawOffer = null;
    ack?.({ ok: true });
    sendState(g, { san: m.san, flags: m.flags, captured: m.captured, check: g.chess.inCheck() });
    checkGameEnd(g);
  }));

  // Abgleich: Client meldet seinen Stand, bei Abweichung bekommt er die echte Stellung
  socket.on('game:sync', need(({ id, ply, fen } = {}, ack) => {
    const g = games.get(userGame.get(user.id));
    if (!g || g.status === 'over') return ack?.({ gone: true });
    if (g.id !== id) return ack?.({ resync: { ...gamePayload(g, user.id), resumed: true } });
    if (g.status !== 'playing') return ack?.({ ok: true });
    const okSync = ply === g.chess.history().length && fen === g.chess.fen();
    if (!okSync) return ack?.({ resync: { ...gamePayload(g, user.id), resumed: true } });
    ack?.({ ok: true, clock: clockState(g), opponentOnline: online.has(opponentOf(g, user.id)) });
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
  socket.on('bot:finish', need(({ botId, color, moves, resigned, startedAt } = {}, ack) => {
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
    const matchId = crypto.randomUUID();
    let coins = 0;
    if (outcome === 'win') coins = bot.reward;
    else if (outcome === 'draw') coins = Math.round(bot.reward / 3);
    else if (moves.length >= 10) coins = REWARDS.botLoss;
    coins = adminApi.coins(coins);
    user.lastBotAt = now;
    user.coins += coins;
    user.stats.botGames++;
    if (outcome === 'win') { user.stats.botWins++; user.stats.mates++; }
    ensureVs(user);
    const hEntry = { type: 'bot', matchId, opponent: bot.name, oppAvatar: { type: 'emoji', value: bot.avatar, color: bot.color }, outcome, reason, coins, rating: 0, moves: moves.length, at: now };
    addVs(user, hEntry);
    user.history.unshift(hEntry);
    user.history = user.history.slice(0, 50);
    try { adminApi.afterBot(user, bot, outcome, moves.length, Number.isFinite(startedAt) && startedAt < now ? startedAt : null); } catch (e) { console.error('Anti-Cheat:', e.message); }
    save();
    archiveMatch({
      id: matchId, type: 'bot', at: now, uids: [user.id], moves: moves.map((m) => ({ from: m.from, to: m.to, promotion: m.promotion })),
      result: outcome, reason, plies: moves.length, players: { user: { id: user.id, name: user.name, color, coins, outcome }, bot: { id: bot.id, name: bot.name, avatar: bot.avatar } },
    });
    ack?.({ coins, outcome, profile: priv(user), matchId });
  }));

  socket.on('leaderboard', (_, ack) => {
    const list = Object.values(db.users).filter((u) => u.stats.games > 0) // nur wer schon online gespielt hat
      .sort((a, b) => b.rating - a.rating || b.stats.wins - a.stats.wins).slice(0, 50)
      .map((u) => ({ ...pub(u), online: online.has(u.id), losses: u.stats.losses, draws: u.stats.draws, botWins: u.stats.botWins }));
    ack?.({ list });
  });

  socket.on('disconnect', () => {
    if (!user || online.get(user.id) !== socket) return;
    online.delete(user.id);
    adminApi.onDisconnect(user);
    notifyFriends(user, false);
    queue = queue.filter((q) => q.userId !== user.id);
    for (const [c, r] of rooms) if (r.hostId === user.id) rooms.delete(c);
    leaveLobby(user.id);
    const g4 = fourGameOf(user.id);
    if (g4 && g4.status === 'playing' && g4.state.alive[fourColorOf(g4, user.id)]) {
      const uid = user.id;
      g4.disconnect[uid] = setTimeout(() => fourEliminate(g4, fourColorOf(g4, uid), 'abandon'), FOUR_ABANDON_MS);
      fourBroadcast(g4, 'four:state', { events: [{ type: 'offline', color: fourColorOf(g4, uid), until: Date.now() + FOUR_ABANDON_MS }] });
    }
    const g = games.get(userGame.get(user.id));
    if (g && g.status !== 'over') {
      const uid = user.id, deadline = Date.now() + RECONNECT_MS;
      (g.deadline ||= {})[uid] = deadline;
      pauseGame(g, { uid, lostAt: socket.data.lastSeen }); // Uhr anhalten, bis er wieder da ist
      emitTo(opponentOf(g, uid), 'game:opponent', { online: false, deadline, paused: g.status === 'playing' });
      g.disconnect[uid] = setTimeout(() => onAbsent(g, uid), RECONNECT_MS);
    }
    broadcastStats();
  });
});

try {
  await loadDb();
} catch (e) {
  console.error('❌ Datenbank konnte nicht geladen werden:', e.message);
  process.exit(1); // lieber neu starten als mit leerer Datenbank alles zu überschreiben
}
for (const u of Object.values(db.users)) { byToken.set(u.token, u); byCode.set(u.code, u); }
migrateUsers();
await adminApi.init();
server.listen(PORT, () => console.log(`♞ SchachArena läuft auf http://localhost:${PORT}`));
