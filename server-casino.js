// Casino: Blackjack, Mines und Roulette (Rot/Schwarz/Grün) – nur mit Spiel-Münzen.
// Alles Zufällige passiert hier auf dem Server (crypto), der Browser zeigt nur an.
import crypto from 'crypto';

export const CASINO = { min: 10, max: 10000 };
const R = (n) => crypto.randomInt(n);
function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = R(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; }

// ---------------------------------------------------------------- Blackjack
const SUITS = ['♠', '♥', '♦', '♣'], RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const newShoe = () => shuffle(Array.from({ length: 6 }, () => SUITS.flatMap((s) => RANKS.map((r) => r + s))).flat());
export function handValue(cards) {
  let t = 0, aces = 0;
  for (const c of cards) { const r = c.slice(0, -1); if (r === 'A') { aces++; t += 11; } else t += 'JQK'.includes(r) || r === '10' ? 10 : +r; }
  while (t > 21 && aces) { t -= 10; aces--; }
  return t;
}
const isBJ = (cards) => cards.length === 2 && handValue(cards) === 21;

// ---------------------------------------------------------------- Mines: 20 Felder, 1–10 Bomben, 3 % Hausvorteil
export const MINES_FIELDS = 20;
export function minesMult(safe, bombs) {
  let m = 0.97;
  for (let i = 0; i < safe; i++) m *= (MINES_FIELDS - i) / (MINES_FIELDS - bombs - i);
  return safe ? Math.floor(m * 100) / 100 : 1;
}

// ---------------------------------------------------------------- Roulette: 15 Felder – 0 grün, 1–7 rot, 8–14 schwarz
export const WHEEL = [0, 1, 8, 2, 9, 3, 10, 4, 11, 5, 12, 6, 13, 7, 14]; // Reihenfolge auf dem Rad
export const colorOf = (n) => (n === 0 ? 'green' : n <= 7 ? 'red' : 'black');
const PAYOUT = { red: 2, black: 2, green: 14 };

export function setupCasino({ save, priv, io }) {
  const history = []; // letzte Roulette-Ergebnisse (für alle gleich)
  const checkBet = (u, raw) => {
    const bet = Math.floor(Number(raw));
    if (!(bet >= CASINO.min)) return { error: `Mindesteinsatz: ${CASINO.min} Münzen.` };
    if (bet > CASINO.max) return { error: `Höchsteinsatz: ${CASINO.max.toLocaleString('de-DE')} Münzen.` };
    if (bet > u.coins) return { error: 'Dafür hast du nicht genug Münzen.' };
    return { bet };
  };
  const stat = (u, game, wager, payout) => {
    const c = (u.casino ||= { wagered: 0, won: 0, games: 0, by: {} });
    c.wagered += wager; c.won += payout; c.games++;
    const g = (c.by[game] ||= { games: 0, wagered: 0, won: 0, best: 0 });
    g.games++; g.wagered += wager; g.won += payout; g.best = Math.max(g.best, payout - wager);
  };

  // Blackjack: sichtbarer Stand (zweite Dealer-Karte verdeckt, solange die Runde läuft)
  const bjView = (b) => b && ({
    bet: b.bet, player: b.player, dealer: b.done ? b.dealer : [b.dealer[0], '??'], done: b.done, outcome: b.outcome || null, payout: b.payout || 0,
    pv: handValue(b.player), dv: b.done ? handValue(b.dealer) : handValue([b.dealer[0]]), canDouble: !b.done && b.player.length === 2 && !b.doubled,
  });
  function bjFinish(u, b) {
    const p = handValue(b.player);
    if (p <= 21 && !(isBJ(b.player) && !b.doubled)) while (handValue(b.dealer) < 17) b.dealer.push(b.deck.pop());
    const d = handValue(b.dealer), pBJ = isBJ(b.player) && !b.doubled, dBJ = isBJ(b.dealer);
    let outcome;
    if (p > 21) outcome = 'bust';
    else if (pBJ && !dBJ) outcome = 'blackjack';
    else if (dBJ && !pBJ) outcome = 'lose';
    else if (d > 21) outcome = 'win';
    else outcome = p > d ? 'win' : p < d ? 'lose' : 'push';
    const payout = outcome === 'blackjack' ? Math.floor(b.bet * 2.5) : outcome === 'win' ? b.bet * 2 : outcome === 'push' ? b.bet : 0;
    Object.assign(b, { done: true, outcome, payout });
    u.coins += payout; stat(u, 'blackjack', b.bet, payout);
    save();
  }

  function register(socket, getUser, need) {
    let last = 0;
    const on = (ev, fn) => socket.on(ev, need(async (data = {}, ack) => {
      const u = getUser();
      if (Date.now() - last < 150) return ack?.({ error: 'Nicht so schnell.' });
      last = Date.now();
      try { ack?.(fn(u, data || {})); } catch (e) { console.error('[casino]', e); ack?.({ error: 'Fehler im Casino.' }); }
    }));
    const done = (u, extra) => ({ ...extra, coins: u.coins, profile: priv(u) });

    on('casino:state', (u) => ({ bj: u.bj && !u.bj.done ? bjView(u.bj) : null, mines: u.mines && !u.mines.done ? minesView(u.mines) : null, history: history.slice(0, 20), stats: u.casino || null, limits: CASINO }));

    // --- Blackjack
    on('bj:deal', (u, { bet }) => {
      if (u.bj && !u.bj.done) return { error: 'Spiel erst die laufende Runde zu Ende.', bj: bjView(u.bj) };
      const c = checkBet(u, bet); if (c.error) return c;
      u.coins -= c.bet;
      const deck = newShoe();
      const b = u.bj = { bet: c.bet, deck, player: [deck.pop()], dealer: [deck.pop()], done: false };
      b.player.push(deck.pop()); b.dealer.push(deck.pop());
      if (isBJ(b.player) || isBJ(b.dealer)) bjFinish(u, b);
      save();
      return done(u, { bj: bjView(b) });
    });
    on('bj:hit', (u) => {
      const b = u.bj; if (!b || b.done) return { error: 'Keine laufende Runde.' };
      b.player.push(b.deck.pop());
      if (handValue(b.player) >= 21) bjFinish(u, b);
      save();
      return done(u, { bj: bjView(b) });
    });
    on('bj:stand', (u) => {
      const b = u.bj; if (!b || b.done) return { error: 'Keine laufende Runde.' };
      bjFinish(u, b);
      return done(u, { bj: bjView(b) });
    });
    on('bj:double', (u) => {
      const b = u.bj; if (!b || b.done || b.player.length !== 2 || b.doubled) return { error: 'Verdoppeln geht nur mit den ersten zwei Karten.' };
      if (u.coins < b.bet) return { error: 'Zum Verdoppeln fehlen dir Münzen.' };
      u.coins -= b.bet; b.bet *= 2; b.doubled = true;
      b.player.push(b.deck.pop());
      bjFinish(u, b);
      return done(u, { bj: bjView(b) });
    });

    // --- Mines
    on('mines:start', (u, { bet, bombs }) => {
      if (u.mines && !u.mines.done) return { error: 'Beende erst die laufende Runde.', mines: minesView(u.mines) };
      const n = Math.floor(Number(bombs));
      if (!(n >= 1 && n <= 10)) return { error: 'Wähle 1 bis 10 Bomben.' };
      const c = checkBet(u, bet); if (c.error) return c;
      u.coins -= c.bet;
      const bombsAt = shuffle(Array.from({ length: MINES_FIELDS }, (_, i) => i)).slice(0, n);
      u.mines = { bet: c.bet, bombs: n, bombsAt, revealed: [], done: false };
      save();
      return done(u, { mines: minesView(u.mines) });
    });
    on('mines:pick', (u, { i }) => {
      const m = u.mines; i = Math.floor(Number(i));
      if (!m || m.done) return { error: 'Keine laufende Runde.' };
      if (!(i >= 0 && i < MINES_FIELDS) || m.revealed.includes(i)) return { error: 'Ungültiges Feld.' };
      if (m.bombsAt.includes(i)) {
        Object.assign(m, { done: true, hit: i, payout: 0 }); stat(u, 'mines', m.bet, 0); save();
        return done(u, { mines: minesView(m), boom: true });
      }
      m.revealed.push(i);
      if (m.revealed.length === MINES_FIELDS - m.bombs) return cashout(u, m); // alles Sichere gefunden
      save();
      return done(u, { mines: minesView(m) });
    });
    const cashout = (u, m) => {
      const payout = Math.floor(m.bet * minesMult(m.revealed.length, m.bombs) + 1e-6);
      Object.assign(m, { done: true, payout }); u.coins += payout; stat(u, 'mines', m.bet, payout); save();
      return done(u, { mines: minesView(m), cashed: true });
    };
    on('mines:cashout', (u) => {
      const m = u.mines; if (!m || m.done) return { error: 'Keine laufende Runde.' };
      if (!m.revealed.length) return { error: 'Deck erst mindestens ein Feld auf.' };
      return cashout(u, m);
    });

    // --- Roulette
    on('roulette:spin', (u, { bet, color }) => {
      if (!PAYOUT[color]) return { error: 'Setze auf Rot, Schwarz oder Grün.' };
      const c = checkBet(u, bet); if (c.error) return c;
      const n = R(15), col = colorOf(n), payout = col === color ? c.bet * PAYOUT[color] : 0;
      u.coins += payout - c.bet; stat(u, 'roulette', c.bet, payout);
      history.unshift(n); history.length = Math.min(history.length, 30);
      save();
      return done(u, { result: n, color: col, payout, bet: c.bet, history: history.slice(0, 20) });
    });
  }
  // Mines: Bomben erst am Ende zeigen
  function minesView(m) {
    return { bet: m.bet, bombs: m.bombs, revealed: m.revealed, done: m.done, hit: m.hit ?? null, payout: m.payout || 0,
      bombsAt: m.done ? m.bombsAt : null, mult: minesMult(m.revealed.length, m.bombs), next: minesMult(m.revealed.length + 1, m.bombs) };
  }
  return { register };
}
