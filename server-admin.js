// Anti-Cheat (Elo-/Münz-Farming, Zweitkonten, Bot-Farming, auffällige Zugzeiten) und erweitertes Admin-Panel.
// Wird von server.js mit einem Kontext-Objekt (ctx) eingebunden, damit hier keine Server-Interna doppelt stehen.
import crypto from 'crypto';
import { BOARDS, PIECES, FINISHERS, SHAPES, BOTS, findItem } from './public/js/catalog.js';

const DAY = 86_400_000, HOUR = 3_600_000;
const AC_WINDOW = 14 * DAY; // Verdachtspunkte zählen 14 Tage
export const AC_TYPES = {
  sameip: { label: 'Gleiche Internet-Verbindung wie der Gegner (Zweitkonto?)', w: 40 },
  'sameip-team': { label: 'Mehrere Konten mit gleicher Verbindung im selben 2v2/4er-Spiel', w: 25 },
  'farm-pair': { label: 'Elo-Farming: viele sehr kurze oder früh aufgegebene Siege gegen denselben Gegner', w: 30 },
  feeder: { label: 'Füttert Elo: verliert auffällig oft schnell gegen dieselben Gegner', w: 25 },
  'new-feeder': { label: 'Neues Konto verliert mehrfach gegen denselben Spieler', w: 20 },
  'elo-spike': { label: 'Ungewöhnlich viel Elo in 24 Stunden gewonnen', w: 20 },
  'upset-streak': { label: 'Siegesserie gegen deutlich stärkere Gegner', w: 15 },
  'move-times': { label: 'Auffällig gleichmäßige, schnelle Zugzeiten (Engine-Verdacht)', w: 15 },
  'bot-farm': { label: 'Sehr viele Bot-Siege in kurzer Zeit (Münz-Farming)', w: 20 },
  'bot-hugo': { label: 'Sieg gegen Hugo (Legende) – Engine-Verdacht', w: 25 },
  'bot-fast': { label: 'Bot-Partien in unmöglich kurzer Zeit beendet', w: 20 },
};
export const DEFAULT_SETTINGS = {
  coinMult: 1, coinMultUntil: 0, shopDiscount: 0, banner: '', maintenance: false, maintenanceText: 'Wartungsarbeiten – Online-Spiele sind kurz pausiert.',
  randomOff: false, fourOff: false, chatMute: false, startCoins: null,
  ac: { enabled: true, autoUnrate: true, autoBan: false, banAt: 120, notify: true, detectors: Object.fromEntries(Object.keys(AC_TYPES).map((k) => [k, true])) },
};

export function setupAdmin(ctx) {
  // db wird beim Start neu geladen – deshalb immer über den Getter auf die aktuelle Datenbank zugreifen
  const db = new Proxy({}, { get: (_, k) => ctx.getDb()[k] });
  const { online, games, games4, lobbies4, rooms, io, save, emitTo, pub, priv, isAdmin, banInfo, findTarget, matchList, matchGet, annulMatch, chatLoad, chatStore, groupDelete, setName, hashPw, VERSION, mongo } = ctx;
  let settings = structuredClone(DEFAULT_SETTINGS);
  let adminLog = [], chatBlocks = [];
  const ipMap = new Map(); // ip-hash -> Set(userId)
  let peakToday = { day: new Date().toDateString(), n: 0 };
  const salt = process.env.IP_SALT || 'schacharena';
  const ipHash = (ip) => crypto.createHash('sha256').update(salt + ip).digest('hex').slice(0, 16);

  // ------------------------------------------------------------ Speichern (in der Chat-Sammlung unter festen Schlüsseln)
  async function init() {
    const s = await chatLoad('__settings').catch(() => null);
    if (s && !Array.isArray(s)) settings = { ...structuredClone(DEFAULT_SETTINGS), ...s, ac: { ...DEFAULT_SETTINGS.ac, ...(s.ac || {}), detectors: { ...DEFAULT_SETTINGS.ac.detectors, ...(s.ac?.detectors || {}) } } };
    adminLog = (await chatLoad('__adminlog').catch(() => [])) || [];
    chatBlocks = (await chatLoad('__chatblocks').catch(() => [])) || [];
    for (const u of Object.values(db.users)) for (const h of u.ips || []) addIp(h, u.id);
  }
  const persistSettings = () => chatStore('__settings', settings).catch((e) => console.error('Einstellungen:', e.message));
  let logTimer = null;
  const persistLogs = () => { clearTimeout(logTimer); logTimer = setTimeout(() => { chatStore('__adminlog', adminLog).catch(() => {}); chatStore('__chatblocks', chatBlocks).catch(() => {}); }, 1500); };
  function log(admin, action, target, detail = '') {
    adminLog.unshift({ at: Date.now(), by: admin?.name || 'System', byId: admin?.id || null, action, target: target ? { id: target.id, name: target.name } : null, detail: String(detail).slice(0, 300) });
    adminLog.length = Math.min(adminLog.length, 1000);
    persistLogs();
  }
  const publicSettings = () => ({ coinMult: coinMult(), coinMultUntil: settings.coinMultUntil, shopDiscount: settings.shopDiscount, banner: settings.banner, maintenance: settings.maintenance, maintenanceText: settings.maintenanceText, randomOff: settings.randomOff, fourOff: settings.fourOff, chatMute: settings.chatMute });
  const broadcastSettings = () => io.emit('settings', publicSettings());

  // ------------------------------------------------------------ Regeln für den Rest des Servers
  const coinMult = () => (settings.coinMult > 1 && (!settings.coinMultUntil || settings.coinMultUntil > Date.now()) ? settings.coinMult : 1);
  const coins = (n) => Math.round(n * coinMult());
  const price = (p) => Math.round((p * (100 - (settings.shopDiscount || 0))) / 100);
  const playBlock = (kind) => {
    if (settings.maintenance) return '🛠️ ' + (settings.maintenanceText || 'Wartungsarbeiten.');
    if (kind === 'random' && settings.randomOff) return 'Das Zufallsmatch ist gerade vom Admin deaktiviert.';
    if (kind === 'four' && settings.fourOff) return '2 vs 2 und 4er-Schach sind gerade vom Admin deaktiviert.';
    return null;
  };
  const muteInfo = (u) => (u?.mute && (u.mute === -1 || u.mute > Date.now()) ? u.mute : null);
  const chatBlock = (u) => {
    if (settings.chatMute && !isAdmin(u)) return '🔇 Der Chat ist gerade für alle stummgeschaltet.';
    const m = muteInfo(u);
    if (m) return `🔇 Du bist ${m === -1 ? 'dauerhaft' : `bis ${new Date(m).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Berlin' })}`} stummgeschaltet.`;
    return null;
  };
  const startCoins = (def) => (Number.isFinite(settings.startCoins) && settings.startCoins >= 0 ? settings.startCoins : def);
  function blockedChat(u, text, where) {
    chatBlocks.unshift({ at: Date.now(), uid: u.id, name: u.name, text: String(text).slice(0, 300), where });
    chatBlocks.length = Math.min(chatBlocks.length, 300);
    persistLogs();
  }

  // ------------------------------------------------------------ Verbindungen / IP
  function addIp(h, uid) { if (!ipMap.has(h)) ipMap.set(h, new Set()); ipMap.get(h).add(uid); }
  function onConnect(socket, u) {
    const fwd = String(socket.handshake.headers['x-forwarded-for'] || '').split(',')[0].trim();
    const ip = fwd || socket.handshake.address || '';
    if (ip) {
      const h = ipHash(ip);
      u.ips = [h, ...(u.ips || []).filter((x) => x !== h)].slice(0, 6);
      addIp(h, u.id);
    }
    u.lastSeen = Date.now();
    const today = new Date().toDateString();
    if (peakToday.day !== today) peakToday = { day: today, n: 0 };
    peakToday.n = Math.max(peakToday.n, online.size);
  }
  const onDisconnect = (u) => { if (u) u.lastSeen = Date.now(); };
  const sameIp = (a, b) => !!(a?.ips?.length && b?.ips?.some((h) => a.ips.includes(h)));
  const ipSiblings = (u) => [...new Set((u.ips || []).flatMap((h) => [...(ipMap.get(h) || [])]))].filter((id) => id !== u.id).map((id) => db.users[id]).filter(Boolean);

  // ------------------------------------------------------------ Anti-Cheat
  const acScore = (u) => (u?.acTrusted ? 0 : (u?.ac?.flags || []).filter((f) => !f.cleared && Date.now() - f.at < AC_WINDOW).reduce((s, f) => s + (AC_TYPES[f.type]?.w || 10), 0));
  function flag(u, type, detail, gameId = null) {
    if (!u || !settings.ac.enabled || settings.ac.detectors[type] === false || u.acTrusted) return;
    u.ac ||= { flags: [] };
    // derselbe Typ höchstens einmal pro Stunde (sonst explodiert der Wert bei einer Serie)
    if (u.ac.flags.some((f) => f.type === type && !f.cleared && Date.now() - f.at < HOUR)) return;
    u.ac.flags.unshift({ id: crypto.randomUUID().slice(0, 8), type, detail: String(detail).slice(0, 200), gameId, at: Date.now() });
    u.ac.flags.length = Math.min(u.ac.flags.length, 60);
    const score = acScore(u);
    log(null, 'anticheat', u, `${AC_TYPES[type]?.label || type} – ${detail} (Punkte: ${score})`);
    if (settings.ac.notify) for (const [uid] of online) if (isAdmin(db.users[uid])) emitTo(uid, 'admin:alert', { name: u.name, id: u.id, type, label: AC_TYPES[type]?.label, detail, score });
    if (settings.ac.autoBan && score >= settings.ac.banAt && !banInfo(u)) {
      u.ban = { until: Date.now() + DAY, reason: 'Automatische Sperre: Verdacht auf Betrug (Anti-Cheat)', by: 'Anti-Cheat', at: Date.now() };
      emitTo(u.id, 'banned', banInfo(u));
      log(null, 'ban', u, `Automatisch 24 Std. gesperrt (${score} Punkte)`);
    }
    save();
  }
  const recent = (u, ms, f = () => true) => (u.history || []).filter((h) => Date.now() - h.at < ms && f(h));
  // „Billige“ Partie = typisch für Farming: sehr kurz, früh aufgegeben, auf Zeit oder durch Verlassen beendet.
  // Echte Partien (lang, mit Matt oder ausgespielt) sind NIE ein Farming-Grund – wer einfach besser ist, wird nicht bestraft.
  const cheap = (reason, plies) => plies < 20 || (reason === 'resign' && plies < 40) || (reason === 'timeout' && plies < 30) || reason === 'abandon';
  const cheapH = (h) => cheap(h.reason, h.moves || 0);

  // Vor der Wertung: harte Gründe, eine Partie nicht zu werten (zusätzlich zum Fair-Play-Check)
  function precheck(W, B, result, reason, plies) {
    if (!settings.ac.enabled || !settings.ac.autoUnrate || result === 'draw') return null;
    if (settings.ac.detectors.sameip !== false && sameIp(W, B) && !W.acTrusted && !B.acTrusted) return 'Anti-Cheat: Beide Konten nutzen dieselbe Internet-Verbindung.';
    if (!cheap(reason, plies)) return null; // echte Partie: wird immer gewertet
    const win = result === 'w' ? W : B, lose = result === 'w' ? B : W;
    const cheapWins = recent(win, DAY, (h) => h.type === 'online' && h.oppId === lose.id && h.outcome === 'win' && cheapH(h)).length;
    if (settings.ac.detectors['farm-pair'] !== false && cheapWins >= 2 && !win.acTrusted) return 'Anti-Cheat: Schon wieder eine sehr kurze oder früh aufgegebene Partie gegen denselben Gegner. Echte, ausgespielte Partien werden normal gewertet.';
    return null;
  }
  // Viele echte Siege gegen denselben Gegner am selben Tag: Partie zählt normal, aber das Elo wird schrittweise kleiner
  function eloFactor(W, B, result) {
    if (result === 'draw') return { factor: 1 };
    const win = result === 'w' ? W : B, lose = result === 'w' ? B : W;
    const n = recent(win, DAY, (h) => h.type === 'online' && h.oppId === lose.id && h.outcome === 'win' && !h.unrated).length; // frühere Siege heute
    if (n >= 5) return { factor: 0.25, note: `${n + 1}. Sieg gegen ${lose.name} heute – Elo zählt nur noch zu 25 %.` };
    if (n >= 3) return { factor: 0.5, note: `${n + 1}. Sieg gegen ${lose.name} heute – Elo zählt nur noch zur Hälfte.` };
    return { factor: 1 };
  }
  // Nach der Partie: Muster erkennen und Verdachtspunkte vergeben
  function afterOnline(g, result, W, B) {
    if (!settings.ac.enabled) return;
    if (sameIp(W, B)) { flag(W, 'sameip', `gegen ${B.name}`, g.id); flag(B, 'sameip', `gegen ${W.name}`, g.id); }
    if (result === 'draw') return;
    const win = result === 'w' ? W : B, lose = result === 'w' ? B : W, wc = result;
    // nur kurze/früh aufgegebene Siege zählen als Farming – lange, echte Partien nicht
    const pairCheap = recent(win, DAY, (h) => h.type === 'online' && h.oppId === lose.id && h.outcome === 'win' && cheapH(h)).length;
    if (pairCheap >= 3) {
      flag(win, 'farm-pair', `${pairCheap} sehr kurze oder früh aufgegebene Siege gegen ${lose.name} in 24 Std.`, g.id);
      flag(lose, 'feeder', `${pairCheap} sehr kurze oder früh aufgegebene Niederlagen gegen ${win.name} in 24 Std.`, g.id);
    }
    const quickLosses = recent(lose, DAY, (h) => h.type === 'online' && h.outcome === 'loss' && cheapH(h));
    if (quickLosses.length >= 5) flag(lose, 'feeder', `${quickLosses.length} schnelle Niederlagen in 24 Std.`, g.id);
    if (Date.now() - (lose.createdAt || 0) < DAY && recent(lose, DAY, (h) => h.oppId === win.id && h.outcome === 'loss').length >= 2) flag(lose, 'new-feeder', `Konto jünger als 1 Tag, verliert gegen ${win.name}`, g.id);
    const gain = recent(win, DAY, (h) => h.type === 'online').reduce((s, h) => s + (h.rating || 0), 0);
    if (gain >= 150) flag(win, 'elo-spike', `+${gain} Elo in 24 Std.`, g.id);
    const lastWins = (win.history || []).filter((h) => h.type === 'online').slice(0, 5);
    if (lastWins.length === 5 && lastWins.every((h) => h.outcome === 'win' && (h.oppRating ?? 0) - (h.myRating ?? 0) >= 200)) flag(win, 'upset-streak', '5 Siege in Folge gegen 200+ Elo stärkere Gegner', g.id);
    const t = g.moveTimes?.[wc] || [];
    if (t.length >= 20) {
      const mean = t.reduce((a, b) => a + b, 0) / t.length;
      const sd = Math.sqrt(t.reduce((a, b) => a + (b - mean) ** 2, 0) / t.length);
      if (mean < 4000 && sd / mean < 0.25) flag(win, 'move-times', `Ø ${(mean / 1000).toFixed(1)} s pro Zug, kaum Schwankung`, g.id);
    }
  }
  function afterBot(u, bot, outcome, moves, startedAt) {
    if (!settings.ac.enabled || outcome !== 'win') return;
    const wins = recent(u, HOUR, (h) => h.type === 'bot' && h.outcome === 'win');
    if (wins.length >= 10) flag(u, 'bot-farm', `${wins.length} Bot-Siege in 1 Std.`);
    if (bot.legend) flag(u, 'bot-hugo', `Sieg gegen ${bot.name} in ${moves} Halbzügen`);
    if (startedAt && Date.now() - startedAt < moves * 150) flag(u, 'bot-fast', `${moves} Halbzüge in ${Math.round((Date.now() - startedAt) / 1000)} s`);
  }
  function afterFour(g) {
    if (!settings.ac.enabled) return;
    const humans = g.players.filter((p) => p.uid).map((p) => db.users[p.uid]).filter(Boolean);
    for (const a of humans) for (const b of humans) if (a !== b && sameIp(a, b)) flag(a, 'sameip-team', `mit ${b.name}`, g.id);
  }

  // ------------------------------------------------------------ Hilfen fürs Panel
  const dayKey = (t) => new Date(t).toISOString().slice(0, 10);
  const lastDays = (n) => Array.from({ length: n }, (_, i) => dayKey(Date.now() - (n - 1 - i) * DAY));
  const count = (arr, keyFn) => { const m = {}; for (const x of arr) { const k = keyFn(x); if (k != null) m[k] = (m[k] || 0) + 1; } return m; };
  const brief = (u) => ({ ...pub(u), code: u.code, coins: u.coins, online: online.has(u.id), ban: banInfo(u), acScore: acScore(u), trusted: !!u.acTrusted, lastSeen: u.lastSeen || null, mute: muteInfo(u) });
  const itemValue = (u) => ['board', 'pieces', 'finisher', 'shape'].reduce((s, k) => s + (u.owned?.[k] || []).reduce((a, id) => a + (findItem(k, id)?.price || 0), 0), 0);
  const notifyPlayer = (u, text, type = 'warn') => emitTo(u.id, 'toast', { type, text });

  // ------------------------------------------------------------ Sockets
  function register(socket, getUser, need) {
    const A = (fn) => need(async (data = {}, ack) => {
      const me = getUser();
      if (!isAdmin(me)) return ack?.({ error: 'Keine Berechtigung.' });
      try { await fn(data || {}, ack, me); } catch (e) { console.error('[admin+]', e); ack?.({ error: 'Fehler: ' + e.message }); }
    });
    const target = (q, ack) => { const t = findTarget(q); if (!t) ack?.({ error: 'Spieler nicht gefunden.' }); return t; };
    const on = (ev, fn) => socket.on(ev, A(fn));

    // ---- Anti-Cheat
    on('ac:list', async ({ all = false }, ack) => {
      const list = Object.values(db.users).filter((u) => (u.ac?.flags || []).some((f) => all || (!f.cleared && Date.now() - f.at < AC_WINDOW)))
        .map((u) => ({ ...brief(u), flags: (u.ac.flags || []).filter((f) => all || !f.cleared).slice(0, 20).map((f) => ({ ...f, label: AC_TYPES[f.type]?.label || f.type })), note: u.ac.note || '' }))
        .sort((a, b) => b.acScore - a.acScore).slice(0, 200);
      ack?.({ list, settings: settings.ac, types: AC_TYPES });
    });
    on('ac:clear', async ({ query, flagId = null }, ack, me) => {
      const t = target(query, ack); if (!t) return;
      for (const f of t.ac?.flags || []) if (!flagId || f.id === flagId) f.cleared = { at: Date.now(), by: me.name };
      log(me, 'ac-clear', t, flagId ? `Hinweis ${flagId} erledigt` : 'Alle Hinweise erledigt'); save(); ack?.({ ok: true });
    });
    on('ac:trust', async ({ query, trusted }, ack, me) => {
      const t = target(query, ack); if (!t) return;
      t.acTrusted = !!trusted; log(me, trusted ? 'ac-trust' : 'ac-untrust', t); save(); ack?.({ ok: true });
    });
    on('ac:note', async ({ query, note }, ack, me) => {
      const t = target(query, ack); if (!t) return;
      (t.ac ||= { flags: [] }).note = String(note || '').slice(0, 300); log(me, 'ac-note', t, t.ac.note); save(); ack?.({ ok: true });
    });
    on('ac:settings', async ({ ac }, ack, me) => {
      if (ac && typeof ac === 'object') {
        for (const k of ['enabled', 'autoUnrate', 'autoBan', 'notify']) if (k in ac) settings.ac[k] = !!ac[k];
        if (Number.isFinite(+ac.banAt) && +ac.banAt >= 20) settings.ac.banAt = Math.min(1000, Math.round(+ac.banAt));
        if (ac.detectors) for (const k of Object.keys(AC_TYPES)) if (k in ac.detectors) settings.ac.detectors[k] = !!ac.detectors[k];
        await persistSettings(); log(me, 'ac-settings', null, JSON.stringify(ac).slice(0, 200));
      }
      ack?.({ settings: settings.ac });
    });
    // Paare: wer spielt auffällig oft gegeneinander (letzte 7 Tage)
    on('ac:pairs', async (_, ack) => {
      const pairs = new Map();
      for (const u of Object.values(db.users)) for (const h of u.history || []) {
        if (h.type !== 'online' || !h.oppId || Date.now() - h.at > 7 * DAY || u.id > h.oppId) continue;
        const k = u.id + ':' + h.oppId;
        const e = pairs.get(k) || { a: u.id, b: h.oppId, n: 0, aw: 0, bw: 0, d: 0, unrated: 0 };
        e.n++; if (h.outcome === 'win') e.aw++; else if (h.outcome === 'loss') e.bw++; else e.d++; if (h.unrated) e.unrated++;
        pairs.set(k, e);
      }
      const list = [...pairs.values()].filter((e) => e.n >= 3).sort((x, y) => y.n - x.n).slice(0, 60).map((e) => ({ ...e, A: brief(db.users[e.a]), B: db.users[e.b] ? brief(db.users[e.b]) : { name: '?' }, sameIp: sameIp(db.users[e.a], db.users[e.b]) }));
      ack?.({ list });
    });
    on('ac:ipgroups', async (_, ack) => {
      const list = [...ipMap.values()].filter((s) => s.size > 1).map((s) => [...s].map((id) => db.users[id]).filter(Boolean).map(brief)).filter((g) => g.length > 1).sort((a, b) => b.length - a.length).slice(0, 60);
      ack?.({ list });
    });
    // Elo-Farm rückgängig: alle gewerteten Partien zwischen zwei Spielern (Zeitraum) annullieren
    on('ac:undoFarm', async ({ a, b, days = 7 }, ack, me) => {
      const A1 = target(a, ack); if (!A1) return; const B1 = target(b, ack); if (!B1) return;
      const since = Date.now() - Math.min(90, Math.max(1, +days || 7)) * DAY;
      const list = (await matchList({ uids: [A1.id], type: 'online', limit: 500 })).filter((m) => m.at >= since && m.uids.includes(B1.id) && !m.annulled && !m.unrated);
      let n = 0;
      for (const brief1 of list) { const m = await matchGet(brief1.id); if (m && !m.annulled) { await annulMatch(m, me.name); n++; } }
      log(me, 'undo-farm', A1, `${n} Partien gegen ${B1.name} (${days} Tage) annulliert`);
      ack?.({ ok: true, n });
    });
    on('ac:scan', async (_, ack, me) => {
      // Alle Spieler über ihren Verlauf neu prüfen (Paar-Farming & Feeder)
      let flagged = 0;
      for (const u of Object.values(db.users)) {
        const byOpp = count(recent(u, 7 * DAY, (h) => h.type === 'online' && h.outcome === 'win' && cheapH(h)), (h) => h.oppId);
        for (const [opp, n] of Object.entries(byOpp)) if (n >= 5) { const o = db.users[opp]; flag(u, 'farm-pair', `${n} kurze/früh aufgegebene Siege gegen ${o?.name || '?'} in 7 Tagen (Scan)`); if (o) flag(o, 'feeder', `${n} kurze/früh aufgegebene Niederlagen gegen ${u.name} in 7 Tagen (Scan)`); flagged++; }
        for (const s of ipSiblings(u)) if (recent(u, 7 * DAY, (h) => h.oppId === s.id).length) { flag(u, 'sameip', `spielt gegen ${s.name} mit gleicher Verbindung (Scan)`); flagged++; }
      }
      log(me, 'ac-scan', null, `${flagged} Treffer`); ack?.({ ok: true, flagged });
    });

    // ---- Statistik
    on('adm:stats2', async (_, ack) => {
      const users = Object.values(db.users);
      const matches = await matchList({ limit: 3000 });
      const days = lastDays(14);
      const perDay = count(matches, (m) => dayKey(m.at)), newPerDay = count(users, (u) => dayKey(u.createdAt || 0));
      const online1 = matches.filter((m) => m.type === 'online');
      const decided = online1.filter((m) => m.result === 'w' || m.result === 'b');
      const elo = count(users.filter((u) => u.stats.games > 0), (u) => Math.min(20, Math.floor(u.rating / 100)) * 100);
      const botStats = BOTS.map((b) => { const ms = matches.filter((m) => m.type === 'bot' && m.players?.bot?.id === b.id); return { name: b.name, avatar: b.avatar, n: ms.length, wins: ms.filter((m) => m.result === 'win').length }; });
      const eq = (k, list) => { const c = count(users, (u) => u.equipped?.[k] || 'klassisch'); return list.map((it) => ({ name: it.name, n: c[it.id] || 0 })).sort((a, b) => b.n - a.n).slice(0, 8); };
      ack?.({
        days, games: days.map((d) => perDay[d] || 0), newUsers: days.map((d) => newPerDay[d] || 0),
        peakToday: peakToday.n, elo: Object.entries(elo).map(([k, n]) => ({ k: +k, n })).sort((a, b) => a.k - b.k),
        boards: eq('board', BOARDS), pieces: eq('pieces', PIECES), shapes: eq('shape', SHAPES), finishers: eq('finisher', FINISHERS), bots: botStats,
        avgPlies: online1.length ? Math.round(online1.reduce((s, m) => s + (m.plies || 0), 0) / online1.length) : 0,
        times: Object.entries(count(online1, (m) => m.timeMs || 0)).map(([t, n]) => ({ t: +t, n })).sort((a, b) => a.t - b.t),
        reasons: Object.entries(count(online1, (m) => m.reason)).map(([r, n]) => ({ r, n })).sort((a, b) => b.n - a.n),
        white: decided.filter((m) => m.result === 'w').length, black: decided.filter((m) => m.result === 'b').length, draws: online1.length - decided.length,
        coinsTotal: users.reduce((s, u) => s + (u.coins || 0), 0), spentTotal: users.reduce((s, u) => s + itemValue(u), 0),
        active24: users.filter((u) => online.has(u.id) || (u.lastSeen && Date.now() - u.lastSeen < DAY)).length,
        active7: users.filter((u) => online.has(u.id) || (u.lastSeen && Date.now() - u.lastSeen < 7 * DAY)).length,
        friendships: users.reduce((s, u) => s + (u.friends?.length || 0), 0) / 2, groups: Object.keys(db.groups || {}).length,
        matchesCounted: matches.length,
      });
    });

    // ---- Events & Wirtschaft
    on('adm:settings', async ({ set }, ack, me) => {
      if (set && typeof set === 'object') {
        if ('coinMult' in set) settings.coinMult = Math.min(5, Math.max(1, +set.coinMult || 1));
        if ('coinMultHours' in set) settings.coinMultUntil = +set.coinMultHours > 0 ? Date.now() + Math.min(720, +set.coinMultHours) * HOUR : 0;
        if ('shopDiscount' in set) settings.shopDiscount = Math.min(90, Math.max(0, Math.round(+set.shopDiscount || 0)));
        if ('banner' in set) settings.banner = String(set.banner || '').slice(0, 160);
        if ('maintenanceText' in set) settings.maintenanceText = String(set.maintenanceText || '').slice(0, 160);
        for (const k of ['maintenance', 'randomOff', 'fourOff', 'chatMute']) if (k in set) settings[k] = !!set[k];
        if ('startCoins' in set) settings.startCoins = set.startCoins === '' || set.startCoins == null ? null : Math.min(100000, Math.max(0, Math.round(+set.startCoins)));
        await persistSettings(); broadcastSettings(); log(me, 'settings', null, JSON.stringify(set).slice(0, 250));
      }
      ack?.({ settings: { ...settings, coinMultActive: coinMult() } });
    });
    on('adm:giveAll', async ({ amount, onlineOnly = true }, ack, me) => {
      const n = Math.round(+amount);
      if (!n || Math.abs(n) > 100000) return ack?.({ error: 'Ungültiger Betrag.' });
      const list = onlineOnly ? [...online.keys()].map((id) => db.users[id]).filter(Boolean) : Object.values(db.users);
      for (const u of list) { u.coins = Math.max(0, u.coins + n); emitTo(u.id, 'profile:refresh', { profile: priv(u) }); notifyPlayer(u, `🎁 Geschenk vom Admin: ${n > 0 ? '+' : ''}${n} Münzen!`, 'good'); }
      save(); log(me, 'give-all', null, `${n} Münzen an ${list.length} Spieler (${onlineOnly ? 'online' : 'alle'})`); ack?.({ ok: true, reached: list.length });
    });
    on('adm:item', async ({ query, kind, id, give = true }, ack, me) => {
      const t = target(query, ack); if (!t) return;
      if (!findItem(kind, id)) return ack?.({ error: 'Unbekannter Gegenstand.' });
      t.owned[kind] ||= ['klassisch'];
      if (give) { if (!t.owned[kind].includes(id)) t.owned[kind].push(id); notifyPlayer(t, `🎁 Ein Admin hat dir „${findItem(kind, id).name}“ geschenkt!`, 'good'); }
      else { if (id === 'klassisch') return ack?.({ error: 'Klassisch kann man nicht entziehen.' }); t.owned[kind] = t.owned[kind].filter((x) => x !== id); if (t.equipped[kind] === id) t.equipped[kind] = 'klassisch'; }
      emitTo(t.id, 'profile:refresh', { profile: priv(t) }); save(); log(me, give ? 'item-give' : 'item-take', t, `${kind}: ${id}`); ack?.({ ok: true, owned: t.owned });
    });

    // ---- Spieler (erweitert)
    on('adm:player', async ({ query }, ack) => {
      const t = target(query, ack); if (!t) return;
      const g = [...games.values()].find((x) => x.status !== 'over' && (x.players.w === t.id || x.players.b === t.id));
      ack?.({
        player: brief(t), note: t.adminNote || '', warnings: t.warnings || [], owned: t.owned, equipped: t.equipped, stats: t.stats, createdAt: t.createdAt,
        registered: !!t.pass, friends: (t.friends || []).map((id) => db.users[id]).filter(Boolean).map((f) => ({ id: f.id, name: f.name, online: online.has(f.id) })),
        groups: Object.values(db.groups || {}).filter((gr) => gr.members.includes(t.id)).map((gr) => ({ id: gr.id, name: gr.name, n: gr.members.length })),
        siblings: ipSiblings(t).map(brief), history: (t.history || []).slice(0, 15), gameId: g?.id || null,
        log: adminLog.filter((e) => e.target?.id === t.id).slice(0, 30), ac: (t.ac?.flags || []).slice(0, 20).map((f) => ({ ...f, label: AC_TYPES[f.type]?.label || f.type })),
      });
    });
    on('adm:note', async ({ query, note }, ack, me) => { const t = target(query, ack); if (!t) return; t.adminNote = String(note || '').slice(0, 500); save(); log(me, 'note', t, t.adminNote); ack?.({ ok: true }); });
    on('adm:rename', async ({ query, name }, ack, me) => {
      const t = target(query, ack); if (!t) return;
      const old = t.name; const r = ctx.forceName(t, name);
      if (r.error) return ack?.(r);
      notifyPlayer(t, `✏️ Ein Admin hat deinen Namen in „${t.name}“ geändert.`); emitTo(t.id, 'profile:refresh', { profile: priv(t) });
      save(); log(me, 'rename', t, `${old} → ${t.name}`); ack?.({ ok: true, name: t.name });
    });
    on('adm:resetAvatar', async ({ query }, ack, me) => { const t = target(query, ack); if (!t) return; t.avatar = { type: 'emoji', value: '♞', color: '#64748b' }; emitTo(t.id, 'profile:refresh', { profile: priv(t) }); save(); log(me, 'reset-avatar', t); ack?.({ ok: true }); });
    on('adm:resetStats', async ({ query }, ack, me) => {
      const t = target(query, ack); if (!t) return;
      t.stats = { games: 0, wins: 0, losses: 0, draws: 0, botWins: 0, botGames: 0, mates: 0 }; t.history = []; t.vs = {}; t.vsBot = {};
      emitTo(t.id, 'profile:refresh', { profile: priv(t) }); save(); log(me, 'reset-stats', t); ack?.({ ok: true });
    });
    on('adm:setCoins', async ({ query, coins }, ack, me) => {
      const t = target(query, ack); if (!t) return; const n = Math.round(+coins);
      if (!(n >= 0 && n <= 10_000_000)) return ack?.({ error: 'Ungültiger Wert.' });
      const old = t.coins; t.coins = n; emitTo(t.id, 'profile:refresh', { profile: priv(t) }); save(); log(me, 'set-coins', t, `${old} → ${n}`); ack?.({ ok: true });
    });
    on('adm:warn', async ({ query, text }, ack, me) => {
      const t = target(query, ack); if (!t) return; const msg = String(text || 'Bitte halte dich an die Regeln.').slice(0, 200);
      (t.warnings ||= []).unshift({ at: Date.now(), by: me.name, text: msg }); t.warnings.length = Math.min(t.warnings.length, 30);
      emitTo(t.id, 'admin:warn', { text: msg, by: me.name }); save(); log(me, 'warn', t, msg); ack?.({ ok: true, delivered: online.has(t.id) });
    });
    on('adm:mute', async ({ query, minutes }, ack, me) => {
      const t = target(query, ack); if (!t) return; const m = +minutes;
      t.mute = m === 0 ? null : m < 0 ? -1 : Date.now() + Math.min(525600, m) * 60_000;
      notifyPlayer(t, t.mute ? '🔇 Ein Admin hat dich im Chat stummgeschaltet.' : '🔊 Du darfst wieder chatten.'); save(); log(me, t.mute ? 'mute' : 'unmute', t, m ? `${m} Min.` : ''); ack?.({ ok: true });
    });
    on('adm:kick', async ({ query }, ack, me) => {
      const t = target(query, ack); if (!t) return; const s = online.get(t.id);
      if (!s) return ack?.({ error: `${t.name} ist nicht online.` });
      s.emit('toast', { type: 'warn', text: '👢 Du wurdest von einem Admin getrennt.' }); setTimeout(() => s.disconnect(true), 300); log(me, 'kick', t); ack?.({ ok: true });
    });
    on('adm:dm', async ({ query, text }, ack, me) => {
      const t = target(query, ack); if (!t) return; const msg = String(text || '').trim().slice(0, 300);
      if (!msg) return ack?.({ error: 'Leere Nachricht.' });
      emitTo(t.id, 'announce', { text: msg, by: `${me.name} (nur an dich)` }); log(me, 'dm', t, msg); ack?.({ ok: true, delivered: online.has(t.id) });
    });
    on('adm:resetPw', async ({ query }, ack, me) => {
      const t = target(query, ack); if (!t) return;
      if (!t.pass) return ack?.({ error: 'Dieser Spieler hat kein Konto (Gast).' });
      const pw = crypto.randomBytes(5).toString('hex'); t.pass = hashPw(pw); save(); log(me, 'reset-pw', t); ack?.({ ok: true, password: pw });
    });
    on('adm:endGame', async ({ query, mode = 'abort' }, ack, me) => {
      const t = target(query, ack); if (!t) return;
      const g = [...games.values()].find((x) => x.status === 'playing' && (x.players.w === t.id || x.players.b === t.id));
      if (!g) return ack?.({ error: `${t.name} spielt gerade keine Partie.` });
      if (mode === 'draw') ctx.endGame(g, 'draw', 'agreement');
      else ctx.abortGame(g);
      log(me, 'end-game', t, mode === 'draw' ? 'als Remis beendet' : 'ohne Wertung abgebrochen'); ack?.({ ok: true });
    });

    // ---- Moderation
    on('adm:groups', async (_, ack) => {
      ack?.({ list: Object.values(db.groups || {}).map((g) => ({ id: g.id, name: g.name, n: g.members.length, owner: db.users[g.owner]?.name || '?', members: g.members.map((id) => db.users[id]?.name).filter(Boolean), last: g.last || null, createdAt: g.createdAt })).sort((a, b) => (b.last?.at || b.createdAt) - (a.last?.at || a.createdAt)) });
    });
    on('adm:groupChat', async ({ id }, ack) => { const g = db.groups?.[id]; if (!g) return ack?.({ error: 'Gruppe nicht gefunden.' }); ack?.({ name: g.name, msgs: (await chatLoad('g:' + id)).slice(-200) }); });
    on('adm:groupDelete', async ({ id }, ack, me) => {
      const g = db.groups?.[id]; if (!g) return ack?.({ error: 'Gruppe nicht gefunden.' });
      const members = [...g.members]; await groupDelete(id);
      for (const uid of members) { emitTo(uid, 'group:update', { id, deleted: true }); notifyPlayer(db.users[uid] || { id: uid }, `🗑️ Die Gruppe „${g.name}“ wurde von einem Admin gelöscht.`); }
      log(me, 'group-delete', null, g.name); ack?.({ ok: true });
    });
    on('adm:groupRename', async ({ id, name }, ack, me) => {
      const g = db.groups?.[id]; if (!g) return ack?.({ error: 'Gruppe nicht gefunden.' });
      const n = String(name || '').replace(/[<>\u0000-\u001f]/g, '').trim().slice(0, 24); if (n.length < 2) return ack?.({ error: 'Name zu kurz.' });
      const old = g.name; g.name = n; await ctx.groupSave(g); for (const uid of g.members) emitTo(uid, 'group:update', { id }); log(me, 'group-rename', null, `${old} → ${n}`); ack?.({ ok: true });
    });
    on('adm:groupClear', async ({ id }, ack, me) => { const g = db.groups?.[id]; if (!g) return ack?.({ error: 'Gruppe nicht gefunden.' }); await chatStore('g:' + id, []); log(me, 'group-clear', null, g.name); ack?.({ ok: true }); });
    on('adm:dmChat', async ({ a, b }, ack, me) => {
      const A1 = target(a, ack); if (!A1) return; const B1 = target(b, ack); if (!B1) return;
      const msgs = await chatLoad([A1.id, B1.id].sort().join(':'));
      log(me, 'read-chat', A1, `Chat mit ${B1.name} gelesen`);
      ack?.({ a: { id: A1.id, name: A1.name }, b: { id: B1.id, name: B1.name }, msgs: msgs.slice(-200) });
    });
    on('adm:chatBlocks', async (_, ack) => ack?.({ list: chatBlocks.slice(0, 200) }));

    // ---- Log
    on('adm:log', async ({ q = '', action = '' }, ack) => {
      const k = String(q).toLowerCase();
      ack?.({ list: adminLog.filter((e) => (!action || e.action === action || (action === 'ban' && /ban/.test(e.action))) && (!k || `${e.by} ${e.target?.name || ''} ${e.detail}`.toLowerCase().includes(k))).slice(0, 300) });
    });

    // ---- Live (erweitert)
    on('adm:lobbies', async (_, ack) => {
      ack?.({
        queue: ctx.getQueue().map((q) => ({ ...brief(db.users[q.userId] || { id: q.userId, name: '?' }), since: q.since, timeMs: q.timeMs || 600000 })),
        rooms: [...rooms.values()].map((r) => ({ code: r.code, host: db.users[r.hostId]?.name || '?', timeMs: r.timeMs, variant: r.variant, at: r.at })),
        four: [...lobbies4.values()].map((l) => ({ code: l.code, host: db.users[l.hostId]?.name || '?', teams: !!l.teams, players: l.seats.map((id) => db.users[id]?.name || '?'), timeMs: l.timeMs })),
        fourGames: [...games4.values()].filter((g) => g.status === 'playing').map((g) => ({ id: g.id, teams: !!g.state.teams, ply: g.state.ply, players: g.players.map((p) => (p.uid ? db.users[p.uid]?.name : `🤖 ${p.bot.name}`)) })),
      });
    });
    on('adm:queueClear', async (_, ack, me) => { const q = ctx.getQueue(); for (const e of q) notifyPlayer({ id: e.userId }, 'Die Suche wurde von einem Admin abgebrochen.'); ctx.setQueue([]); log(me, 'queue-clear', null, `${q.length} Spieler`); ack?.({ ok: true }); });
    on('adm:lobbyClose', async ({ code }, ack, me) => {
      code = String(code || '');
      if (rooms.has(code)) { const r = rooms.get(code); rooms.delete(code); notifyPlayer({ id: r.hostId }, 'Deine Lobby wurde von einem Admin geschlossen.'); }
      else if (lobbies4.has(code)) { const l = lobbies4.get(code); lobbies4.delete(code); for (const id of l.seats) emitTo(id, 'four:lobby', { closed: true }); }
      else return ack?.({ error: 'Lobby nicht gefunden.' });
      log(me, 'lobby-close', null, code); ack?.({ ok: true });
    });
    on('adm:fourEnd', async ({ id }, ack, me) => { const g = games4.get(id); if (!g || g.status !== 'playing') return ack?.({ error: 'Spiel läuft nicht mehr.' }); ctx.abortFour(g); log(me, 'four-abort', null, id); ack?.({ ok: true }); });

    // ---- System
    on('adm:system', async (_, ack) => {
      const mem = process.memoryUsage();
      ack?.({ version: VERSION, uptime: process.uptime(), node: process.version, rss: mem.rss, heap: mem.heapUsed, sockets: io.engine.clientsCount, online: online.size, users: Object.keys(db.users).length, db: mongo() ? 'MongoDB' : 'Datei', games: [...games.values()].filter((g) => g.status !== 'over').length, four: [...games4.values()].filter((g) => g.status === 'playing').length, settings: publicSettings(), peakToday: peakToday.n });
    });
    on('adm:reloadAll', async (_, ack, me) => { io.emit('server:reload'); log(me, 'reload-all'); ack?.({ ok: true }); });
    on('adm:saveNow', async (_, ack, me) => { await ctx.flush(); log(me, 'save-now'); ack?.({ ok: true }); });
    on('adm:export', async ({ what }, ack, me) => {
      log(me, 'export', null, what);
      if (what === 'players') {
        const rows = [['Name', 'Code', 'Elo', 'Münzen', 'Partien', 'Siege', 'Niederlagen', 'Remis', 'Bot-Siege', 'Konto', 'Erstellt', 'Zuletzt online', 'Anti-Cheat-Punkte', 'Gesperrt']];
        for (const u of Object.values(db.users)) rows.push([u.name, u.code, u.rating, u.coins, u.stats.games, u.stats.wins, u.stats.losses, u.stats.draws, u.stats.botWins, u.pass ? 'ja' : 'Gast', new Date(u.createdAt || 0).toISOString(), u.lastSeen ? new Date(u.lastSeen).toISOString() : '', acScore(u), banInfo(u) ? 'ja' : '']);
        return ack?.({ name: 'spieler.csv', mime: 'text/csv', data: rows.map((r) => r.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(';')).join('\n') });
      }
      if (what === 'matches') return ack?.({ name: 'partien.json', mime: 'application/json', data: JSON.stringify(await matchList({ limit: 1000 }), null, 1) });
      if (what === 'log') return ack?.({ name: 'admin-log.json', mime: 'application/json', data: JSON.stringify(adminLog, null, 1) });
      ack?.({ error: 'Unbekannter Export.' });
    });
    on('adm:openCases', async (_, ack) => ack?.({ n: Object.values(db.users).filter((u) => acScore(u) >= 30).length }));
  }

  return { init, register, log, onConnect, onDisconnect, precheck, eloFactor, afterOnline, afterBot, afterFour, coins, price, playBlock, chatBlock, blockedChat, startCoins, publicSettings, acScore };
}
