// Handel unter Freunden: Bretter, Figuren, Formen, Finisher und Münzen tauschen.
// Angebot -> Freund nimmt an/lehnt ab. Beim Annehmen prüft der Server alles neu und tauscht atomar.
import crypto from 'crypto';
import { findItem } from './public/js/catalog.js';

const KINDS = ['board', 'pieces', 'shape', 'finisher'];
const TRADE_TTL = 24 * 3600_000, MAX_OPEN = 5, MAX_COINS = 1_000_000;

export function setupTrade({ getDb, online, emitTo, pub, priv, save, social, chatLoad, chatStore, banErr, log }) {
  const db = new Proxy({}, { get: (_, k) => getDb()[k] });
  let trades = []; // { id, from, to, give:{items,coins}, want:{items,coins}, note, at, status, doneAt }
  const persist = () => chatStore('__trades', trades.filter((t) => t.status === 'open' || Date.now() - (t.doneAt || t.at) < 7 * 86_400_000)).catch(() => {});
  async function init() { const t = await chatLoad('__trades').catch(() => []); trades = Array.isArray(t) ? t : []; }
  const expire = () => { let ch = false; for (const t of trades) if (t.status === 'open' && Date.now() - t.at > TRADE_TTL) { t.status = 'expired'; t.doneAt = Date.now(); ch = true; } if (ch) persist(); };
  const tradable = (u) => Object.fromEntries(KINDS.map((k) => [k, (u.owned?.[k] || []).filter((id) => id !== 'klassisch' && findItem(k, id))]));
  const cleanItems = (list) => (Array.isArray(list) ? list : []).slice(0, 20).map((x) => [String(x?.[0]), String(x?.[1])]).filter(([k, id]) => KINDS.includes(k) && findItem(k, id) && id !== 'klassisch');
  const owns = (u, [k, id]) => (u.owned?.[k] || []).includes(id);
  const view = (t) => ({ ...t, fromUser: db.users[t.from] ? pub(db.users[t.from]) : { name: '?' }, toUser: db.users[t.to] ? pub(db.users[t.to]) : { name: '?' } });
  const notifyBoth = (t, extra = {}) => { for (const id of [t.from, t.to]) emitTo(id, 'trade:update', { trade: view(t), ...extra }); };

  // Prüfen, ob ein Angebot (noch) möglich ist – Fehlertext oder null
  function check(t, A, B) {
    if (!A || !B) return 'Spieler nicht gefunden.';
    if (!social(A).friends.includes(B.id)) return 'Ihr seid keine Freunde mehr.';
    for (const it of t.give.items) { if (!owns(A, it)) return `${A.name} besitzt „${findItem(...it).name}“ nicht mehr.`; if (owns(B, it)) return `${B.name} hat „${findItem(...it).name}“ schon.`; }
    for (const it of t.want.items) { if (!owns(B, it)) return `${B.name} besitzt „${findItem(...it).name}“ nicht mehr.`; if (owns(A, it)) return `${A.name} hat „${findItem(...it).name}“ schon.`; }
    if (A.coins < t.give.coins) return `${A.name} hat nicht mehr genug Münzen.`;
    if (B.coins < t.want.coins) return `${B.name} hat nicht genug Münzen.`;
    return null;
  }
  function move(from, to, [k, id]) {
    from.owned[k] = from.owned[k].filter((x) => x !== id);
    if (from.equipped[k] === id) from.equipped[k] = 'klassisch';
    (to.owned[k] ||= ['klassisch']).push(id);
  }

  function register(socket, getUser, need) {
    const on = (ev, fn) => socket.on(ev, need(async (data = {}, ack) => { try { ack?.(await fn(getUser(), data || {})); } catch (e) { console.error('[trade]', e); ack?.({ error: 'Fehler beim Handel.' }); } }));

    on('trade:inventory', (u, { id }) => {
      const f = db.users[String(id || '')];
      if (!f || !social(u).friends.includes(f.id)) return { error: 'Handeln geht nur mit Freunden.' };
      return { mine: tradable(u), theirs: tradable(f), myCoins: u.coins, theirCoins: f.coins, friend: pub(f) };
    });
    on('trade:list', (u) => {
      expire();
      const mine = trades.filter((t) => t.from === u.id || t.to === u.id);
      return { open: mine.filter((t) => t.status === 'open').map(view), recent: mine.filter((t) => t.status !== 'open').slice(-10).reverse().map(view) };
    });
    on('trade:offer', (u, { to, give = {}, want = {}, note = '' }) => {
      if (banErr(u)) return { error: banErr(u) };
      expire();
      const B = db.users[String(to || '')];
      if (!B || B.id === u.id || !social(u).friends.includes(B.id)) return { error: 'Handeln geht nur mit Freunden.' };
      if (trades.filter((t) => t.status === 'open' && t.from === u.id).length >= MAX_OPEN) return { error: `Du hast schon ${MAX_OPEN} offene Angebote. Warte auf Antworten oder zieh welche zurück.` };
      const t = {
        id: crypto.randomUUID().slice(0, 12), from: u.id, to: B.id, at: Date.now(), status: 'open', note: String(note).replace(/[<>\u0000-\u001f]/g, '').trim().slice(0, 120),
        give: { items: cleanItems(give.items), coins: Math.max(0, Math.min(MAX_COINS, Math.floor(+give.coins || 0))) },
        want: { items: cleanItems(want.items), coins: Math.max(0, Math.min(MAX_COINS, Math.floor(+want.coins || 0))) },
      };
      if (!t.give.items.length && !t.give.coins && !t.want.items.length && !t.want.coins) return { error: 'Das Angebot ist leer.' };
      const err = check(t, u, B); if (err) return { error: err };
      trades.push(t); persist();
      notifyBoth(t, { incoming: true });
      return { ok: true, trade: view(t) };
    });
    on('trade:cancel', (u, { id }) => {
      const t = trades.find((x) => x.id === id && x.status === 'open' && x.from === u.id);
      if (!t) return { error: 'Angebot nicht gefunden.' };
      t.status = 'cancelled'; t.doneAt = Date.now(); persist(); notifyBoth(t);
      return { ok: true };
    });
    on('trade:respond', (u, { id, accept }) => {
      expire();
      const t = trades.find((x) => x.id === id && x.status === 'open' && x.to === u.id);
      if (!t) return { error: 'Angebot nicht gefunden oder schon erledigt.' };
      if (!accept) { t.status = 'declined'; t.doneAt = Date.now(); persist(); notifyBoth(t); return { ok: true }; }
      if (banErr(u)) return { error: banErr(u) };
      const A = db.users[t.from], B = u;
      const err = check(t, A, B);
      if (err) { t.status = 'failed'; t.reason = err; t.doneAt = Date.now(); persist(); notifyBoth(t); return { error: `Handel nicht möglich: ${err}` }; }
      // alles auf einmal tauschen
      for (const it of t.give.items) move(A, B, it);
      for (const it of t.want.items) move(B, A, it);
      A.coins += t.want.coins - t.give.coins; B.coins += t.give.coins - t.want.coins;
      t.status = 'done'; t.doneAt = Date.now();
      save(); persist();
      log?.(null, 'trade', A, `Handel mit ${B.name}: gibt ${t.give.items.map((x) => x[1]).join(', ') || '–'} + ${t.give.coins} Münzen, bekommt ${t.want.items.map((x) => x[1]).join(', ') || '–'} + ${t.want.coins} Münzen`);
      for (const p of [A, B]) emitTo(p.id, 'profile:refresh', { profile: priv(p) });
      notifyBoth(t, { done: true });
      return { ok: true, profile: priv(B) };
    });
  }
  return { init, register };
}
