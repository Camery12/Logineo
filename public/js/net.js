// Ersetzt den Node-Server, wenn die Seite als Claude-Artefakt läuft.
// Profile/Münzen: db-Speicher (privat pro Spieler) + öffentliche Spielerliste.
// Online-Spiele: Echtzeit-Räume (presence). Gleiche Schnittstelle wie socket.io.
import { Chess } from '../vendor/chess.js';
import { REWARDS, BOTS, findItem, AVATAR_EMOJIS, AVATAR_COLORS } from './catalog.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const withTimeout = (p, ms, fb = null) => Promise.race([Promise.resolve(p).catch(() => fb), sleep(ms).then(() => fb)]);
const rint = (n) => Math.floor(Math.random() * n);
const digits = (n) => String(1 + rint(9)) + Array.from({ length: n - 1 }, () => rint(10)).join('');
const pick = (a) => a[rint(a.length)];
const clone = (o) => JSON.parse(JSON.stringify(o));
const LS = {
  get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* egal */ } },
  del(k) { try { localStorage.removeItem(k); } catch { /* egal */ } },
};
function stableDigits(str, n) {
  let x = 2166136261;
  for (const c of str) { x ^= c.charCodeAt(0); x = Math.imul(x, 16777619) >>> 0; }
  let out = '';
  while (out.length < n) { x = Math.imul(x ^ (x >>> 15), 2246822507) >>> 0; x = (x ^ (x >>> 13)) >>> 0; out += String(x % 10); }
  return (out[0] === '0' ? '7' : out[0]) + out.slice(1);
}
const slug = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
const clean = (s, n) => String(s ?? '').replace(/[<>\u0000-\u001f]/g, '').trim().slice(0, n);
const ALLOWED_TIMES = [0, 60_000, 180_000, 300_000, 600_000, 900_000];
const VOTE_MS = 12000, ABANDON_MS = 45000;
const NO_ONLINE = 'Online-Spiele gehen nur auf der veröffentlichten Claude-Seite (angemeldet).';

export function createSocket() {
  const handlers = {};
  const fire = (ev, d) => (handlers[ev] || []).forEach((f) => { try { f(d); } catch (e) { console.error(e); } });
  const toast = (text, type = '') => fire('toast', { text, type });

  let db = null, room = null, uid = null, dbBlocked = false;
  let profile = null;
  let lobby = { status: 'idle' }, lobbyPeers = [];
  let G = null;
  const seenChallenges = new Set();
  let myChallenge = null;
  const avatarCache = new Map();

  // ------------------------------------------------------------ Profil & Speicher
  const privDoc = () => db.doc(`data/users/${uid}/profile`);
  const canDb = () => db && !dbBlocked && uid && !uid.startsWith('local-');

  function newUser() {
    return {
      id: uid, code: stableDigits(uid, 8), name: 'Spieler' + (1000 + rint(9000)),
      avatar: { type: 'emoji', value: pick(AVATAR_EMOJIS), color: pick(AVATAR_COLORS) },
      coins: REWARDS.start, rating: 1200,
      stats: { games: 0, wins: 0, losses: 0, draws: 0, botWins: 0, botGames: 0, mates: 0 },
      owned: { board: ['klassisch'], pieces: ['klassisch'], finisher: ['klassisch'], shape: ['klassisch'] },
      equipped: { board: 'klassisch', pieces: 'klassisch', finisher: 'klassisch' },
      history: [], createdAt: Date.now(),
    };
  }

  let writing = false, dirty = false;
  async function save() {
    LS.set('sa-profile-' + uid, profile);
    if (!canDb()) return;
    dirty = true;
    if (writing) return;
    writing = true;
    while (dirty) {
      dirty = false;
      try {
        await privDoc().set(clone(profile));
        await db.doc('players/' + uid).set({
          name: profile.name, avatar: profile.avatar, rating: profile.rating,
          games: profile.stats.games, wins: profile.stats.wins, losses: profile.stats.losses,
          draws: profile.stats.draws, botWins: profile.stats.botWins, at: Date.now(),
        });
      } catch (e) {
        if (['invalid_argument', 'not_granted', 'revoked', 'capability_disabled'].includes(e?.code)) dbBlocked = true;
        break;
      }
    }
    writing = false;
  }

  const fullPub = () => ({ id: uid, name: profile.name, avatar: profile.avatar, rating: profile.rating, equipped: profile.equipped, stats: { games: profile.stats.games, wins: profile.stats.wins } });
  const smallPub = () => {
    const p = fullPub();
    if (p.avatar.type === 'image') p.avatar = { type: 'image', ref: true };
    return p;
  };
  const priv = () => ({ ...fullPub(), code: profile.code, coins: profile.coins, owned: profile.owned, stats: profile.stats, history: profile.history.slice(0, 30) });

  async function resolvePub(p) {
    if (!p) return { name: 'Gegner', avatar: { type: 'emoji', value: '♟', color: '#64748b' }, rating: 1200, equipped: { board: 'klassisch', pieces: 'klassisch', finisher: 'klassisch' }, stats: {} };
    if (p.id === uid) return fullPub();
    if (p.avatar?.ref) {
      let img = avatarCache.get(p.id);
      if (!img && db) {
        const s = await withTimeout(db.doc('players/' + p.id).get(), 4000, null);
        img = s?.exists ? s.data().avatar : null;
        if (img) avatarCache.set(p.id, img);
      }
      return { ...p, avatar: img || { type: 'emoji', value: '♟', color: '#64748b' } };
    }
    return p;
  }

  // ------------------------------------------------------------ Start
  async function init() {
    const C = window.claude;
    const use = (n) => (C?.use ? withTimeout(C.use(n), 12000, null) : Promise.resolve(null));
    const [d, u, r] = await Promise.all([use('db'), use('user'), use('room')]);
    db = d; room = r;
    uid = u ? await withTimeout(u.id(), 5000, null) : null;
    if (!uid) { uid = LS.get('sa-uid') || 'local-' + Math.random().toString(36).slice(2, 12); LS.set('sa-uid', uid); }
    let remote = null;
    if (canDb()) {
      const s = await withTimeout(privDoc().get(), 10000, null);
      if (s?.exists) remote = s.data();
    }
    profile = clone(remote || LS.get('sa-profile-' + uid) || newUser());
    profile.owned.shape ||= ['klassisch']; profile.equipped.shape ||= 'klassisch'; // Formen (seit 1.15)
    const base = newUser();
    for (const k of Object.keys(base)) if (profile[k] === undefined) profile[k] = base[k];
    profile.id = uid; profile.code = stableDigits(uid, 8);
    if (!remote) save();
    fire('connect');
    if (room) startLobby();
    else setTimeout(() => toast(NO_ONLINE, 'warn'), 1500);
  }
  setTimeout(init, 0);

  // ------------------------------------------------------------ Lobby
  const pUid = (p) => p.by || p.presence?.uid;
  function setLobby(patch) {
    Object.assign(lobby, patch);
    room?.presence({ ...patch }).catch(() => {});
  }
  function startLobby() {
    lobby = { uid, code: profile.code, pub: smallPub(), status: 'idle', since: 0, invite: null, challenge: null, accept: null, decline: null };
    room.presence(lobby).catch(() => {});
    room.onPeers((ch) => { lobbyPeers = ch.peers; onLobby(); }, () => {});
    setInterval(() => { if (room) onLobby(); }, 2000);
    const saved = LS.get('sa-game-' + uid);
    if (saved && Date.now() - saved.at < 30 * 60_000) resumeGame(saved);
    else LS.del('sa-game-' + uid);
  }
  const refreshLobbyPub = () => { if (room) setLobby({ pub: smallPub() }); };

  async function onLobby() {
    const viewers = lobbyPeers.filter((p) => p.kind !== 'agent');
    const uids = new Set(viewers.map(pUid).filter(Boolean));
    const playing = new Set(viewers.filter((p) => p.presence?.status === 'playing').map(pUid));
    const seekers = viewers.filter((p) => p.presence?.status === 'seeking');
    fire('stats', { online: Math.max(1, uids.size), playing: playing.size, queue: seekers.length });

    // Eingehende Herausforderungen
    for (const p of viewers) {
      const c = p.presence?.challenge;
      if (!c || p.sameTab || c.to !== profile.code || seenChallenges.has(c.id) || Date.now() - c.at > 60_000) continue;
      if (G && !G.over) continue;
      seenChallenges.add(c.id);
      fire('challenge:incoming', { id: c.id, from: await resolvePub(p.presence.pub) });
    }
    // Antwort auf meine Herausforderung
    if (myChallenge) {
      const acc = viewers.find((p) => !p.sameTab && p.presence?.accept === myChallenge.id);
      const dec = viewers.find((p) => !p.sameTab && p.presence?.decline === myChallenge.id);
      if (acc) { const id = myChallenge.id; myChallenge = null; setLobby({ challenge: null }); joinGame('ch-' + id, 'host', 600_000); }
      else if (dec) { myChallenge = null; setLobby({ challenge: null }); toast(`${dec.presence.pub?.name || 'Der Spieler'} hat deine Herausforderung abgelehnt.`, 'warn'); }
    }
    // Zufalls-Matchmaking: alle Suchenden deterministisch paaren
    if (lobby.status === 'seeking' && !G) {
      const seen = new Set();
      const list = seekers.filter((p) => { const k = pUid(p) + (p.isMe ? p.peer : ''); if (seen.has(k)) return false; seen.add(k); return true; })
        .sort((a, b) => (a.presence.since - b.presence.since) || (a.peer < b.peer ? -1 : 1));
      const i = list.findIndex((p) => p.sameTab);
      if (i >= 0) {
        const partner = list[i % 2 === 0 ? i + 1 : i - 1];
        if (partner) {
          const a = list[i - (i % 2)], b = list[i - (i % 2) + 1];
          const gid = 'r-' + slug(a.peer).slice(0, 14) + slug(b.peer).slice(0, 14) + (a.presence.since % 100000);
          setLobby({ status: 'playing' });
          joinGame(gid, i % 2 === 0 ? 'host' : 'guest', 600_000, true);
        }
      }
    }
  }

  // ------------------------------------------------------------ Spiele (benannte Räume)
  const encMove = (m, spent) => `${m.from}${m.to}${m.promotion || ''}.${Math.round(spent / 100)}`;
  const decMove = (s) => { const [mv, sp] = String(s).split('.'); return { from: mv.slice(0, 2), to: mv.slice(2, 4), promotion: mv[4] || undefined, spent: (+sp || 0) * 100 }; };

  async function joinGame(gid, role, timeMs, isRandom = false, restore = null) {
    if (G) await leaveGame();
    let r;
    try { r = await room.join('g-' + gid); }
    catch { toast('Spielraum konnte nicht betreten werden.', 'warn'); setLobby({ status: 'idle' }); return false; }
    G = {
      gid, role, r, timeMs, isRandom, peers: [], opp: null, oppSeen: false,
      setup: restore?.setup || null, board: restore?.board || null, decision: restore?.decision || null,
      status: 'wait', chess: new Chess(), spent: { w: 0, b: 0 }, turnStart: Date.now(), over: false,
      voteShown: false, votesKey: '', emoteSeen: 0, drawSeen: 0, answerSeen: 0, offerN: 0, emoteN: 0, players: null, myColor: null,
    };
    G.mine = {
      role, uid, pub: smallPub(), timeMs: role === 'host' ? timeMs : null,
      setup: role === 'host' ? G.setup : null, board: role === 'host' ? G.board : null, decision: role === 'host' ? G.decision : null,
      moves: restore?.moves || [], vote: null, resign: false, drawOffer: null, drawAnswer: null, emote: null, over: null,
    };
    await r.presence(G.mine).catch(() => {});
    r.onPeers((ch) => { if (G && G.r === r) { G.peers = ch.peers; onGame(); } }, () => {});
    persistGame();
    const g = G;
    if (role === 'guest' || isRandom) {
      setTimeout(() => {
        if (G !== g || G.setup || G.oppSeen) return;
        leaveGame();
        if (isRandom) { setLobby({ status: 'seeking', since: Date.now() }); }
        else { setLobby({ status: 'idle' }); toast('Kein Gegner im Spielraum gefunden.', 'warn'); }
      }, role === 'guest' ? 12000 : 9000);
    }
    return true;
  }

  function pres(patch) {
    if (!G) return;
    Object.assign(G.mine, patch);
    G.r.presence(patch).catch(() => {});
    persistGame();
  }
  function persistGame() {
    if (!G || G.over) return;
    LS.set('sa-game-' + uid, { gid: G.gid, role: G.role, timeMs: G.timeMs, moves: G.mine.moves, setup: G.setup, board: G.board, decision: G.decision, at: Date.now() });
  }
  async function leaveGame() {
    const g = G; G = null;
    clearTimeout(g?.abandonTimer); clearTimeout(g?.voteTimer);
    LS.del('sa-game-' + uid);
    try { await g?.r.leave(); } catch { /* egal */ }
  }
  function resumeGame(s) {
    joinGame(s.gid, s.role, s.timeMs, false, s);
  }

  const oppPeer = () => G.peers.find((p) => !p.sameTab && p.kind !== 'agent' && p.presence?.role && p.presence.role !== G.role);
  const colorOfRole = (role) => (G.setup.w === role ? 'w' : 'b');

  function clockState() {
    const t = G.chess.turn();
    const started = G.chess.history().length >= 2;
    const run = G.status === 'playing' && !G.over && started && G.timeMs ? t : null;
    const c = { w: G.timeMs - G.spent.w, b: G.timeMs - G.spent.b };
    if (run) c[run] -= Date.now() - G.turnStart;
    return { w: Math.max(0, c.w), b: Math.max(0, c.b), running: run, unlimited: !G.timeMs };
  }

  async function onGame() {
    if (!G) return;
    const g = G;
    const opp = oppPeer();
    const op = opp?.presence;
    // Verbindung des Gegners
    if (opp) {
      g.oppSeen = true;
      if (g.oppGone) { g.oppGone = false; clearTimeout(g.abandonTimer); fire('game:opponent', { online: true }); }
    } else if (g.status === 'playing' && !g.over && g.oppSeen && !g.oppGone) {
      g.oppGone = true;
      const deadline = Date.now() + ABANDON_MS;
      fire('game:opponent', { online: false, deadline });
      g.abandonTimer = setTimeout(() => { if (G === g && g.oppGone && !g.over) finish(g.myColor, 'abandon'); }, ABANDON_MS);
    }
    if (!op) return;

    // Aufbau: Host verteilt die Farben
    if (!g.setup) {
      if (g.role === 'host' && op.role === 'guest' && op.pub) {
        const setup = Math.random() < 0.5 ? { w: 'host', b: 'guest' } : { w: 'guest', b: 'host' };
        g.setup = setup;
        const mb = profile.equipped.board, ob = op.pub.equipped?.board || 'klassisch';
        if (mb === ob) { g.board = mb; g.decision = 'gleich'; }
        pres({ setup, board: g.board, decision: g.decision, timeMs: g.timeMs });
      } else if (g.role === 'guest' && op.setup) {
        g.setup = op.setup; g.timeMs = op.timeMs ?? 600_000;
      } else return;
    }
    if (g.role === 'guest' && op.timeMs != null) g.timeMs = op.timeMs;
    g.myColor = colorOfRole(g.role);
    const oppColor = g.myColor === 'w' ? 'b' : 'w';
    if (!g.players || !g.players[oppColor].name || g.players[oppColor].avatar?.ref) {
      g.players = { [g.myColor]: fullPub(), [oppColor]: await resolvePub(op.pub) };
      if (G !== g) return;
    }
    const lobbyAndQueue = () => { setLobby({ status: 'playing', invite: null }); };

    // Brett-Abstimmung
    if (g.status === 'wait') {
      if (g.role === 'guest' && op.board) { g.board = op.board; g.decision = op.decision; }
      if (g.board) { lobbyAndQueue(); return startPlaying(); }
      if (!g.voteShown) {
        g.voteShown = true; lobbyAndQueue();
        const host = g.role === 'host' ? fullPub() : g.players[oppColor];
        const guest = g.role === 'guest' ? fullPub() : g.players[oppColor];
        g.voteOptions = [{ board: host.equipped.board, by: host }, { board: guest.equipped.board, by: guest }];
        fire('match:vote', { gameId: g.gid, options: g.voteOptions, deadline: Date.now() + VOTE_MS, duration: VOTE_MS, players: g.players, you: g.myColor });
        if (g.role === 'host') g.voteTimer = setTimeout(() => decideBoard(true), VOTE_MS + 300);
      }
      const votes = {};
      if (g.mine.vote) votes[uid] = g.mine.vote;
      if (op.vote) votes[g.players[oppColor].id || 'opp'] = op.vote;
      const key = JSON.stringify(votes);
      if (key !== g.votesKey) { g.votesKey = key; fire('match:voteUpdate', { gameId: g.gid, votes }); }
      if (g.role === 'host' && g.mine.vote && op.vote) setTimeout(() => decideBoard(false), 900);
      return;
    }

    if (g.status !== 'playing') return;
    // Gegnerzüge anwenden
    applyMoves();
    if (g.over) return;
    if (op.over && !g.over) return finish(op.over.result, op.over.reason, true);
    if (op.resign) return finish(g.myColor, 'resign');
    // Remis
    if (op.drawOffer && op.drawOffer.n !== g.drawSeen && G.chess.history().length - op.drawOffer.at <= 1) {
      g.drawSeen = op.drawOffer.n;
      fire('game:state', { id: g.gid, fen: g.chess.fen(), lastMove: lastMove(), clock: clockState(), drawOffer: oppColor });
    }
    if (op.drawAnswer && g.mine.drawOffer && op.drawAnswer.n === g.mine.drawOffer.n && op.drawAnswer.n !== g.answerSeen) {
      g.answerSeen = op.drawAnswer.n;
      if (op.drawAnswer.accept) return finish('draw', 'agreement');
      pres({ drawOffer: null });
      fire('game:state', { id: g.gid, fen: g.chess.fen(), lastMove: lastMove(), clock: clockState(), drawOffer: null, drawDeclined: true });
    }
    if (op.emote && op.emote.n !== g.emoteSeen) { g.emoteSeen = op.emote.n; fire('game:emote', { emote: op.emote.e }); }
  }

  function decideBoard(timeout) {
    const g = G;
    if (!g || g.board || g.status !== 'wait') return;
    clearTimeout(g.voteTimer);
    const op = oppPeer()?.presence;
    const votes = [g.mine.vote, op?.vote].filter(Boolean);
    if (!timeout && votes.length < 2) return;
    let board, decision;
    if (votes.length === 2 && votes[0] === votes[1]) { board = votes[0]; decision = 'einig'; }
    else if (votes.length === 1) { board = votes[0]; decision = 'einzige Stimme'; }
    else { board = pick(votes.length ? votes : g.voteOptions.map((o) => o.board)); decision = 'zufall'; }
    g.board = board; g.decision = decision;
    pres({ board, decision });
    startPlaying();
  }

  const lastMove = () => { const h = G.chess.history({ verbose: true }).at(-1); return h ? { from: h.from, to: h.to, san: h.san } : null; };

  function startPlaying() {
    const g = G;
    if (g.status === 'playing') return;
    g.status = 'playing';
    g.turnStart = Date.now();
    applyMoves(true);
    persistGame();
    const players = g.players;
    fire('game:start', {
      id: g.gid, fen: g.chess.fen(), moves: g.chess.history({ verbose: true }).map((m) => ({ san: m.san, from: m.from, to: m.to })),
      status: 'playing', board: g.board, you: g.myColor, players,
      skins: { w: players.w.equipped?.pieces || 'klassisch', b: players.b.equipped?.pieces || 'klassisch' },
      clock: clockState(), timeMs: g.timeMs, drawOffer: null, boardDecision: g.decision, resumed: g.mine.moves.length > 0,
    });
    if (!g.over) checkEnd();
  }

  // Wendet alle noch fehlenden Halbzüge (beider Seiten) aus den Presence-Listen an
  function applyMoves(silent = false) {
    const g = G;
    const op = oppPeer()?.presence;
    while (true) {
      const ply = g.chess.history().length;
      const color = ply % 2 ? 'b' : 'w';
      const list = color === g.myColor ? g.mine.moves : op?.moves;
      const enc = list?.[ply >> 1];
      if (!enc) break;
      const d = decMove(enc);
      let m;
      try { m = g.chess.move({ from: d.from, to: d.to, promotion: d.promotion }); } catch { m = null; }
      if (!m) break;
      g.spent[color] += d.spent;
      g.turnStart = Date.now();
      if (!silent) fire('game:state', { id: g.gid, fen: g.chess.fen(), lastMove: { from: m.from, to: m.to, san: m.san }, clock: clockState(), drawOffer: null, san: m.san, flags: m.flags, captured: m.captured, check: g.chess.inCheck() });
      if (checkEnd()) break;
    }
  }

  function checkEnd() {
    const c = G.chess;
    if (c.isCheckmate()) { finish(c.turn() === 'w' ? 'b' : 'w', 'checkmate'); return true; }
    if (c.isStalemate()) { finish('draw', 'stalemate'); return true; }
    if (c.isInsufficientMaterial()) { finish('draw', 'insufficient'); return true; }
    if (c.isThreefoldRepetition()) { finish('draw', 'repetition'); return true; }
    if (c.isDraw()) { finish('draw', 'fifty'); return true; }
    return false;
  }

  setInterval(() => {
    const g = G;
    if (!g || g.status !== 'playing' || g.over || !g.timeMs || g.chess.history().length < 2) return;
    const cs = clockState(), t = g.chess.turn();
    if (t === g.myColor && cs[t] <= 0) finish(t === 'w' ? 'b' : 'w', 'timeout');
    else if (t !== g.myColor && g.timeMs - g.spent[t] - (Date.now() - g.turnStart) < -2500) finish(g.myColor, 'timeout');
  }, 250);

  function elo(ra, rb, score) { return Math.round(32 * (score - 1 / (1 + 10 ** ((rb - ra) / 400)))); }

  function finish(result, reason, fromOpp = false) {
    const g = G;
    if (!g || g.over) return;
    g.over = true;
    clearTimeout(g.abandonTimer);
    if (!fromOpp) pres({ over: { result, reason } });
    const me = g.myColor, oppColor = me === 'w' ? 'b' : 'w';
    const opp = g.players[oppColor];
    const outcome = result === 'draw' ? 'draw' : result === me ? 'win' : 'loss';
    const plies = g.chess.history().length;
    let coins = outcome === 'win' ? REWARDS.win : outcome === 'draw' ? REWARDS.draw : REWARDS.loss;
    if (plies < 4 && reason !== 'checkmate') coins = outcome === 'win' ? Math.round(REWARDS.win / 4) : 0;
    const d = elo(profile.rating, opp.rating || 1200, outcome === 'win' ? 1 : outcome === 'draw' ? 0.5 : 0);
    profile.coins += coins; profile.rating = Math.max(100, profile.rating + d);
    profile.stats.games++; profile.stats[outcome === 'win' ? 'wins' : outcome === 'loss' ? 'losses' : 'draws']++;
    if (outcome === 'win' && reason === 'checkmate') profile.stats.mates++;
    profile.history.unshift({ type: 'online', opponent: opp.name, oppAvatar: opp.avatar, outcome, reason, coins, rating: d, moves: plies, at: Date.now() });
    profile.history = profile.history.slice(0, 50);
    save(); refreshLobbyPub();
    const winner = result === 'draw' ? null : g.players[result];
    LS.del('sa-game-' + uid);
    fire('game:over', {
      id: g.gid, result, reason, outcome, coins, ratingChange: d,
      finisher: reason === 'checkmate' && winner ? (winner.equipped?.finisher || 'klassisch') : null,
      winnerName: winner?.name || null, fen: g.chess.fen(), board: g.board,
      skins: { w: g.players.w.equipped?.pieces || 'klassisch', b: g.players.b.equipped?.pieces || 'klassisch' }, profile: priv(),
    });
    setTimeout(() => { if (G === g) { leaveGame(); setLobby({ status: 'idle' }); } }, 6000);
  }

  // ------------------------------------------------------------ Anfragen der App
  const api = {
    auth: () => ({ token: uid, profile: priv() }),

    'profile:update': ({ name, avatar }) => {
      if (name !== undefined) {
        const n = clean(name, 20);
        if (n.length < 2) return { error: 'Der Name braucht mindestens 2 Zeichen.' };
        profile.name = n;
      }
      if (avatar) {
        if (avatar.type === 'emoji' && AVATAR_EMOJIS.includes(avatar.value) && /^#[0-9a-f]{6}$/i.test(avatar.color)) profile.avatar = { type: 'emoji', value: avatar.value, color: avatar.color };
        else if (avatar.type === 'image' && /^data:image\/(png|jpeg|webp);base64,/.test(avatar.value || '') && avatar.value.length < 120_000) profile.avatar = { type: 'image', value: avatar.value };
        else return { error: 'Ungültiges Profilbild.' };
        avatarCache.delete(uid);
      }
      save(); refreshLobbyPub();
      return { profile: priv() };
    },

    'shop:buy': ({ kind, id }) => {
      const item = findItem(kind, id);
      if (!item) return { error: 'Unbekannter Artikel.' };
      if (profile.owned[kind].includes(id)) return { error: 'Schon in deinem Besitz.' };
      if (profile.coins < item.price) return { error: `Dir fehlen ${item.price - profile.coins} Münzen.` };
      profile.coins -= item.price; profile.owned[kind].push(id); profile.equipped[kind] = id;
      save(); refreshLobbyPub();
      return { profile: priv() };
    },
    'shop:equip': ({ kind, id }) => {
      if (!findItem(kind, id) || !profile.owned[kind]?.includes(id)) return { error: 'Nicht in deinem Besitz.' };
      profile.equipped[kind] = id; save(); refreshLobbyPub();
      return { profile: priv() };
    },

    'room:create': async ({ timeMs = 600_000 }) => {
      if (!room) return { error: NO_ONLINE };
      if (G && !G.over) return { error: 'Du bist bereits in einem Spiel.' };
      const code = digits(6);
      const t = ALLOWED_TIMES.includes(timeMs) ? timeMs : 600_000;
      if (!(await joinGame('inv-' + code, 'host', t))) return { error: 'Raum konnte nicht erstellt werden.' };
      setLobby({ status: 'hosting', invite: code });
      return { code };
    },
    'room:cancel': () => { if (G && G.status === 'wait') leaveGame(); setLobby({ status: 'idle', invite: null }); },

    'code:join': async ({ code }) => {
      code = String(code || '').replace(/\D/g, '');
      if (!room) return { error: NO_ONLINE };
      if (G && !G.over) return { error: 'Du bist bereits in einem Spiel.' };
      const find = (f) => lobbyPeers.find((p) => !p.sameTab && f(p.presence || {}));
      if (code.length === 6) {
        if (lobby.invite === code) return { error: 'Das ist dein eigener Code – teile ihn mit einem Freund.' };
        let host = find((pr) => pr.invite === code);
        if (!host) { await sleep(1500); host = find((pr) => pr.invite === code); }
        if (!host) return { error: 'Kein Spiel mit diesem Code gefunden.' };
        await joinGame('inv-' + code, 'guest', 0);
        return { ok: true };
      }
      if (code === profile.code) return { error: 'Das ist dein eigener Spielercode.' };
      const target = find((pr) => pr.code === code);
      if (!target) return { error: 'Kein Spieler mit diesem Code online.' };
      const name = target.presence.pub?.name || 'Spieler';
      if (target.presence.status === 'playing') return { error: `${name} spielt gerade.` };
      myChallenge = { to: code, id: digits(9), at: Date.now() };
      setLobby({ challenge: myChallenge });
      const c = myChallenge;
      setTimeout(() => { if (myChallenge === c) { myChallenge = null; setLobby({ challenge: null }); toast(`${name} hat nicht geantwortet.`, 'warn'); } }, 60_000);
      return { challenged: name };
    },
    'challenge:respond': async ({ id, accept }) => {
      if (accept) {
        if (G && !G.over) return;
        setLobby({ accept: id });
        await joinGame('ch-' + id, 'guest', 0);
        setTimeout(() => setLobby({ accept: null }), 15000);
      } else {
        setLobby({ decline: id });
        setTimeout(() => setLobby({ decline: null }), 10000);
      }
    },

    'queue:join': () => {
      if (!room) return { error: NO_ONLINE };
      if (G && !G.over) return { error: 'Du bist bereits in einem Spiel.' };
      setLobby({ status: 'seeking', since: Date.now() });
      setTimeout(onLobby, 50);
      return { ok: true };
    },
    'queue:leave': () => { if (lobby.status === 'seeking') setLobby({ status: 'idle' }); },

    'match:vote': ({ board }) => {
      if (!G || G.status !== 'wait' || !G.voteOptions?.some((o) => o.board === board)) return;
      pres({ vote: board });
      onGame();
    },

    'game:move': ({ from, to, promotion }) => {
      const g = G;
      if (!g || g.status !== 'playing' || g.over) return { error: 'Kein aktives Spiel.' };
      if (g.chess.turn() !== g.myColor) return { error: 'Du bist nicht am Zug.', fen: g.chess.fen() };
      const charged = g.chess.history().length >= 2 && g.timeMs;
      let m;
      try { m = g.chess.move({ from, to, promotion: promotion || 'q' }); } catch { m = null; }
      if (!m) return { error: 'Ungültiger Zug.', fen: g.chess.fen() };
      const spent = charged ? Date.now() - g.turnStart : 0;
      g.spent[g.myColor] += spent;
      g.turnStart = Date.now();
      const patch = { moves: [...g.mine.moves, encMove(m, spent)] };
      if (g.mine.drawOffer) patch.drawOffer = g.mine.drawOffer; // Angebot bleibt bis zur Antwort
      pres(patch);
      setTimeout(() => {
        fire('game:state', { id: g.gid, fen: g.chess.fen(), lastMove: { from: m.from, to: m.to, san: m.san }, clock: clockState(), drawOffer: null, san: m.san, flags: m.flags, captured: m.captured, check: g.chess.inCheck() });
        checkEnd();
      });
      return { ok: true };
    },
    'game:resign': () => { if (G && G.status === 'playing' && !G.over) { pres({ resign: true }); finish(G.myColor === 'w' ? 'b' : 'w', 'resign'); } },
    'game:draw': ({ action }) => {
      const g = G; if (!g || g.status !== 'playing' || g.over) return;
      const op = oppPeer()?.presence;
      if (action === 'offer') { g.offerN++; pres({ drawOffer: { n: Date.now() % 1e9, at: g.chess.history().length } }); }
      else if (action === 'accept' && op?.drawOffer) { pres({ drawAnswer: { n: op.drawOffer.n, accept: true } }); finish('draw', 'agreement'); }
      else if (action === 'decline' && op?.drawOffer) pres({ drawAnswer: { n: op.drawOffer.n, accept: false } });
    },
    'game:emote': ({ emote }) => {
      if (!G || G.status !== 'playing') return;
      if (['👍', '😮', '😂', '🔥', '🤝', '😅', '👑', 'GG'].includes(emote)) pres({ emote: { e: emote, n: Date.now() % 1e9 } });
    },

    'bot:finish': ({ botId, color, moves, resigned }) => {
      const bot = BOTS.find((b) => b.id === botId);
      if (!bot || !['w', 'b'].includes(color) || !Array.isArray(moves)) return { error: 'Ungültig.' };
      const now = Date.now();
      if (profile.lastBotAt && now - profile.lastBotAt < 8000) return { error: 'Zu schnell.' };
      const c = new Chess();
      try { for (const m of moves) if (!c.move({ from: m.from, to: m.to, promotion: m.promotion })) throw 0; } catch { return { error: 'Partie ungültig.' }; }
      let outcome, reason;
      if (c.isCheckmate()) { outcome = c.turn() === color ? 'loss' : 'win'; reason = 'checkmate'; }
      else if (c.isDraw() || c.isStalemate()) { outcome = 'draw'; reason = 'draw'; }
      else if (resigned) { outcome = 'loss'; reason = 'resign'; }
      else return { error: 'Partie nicht beendet.' };
      let coins = 0;
      if (outcome === 'win') coins = bot.reward;
      else if (outcome === 'draw') coins = Math.round(bot.reward / 3);
      else if (moves.length >= 10) coins = REWARDS.botLoss;
      profile.lastBotAt = now;
      profile.coins += coins; profile.stats.botGames++;
      if (outcome === 'win') { profile.stats.botWins++; profile.stats.mates++; }
      profile.history.unshift({ type: 'bot', opponent: bot.name, oppAvatar: { type: 'emoji', value: bot.avatar, color: bot.color }, outcome, reason, coins, rating: 0, moves: moves.length, at: now });
      profile.history = profile.history.slice(0, 50);
      save();
      return { coins, outcome, profile: priv() };
    },

    leaderboard: async () => {
      const online = new Set(lobbyPeers.map(pUid));
      const mine = { ...fullPub(), online: true, losses: profile.stats.losses, draws: profile.stats.draws, botWins: profile.stats.botWins };
      let list = [];
      if (db) {
        const snap = await withTimeout(db.collection('players').orderBy('rating', 'desc').limit(50).get(), 8000, null);
        list = (snap?.docs || []).map((d) => { const x = d.data(); return { id: d.id, name: x.name, avatar: x.avatar, rating: x.rating, stats: { wins: x.wins, games: x.games }, losses: x.losses, draws: x.draws, botWins: x.botWins, online: online.has(d.id) }; })
          .filter((u) => u.stats.games > 0 || u.botWins > 0);
      }
      if (!list.some((u) => u.id === uid) && (profile.stats.games > 0 || profile.stats.botWins > 0)) list.push(mine);
      list.sort((a, b) => b.rating - a.rating);
      return { list };
    },
  };

  return {
    on(ev, fn) { (handlers[ev] ||= []).push(fn); },
    emit(ev, data, ack) {
      Promise.resolve().then(() => api[ev]?.(data || {})).then((r) => ack?.(r), (e) => { console.error(e); ack?.({ error: 'Fehler: ' + (e?.message || e) }); });
    },
  };
}
