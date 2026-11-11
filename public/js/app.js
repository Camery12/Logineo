import { Chess } from '../vendor/chess.js';
import { createSocket } from './net.js';
import { Board, miniBoard, applyBoardTheme } from './board.js';
import { pieceURL } from './pieces.js';
import { BOARDS, PIECES, FINISHERS, BUNDLES, BOTS, REWARDS, AVATAR_EMOJIS, AVATAR_COLORS, findItem, bundlePrice } from './catalog.js';
import { sound } from './sound.js';
import { VERSION, VERSION_DATE, CHANGELOG } from './version.js';
import { burstAt, shakeBoard, checkFlash, confetti, coinRain, shatterPiece, preloadPieces, tableFlip, resetThrown } from './fx.js';

// ================================================================ Helfer
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const html = (s) => { const t = document.createElement('template'); t.innerHTML = s.trim(); return t.content.firstElementChild; };
const fmtNum = (n) => new Intl.NumberFormat('de-DE').format(n);
const fmtClock = (ms) => {
  if (ms == null) return '∞';
  const s = Math.max(0, ms) / 1000;
  if (s < 10) return `0:0${s.toFixed(1)}`;
  const m = Math.floor(s / 60), r = Math.floor(s % 60);
  return `${m}:${String(r).padStart(2, '0')}`;
};
const timeAgo = (t) => {
  const d = (Date.now() - t) / 1000;
  if (d < 60) return 'gerade eben';
  if (d < 3600) return `vor ${Math.floor(d / 60)} Min.`;
  if (d < 86400) return `vor ${Math.floor(d / 3600)} Std.`;
  return `vor ${Math.floor(d / 86400)} Tg.`;
};
const avatar = (a, size = 40) => {
  if (!a) return `<span class="avatar" style="--s:${size}px"></span>`;
  if (a.type === 'image') return `<span class="avatar" style="--s:${size}px;background-image:url('${a.value}')"></span>`;
  return `<span class="avatar" style="--s:${size}px;--c:${a.color}">${esc(a.value)}</span>`;
};
const coinHTML = (n) => `<span class="price"><i class="coin"></i>${fmtNum(n)}</span>`;

function toast(text, type = '') {
  const el = html(`<div class="toast ${type}">${text}</div>`);
  $('#toast-root').appendChild(el);
  setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 300); }, 3200);
}

function openOverlay(content, { closable = true, wide = false } = {}) {
  const ov = html(`<div class="overlay"><div class="modal ${wide ? 'wide' : ''}"></div></div>`);
  const m = ov.firstElementChild;
  if (typeof content === 'string') m.innerHTML = content; else m.appendChild(content);
  const close = () => { ov.remove(); };
  if (closable) ov.addEventListener('pointerdown', (e) => { if (e.target === ov) close(); });
  $('#overlay-root').appendChild(ov);
  return { el: m, close, root: ov };
}

const REASONS = {
  checkmate: 'durch Schachmatt', resign: 'durch Aufgabe', timeout: 'auf Zeit', abandon: 'Spiel verlassen',
  stalemate: 'durch Patt', insufficient: 'ungenügendes Material', repetition: 'dreifache Stellungswiederholung',
  fifty: '50-Züge-Regel', agreement: 'Remis vereinbart', draw: 'Remis',
};
const DECISIONS = { gleich: 'Beide hatten dasselbe Brett', einig: 'Ihr wart euch einig', zufall: 'Per Zufall entschieden', 'einzige Stimme': 'Nur eine Stimme abgegeben' };

// ================================================================ Zustand & Verbindung
const state = { profile: null, stats: { online: 0, playing: 0, queue: 0 }, view: 'play', searching: false, searchStart: 0, room: null, game: null, bot: null, shopTab: 'board', botColor: 'random', roomTime: 600000 };
const socket = window.io ? window.io({ transports: ['websocket', 'polling'] }) : createSocket();
const emit = (ev, data) => new Promise((res) => socket.emit(ev, data, (r) => res(r || {})));

socket.on('connect', async () => {
  const r = await emit('auth', { token: localStorage.getItem('token') });
  localStorage.setItem('token', r.token);
  setProfile(r.profile);
  if (!state.booted) { state.booted = true; renderAll(); go(location.hash.slice(1) || 'play'); }
});
socket.on('disconnect', () => toast('Verbindung verloren – verbinde neu…', 'warn'));
socket.on('session:replaced', () => { toast('Du hast SchachArena in einem anderen Tab geöffnet.', 'warn'); });
socket.on('stats', (s) => { state.stats = s; $('#online-count').textContent = `${s.online} online`; const el = $('#hero-online'); if (el) el.textContent = s.online; const pl = $('#hero-playing'); if (pl) pl.textContent = s.playing; });
socket.on('toast', (t) => toast(esc(t.text), t.type));

function setProfile(p, { coinsAnim = false } = {}) {
  const before = state.profile?.coins;
  const skinsBefore = JSON.stringify(state.profile?.equipped || {});
  state.profile = p;
  const cc = $('#coin-count');
  if (coinsAnim && before != null && p.coins !== before) animateNumber(cc, before, p.coins);
  else cc.textContent = fmtNum(p.coins);
  $('#me-btn').innerHTML = `${avatar(p.avatar, 30)}<span>${esc(p.name)}</span>`;
  $('#login-btn').hidden = !!p.registered;
  $('#admin-btn').hidden = !p.admin;
  renderFooter();
  // Hero-Brett passt sich sofort an neue Skins an
  if (JSON.stringify(p.equipped) !== skinsBefore) renderHeroBoard();
}

// ================================================================ Konto: Anmelden / Registrieren / Abmelden
function renderFooter() {
  const p = state.profile;
  const acc = !p ? '' : p.registered
    ? `Angemeldet als <b>${esc(p.name)}</b> · <button data-acc="logout">Abmelden</button>`
    : `<button data-acc="login">🔑 Anmelden</button> · <button data-acc="register">Konto erstellen</button>`;
  $('#site-foot').innerHTML = `SchachArena · Version ${VERSION} · <button data-acc="changes">Was ist neu?</button>${acc ? ' · ' + acc : ''}`;
  $$('#site-foot [data-acc]').forEach((b) => b.onclick = () => {
    const a = b.dataset.acc;
    if (a === 'changes') showChangelog();
    if (a === 'login' || a === 'register') openAuth(a);
    if (a === 'logout') logout();
  });
}

function openAuth(mode = 'login') {
  const p = state.profile;
  const ov = openOverlay(`<div class="auth">
    <div class="tabs" style="margin-bottom:18px"><button data-m="login">Anmelden</button><button data-m="register">Konto erstellen</button></div>
    <form id="auth-form" autocomplete="on">
      <label class="field"><span>Benutzername</span><input name="username" autocomplete="username" maxlength="16" required></label>
      <label class="field"><span>Passwort</span><input name="password" type="password" autocomplete="current-password" maxlength="64" required></label>
      <label class="field reg-only"><span>Passwort wiederholen</span><input name="password2" type="password" autocomplete="new-password" maxlength="64"></label>
      <p class="muted small reg-only">Dein bisheriger Fortschritt (Münzen, Skins, Elo) wird in das neue Konto übernommen. 3–16 Zeichen: Buchstaben, Zahlen, _ . -</p>
      <p class="muted small login-only">${p && !p.registered && (p.stats.games || p.stats.botGames || p.owned.board.length > 1) ? '⚠️ Dein aktuelles Gastprofil hat noch kein Passwort. Erstelle zuerst ein Konto, sonst ist es nach dem Anmelden weg.' : 'Melde dich mit deinem Konto an – auf jedem Gerät.'}</p>
      <div class="form-error" id="auth-err"></div>
      <div class="modal-actions"><button type="button" class="btn" data-x>Abbrechen</button><button class="btn primary" id="auth-go"></button></div>
    </form></div>`);
  const form = $('#auth-form', ov.el);
  const setMode = (m) => {
    mode = m;
    $$('[data-m]', ov.el).forEach((b) => b.classList.toggle('on', b.dataset.m === m));
    $$('.reg-only', ov.el).forEach((e) => e.hidden = m !== 'register');
    $$('.login-only', ov.el).forEach((e) => e.hidden = m !== 'login');
    $('#auth-go', ov.el).textContent = m === 'login' ? 'Anmelden' : 'Konto erstellen';
    form.password.autocomplete = m === 'login' ? 'current-password' : 'new-password';
    if (m === 'register' && p && !form.username.value) form.username.value = p.name;
    $('#auth-err', ov.el).textContent = '';
  };
  $$('[data-m]', ov.el).forEach((b) => b.onclick = () => setMode(b.dataset.m));
  $('[data-x]', ov.el).onclick = ov.close;
  setMode(mode);
  form.onsubmit = async (e) => {
    e.preventDefault();
    const err = (t) => { $('#auth-err', ov.el).textContent = t; };
    const username = form.username.value.trim(), password = form.password.value;
    if (mode === 'register') {
      if (password !== form.password2.value) return err('Die Passwörter stimmen nicht überein.');
      const r = await emit('account:register', { username, password });
      if (r.error) return err(r.error);
      setProfile(r.profile); ov.close(); toast(`✅ Konto <b>${esc(r.profile.name)}</b> erstellt – dein Fortschritt ist jetzt gesichert.`, 'good');
      if (state.view === 'profile') renderProfile();
    } else {
      const r = await emit('account:login', { username, password });
      if (r.error) return err(r.error);
      localStorage.setItem('token', r.token);
      toast('✅ Angemeldet – lade dein Konto…', 'good');
      setTimeout(() => location.reload(), 400);
    }
  };
  setTimeout(() => form.username.focus(), 50);
}

function logout() {
  confirmBox('Abmelden?', 'Du kannst dich jederzeit mit Benutzername und Passwort wieder anmelden.', 'Abmelden', () => {
    localStorage.removeItem('token');
    location.reload();
  });
}
$('#login-btn').onclick = () => openAuth('login');

// ================================================================ Admin-Menü (nur für Admins sichtbar, Server prüft zusätzlich)
socket.on('profile:refresh', ({ profile }) => { if (profile) setProfile(profile, { coinsAnim: true }); });
$('#admin-btn').onclick = () => {
  const ov = openOverlay(`<div class="admin">
    <h2>🛠️ Admin-Menü</h2><p class="muted small">Spieler per Spielercode (8 Ziffern) oder Benutzername finden und Münzen geben.</p>
    <form id="adm-find" class="adm-row"><input id="adm-q" placeholder="z. B. 58525408 oder loldonatforever" autocomplete="off"><button class="btn primary">Suchen</button></form>
    <div id="adm-player"></div>
    <div class="modal-actions"><button class="btn" data-x>Schließen</button></div></div>`, { wide: true });
  $('[data-x]', ov.el).onclick = ov.close;
  const show = (pl) => {
    $('#adm-player', ov.el).innerHTML = `<div class="adm-card">
      <div class="adm-who">${avatar(pl.avatar, 48)}<div><b>@${esc(pl.name)}</b> ${pl.online ? '<i class="dot"></i>' : ''}<div class="muted small">Code ${pl.code} · ${pl.rating} Elo</div></div>
        <span class="pill coin-pill"><i class="coin"></i><b id="adm-coins">${fmtNum(pl.coins)}</b></span></div>
      <div class="adm-quick">${[100, 500, 1000, 5000, 10000].map((n) => `<button class="btn gold sm" data-amt="${n}">+${fmtNum(n)}</button>`).join('')}</div>
      <form id="adm-custom" class="adm-row"><input id="adm-amt" type="number" placeholder="Eigener Betrag (minus zum Abziehen)"><button class="btn primary">Ausführen</button></form>
    </div>`;
    const give = async (amount) => {
      const r = await emit('admin:coins', { query: pl.code, amount });
      if (r.error) return toast(esc(r.error), 'warn');
      if (r.profile) setProfile(r.profile, { coinsAnim: true });
      toast(`✅ @${esc(r.player.name)}: ${amount > 0 ? '+' : ''}${fmtNum(amount)} Münzen (jetzt ${fmtNum(r.player.coins)})`, 'good');
      show(r.player);
    };
    $$('[data-amt]', ov.el).forEach((b) => b.onclick = () => give(+b.dataset.amt));
    $('#adm-custom', ov.el).onsubmit = (e) => { e.preventDefault(); const n = +$('#adm-amt', ov.el).value; if (n) give(n); };
  };
  $('#adm-find', ov.el).onsubmit = async (e) => {
    e.preventDefault();
    const r = await emit('admin:find', { query: $('#adm-q', ov.el).value });
    if (r.error) { $('#adm-player', ov.el).innerHTML = `<p class="form-error">${esc(r.error)}</p>`; return; }
    show(r.player);
  };
  setTimeout(() => $('#adm-q', ov.el).focus(), 50);
};

// ================================================================ Profile anderer Spieler ansehen
async function showPlayerProfile(id) {
  if (!id) return;
  const r = await emit('profile:get', { id });
  if (r.error || !r.profile) return toast(esc(r.error || 'Profil nicht gefunden.'), 'warn');
  const u = r.profile, s = u.stats;
  const rate = s.games ? Math.round((s.wins / s.games) * 100) : 0;
  const it = (k, id2) => findItem(k, id2);
  const ov = openOverlay(`<div class="pp">
    <div class="pp-head">${avatar(u.avatar, 84)}<div><h2>${esc(u.name)} ${u.registered ? '<span class="tag">Konto</span>' : '<span class="tag">Gast</span>'}</h2>
      <div class="muted">${u.online ? '<i class="dot"></i> online' : 'offline'} · Mitglied seit ${new Date(u.createdAt || Date.now()).toLocaleDateString('de-DE')}</div></div>
      <div class="pp-elo"><b>${u.rating}</b><span>Elo</span></div></div>
    <div class="stats-grid pp-stats">
      <div class="stat"><b>${s.games}</b><span>Partien</span></div><div class="stat"><b style="color:var(--good)">${s.wins}</b><span>Siege</span></div>
      <div class="stat"><b style="color:var(--bad)">${s.losses}</b><span>Niederlagen</span></div><div class="stat"><b>${rate}%</b><span>Siegquote</span></div>
      <div class="stat"><b>${s.draws}</b><span>Remis</span></div><div class="stat"><b>${s.botWins}</b><span>Bot-Siege</span></div>
      <div class="stat"><b>${s.mates}</b><span>Schachmatts</span></div><div class="stat"><b>${it('finisher', u.equipped.finisher)?.icon || '♚'}</b><span>${esc(it('finisher', u.equipped.finisher)?.name || '')}</span></div>
    </div>
    <div class="pp-prev"></div>
    <h3 style="margin:18px 0 10px">Letzte Partien</h3>
    <ul class="history">${u.history.length ? u.history.map((h) => `<li>${avatar(h.oppAvatar, 30)}<div><b>${esc(h.opponent)}</b> ${h.type === 'bot' ? '<span class="tag">Bot</span>' : ''}<div class="muted" style="font-size:12px">${REASONS[h.reason] || ''} · ${timeAgo(h.at)}</div></div>
      <div class="res"><b class="res-${h.outcome}">${h.outcome === 'win' ? 'Sieg' : h.outcome === 'loss' ? 'Niederlage' : 'Remis'}</b>${h.type === 'online' && h.rating ? `<div class="muted">${h.rating > 0 ? '+' : ''}${h.rating} Elo</div>` : ''}</div></li>`).join('') : '<li class="muted">Noch keine Partien.</li>'}</ul>
    <div class="modal-actions"><button class="btn primary" data-x>Schließen</button></div></div>`, { wide: true });
  $('.pp-prev', ov.el).append(miniBoard(u.equipped.board, { w: u.equipped.pieces, b: u.equipped.pieces }));
  $('.pp-prev', ov.el).insertAdjacentHTML('beforeend', `<div class="muted small">🎨 ${esc(it('board', u.equipped.board)?.name || '')}<br>♟️ ${esc(it('pieces', u.equipped.pieces)?.name || '')}</div>`);
  $('[data-x]', ov.el).onclick = ov.close;
}

function showBotProfile(b) {
  const ov = openOverlay(`<div class="pp"><div class="pp-head">${avatar({ type: 'emoji', value: b.avatar, color: 'rgba(255,255,255,.08)' }, 84)}<div><h2>${esc(b.name)} <span class="tag">Bot</span></h2>
    <div class="muted">${b.level} · „${esc(b.quote)}"</div></div><div class="pp-elo"><b>${b.elo}</b><span>Elo</span></div></div>
    <p class="muted">Sieg gegen ${esc(b.name)}: <b style="color:var(--gold)">${b.reward} Münzen</b> · Finisher: ${findItem('finisher', b.finisher)?.icon} ${esc(findItem('finisher', b.finisher)?.name)}</p>
    <div class="modal-actions"><button class="btn primary" data-x>Schließen</button></div></div>`);
  $('[data-x]', ov.el).onclick = ov.close;
}

function animateNumber(el, from, to) {
  const t0 = performance.now(), dur = 1200;
  el.parentElement.classList.remove('bump'); void el.offsetWidth; el.parentElement.classList.add('bump');
  const step = (now) => {
    const p = Math.min(1, (now - t0) / dur);
    el.textContent = fmtNum(Math.round(from + (to - from) * (1 - (1 - p) ** 3)));
    if (p < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
  if (to > from) sound.coin();
}

// ================================================================ Navigation
function go(view) {
  if (!['play', 'bots', 'shop', 'leaderboard', 'profile', 'game'].includes(view)) view = 'play';
  if (view === 'game' && !state.game && !state.bot) view = 'play';
  if (state.view === 'game' && view !== 'game' && (state.game?.active || (state.bot && !state.bot.over))) {
    if (state.game?.active) { toast('Beende zuerst dein laufendes Spiel.', 'warn'); return; }
    state.bot.over = true; // Bot-Partie verlassen
  }
  state.view = view;
  $$('.view').forEach((v) => v.classList.toggle('active', v.id === `view-${view}`));
  $$('.nav button').forEach((b) => b.classList.toggle('active', b.dataset.view === view));
  try { history.replaceState(null, '', `#${view}`); } catch { /* egal */ }
  if (view === 'shop') renderShop();
  if (view === 'profile') renderProfile();
  if (view === 'leaderboard') renderLeaderboard();
  if (view === 'play') renderPlay();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
// Zurück/Vor im Browser und Links mit #seite wechseln die Ansicht
window.addEventListener('hashchange', () => { const v = location.hash.slice(1); if (state.booted && v && v !== state.view) go(v); });
document.addEventListener('click', (e) => {
  const v = e.target.closest('[data-view]');
  if (v) { e.preventDefault(); sound.click(); go(v.dataset.view); }
});
$('#mute-btn').onclick = (e) => { e.currentTarget.textContent = sound.toggle() ? '🔇' : '🔊'; };
$('#mute-btn').textContent = sound.muted ? '🔇' : '🔊';

function renderAll() { renderPlay(); renderBots(); }

// ================================================================ Spielen (Lobby)
const TIMES = [[60000, '1 Min'], [180000, '3 Min'], [300000, '5 Min'], [600000, '10 Min'], [900000, '15 Min'], [0, '∞']];
const codeDigits = (code, small = false) => `<div class="code-display ${small ? 'small' : ''}">${[...code].map((d, i) => `<span style="animation-delay:${i * 50}ms">${d}</span>`).join('')}</div>`;

// Hero-Brett: zeigt deine ausgerüsteten Skins und neigt sich zur Maus, wenn sie in der Nähe ist
function renderHeroBoard() {
  const p = state.profile, tilt = $('.hero-tilt');
  if (!p || !tilt) return;
  tilt.replaceChildren(miniBoard(p.equipped.board, { w: p.equipped.pieces, b: p.equipped.pieces }, 'r1bq1rk1/pppp1ppp/2n2n2/2b1p3/2B1P3/3P1N2/PPP2PPP/RNBQ1RK1'));
}
let heroRaf = 0;
document.addEventListener('pointermove', (e) => {
  const tilt = $('.hero-tilt');
  if (!tilt || state.view !== 'play' || e.pointerType === 'touch') return;
  cancelAnimationFrame(heroRaf);
  heroRaf = requestAnimationFrame(() => {
    const r = tilt.getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    const dx = e.clientX - cx, dy = e.clientY - cy, dist = Math.hypot(dx, dy);
    const reach = Math.max(r.width, 300) * 1.4;
    const k = Math.max(0, 1 - dist / reach); // nah = stark, weit weg = gar nicht
    tilt.style.transform = `rotateY(${(dx / reach) * 22 * k}deg) rotateX(${(-dy / reach) * 22 * k}deg) translateZ(${k * 30}px)`;
    tilt.classList.toggle('near', k > 0.05);
  });
});

function renderPlay() {
  const p = state.profile; if (!p) return;
  const root = $('#view-play');
  root.innerHTML = `
    <div class="hero">
      <div>
        <h1>Schach. Online.<br><span>Mit Stil gewinnen.</span></h1>
        <p>Fordere Freunde per Code heraus, finde in Sekunden einen Gegner oder trainiere gegen sechs Bots – vom Noob bis zum Großmeister. Jeder Sieg bringt Münzen für neue Bretter, Figuren und epische 3D-Finisher.</p>
        <div class="hero-stats">
          <div><b id="hero-online">${state.stats.online}</b><span>Spieler online</span></div>
          <div><b id="hero-playing">${state.stats.playing}</b><span>spielen gerade</span></div>
          <div><b>${p.rating}</b><span>dein Elo</span></div>
        </div>
      </div>
      <div class="hero-board"><div class="hero-tilt"></div></div>
    </div>
    <div class="play-grid">
      <div class="card play-card" id="card-random"></div>
      <div class="card play-card" id="card-invite"></div>
      <div class="card play-card" id="card-join">
        <div class="ic">🔢</div>
        <h3>Code eingeben</h3>
        <p>Gib einen 6-stelligen Einladungscode oder den 8-stelligen Spielercode eines Freundes ein.</p>
        <input class="code-input" id="join-input" inputmode="numeric" maxlength="8" placeholder="••••••" autocomplete="off" />
        <button class="btn primary block" id="join-btn">Beitreten</button>
      </div>
      <div class="card play-card">
        <div class="ic">🪪</div>
        <h3>Mein Spielercode</h3>
        <p>Dein fester Code. Freunde können dich damit jederzeit direkt herausfordern.</p>
        ${codeDigits(p.code, true)}
        <button class="btn block" id="copy-mycode">📋 Code kopieren</button>
      </div>
    </div>`;
  renderHeroBoard();
  renderRandomCard(); renderInviteCard();
  const inp = $('#join-input');
  inp.oninput = () => { inp.value = inp.value.replace(/\D/g, ''); };
  inp.onkeydown = (e) => { if (e.key === 'Enter') joinCode(); };
  $('#join-btn').onclick = joinCode;
  $('#copy-mycode').onclick = () => copy(p.code, 'Spielercode kopiert!');
}

function copy(text, msg) {
  try { navigator.clipboard.writeText(text).then(() => toast('✅ ' + msg, 'good'), () => toast(`Code: <b>${esc(text)}</b>`)); }
  catch { toast(`Code: <b>${esc(text)}</b>`); }
}

async function joinCode() {
  const code = $('#join-input').value.trim();
  if (code.length !== 6 && code.length !== 8) return toast('Der Code muss 6 oder 8 Ziffern haben.', 'warn');
  const btn = $('#join-btn'); btn.disabled = true;
  const r = await emit('code:join', { code });
  btn.disabled = false;
  if (r.error) return toast(esc(r.error), 'warn');
  if (r.challenged) toast(`⚔️ Herausforderung an ${esc(r.challenged)} gesendet…`, 'good');
}

let searchTimer = null;
function renderRandomCard() {
  const el = $('#card-random'); if (!el) return;
  clearInterval(searchTimer);
  if (state.searching) {
    el.innerHTML = `<div class="ic">🎲</div><h3>Suche Gegner…</h3>
      <div class="searching"><div class="radar"><i>♞</i></div><b id="search-time">0:00</b><span class="muted" id="search-q"></span></div>
      <button class="btn danger block" id="search-cancel">Abbrechen</button>`;
    const tick = () => {
      const s = Math.floor((Date.now() - state.searchStart) / 1000);
      const t = $('#search-time'); if (t) t.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
      const q = $('#search-q'); if (q) q.textContent = `${Math.max(0, state.stats.queue - 1)} weitere in der Warteschlange`;
    };
    tick(); searchTimer = setInterval(tick, 500);
    $('#search-cancel').onclick = () => { socket.emit('queue:leave'); state.searching = false; renderRandomCard(); };
  } else {
    el.innerHTML = `<div class="ic">🎲</div><h3>Zufälliges Match</h3>
      <p>Wir finden dir einen Gegner mit ähnlichem Elo. 10 Minuten pro Spieler, mit Elo-Wertung.</p>
      <div class="muted" style="font-size:13px">Sieg <b style="color:var(--good)">+${REWARDS.win}</b> · Remis +${REWARDS.draw} · Trostgeld +${REWARDS.loss} <i class="coin" style="width:14px;height:14px;vertical-align:-2px"></i></div>
      <button class="btn primary block" id="search-btn">⚡ Gegner suchen</button>`;
    $('#search-btn').onclick = async () => {
      const r = await emit('queue:join');
      if (r.error) return toast(esc(r.error), 'warn');
      if (!r.matched) { state.searching = true; state.searchStart = Date.now(); renderRandomCard(); }
    };
  }
}

function renderInviteCard() {
  const el = $('#card-invite'); if (!el) return;
  if (state.room) {
    el.innerHTML = `<div class="ic">✉️</div><h3>Dein Einladungscode</h3>
      <p>Schick diesen Code deinem Freund. Das Spiel startet, sobald er ihn eingibt.</p>
      ${codeDigits(state.room)}
      <div class="searching" style="flex-direction:row;justify-content:center;padding:0"><span class="spinner"></span><span class="muted">Warte auf Gegner…</span></div>
      <div style="display:flex;gap:8px"><button class="btn block" id="room-copy">📋 Kopieren</button><button class="btn danger" id="room-cancel">✕</button></div>`;
    $('#room-copy').onclick = () => copy(state.room, 'Einladungscode kopiert!');
    $('#room-cancel').onclick = () => { socket.emit('room:cancel'); state.room = null; renderInviteCard(); };
  } else {
    el.innerHTML = `<div class="ic">✉️</div><h3>Freund einladen</h3>
      <p>Erzeuge einen zufälligen Zahlen-Code und teile ihn mit einem Freund.</p>
      <div class="seg" id="time-seg">${TIMES.map(([v, l]) => `<button data-t="${v}" class="${v === state.roomTime ? 'on' : ''}">${l}</button>`).join('')}</div>
      <button class="btn primary block" id="room-btn">🔐 Code erstellen</button>`;
    $$('#time-seg button').forEach((b) => b.onclick = () => { state.roomTime = +b.dataset.t; renderInviteCard(); });
    $('#room-btn').onclick = async () => {
      const r = await emit('room:create', { timeMs: state.roomTime });
      if (r.error) return toast(esc(r.error), 'warn');
      state.room = r.code; renderInviteCard(); sound.notify();
    };
  }
}

// Eingehende Herausforderung
socket.on('challenge:incoming', ({ id, from }) => {
  sound.notify();
  const ov = openOverlay(`<div class="challenge">${avatar(from.avatar, 84)}<h2>${esc(from.name)}</h2>
    <p class="muted">fordert dich zu einer Partie heraus! (${from.rating} Elo · 10 Min)</p>
    <div class="modal-actions"><button class="btn danger" data-a="0">Ablehnen</button><button class="btn good" data-a="1">⚔️ Annehmen</button></div></div>`, { closable: false });
  const answer = (accept) => { socket.emit('challenge:respond', { id, accept }); ov.close(); clearTimeout(timer); };
  $$('[data-a]', ov.el).forEach((b) => b.onclick = () => answer(b.dataset.a === '1'));
  const timer = setTimeout(() => answer(false), 30000);
});

// ================================================================ Brett-Abstimmung
let voteOv = null;
socket.on('match:vote', (d) => {
  state.searching = false; state.room = null; renderRandomCard(); renderInviteCard();
  closeVote();
  sound.start();
  const me = state.profile;
  const opp = d.players[d.you === 'w' ? 'b' : 'w'];
  const content = html(`<div>
    <h2 style="text-align:center">Gegner gefunden!</h2>
    <div class="vs"><div class="p">${avatar(me.avatar, 56)}${esc(me.name)}</div><div class="x">VS</div><div class="p">${avatar(opp.avatar, 56)}${esc(opp.name)}</div></div>
    <p class="muted" style="text-align:center;margin:16px 0 0">Ihr habt verschiedene Bretter ausgerüstet. Stimmt ab, auf welchem gespielt wird!</p>
    <div class="vote-grid"></div>
    <div class="vote-bar"><i></i></div>
  </div>`);
  const grid = $('.vote-grid', content);
  const skins = { w: d.players.w.equipped.pieces, b: d.players.b.equipped.pieces };
  d.options.forEach((o) => {
    const b = findItem('board', o.board) || BOARDS[0];
    const card = html(`<div class="vote-card" data-board="${o.board}">
      <div class="prev"></div>
      <div class="by">${avatar(o.by.avatar, 36)}<div><b>${esc(b.name)}</b><span class="muted">Brett von ${esc(o.by.name)}</span></div></div>
      <div class="voters"></div>
      <button class="btn primary block">Dafür stimmen</button></div>`);
    $('.prev', card).appendChild(miniBoard(o.board, skins));
    card.onclick = () => { socket.emit('match:vote', { gameId: d.gameId, board: o.board }); sound.click(); $$('.vote-card', grid).forEach((c) => c.classList.toggle('mine', c === card)); };
    grid.appendChild(card);
  });
  voteOv = openOverlay(content, { closable: false, wide: true });
  voteOv.players = d.players;
  const bar = $('.vote-bar i', content);
  const total = d.duration;
  const tick = () => {
    if (!voteOv || !bar.isConnected) return;
    bar.style.transform = `scaleX(${Math.max(0, (d.deadline - Date.now()) / total)})`;
    requestAnimationFrame(tick);
  };
  tick();
  if (d.votes) updateVotes(d.votes);
});
socket.on('match:voteUpdate', ({ votes }) => updateVotes(votes));
function updateVotes(votes) {
  if (!voteOv) return;
  const players = [voteOv.players.w, voteOv.players.b];
  $$('.vote-card', voteOv.el).forEach((c) => {
    const who = Object.entries(votes).filter(([, b]) => b === c.dataset.board).map(([uid]) => players.find((p) => p.id === uid));
    $('.voters', c).innerHTML = who.length ? who.map((p) => avatar(p.avatar, 28)).join('') + `<span>${who.map((p) => esc(p.name)).join(' & ')}</span>` : '';
  });
}
function closeVote() { if (voteOv) { voteOv.close(); voteOv = null; } }

// ================================================================ Gemeinsame Spielansicht
const board = new Board($('#board'), {
  canMove: (c) => {
    if (state.game?.active) return c === state.game.you;
    if (state.bot && !state.bot.over && !state.bot.thinking) return c === state.bot.color;
    return false;
  },
  onMove: (m) => {
    if (state.game?.active) onlineMove(m);
    else if (state.bot) botPlayerMove(m);
  },
});

function flipBoard() {
  board.setOrientation(board.orientation === 'w' ? 'b' : 'w');
  $('.board-col').classList.toggle('flipped');
}

function setupBoardLook(themeId, skins, orientation) {
  $('.board-col').classList.remove('flipped');
  $('.board-frame').classList.remove('mated');
  preloadPieces(skins);
  board.setTheme(themeId);
  applyBoardTheme($('.board-frame'), themeId);
  board.setSkins(skins);
  board.setOrientation(orientation);
}

function playMoveSound(m, inCheck) {
  const isCap = m?.captured || m?.flags?.includes('c') || m?.flags?.includes('e');
  if (inCheck) sound.check();
  else if (isCap) sound.capture();
  else sound.move();
  moveFx(m, inCheck, isCap);
}

// Brett-Effekte nach jedem Zug
function moveFx(m, inCheck, isCap) {
  const to = m?.to || m?.lastMove?.to;
  if (!to) return;
  $$('.move-badge', board.el).forEach((e) => e.remove());
  const frame = $('.board-frame');
  const from = m?.from || m?.lastMove?.from;
  if (isCap && m?.captured) {
    // Geschlagene Figur zerspringt sofort, der Angreifer gleitet in die Splitter
    const mover = board.chess.get(to)?.color || (board.chess.turn() === 'w' ? 'b' : 'w');
    const victim = mover === 'w' ? 'b' : 'w';
    const capSq = m?.flags?.includes('e') && from ? to[0] + from[1] : to;
    shatterPiece(board, capSq, m.captured, victim, board.skins[victim], from);
  }
  setTimeout(() => {
    const el = board.pieceEls.get(to)?.el;
    if (el) { el.classList.remove('land'); void el.offsetWidth; el.classList.add('land'); setTimeout(() => el.classList.remove('land'), 250); }
    if (isCap) burstAt(board, to, { kind: 'capture', color: board.chess.get(to)?.color === 'w' ? '#3b3b4a' : '#f2f2f2' });
    else burstAt(board, to, { kind: 'move' });
    if (m?.promotion || m?.flags?.includes('p')) { burstAt(board, to, { kind: 'promo' }); el?.classList.add('promo-glow'); setTimeout(() => el?.classList.remove('promo-glow'), 1000); }
    if (inCheck) { const k = board.kingSquare(board.chess.turn()); burstAt(board, k, { kind: 'check' }); checkFlash(frame); }
  }, 190);
}

// Schachmatt auf dem Brett, bevor der 3D-Finisher startet
async function mateFx() {
  const frame = $('.board-frame');
  const k = board.kingSquare(board.chess.turn());
  await wait(250);
  burstAt(board, k, { kind: 'mate' });
  shakeBoard(frame, true);
  frame.classList.add('mated');
  sound.boom();
  await wait(1100);
}

function captured(fen) {
  const start = { p: 8, n: 2, b: 2, r: 2, q: 1 };
  const vals = { p: 1, n: 3, b: 3, r: 5, q: 9 };
  const cnt = { w: { p: 0, n: 0, b: 0, r: 0, q: 0 }, b: { p: 0, n: 0, b: 0, r: 0, q: 0 } };
  for (const ch of fen.split(' ')[0]) { const l = ch.toLowerCase(); if (start[l] != null) cnt[ch === l ? 'b' : 'w'][l]++; }
  const mat = (c) => Object.entries(cnt[c]).reduce((s, [t, n]) => s + n * vals[t], 0);
  // Von Farbe c geschlagene Figuren = fehlende gegnerische Figuren
  const taken = (c) => { const o = c === 'w' ? 'b' : 'w'; const out = []; for (const t of ['q', 'r', 'b', 'n', 'p']) for (let i = cnt[o][t]; i < start[t]; i++) out.push([t, o]); return out; };
  return { taken, diff: mat('w') - mat('b') };
}

function renderBar(el, player, color, { clock = null, thinking = false, tag = '' } = {}) {
  const fen = board.fen;
  const cap = captured(fen);
  const diff = color === 'w' ? cap.diff : -cap.diff;
  const skinFor = (c) => board.skins[c];
  // Anklickbar: öffnet das Profil des Spielers (oder die Bot-Karte)
  el.classList.add('clickable');
  el.title = 'Profil ansehen';
  el.onclick = (e) => { if (e.target.closest('.clock')) return; player.bot ? showBotProfile(player.bot) : showPlayerProfile(player.id); };
  el.innerHTML = `${avatar(player.avatar, 44)}
    <div><div class="pname">${esc(player.name)} ${tag ? `<span class="tag">${tag}</span>` : ''} <span class="prating">${player.rating ?? ''} Elo</span></div>
    <div class="caps">${cap.taken(color).map(([t, c]) => `<i style="background-image:${pieceURL(t, c, skinFor(c)).replace(/"/g, '&quot;')}"></i>`).join('')}${diff > 0 ? `<b>+${diff}</b>` : ''}</div></div>
    ${thinking ? '<div class="thinking"><span class="spinner"></span>denkt nach…</div>' : ''}
    ${clock !== null ? `<div class="clock" data-c="${color}">${clock}</div>` : ''}`;
}

// ================================================================ Zug-Analyse (Brillant & Co.)
const MOVE_CLASSES = {
  brilliant: { sym: '!!', label: 'Brillant', color: '#1fc3bb' },
  best: { sym: '★', label: 'Bester Zug', color: '#81b64c' },
  excellent: { sym: '!', label: 'Exzellent', color: '#96bc4b' },
  good: { sym: '✓', label: 'Gut', color: '#8fb6a0' },
  inaccuracy: { sym: '?!', label: 'Ungenauigkeit', color: '#f7c631' },
  mistake: { sym: '?', label: 'Fehler', color: '#e58f2a' },
  blunder: { sym: '??', label: 'Patzer', color: '#e0443f' },
};
function classifyMove(r) {
  if (!r) return null;
  let loss = r.loss;
  if (r.after >= 800 && r.bestScore >= 800) loss = Math.min(loss, 25); // klar gewonnen bleibt gewonnen
  if (r.sacrifice && loss <= 40 && r.after >= -60) return 'brilliant';
  if (r.isBest || loss <= 8) return 'best';
  if (loss <= 30) return 'excellent';
  if (loss <= 80) return 'good';
  if (loss <= 160) return 'inaccuracy';
  if (loss <= 320) return 'mistake';
  return 'blunder';
}
let analyzer = null, anaQueue = Promise.resolve(), anaId = 0;
// ctx = laufendes Spiel (state.game oder state.bot), ply = Index des Halbzugs
function analyzeMove(ctx, ply, fenBefore, move, history, moverName) {
  anaQueue = anaQueue.then(() => new Promise((resolve) => {
    if (!analyzer) analyzer = new Worker(new URL('./engine-worker.js', import.meta.url), { type: 'module' });
    const id = ++anaId;
    const timer = setTimeout(() => { analyzer.removeEventListener('message', onMsg); resolve(null); }, 4000);
    const onMsg = (e) => { if (e.data.id !== id) return; clearTimeout(timer); analyzer.removeEventListener('message', onMsg); resolve(e.data.result); };
    analyzer.addEventListener('message', onMsg);
    analyzer.postMessage({ type: 'analyze', id, fen: fenBefore, move, history: history.slice(-40), timeMs: 280 });
  })).then((res) => {
    const cls = classifyMove(res);
    if (!cls || (ctx !== state.game && ctx !== state.bot)) return;
    (ctx.marks ||= {})[ply] = cls;
    const plies = ctx === state.bot ? ctx.chess.history().length : ctx.sans.length;
    renderMoves(ctx === state.bot ? ctx.chess.history() : ctx.sans);
    if (ply === plies - 1) showMoveBadge(move.to, cls);
    if (cls === 'brilliant') celebrateBrilliant(move.to, moverName);
  }).catch(() => {});
}
function showMoveBadge(sq, cls) {
  $$('.move-badge', board.el).forEach((e) => e.remove());
  const c = MOVE_CLASSES[cls]; if (!c || !sq) return;
  const [x, y] = board._xy(sq);
  const el = html(`<div class="move-badge ${cls}" title="${c.label}" style="left:${(x + 1) * 12.5}%;top:${y * 12.5}%;background:${c.color}">${c.sym}</div>`);
  board.el.appendChild(el);
}
function celebrateBrilliant(sq, who) {
  const frame = $('.board-frame');
  const pop = html(`<div class="brilliant-pop"><b>!!</b><span>Brillanter Zug${who ? ` von ${esc(who)}` : ''}!</span></div>`);
  frame.appendChild(pop);
  setTimeout(() => pop.remove(), 2600);
  burstAt(board, sq, { kind: 'promo' });
  sound.win();
}

function renderMoves(sans, current = sans.length - 1) {
  const ol = $('#moves');
  const marks = (state.game?.active || !state.bot ? state.game?.marks : state.bot?.marks) || {};
  const mk = (i) => { const c = MOVE_CLASSES[marks[i]]; return c ? `<i class="mk" style="color:${c.color}" title="${c.label}">${c.sym}</i>` : ''; };
  let h = '';
  for (let i = 0; i < sans.length; i += 2) {
    h += `<li><span class="n">${i / 2 + 1}.</span><span class="m ${current === i ? 'cur' : ''}">${esc(sans[i])}${mk(i)}</span><span class="m ${current === i + 1 ? 'cur' : ''}">${esc(sans[i + 1] || '')}${sans[i + 1] ? mk(i + 1) : ''}</span></li>`;
  }
  ol.innerHTML = h;
  ol.scrollTop = ol.scrollHeight;
  $('#move-count').textContent = sans.length ? `${Math.ceil(sans.length / 2)} Züge` : '';
}

function setStatus(text) { $('#status-line').innerHTML = text; }
function setBanner(htmlStr) { const b = $('#game-banner'); if (!htmlStr) { b.hidden = true; b.innerHTML = ''; return; } b.hidden = false; b.innerHTML = htmlStr; }

// ================================================================ Online-Spiel
socket.on('game:start', (d) => {
  closeVote();
  $$('.overlay').forEach((o) => o.remove());
  state.bot = null;
  state.searching = false; state.room = null;
  const g = state.game = { ...d, active: true, sans: d.moves.map((m) => m.san), clockAt: performance.now(), marks: {}, fens: [], anaChess: new Chess() };
  for (const m of d.moves) { g.fens.push(g.anaChess.fen()); try { g.anaChess.move(m.san); } catch { /* egal */ } }
  setupBoardLook(d.board, d.skins, d.you);
  const last = d.moves.at(-1);
  board.load(d.fen, last ? { from: last.from, to: last.to } : null, false);
  renderOnline();
  setBanner('');
  go('game');
  if (!d.resumed) {
    sound.start();
    const b = findItem('board', d.board);
    toast(`♟️ Brett: <b>${esc(b?.name)}</b> · ${DECISIONS[d.boardDecision] || ''}`, 'good');
    toast(`Du spielst <b>${d.you === 'w' ? 'Weiß' : 'Schwarz'}</b>`);
  } else toast('Spiel fortgesetzt', 'good');
  if (d.drawOffer && d.drawOffer !== d.you) showDrawOffer();
});

function renderOnline() {
  const g = state.game; if (!g) return;
  const opp = g.you === 'w' ? 'b' : 'w';
  const clk = (c) => g.clock.unlimited ? null : fmtClock(clockLeft(c));
  renderBar($('#bar-top'), g.players[opp], opp, { clock: clk(opp) });
  renderBar($('#bar-bottom'), g.players[g.you], g.you, { clock: clk(g.you), tag: 'Du' });
  const turn = board.chess.turn();
  $('#bar-top').classList.toggle('turn', g.active && turn === opp);
  $('#bar-bottom').classList.toggle('turn', g.active && turn === g.you);
  renderMoves(g.sans);
  if (g.active) setStatus(turn === g.you ? '🟢 Du bist am Zug' + (board.chess.inCheck() ? ' – <span style="color:var(--bad)">Schach!</span>' : '') : `⏳ ${esc(g.players[opp].name)} ist am Zug`);
  $('#game-actions').innerHTML = g.active
    ? `<button class="btn" id="draw-btn" ${g.drawOffer === g.you ? 'disabled' : ''}>🤝 Remis</button><button class="btn danger" id="resign-btn">🏳️ Aufgeben</button>
       <button class="btn" id="flip-btn" style="grid-column:1/-1">🔄 Brett drehen</button>`
    : `<button class="btn primary" data-act="again">⚡ Neues Match</button><button class="btn" data-view="play">Zur Lobby</button>`;
  $('#emotes').hidden = !g.active;
  $('#emotes').innerHTML = ['👍', '😮', '😂', '🔥', '🤝', '😅', '👑', 'GG'].map((e) => `<button data-e="${e}">${e}</button>`).join('');
  $$('#emotes button').forEach((b) => b.onclick = () => { socket.emit('game:emote', { emote: b.dataset.e }); showEmote(b.dataset.e); });
  const rb = $('#resign-btn');
  if (rb) rb.onclick = () => confirmBox('Wirklich aufgeben?', 'Die Partie wird als Niederlage gewertet. Du bekommst trotzdem Trostgeld.', 'Aufgeben', () => socket.emit('game:resign'));
  const db = $('#draw-btn'); if (db) db.onclick = () => { socket.emit('game:draw', { action: 'offer' }); toast('Remis angeboten'); };
  const fb = $('#flip-btn'); if (fb) fb.onclick = flipBoard;
  const again = $('[data-act="again"]'); if (again) again.onclick = () => { go('play'); $('#search-btn')?.click(); };
}

function clockLeft(c) {
  const g = state.game;
  let v = g.clock[c];
  if (g.active && g.clock.running === c) v -= performance.now() - g.clockAt;
  return Math.max(0, v);
}
setInterval(() => {
  const g = state.game;
  if (!g || !g.active || g.clock.unlimited) return;
  for (const el of $$('.clock')) {
    const c = el.dataset.c, left = clockLeft(c);
    el.textContent = fmtClock(left);
    el.classList.toggle('run', g.clock.running === c);
    el.classList.toggle('low', left < 20000);
  }
}, 100);

// Analyse-Kopie der Online-Partie mitführen und jeden neuen Zug bewerten lassen
function trackOnlineMove(g, san) {
  const fenBefore = g.anaChess.fen();
  let mv = null;
  try { mv = g.anaChess.move(san); } catch { mv = null; }
  if (!mv) { g.anaChess = new Chess(board.fen); return; }
  g.fens.push(fenBefore);
  const moverName = g.players[mv.color]?.name;
  analyzeMove(g, g.anaChess.history().length - 1, fenBefore, { from: mv.from, to: mv.to, promotion: mv.promotion }, g.fens.slice(0, -1), mv.color === g.you ? null : moverName);
}

function onlineMove(m) {
  const g = state.game;
  g.sans.push(m.san);
  trackOnlineMove(g, m.san);
  g.pendingFen = board.fen;
  playMoveSound(m, m.check);
  g.clock.running = null; // bis Serverbestätigung
  renderOnline();
  emit('game:move', { from: m.from, to: m.to, promotion: m.promotion }).then((r) => {
    if (r.error) {
      toast(esc(r.error), 'warn');
      g.sans.pop();
      if (r.fen) board.load(r.fen, null, true);
      renderOnline();
    }
  });
}

socket.on('game:state', (s) => {
  const g = state.game; if (!g || g.id !== s.id) return;
  const changed = s.fen !== board.fen;
  if (changed) {
    board.load(s.fen, s.lastMove, true);
    if (s.lastMove?.san) { g.sans.push(s.lastMove.san); playMoveSound(s, s.check); trackOnlineMove(g, s.lastMove.san); }
  } else if (s.lastMove) { board.lastMove = s.lastMove; }
  g.clock = s.clock; g.clockAt = performance.now();
  const prevOffer = g.drawOffer;
  g.drawOffer = s.drawOffer;
  renderOnline();
  if (s.drawOffer && s.drawOffer !== g.you && prevOffer !== s.drawOffer) showDrawOffer();
  if (!s.drawOffer) setBanner('');
  if (s.drawDeclined && g.drawOffer == null && prevOffer === g.you) toast('Remisangebot abgelehnt', 'warn');
});

function showDrawOffer() {
  sound.notify();
  setBanner(`<div>🤝 <b>${esc(state.game.players[state.game.you === 'w' ? 'b' : 'w'].name)}</b> bietet Remis an.</div>
    <div class="row"><button class="btn sm good" id="da">Annehmen</button><button class="btn sm" id="dd">Ablehnen</button></div>`);
  $('#da').onclick = () => socket.emit('game:draw', { action: 'accept' });
  $('#dd').onclick = () => { socket.emit('game:draw', { action: 'decline' }); setBanner(''); };
}

socket.on('game:opponent', ({ online, deadline }) => {
  if (!state.game?.active) return;
  clearInterval(state.oppTimer);
  if (online) { setBanner(''); toast('Gegner ist wieder da', 'good'); return; }
  const upd = () => {
    const s = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
    setBanner(`<div>📡 Dein Gegner hat die Verbindung verloren. Sieg in <b>${s}s</b>, falls er nicht zurückkommt.</div>`);
  };
  upd(); state.oppTimer = setInterval(upd, 1000);
});

socket.on('game:emote', ({ emote }) => showEmote(emote));
function showEmote(e) {
  const el = $('#emote-pop');
  el.textContent = e; el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
}

socket.on('game:over', async (d) => {
  const g = state.game; if (!g || g.id !== d.id) return;
  clearInterval(state.oppTimer);
  g.active = false;
  if (d.fen !== board.fen) board.load(d.fen, board.lastMove, true);
  renderOnline();
  setBanner('');
  setStatus(d.outcome === 'win' ? '🏆 Gewonnen!' : d.outcome === 'loss' ? '❌ Verloren' : '🤝 Remis');
  const loserColor = d.result === 'w' ? 'b' : 'w';
  if (d.finisher) {
    await mateFx();
    const { playFinisher } = await import('./finisher.js');
    await playFinisher({ finisher: d.finisher, fen: d.fen, boardTheme: d.board, skins: d.skins, loserColor, winnerName: d.winnerName });
  }
  if (d.reason === 'resign') await throwBoard();
  setProfile(d.profile, { coinsAnim: true });
  showResult({ outcome: d.outcome, reason: d.reason, coins: d.coins, rating: d.ratingChange, online: true });
});

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// Aufgeben: das ganze Brett fliegt weg, danach steht es wieder da
async function throwBoard() {
  const frame = $('.board-frame');
  sound.thud(); setTimeout(() => sound.capture(), 120);
  await tableFlip(frame, [...board.pieceEls.values()].map((p) => p.el));
  await wait(150);
  resetThrown(frame);
  board.load(board.fen, board.lastMove, false);
}

function showResult({ outcome, reason, coins, rating, online, bot }) {
  if (reason === 'abandon' && outcome === 'win') {
    // Gegner hat das Spiel verlassen: keine Wertung für den, der bleibt
    sound.notify();
    const ov = openOverlay(`<div class="result-head draw"><div class="result-icon">🚪</div><h2>Gegner weg</h2>
      <p class="muted">Dein Gegner hat das Spiel verlassen und verliert dafür Elo. Für dich ändert sich nichts.</p></div>
      <div class="modal-actions"><button class="btn" data-r="lobby">Zur Lobby</button><button class="btn primary" data-r="again">⚡ Neues Match</button></div>`);
    $$('[data-r]', ov.el).forEach((b) => b.onclick = () => { ov.close(); go('play'); if (b.dataset.r === 'again') $('#search-btn')?.click(); });
    return;
  }
  outcome === 'win' ? sound.win() : outcome === 'loss' ? sound.lose() : sound.notify();
  const titles = { win: ['🏆', 'Sieg!'], loss: ['💔', 'Niederlage'], draw: ['🤝', 'Remis'] };
  const [icon, title] = titles[outcome];
  const coinLabel = outcome === 'loss' && coins > 0 ? 'Trostgeld' : 'Münzen';
  const ov = openOverlay(`<div class="result-head ${outcome}"><div class="result-icon">${icon}</div><h2>${title}</h2><p class="muted">${REASONS[reason] || ''}</p></div>
    <div class="reward">
      <span class="pill coin-pill"><i class="coin" style="width:24px;height:24px"></i><b>+${coins}</b> ${coinLabel}</span>
      ${online ? `<span class="pill" style="color:${rating >= 0 ? 'var(--good)' : 'var(--bad)'}"><b>${rating >= 0 ? '+' : ''}${rating}</b> Elo</span>` : ''}
    </div>
    ${outcome === 'win' && reason === 'checkmate' ? '' : outcome === 'win' ? '<p class="muted" style="text-align:center;font-size:13px;margin-top:16px">Tipp: Gewinne per Schachmatt, um deinen 3D-Finisher zu sehen!</p>' : ''}
    <div class="modal-actions">
      ${online ? '<button class="btn" data-r="lobby">Zur Lobby</button><button class="btn primary" data-r="again">⚡ Neues Match</button>'
               : '<button class="btn" data-r="bots">Anderer Bot</button><button class="btn primary" data-r="rematch">🔁 Nochmal</button>'}
    </div>`);
  if (outcome === 'win') confetti();
  if (coins > 0) setTimeout(() => coinRain($('.reward .coin-pill', ov.el), $('#coin-count').parentElement, Math.min(18, 4 + Math.round(coins / 20)), (i) => { if (i % 3 === 0) sound.coin(); }), 350);
  $$('[data-r]', ov.el).forEach((b) => b.onclick = () => {
    ov.close();
    const r = b.dataset.r;
    if (r === 'lobby') go('play');
    if (r === 'again') { go('play'); $('#search-btn')?.click(); }
    if (r === 'bots') go('bots');
    if (r === 'rematch' && bot) startBot(bot.id);
  });
}

function confirmBox(title, text, okLabel, onOk) {
  const ov = openOverlay(`<h2>${title}</h2><p class="muted">${text}</p><div class="modal-actions"><button class="btn" data-x>Abbrechen</button><button class="btn danger" data-ok>${okLabel}</button></div>`);
  $('[data-x]', ov.el).onclick = ov.close;
  $('[data-ok]', ov.el).onclick = () => { ov.close(); onOk(); };
}

// ================================================================ Bots
function renderBots() {
  const root = $('#view-bots');
  root.innerHTML = `<div class="section-title"><div><h2>Gegen Bots spielen</h2><p>Sechs Gegner – vom völligen Noob bis zur gnadenlosen Engine. Je stärker der Bot, desto mehr Münzen.</p></div>
    <div><div class="muted" style="font-size:13px;margin-bottom:6px">Deine Farbe</div><div class="color-pick" id="color-pick">
      <button data-c="w" title="Weiß">♔</button><button data-c="random" title="Zufall">🎲</button><button data-c="b" title="Schwarz">♚</button></div></div></div>
    <div class="bots-grid">${BOTS.map((b, i) => `
      <div class="card bot-card" style="--bc:${b.color}">
        <div class="bot-top">${avatar({ type: 'emoji', value: b.avatar, color: 'rgba(255,255,255,.08)' }, 64)}
          <div><h3>${esc(b.name)}</h3><div class="muted" style="font-size:13px">${b.level} · ~${b.elo} Elo</div>
          <div class="lvl">${BOTS.map((_, j) => `<i class="${j <= i ? 'on' : ''}"></i>`).join('')}</div></div></div>
        <blockquote>„${esc(b.quote)}"</blockquote>
        <div class="bot-meta"><span>Sieg: <b>${coinHTML(b.reward)}</b></span><span>Finisher: <b>${FINISHERS.find((f) => f.id === b.finisher).icon}</b></span></div>
        <button class="btn primary block" data-bot="${b.id}">Herausfordern</button>
      </div>`).join('')}</div>`;
  const pickColor = () => $$('#color-pick button').forEach((b) => b.classList.toggle('on', b.dataset.c === state.botColor));
  $$('#color-pick button').forEach((b) => b.onclick = () => { state.botColor = b.dataset.c; pickColor(); });
  pickColor();
  $$('[data-bot]', root).forEach((b) => b.onclick = () => startBot(+b.dataset.bot));
}

let worker = null, reqId = 0;
function getWorker() {
  if (!worker) worker = new Worker(new URL('./engine-worker.js', import.meta.url), { type: 'module' });
  return worker;
}

function startBot(id) {
  if (state.game?.active) return toast('Du bist gerade in einem Online-Spiel.', 'warn');
  const bot = BOTS.find((b) => b.id === id);
  const color = state.botColor === 'random' ? (Math.random() < 0.5 ? 'w' : 'b') : state.botColor;
  state.game = null;
  state.bot = { bot, color, chess: new Chess(), moves: [], fens: [], marks: {}, over: false, thinking: false, token: ++reqId };
  const p = state.profile;
  setupBoardLook(p.equipped.board, { w: p.equipped.pieces, b: p.equipped.pieces }, color);
  board.load(state.bot.chess.fen(), null, false);
  setBanner('');
  renderBotGame();
  go('game');
  sound.start();
  if (color === 'b') botThink();
}

function botPlayer(b) { return { name: b.name, avatar: { type: 'emoji', value: b.avatar, color: 'rgba(255,255,255,.08)' }, rating: b.elo, bot: b }; }

function renderBotGame() {
  const s = state.bot; if (!s) return;
  const opp = s.color === 'w' ? 'b' : 'w';
  renderBar($('#bar-top'), botPlayer(s.bot), opp, { thinking: s.thinking, tag: s.bot.level });
  renderBar($('#bar-bottom'), state.profile, s.color, { tag: 'Du' });
  const turn = s.chess.turn();
  $('#bar-top').classList.toggle('turn', !s.over && turn === opp);
  $('#bar-bottom').classList.toggle('turn', !s.over && turn === s.color);
  renderMoves(s.chess.history());
  if (!s.over) setStatus(turn === s.color ? '🟢 Du bist am Zug' + (s.chess.inCheck() ? ' – <span style="color:var(--bad)">Schach!</span>' : '') : `🤖 ${esc(s.bot.name)} überlegt…`);
  $('#game-actions').innerHTML = s.over
    ? `<button class="btn primary" id="bot-again">🔁 Nochmal</button><button class="btn" data-view="bots">Anderer Bot</button>`
    : `<button class="btn" id="undo-btn" ${s.moves.length < 2 || s.thinking ? 'disabled' : ''}>↩️ Zurück</button><button class="btn danger" id="bot-resign">🏳️ Aufgeben</button>
       <button class="btn" id="flip-btn" style="grid-column:1/-1">🔄 Brett drehen</button>`;
  $('#emotes').hidden = true;
  const again = $('#bot-again'); if (again) again.onclick = () => startBot(s.bot.id);
  const undo = $('#undo-btn'); if (undo) undo.onclick = () => {
    const n = s.chess.turn() === s.color ? 2 : 1;
    for (let i = 0; i < n && s.moves.length; i++) { s.chess.undo(); s.moves.pop(); s.fens.pop(); delete s.marks[s.chess.history().length]; }
    const last = s.chess.history({ verbose: true }).at(-1);
    board.load(s.chess.fen(), last ? { from: last.from, to: last.to } : null, true);
    renderBotGame();
  };
  const rs = $('#bot-resign'); if (rs) rs.onclick = () => confirmBox('Aufgeben?', `Gegen ${esc(s.bot.name)} aufgeben?`, 'Aufgeben', () => finishBot(true));
  const fb = $('#flip-btn'); if (fb) fb.onclick = flipBoard;
}

function botPlayerMove(m) {
  const s = state.bot;
  s.fens.push(s.chess.fen());
  const mv = s.chess.move({ from: m.from, to: m.to, promotion: m.promotion });
  s.moves.push({ from: m.from, to: m.to, promotion: m.promotion });
  playMoveSound(mv, s.chess.inCheck());
  renderBotGame();
  analyzeMove(s, s.chess.history().length - 1, s.fens.at(-1), { from: mv.from, to: mv.to, promotion: mv.promotion }, s.fens.slice(0, -1), null);
  if (!checkBotEnd()) botThink();
}

async function botThink() {
  const s = state.bot;
  if (!s || s.over) return;
  s.thinking = true; renderBotGame();
  const id = ++reqId;
  const t0 = performance.now();
  const cfg = s.bot.cfg;
  const move = await new Promise((resolve) => {
    const w = getWorker();
    const onMsg = (e) => { if (e.data.id === id) { w.removeEventListener('message', onMsg); resolve(e.data.move); } };
    w.addEventListener('message', onMsg);
    w.postMessage({ id, fen: s.chess.fen(), history: s.fens.slice(-60), cfg });
  });
  const minDelay = 450 + Math.random() * 500;
  const el = performance.now() - t0;
  if (el < minDelay) await wait(minDelay - el);
  if (state.bot !== s || s.over || !move) return;
  s.thinking = false;
  s.fens.push(s.chess.fen());
  const mv = s.chess.move(move);
  s.moves.push({ from: move.from, to: move.to, promotion: move.promotion });
  board.load(s.chess.fen(), { from: mv.from, to: mv.to }, true);
  playMoveSound(mv, s.chess.inCheck());
  renderBotGame();
  analyzeMove(s, s.chess.history().length - 1, s.fens.at(-1), { from: mv.from, to: mv.to, promotion: mv.promotion }, s.fens.slice(0, -1), s.bot.name);
  checkBotEnd();
}

function checkBotEnd() {
  const c = state.bot.chess;
  if (c.isGameOver()) { finishBot(false); return true; }
  return false;
}

async function finishBot(resigned) {
  const s = state.bot;
  if (s.over) return;
  s.over = true; s.thinking = false;
  const c = s.chess;
  let outcome, reason;
  if (c.isCheckmate()) { outcome = c.turn() === s.color ? 'loss' : 'win'; reason = 'checkmate'; }
  else if (resigned) { outcome = 'loss'; reason = 'resign'; }
  else { outcome = 'draw'; reason = c.isStalemate() ? 'stalemate' : c.isInsufficientMaterial() ? 'insufficient' : c.isThreefoldRepetition() ? 'repetition' : 'fifty'; }
  renderBotGame();
  setStatus(outcome === 'win' ? '🏆 Gewonnen!' : outcome === 'loss' ? '❌ Verloren' : '🤝 Remis');
  const req = emit('bot:finish', { botId: s.bot.id, color: s.color, moves: s.moves, resigned });
  if (reason === 'checkmate') {
    await mateFx();
    const { playFinisher } = await import('./finisher.js');
    const p = state.profile;
    await playFinisher({
      finisher: outcome === 'win' ? p.equipped.finisher : s.bot.finisher, fen: c.fen(), boardTheme: p.equipped.board,
      skins: { w: p.equipped.pieces, b: p.equipped.pieces }, loserColor: c.turn(), winnerName: outcome === 'win' ? p.name : s.bot.name,
    });
  }
  if (reason === 'resign') await throwBoard();
  const r = await req;
  if (r?.profile) setProfile(r.profile, { coinsAnim: true });
  showResult({ outcome, reason, coins: r?.coins ?? 0, bot: s.bot });
}

// ================================================================ Shop
function renderShop() {
  const p = state.profile; if (!p) return;
  const root = $('#view-shop');
  const tab = state.shopTab;
  const items = { board: BOARDS, pieces: PIECES, finisher: FINISHERS, bundle: [] }[tab] || [];
  root.innerHTML = `<div class="section-title"><div><h2>Shop</h2><p>Verdiene Münzen mit jedem Spiel und gestalte dein Schach, wie du willst.</p></div>
    <span class="pill coin-pill" style="font-size:18px;padding:12px 18px"><i class="coin" style="width:22px;height:22px"></i>${fmtNum(p.coins)}</span></div>
    <div class="tabs">${[['bundle', '🎁 Pakete'], ['board', '🎨 Bretter'], ['pieces', '♟️ Figuren'], ['finisher', '💥 Finisher']].map(([k, l]) => `<button data-tab="${k}" class="${k === tab ? 'on' : ''}">${l}</button>`).join('')}</div>
    <div class="shop-grid"></div>`;
  $$('[data-tab]', root).forEach((b) => b.onclick = () => { state.shopTab = b.dataset.tab; renderShop(); });
  const grid = $('.shop-grid', root);
  if (tab === 'bundle') {
    // Pakete: Brett + Figuren + Finisher mit Rabatt
    for (const bd of BUNDLES) {
      const { price, full, missing } = bundlePrice(bd, p.owned);
      const [[, bId], [, pId], [, fId]] = bd.items;
      const names = bd.items.map(([k, id]) => findItem(k, id)).map((it) => `<li>${esc(it.name)} <span class="muted">${fmtNum(it.price)}</span></li>`).join('');
      const card = html(`<div class="card shop-item bundle ${!missing.length ? 'equipped' : ''}">
        <span class="ribbon">-${Math.round(bd.discount * 100)} %</span>
        <div class="prev bundle-prev"><div class="bp-board"></div><div class="bp-fin">${findItem('finisher', fId).icon}</div></div>
        <h4>${bd.icon} ${esc(bd.name)}</h4><p>${esc(bd.desc)}</p><ul class="bundle-list">${names}</ul>
        <div style="display:flex;align-items:center;justify-content:space-between;gap:10px">
          ${missing.length ? `<span><s class="muted small">${fmtNum(full)}</s> ${coinHTML(price)}</span>` : '<span class="muted small">✔ Alles freigeschaltet</span>'}
          ${missing.length ? `<button class="btn sm gold" data-bundle ${p.coins < price ? 'disabled' : ''}>Paket kaufen</button>` : ''}
        </div></div>`);
      $('.bp-board', card).appendChild(miniBoard(bId, { w: pId, b: pId }));
      const btn = $('[data-bundle]', card);
      if (btn) btn.onclick = () => {
        const ov = openOverlay(`<h2>${bd.icon} ${esc(bd.name)} kaufen?</h2><p class="muted">Du bekommst ${missing.length === bd.items.length ? 'alle drei Teile' : 'die fehlenden Teile'} und rüstest sie direkt aus.</p>
          <div class="reward"><span class="pill coin-pill"><i class="coin"></i><b>${fmtNum(price)}</b></span><span class="pill"><s>${fmtNum(full)}</s>&nbsp;gespart: ${fmtNum(full - price)}</span></div>
          <div class="modal-actions"><button class="btn" data-x>Abbrechen</button><button class="btn gold" data-ok>Kaufen & ausrüsten</button></div>`);
        $('[data-x]', ov.el).onclick = ov.close;
        $('[data-ok]', ov.el).onclick = async () => {
          const r = await emit('shop:bundle', { id: bd.id });
          ov.close();
          if (r.error) return toast(esc(r.error), 'warn');
          sound.coin(); setProfile(r.profile, { coinsAnim: true }); confetti(1800);
          toast(`🎉 ${esc(bd.name)} gekauft und ausgerüstet!`, 'good'); renderShop();
        };
      };
      grid.appendChild(card);
    }
    return;
  }
  for (const it of items) {
    const owned = p.owned[tab].includes(it.id), equipped = p.equipped[tab] === it.id;
    const card = html(`<div class="card shop-item ${equipped ? 'equipped' : ''}">
      ${equipped ? '<span class="ribbon">Ausgerüstet</span>' : owned ? '<span class="ribbon owned">Besitz</span>' : ''}
      <div class="prev"></div><h4>${esc(it.name)}</h4><p>${esc(it.desc)}</p>
      <div style="display:flex;align-items:center;justify-content:space-between;gap:10px">
        ${owned ? '<span class="muted" style="font-size:13px">✔ Freigeschaltet</span>' : it.price === 0 ? '<span class="muted">Gratis</span>' : coinHTML(it.price)}
        ${equipped ? '<button class="btn sm" disabled>✓ Aktiv</button>' : owned ? '<button class="btn sm primary" data-eq>Ausrüsten</button>'
          : `<button class="btn sm gold" data-buy ${p.coins < it.price ? 'disabled' : ''}>Kaufen</button>`}
      </div></div>`);
    const prev = $('.prev', card);
    if (tab === 'board') prev.appendChild(miniBoard(it.id, { w: p.equipped.pieces, b: p.equipped.pieces }));
    if (tab === 'pieces') prev.appendChild(miniBoard(p.equipped.board, { w: it.id, b: it.id }, 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR'));
    if (tab === 'finisher') {
      const colors = { klassisch: '#f5c542', feuerwerk: '#ff3d6e', blitz: '#39b6ff', meteor: '#ff7a1a', kristall: '#9be7ff', loch: '#8a3dff', glitch: '#39ff7a', tornado: '#cbb89a', samurai: '#ff2d55', laser: '#38d9ff', kanone: '#ffb347', erdbeben: '#ff5a1a', hammer: '#7fd4ff' };
      prev.style.padding = '0';
      prev.innerHTML = `<div class="fin-prev" style="--fc:${colors[it.id]}"><span>${it.icon}</span><button class="btn sm">▶ Vorschau</button></div>`;
      $('button', prev).onclick = () => previewFinisher(it.id);
    }
    const eq = $('[data-eq]', card);
    if (eq) eq.onclick = async () => { const r = await emit('shop:equip', { kind: tab, id: it.id }); if (r.error) return toast(esc(r.error), 'warn'); setProfile(r.profile); toast(`✨ ${esc(it.name)} ausgerüstet`, 'good'); renderShop(); };
    const buy = $('[data-buy]', card);
    if (buy) buy.onclick = () => confirmBuy(tab, it);
    grid.appendChild(card);
  }
}

function confirmBuy(kind, it) {
  const ov = openOverlay(`<h2>${esc(it.name)} kaufen?</h2><p class="muted">${esc(it.desc)}</p>
    <div class="reward"><span class="pill coin-pill"><i class="coin"></i><b>${fmtNum(it.price)}</b></span></div>
    <div class="modal-actions"><button class="btn" data-x>Abbrechen</button><button class="btn gold" data-ok>Kaufen & ausrüsten</button></div>`);
  $('[data-x]', ov.el).onclick = ov.close;
  $('[data-ok]', ov.el).onclick = async () => {
    const r = await emit('shop:buy', { kind, id: it.id });
    ov.close();
    if (r.error) return toast(esc(r.error), 'warn');
    sound.coin(); setProfile(r.profile, { coinsAnim: true });
    toast(`🎉 ${esc(it.name)} gekauft und ausgerüstet!`, 'good');
    renderShop();
  };
}

async function previewFinisher(id) {
  const p = state.profile;
  const { playFinisher } = await import('./finisher.js');
  await playFinisher({ finisher: id, fen: 'r1bqkb1r/pppp1Qpp/2n2n2/4p3/2B1P3/8/PPPP1PPP/RNB1K1NR b KQkq - 0 4', boardTheme: p.equipped.board, skins: { w: p.equipped.pieces, b: p.equipped.pieces }, loserColor: 'b', winnerName: p.name, subtitle: 'Vorschau' });
}

// ================================================================ Profil
function renderProfile() {
  const p = state.profile; if (!p) return;
  const root = $('#view-profile');
  const s = p.stats;
  const rate = s.games ? Math.round((s.wins / s.games) * 100) : 0;
  root.innerHTML = `
    <div class="card profile-head">
      <div class="avatar-wrap" id="av-edit" title="Profilbild ändern">${avatar(p.avatar, 112)}</div>
      <div>
        <div class="muted small">Benutzername ${p.registered ? '<span class="tag">Konto</span>' : '<span class="tag">Gast</span>'}</div>
        <div class="name-edit"><span class="at">@</span><input id="name-in" maxlength="16" value="${esc(p.name)}" spellcheck="false" autocomplete="off" /><button class="btn sm primary" id="name-save" hidden>Speichern</button></div>
        <div class="muted" style="margin-top:6px">Elo <b style="color:var(--text)">${p.rating}</b> · Spielercode <b style="color:var(--text);letter-spacing:.1em">${p.code}</b> <button class="btn sm" id="pc-copy" style="padding:4px 8px">📋</button></div>
      </div>
      <div class="equip-row">
        <span class="pill">🎨 ${esc(findItem('board', p.equipped.board)?.name)}</span>
        <span class="pill">♟️ ${esc(findItem('pieces', p.equipped.pieces)?.name)}</span>
        <span class="pill">${findItem('finisher', p.equipped.finisher)?.icon} ${esc(findItem('finisher', p.equipped.finisher)?.name)}</span>
      </div>
    </div>
    <div class="stats-grid">
      <div class="stat"><b>${s.games}</b><span>Online-Partien</span></div>
      <div class="stat"><b style="color:var(--good)">${s.wins}</b><span>Siege</span></div>
      <div class="stat"><b style="color:var(--bad)">${s.losses}</b><span>Niederlagen</span></div>
      <div class="stat"><b style="color:var(--warn)">${s.draws}</b><span>Remis</span></div>
      <div class="stat"><b>${rate}%</b><span>Siegquote</span></div>
      <div class="stat"><b>${s.botWins}</b><span>Bot-Siege</span></div>
      <div class="stat"><b>${s.mates}</b><span>Schachmatts gesetzt</span></div>
      <div class="stat"><b style="color:var(--gold)">${fmtNum(p.coins)}</b><span>Münzen</span></div>
    </div>
    <div class="profile-grid">
      <div class="card" id="avatar-card">
        <div class="card-head"><h3>Profilbild</h3><label class="btn sm">📷 Bild hochladen<input type="file" accept="image/*" id="av-file" hidden></label></div>
        <div class="emoji-grid">${AVATAR_EMOJIS.map((e) => `<button data-emoji="${e}" class="${p.avatar.type === 'emoji' && p.avatar.value === e ? 'on' : ''}">${e}</button>`).join('')}</div>
        <div class="color-grid">${AVATAR_COLORS.map((c) => `<button data-color="${c}" style="background:${c}" class="${p.avatar.color === c ? 'on' : ''}"></button>`).join('')}</div>
      </div>
      <div class="card">
        <div class="card-head"><h3>Letzte Partien</h3></div>
        <ul class="history">${p.history.length ? p.history.map((h) => `<li>${avatar(h.oppAvatar, 36)}
          <div><b>${esc(h.opponent)}</b> ${h.type === 'bot' ? '<span class="tag">Bot</span>' : ''}<div class="muted" style="font-size:12px">${REASONS[h.reason] || ''} · ${timeAgo(h.at)}</div></div>
          <div class="res"><b class="res-${h.outcome}">${h.outcome === 'win' ? 'Sieg' : h.outcome === 'loss' ? 'Niederlage' : 'Remis'}</b>
          <div class="muted">+${h.coins} 🪙 ${h.type === 'online' ? `· ${h.rating >= 0 ? '+' : ''}${h.rating} Elo` : ''}</div></div></li>`).join('') : '<li class="muted">Noch keine Partien gespielt.</li>'}</ul>
      </div>
      <div class="card" id="account-card">
        <div class="card-head"><h3>🔐 Konto & Passwort</h3>${p.registered ? '<button class="btn sm danger" id="acc-logout">Abmelden</button>' : ''}</div>
        ${p.registered
          ? `<p class="muted small">Du bist als <b>@${esc(p.name)}</b> angemeldet. Damit kannst du dich auf jedem Gerät einloggen.</p>
             <form id="pw-form" class="acc-form"><label class="field"><span>Altes Passwort</span><input type="password" name="old" autocomplete="current-password"></label>
             <label class="field"><span>Neues Passwort</span><input type="password" name="pw" autocomplete="new-password" minlength="6"></label>
             <button class="btn primary">Passwort ändern</button></form>`
          : `<p class="muted small">Du spielst als <b>Gast</b>. Lege ein Passwort fest, damit dein Fortschritt (Münzen, Skins, Elo) sicher ist und du dich überall anmelden kannst.</p>
             <form id="pw-form" class="acc-form"><label class="field"><span>Benutzername</span><input name="user" value="${esc(p.name)}" autocomplete="username" maxlength="16"></label>
             <label class="field"><span>Passwort festlegen</span><input type="password" name="pw" autocomplete="new-password" minlength="6"></label>
             <button class="btn primary">Konto sichern</button></form>
             <p class="muted small" style="margin-top:10px">Schon ein Konto? <button class="linkish" id="acc-login">Anmelden</button></p>`}
      </div>
    </div>`;
  const pwForm = $('#pw-form');
  pwForm.onsubmit = async (e) => {
    e.preventDefault();
    const r = p.registered
      ? await emit('account:password', { old: pwForm.old.value, password: pwForm.pw.value })
      : await emit('account:register', { username: pwForm.user.value.trim(), password: pwForm.pw.value });
    if (r.error) return toast(esc(r.error), 'warn');
    setProfile(r.profile); toast(p.registered ? '✅ Passwort geändert' : '✅ Konto gesichert – du kannst dich jetzt überall anmelden', 'good'); renderProfile();
  };
  $('#acc-logout')?.addEventListener('click', logout);
  $('#acc-login')?.addEventListener('click', () => openAuth('login'));
  const nameIn = $('#name-in'), save = $('#name-save');
  nameIn.oninput = () => { save.hidden = nameIn.value.trim() === p.name; };
  const doSave = async () => {
    const r = await emit('profile:update', { name: nameIn.value });
    if (r.error) return toast(esc(r.error), 'warn');
    setProfile(r.profile); toast('✅ Benutzername gespeichert', 'good'); renderProfile();
  };
  save.onclick = doSave;
  nameIn.onkeydown = (e) => { if (e.key === 'Enter') doSave(); };
  $('#pc-copy').onclick = () => copy(p.code, 'Spielercode kopiert!');
  $('#av-edit').onclick = () => $('#avatar-card').scrollIntoView({ behavior: 'smooth', block: 'center' });
  const setAv = async (avatarObj) => {
    const r = await emit('profile:update', { avatar: avatarObj });
    if (r.error) return toast(esc(r.error), 'warn');
    setProfile(r.profile); renderProfile();
  };
  $$('[data-emoji]').forEach((b) => b.onclick = () => setAv({ type: 'emoji', value: b.dataset.emoji, color: p.avatar.color || AVATAR_COLORS[0] }));
  $$('[data-color]').forEach((b) => b.onclick = () => setAv({ type: 'emoji', value: p.avatar.type === 'emoji' ? p.avatar.value : AVATAR_EMOJIS[0], color: b.dataset.color }));
  $('#av-file').onchange = async (e) => {
    const f = e.target.files[0]; if (!f) return;
    try { await setAv({ type: 'image', value: await resizeImage(f, 160) }); toast('✅ Profilbild aktualisiert', 'good'); }
    catch { toast('Bild konnte nicht geladen werden.', 'warn'); }
  };
}

function resizeImage(file, size) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas'); c.width = c.height = size;
      const g = c.getContext('2d');
      const s = Math.min(img.width, img.height);
      g.drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, size, size);
      URL.revokeObjectURL(img.src);
      resolve(c.toDataURL('image/jpeg', 0.85));
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

// ================================================================ Rangliste
async function renderLeaderboard() {
  const root = $('#view-leaderboard');
  root.innerHTML = `<div class="section-title"><div><h2>Rangliste</h2><p>Die besten Spieler der SchachArena nach Elo. Klicke auf einen Spieler, um sein Profil zu sehen.</p></div></div><div class="card"><div class="muted">Lade…</div></div>`;
  const { list } = await emit('leaderboard');
  const me = state.profile.id;
  $('.card', root).innerHTML = list.length ? `<table class="lb"><thead><tr><th>#</th><th>Spieler</th><th>Elo</th><th>S / N / R</th><th>Bot-Siege</th></tr></thead><tbody>
    ${list.map((u, i) => `<tr class="clickable ${u.id === me ? 'me' : ''}" data-uid="${esc(u.id)}" title="Profil ansehen"><td><span class="rank ${i < 3 ? 'r' + (i + 1) : ''}">${i + 1}</span></td>
      <td><div class="who">${avatar(u.avatar, 36)}${esc(u.name)} ${u.online ? '<i class="dot" title="online"></i>' : ''}</div></td>
      <td><b>${u.rating}</b></td><td><span class="res-win">${u.stats.wins}</span> / <span class="res-loss">${u.losses}</span> / <span class="res-draw">${u.draws}</span></td><td>${u.botWins}</td></tr>`).join('')}
    </tbody></table>` : '<p class="muted">Noch keine Partien gespielt – sei der Erste!</p>';
  $$('tr[data-uid]', root).forEach((tr) => tr.onclick = () => showPlayerProfile(tr.dataset.uid));
}

// ================================================================ Version
function showChangelog() {
  openOverlay(`<h2>Version ${VERSION}</h2><p class="muted">Stand ${new Date(VERSION_DATE).toLocaleDateString('de-DE')}</p>
    <ul class="changelog">${CHANGELOG.map(([v, t]) => `<li><b>v${v}</b><span>${esc(t)}</span></li>`).join('')}</ul>
    <div class="modal-actions"><button class="btn primary" onclick="this.closest('.overlay').remove()">Schließen</button></div>`);
}
$('#ver-pill').textContent = 'v' + VERSION;
$('#ver-pill').onclick = (e) => { e.preventDefault(); e.stopPropagation(); showChangelog(); };
renderFooter();
