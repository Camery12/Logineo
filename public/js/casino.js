// Casino-Tab: Blackjack, Mines, Roulette (Rot/Schwarz/Grün). Ergebnisse kommen immer vom Server.
let H = null, root = null, tab = localStorage.getItem('casinoTab') || 'blackjack', S = { bj: null, mines: null, history: [], limits: { min: 10, max: 10000 }, stats: null };
let bet = { blackjack: 100, mines: 100, roulette: 100 }, bombs = +(localStorage.getItem('minesBombs') || 3), spinning = false;
const WHEEL = [0, 1, 8, 2, 9, 3, 10, 4, 11, 5, 12, 6, 13, 7, 14];
const colorOf = (n) => (n === 0 ? 'green' : n <= 7 ? 'red' : 'black');

export async function renderCasino(rootEl, helpers) {
  H = helpers; root = rootEl;
  const r = await H.emit('casino:state');
  if (!r.error) Object.assign(S, r);
  draw();
}
const coins = () => H.state.profile?.coins ?? 0;
const after = (r) => { if (r.profile) H.setProfile(r.profile, { coinsAnim: true }); };

function draw() {
  const tabs = [['blackjack', '🃏 Blackjack'], ['mines', '💣 Mines'], ['roulette', '🎡 Roulette']];
  root.innerHTML = `<div class="section-title"><div><h2>🎰 Casino</h2><p>Spiel mit deinen Münzen – nur zum Spaß, echtes Geld gibt es hier nicht. Einsatz ${H.fmtNum(S.limits.min)} bis ${H.fmtNum(S.limits.max)} Münzen.</p></div>
      <span class="pill coin-pill" style="font-size:18px;padding:12px 18px"><i class="coin" style="width:22px;height:22px"></i><b id="cs-coins">${H.fmtNum(coins())}</b></span></div>
    <div class="tabs">${tabs.map(([k, l]) => `<button data-ct="${k}" class="${k === tab ? 'on' : ''}">${l}</button>`).join('')}</div>
    <div class="card casino-card" id="cs-body"></div>
    ${S.stats ? `<p class="muted small cs-stats">Deine Bilanz: ${S.stats.games} Spiele · eingesetzt ${H.fmtNum(S.stats.wagered)} · ausgezahlt ${H.fmtNum(S.stats.won)} · <b class="${S.stats.won - S.stats.wagered >= 0 ? 'res-win' : 'res-loss'}">${S.stats.won - S.stats.wagered >= 0 ? '+' : ''}${H.fmtNum(S.stats.won - S.stats.wagered)}</b></p>` : ''}`;
  H.$$('[data-ct]', root).forEach((b) => b.onclick = () => { if (spinning) return; tab = b.dataset.ct; localStorage.setItem('casinoTab', tab); draw(); });
  ({ blackjack: drawBJ, mines: drawMines, roulette: drawRoulette })[tab](H.$('#cs-body', root));
}
const refreshCoins = () => { const el = H.$('#cs-coins', root); if (el) el.textContent = H.fmtNum(coins()); };

// Einsatz-Auswahl (gemeinsam)
function betBox(game, disabled = false) {
  const v = bet[game];
  return `<div class="cs-bet ${disabled ? 'off' : ''}"><label>Einsatz</label>
    <div class="cs-bet-row"><input type="number" id="cs-bet" min="${S.limits.min}" max="${S.limits.max}" value="${v}" ${disabled ? 'disabled' : ''}>
    ${[['½', 'half'], ['×2', 'double'], ['10', 10], ['100', 100], ['1.000', 1000], ['Max', 'max']].map(([l, a]) => `<button class="btn sm" data-bet="${a}" ${disabled ? 'disabled' : ''}>${l}</button>`).join('')}</div></div>`;
}
function wireBet(box, game) {
  const inp = H.$('#cs-bet', box); if (!inp) return;
  const set = (n) => { bet[game] = Math.max(S.limits.min, Math.min(S.limits.max, Math.floor(n) || S.limits.min)); inp.value = bet[game]; };
  inp.onchange = () => set(+inp.value);
  H.$$('[data-bet]', box).forEach((b) => b.onclick = () => { const a = b.dataset.bet; set(a === 'half' ? bet[game] / 2 : a === 'double' ? bet[game] * 2 : a === 'max' ? Math.min(coins(), S.limits.max) : +a); });
}
const readBet = (box, game) => { const inp = H.$('#cs-bet', box); if (inp) bet[game] = Math.floor(+inp.value) || bet[game]; return bet[game]; };

// ---------------------------------------------------------------- Blackjack
const cardHTML = (c, i = 0) => {
  if (c === '??') return `<div class="pcard back" style="--d:${i}"></div>`;
  const s = c.slice(-1), r = c.slice(0, -1), red = s === '♥' || s === '♦';
  return `<div class="pcard ${red ? 'red' : ''}" style="--d:${i}"><b>${r}</b><i>${s}</i><b class="bot">${r}</b></div>`;
};
const BJ_TEXT = { blackjack: ['🎉 Blackjack!', 'win'], win: ['🏆 Gewonnen!', 'win'], push: ['🤝 Unentschieden – Einsatz zurück', 'draw'], lose: ['💔 Verloren', 'loss'], bust: ['💥 Über 21 – verloren', 'loss'] };
function drawBJ(box) {
  const b = S.bj, live = b && !b.done;
  box.innerHTML = `<div class="bj-table">
      <div class="bj-hand"><div class="bj-label">Dealer ${b ? `<span class="bj-val">${b.dv}</span>` : ''}</div><div class="bj-cards">${b ? b.dealer.map(cardHTML).join('') : '<div class="pcard back ghost"></div><div class="pcard back ghost"></div>'}</div></div>
      <div class="bj-mid">${b?.done ? `<div class="bj-result ${BJ_TEXT[b.outcome][1]}">${BJ_TEXT[b.outcome][0]}${b.payout ? ` <span>+${H.fmtNum(b.payout)} 🪙</span>` : ''}</div>` : live ? `<div class="muted">Einsatz ${H.fmtNum(b.bet)} 🪙</div>` : '<div class="muted">Dealer zieht bis 16 und bleibt ab 17 stehen · Blackjack zahlt 3:2</div>'}</div>
      <div class="bj-hand"><div class="bj-label">Du ${b ? `<span class="bj-val">${b.pv}</span>` : ''}</div><div class="bj-cards">${b ? b.player.map(cardHTML).join('') : '<div class="pcard back ghost"></div><div class="pcard back ghost"></div>'}</div></div>
    </div>
    <div class="cs-controls">${live
      ? `<button class="btn primary" data-a="hit">➕ Karte</button><button class="btn" data-a="stand">✋ Stehen</button>${b.canDouble ? `<button class="btn gold" data-a="double" ${coins() < b.bet ? 'disabled' : ''}>×2 Verdoppeln</button>` : ''}`
      : `${betBox('blackjack')}<button class="btn primary cs-go" data-a="deal">🃏 ${b ? 'Neue Runde' : 'Austeilen'}</button>`}</div>`;
  wireBet(box, 'blackjack');
  H.$$('[data-a]', box).forEach((btn) => btn.onclick = async () => {
    const a = btn.dataset.a;
    H.$$('[data-a]', box).forEach((x) => x.disabled = true);
    const r = a === 'deal' ? await H.emit('bj:deal', { bet: readBet(box, 'blackjack') }) : await H.emit('bj:' + a);
    if (r.error) { H.toast(H.esc(r.error), 'warn'); if (r.bj) S.bj = r.bj; drawBJ(box); return; }
    after(r); S.bj = r.bj;
    H.sound.move();
    drawBJ(box); refreshCoins();
    if (S.bj.done) { const o = S.bj.outcome; if (o === 'win' || o === 'blackjack') { H.sound.win(); if (o === 'blackjack') H.confetti(); } else if (o !== 'push') H.sound.lose(); }
  });
}

// ---------------------------------------------------------------- Mines (20 Felder, 1–10 Bomben)
function minesMult(safe, b) { let m = 0.97; for (let i = 0; i < safe; i++) m *= (20 - i) / (20 - b - i); return safe ? Math.floor(m * 100) / 100 : 1; }
function drawMines(box) {
  const m = S.mines, live = m && !m.done;
  const nb = live || m ? m.bombs : bombs;
  box.innerHTML = `<div class="mines-wrap">
      <div class="mines-side">
        ${live ? `<div class="mines-info"><div><span class="muted small">Einsatz</span><b>${H.fmtNum(m.bet)} 🪙</b></div><div><span class="muted small">Bomben</span><b>💣 ${m.bombs}</b></div>
            <div><span class="muted small">Jetzt</span><b class="res-win">×${m.mult.toFixed(2)}</b></div><div><span class="muted small">Nächstes Feld</span><b>×${m.next.toFixed(2)}</b></div></div>
            <button class="btn gold cs-go" data-a="cash" ${m.revealed.length ? '' : 'disabled'}>💰 Auszahlen ${m.revealed.length ? `${H.fmtNum(Math.floor(m.bet * m.mult + 1e-6))} 🪙` : ''}</button>`
          : `${betBox('mines')}
            <label class="cs-lab">Bomben: <b id="mn-b">${bombs}</b> <span class="muted small">(mehr Bomben = mehr Gewinn pro Feld)</span></label>
            <input type="range" id="mn-range" min="1" max="10" value="${bombs}">
            <div class="muted small" id="mn-prev"></div>
            <button class="btn primary cs-go" data-a="start">💣 Spiel starten</button>
            ${m?.done ? `<div class="bj-result ${m.payout ? 'win' : 'loss'}">${m.payout ? `💰 Ausgezahlt: +${H.fmtNum(m.payout)} 🪙` : '💥 Bombe getroffen!'}</div>` : ''}`}
      </div>
      <div class="mines-grid ${live ? 'live' : ''}">${Array.from({ length: 20 }, (_, i) => {
        const rev = m?.revealed.includes(i), bomb = m?.bombsAt?.includes(i), hit = m?.hit === i;
        return `<button class="mine ${rev ? 'safe' : ''} ${m?.done && bomb ? 'bomb' : ''} ${hit ? 'hit' : ''} ${m?.done && !rev && !bomb ? 'dim' : ''}" data-i="${i}" ${live && !rev ? '' : 'disabled'}>${rev ? '💎' : m?.done && bomb ? '💣' : m?.done ? '💎' : ''}</button>`;
      }).join('')}</div>
    </div>`;
  wireBet(box, 'mines');
  const range = H.$('#mn-range', box);
  const prev = () => { const el = H.$('#mn-prev', box); if (el) el.textContent = `1 Feld: ×${minesMult(1, bombs).toFixed(2)} · 3 Felder: ×${minesMult(3, bombs).toFixed(2)} · 5 Felder: ×${minesMult(5, bombs).toFixed(2)}`; };
  if (range) { range.oninput = () => { bombs = +range.value; localStorage.setItem('minesBombs', bombs); H.$('#mn-b', box).textContent = bombs; prev(); }; prev(); }
  const st = H.$('[data-a="start"]', box);
  if (st) st.onclick = async () => {
    st.disabled = true;
    const r = await H.emit('mines:start', { bet: readBet(box, 'mines'), bombs });
    if (r.error) { H.toast(H.esc(r.error), 'warn'); if (r.mines) S.mines = r.mines; drawMines(box); return; }
    after(r); S.mines = r.mines; H.sound.move(); drawMines(box); refreshCoins();
  };
  const cash = H.$('[data-a="cash"]', box);
  if (cash) cash.onclick = async () => {
    cash.disabled = true;
    const r = await H.emit('mines:cashout');
    if (r.error) { H.toast(H.esc(r.error), 'warn'); drawMines(box); return; }
    after(r); S.mines = r.mines; H.sound.win(); H.sound.coin(); drawMines(box); refreshCoins();
  };
  H.$$('.mine:not([disabled])', box).forEach((b) => b.onclick = async () => {
    H.$$('.mine', box).forEach((x) => x.disabled = true);
    const r = await H.emit('mines:pick', { i: +b.dataset.i });
    if (r.error) { H.toast(H.esc(r.error), 'warn'); drawMines(box); return; }
    after(r); S.mines = r.mines;
    if (r.boom) { H.sound.boom(); box.classList.remove('shake'); void box.offsetWidth; box.classList.add('shake'); }
    else if (r.cashed) { H.sound.win(); H.confetti(); } else H.sound.click();
    drawMines(box); refreshCoins();
  });
}

// ---------------------------------------------------------------- Roulette (Rot ×2, Schwarz ×2, Grün ×14)
let rlColor = 'red', rlPos = 0;
const SLOT = 72; // Breite eines Feldes in px
function stripHTML() {
  let h = ''; for (let k = 0; k < 8; k++) for (const n of WHEEL) h += `<div class="rl-slot ${colorOf(n)}">${n}</div>`;
  return h;
}
function drawRoulette(box) {
  box.innerHTML = `<div class="rl-wrap"><div class="rl-pointer"></div><div class="rl-strip" id="rl-strip">${stripHTML()}</div></div>
    <div class="rl-hist">${(S.history || []).map((n) => `<span class="rl-dot ${colorOf(n)}">${n}</span>`).join('') || '<span class="muted small">Noch keine Drehungen.</span>'}</div>
    <div class="rl-bets">${[['red', 'Rot', '×2', '1–7'], ['green', 'Grün', '×14', '0'], ['black', 'Schwarz', '×2', '8–14']].map(([c, l, x, nums]) => `<button class="rl-bet ${c} ${rlColor === c ? 'on' : ''}" data-c="${c}"><b>${l}</b><span>${x}</span><small>${nums}</small></button>`).join('')}</div>
    <div class="cs-controls">${betBox('roulette', spinning)}<button class="btn primary cs-go" id="rl-spin" ${spinning ? 'disabled' : ''}>🎡 Drehen</button></div>
    <div id="rl-res"></div>`;
  wireBet(box, 'roulette');
  const strip = H.$('#rl-strip', box);
  const center = () => strip.parentElement.clientWidth / 2 - SLOT / 2;
  strip.style.transform = `translateX(${center() - rlPos * SLOT}px)`;
  H.$$('.rl-bet', box).forEach((b) => b.onclick = () => { if (spinning) return; rlColor = b.dataset.c; H.$$('.rl-bet', box).forEach((x) => x.classList.toggle('on', x === b)); });
  H.$('#rl-spin', box).onclick = async () => {
    if (spinning) return;
    spinning = true; H.$('#rl-spin', box).disabled = true;
    const r = await H.emit('roulette:spin', { bet: readBet(box, 'roulette'), color: rlColor });
    if (r.error) { spinning = false; H.toast(H.esc(r.error), 'warn'); drawRoulette(box); return; }
    // Band zum Ergebnis drehen: ein paar volle Runden + Zielfeld (leicht zufällig im Feld)
    const idx = WHEEL.indexOf(r.result), target = 5 * WHEEL.length + idx;
    strip.style.transition = 'none'; strip.style.transform = `translateX(${center() - (rlPos % WHEEL.length) * SLOT}px)`;
    void strip.offsetWidth;
    strip.style.transition = 'transform 5s cubic-bezier(.12,.75,.12,1)';
    strip.style.transform = `translateX(${center() - target * SLOT}px)`;
    H.sound.move();
    setTimeout(() => {
      rlPos = idx; spinning = false;
      S.history = r.history; after(r); refreshCoins();
      const win = r.payout > 0;
      win ? H.sound.win() : H.sound.lose();
      if (win && r.color === 'green') H.confetti();
      drawRoulette(box);
      H.$('#rl-res', box).innerHTML = `<div class="bj-result ${win ? 'win' : 'loss'}">${r.color === 'green' ? '🟢' : r.color === 'red' ? '🔴' : '⚫'} ${r.result} – ${win ? `Gewonnen! +${H.fmtNum(r.payout)} 🪙` : `Verloren (−${H.fmtNum(r.bet)} 🪙)`}</div>`;
    }, 5200);
  };
}
