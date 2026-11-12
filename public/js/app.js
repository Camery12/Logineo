import { Chess } from '../vendor/chess.js';
import { createSocket } from './net.js';
import { Board, miniBoard, applyBoardTheme } from './board.js';
import { pieceURL } from './pieces.js';
import { BOARDS, PIECES, FINISHERS, BUNDLES, BOTS, REWARDS, AVATAR_EMOJIS, AVATAR_COLORS, findItem, bundlePrice, PROFILE_OPTIONS, MUSIC_MAX_BYTES, eloText } from './catalog.js';
import { sound } from './sound.js';
import { VERSION, VERSION_DATE, CHANGELOG } from './version.js';
import { profileCardHTML, wireProfileMusic, stopProfileMusic, fmtPlaytime } from './profilecard.js';
import { burstAt, shakeBoard, checkFlash, confetti, coinRain, shatterPiece, preloadPieces, tableFlip, resetThrown } from './fx.js';
import { FourBoard } from './fourboard.js';
import { COLOR_NAMES, COLOR_HEX } from './four.js';
import { pieceURL4 } from './pieces.js';

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
// Spieler mit seinem Profil-Look (Mini-Banner, Rahmen, Namenseffekt) – z. B. in der Rangliste
const styledWho = (u, size, extra = '') => {
  const st = u.style || {};
  return `<div class="lb-who bn-${st.banner || 'standard'}" style="--acc:${st.accent || '#7c5cff'}"><span class="mini-fr fr-${st.frame || 'keiner'}">${avatar(u.avatar, size)}</span><span class="lb-name nf-${st.nameFx || 'keiner'}" data-text="${esc(u.name)}">${esc(u.name)}</span>${extra}</div>`;
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

function openOverlay(content, { closable = true, wide = false, onClose = null } = {}) {
  const ov = html(`<div class="overlay"><div class="modal ${wide ? 'wide' : ''}"></div></div>`);
  const m = ov.firstElementChild;
  if (typeof content === 'string') m.innerHTML = content; else m.appendChild(content);
  const close = () => { ov.remove(); onClose?.(); };
  if (closable) ov.addEventListener('pointerdown', (e) => { if (e.target === ov) close(); });
  $('#overlay-root').appendChild(ov);
  return { el: m, close, root: ov };
}

const REASONS = {
  checkmate: 'durch Schachmatt', resign: 'durch Aufgabe', timeout: 'auf Zeit', abandon: 'Spiel verlassen',
  stalemate: 'durch Patt', insufficient: 'ungenügendes Material', repetition: 'dreifache Stellungswiederholung',
  fifty: '50-Züge-Regel', agreement: 'Remis vereinbart', draw: 'Remis', 'four-win': '4er-Schach · 1. Platz', 'four-place': '4er-Schach',
};
const DECISIONS = { gleich: 'Beide hatten dasselbe Brett', einig: 'Ihr wart euch einig', zufall: 'Per Zufall entschieden', 'einzige Stimme': 'Nur eine Stimme abgegeben' };

// ================================================================ Zustand & Verbindung
const state = { profile: null, stats: { online: 0, playing: 0, queue: 0 }, view: 'play', searching: false, searchStart: 0, room: null, game: null, bot: null, shopTab: 'bundle', botColor: 'random', roomTime: 600000, training: localStorage.getItem('training') === '1' };
const socket = window.io ? window.io({ transports: ['websocket', 'polling'] }) : createSocket();
const emit = (ev, data) => new Promise((res) => socket.emit(ev, data, (r) => res(r || {})));

socket.on('connect', async () => {
  const r = await emit('auth', { token: localStorage.getItem('token') });
  if (!r.token) return;
  localStorage.setItem('token', r.token);
  setProfile(r.profile);
  if (state.game?.spectator && state.game.active) socket.emit('watch:start', { id: state.game.id }, (rr) => { if (rr?.error) { toast('Das Live-Match ist vorbei.', 'warn'); state.game = null; go('play'); } });
  if (state.restarting) { state.restarting = false; if (!state.game?.active) toast('✅ Wieder verbunden', 'good'); }
  if (!state.booted) {
    state.booted = true; renderAll(); go(location.hash.slice(1) || 'play'); warmFinisherLater();
    const join = new URLSearchParams(location.search).get('join');
    if (join && /^\d{6,8}$/.test(join)) {
      history.replaceState(null, '', location.pathname + location.hash);
      go('play');
      setTimeout(() => { const inp = $('#join-input'); if (inp) { inp.value = join; joinCode(); } }, 300);
    }
  }
  // Laufende Partie gibt es auf dem Server nicht mehr (sollte praktisch nie passieren)
  if (state.game?.active && !state.game.spectator && r.gameId !== state.game.id) {
    state.game.active = false; clearInterval(state.oppTimer); setBanner(''); renderOnline();
    toast('Die Partie konnte nach dem Neustart leider nicht fortgesetzt werden.', 'warn');
  }
  if (r.version && r.version !== VERSION) { state.updateTo = r.version; checkUpdate(); }
});
// Partie läuft inzwischen auf dem neuen Server: neu verbinden
socket.on('server:reconnect', () => { state.restarting = true; socket.disconnect(); setTimeout(() => socket.connect(), 400); });
socket.on('disconnect', () => { if (!state.restarting) toast('Verbindung verloren – verbinde neu…', 'warn'); });
socket.on('server:restarting', () => { state.restarting = true; toast('🔄 Ein Update wird eingespielt – gleich geht es weiter…'); });

// 3D-Finisher schon im Hintergrund laden und vorbereiten, damit er sofort startet
function warmFinisherLater() {
  const idle = window.requestIdleCallback || ((f) => setTimeout(f, 1));
  setTimeout(() => idle(async () => {
    try {
      const m = await import('./finisher.js');
      // nur vorbereiten, wenn gerade nichts los ist (sonst später nochmal versuchen)
      const tryWarm = () => {
        if (isBusy() || document.hidden) return setTimeout(tryWarm, 5000);
        const p = state.profile;
        m.warmupFinisher({ boardTheme: p?.equipped.board, skins: { w: p?.equipped.pieces, b: p?.equipped.pieces } });
      };
      tryWarm();
    } catch { /* egal – lädt dann eben beim ersten Finisher */ }
  }, { timeout: 4000 }), 2500);
}

// ---------------------------------------------------------------- Automatisch aktualisieren
// Nach einem Update lädt die Seite kurz neu – aber nie mitten in einer Partie, Suche, Abstimmung oder einem Finisher.
const fourActive = () => !!(state.four && state.four.status === 'playing' && state.four.alive[state.four.you]);
const isBusy = () => !!(state.view === 'game' || state.view === 'four' || fourActive() || state.fourLobby || state.game?.active || (state.bot && !state.bot.over) || state.searching || state.room
  || $('.overlay') || $('.finisher') || ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName));
function checkUpdate() {
  const v = state.updateTo;
  if (!v) return;
  if (sessionStorage.getItem('reloadedFor') === v) return; // schon versucht – keine Endlosschleife
  if (isBusy()) {
    if (!state.updateNotified) {
      state.updateNotified = true;
      toast(state.view === 'game' || state.game?.active
        ? `✨ Update v${esc(v)} ist da. Spiel einfach weiter – die Seite aktualisiert sich von selbst, wenn du zurück in der Lobby bist.`
        : `✨ Update v${esc(v)} ist da – wird gleich automatisch geladen.`);
    }
    clearTimeout(state.updateTimer); state.updateTimer = setTimeout(checkUpdate, 2000);
    return;
  }
  sessionStorage.setItem('reloadedFor', v);
  const el = document.createElement('div');
  el.className = 'update-veil';
  el.innerHTML = `<div><div class="spinner"></div><b>Update auf v${esc(v)}</b><span>Die Seite lädt kurz neu…</span></div>`;
  document.body.appendChild(el);
  setTimeout(() => location.reload(), 1200);
}
socket.on('session:replaced', () => { toast('Du hast SchachArena in einem anderen Tab geöffnet.', 'warn'); });
socket.on('stats', (s) => { const liveBefore = state.stats.live; state.stats = s; if (state.view === 'play' && (s.live || liveBefore)) refreshLive(); $('#online-count').textContent = `${s.online} online`; const el = $('#hero-online'); if (el) el.textContent = s.online; const pl = $('#hero-playing'); if (pl) pl.textContent = s.playing; });
socket.on('toast', (t) => toast(esc(t.text), t.type));

function setProfile(p, { coinsAnim = false } = {}) {
  const before = state.profile?.coins;
  const skinsBefore = JSON.stringify(state.profile?.equipped || {});
  state.profile = p;
  const he = document.getElementById('hero-elo'); if (he) he.textContent = p.rating;
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
    <h2>🛠️ Admin-Menü</h2><p class="muted small">Spieler per Spielercode (8 Ziffern) oder Benutzername finden – Münzen und Elo geben oder abziehen.</p>
    <form id="adm-find" class="adm-row"><input id="adm-q" placeholder="z. B. 58525408 oder loldonatforever" autocomplete="off"><button class="btn primary">Suchen</button></form>
    <div id="adm-player"></div>
    <div class="modal-actions"><button class="btn" data-x>Schließen</button></div></div>`, { wide: true });
  $('[data-x]', ov.el).onclick = ov.close;
  const show = (pl) => {
    $('#adm-player', ov.el).innerHTML = `<div class="adm-card">
      <div class="adm-who">${avatar(pl.avatar, 48)}<div><b>@${esc(pl.name)}</b> ${pl.online ? '<i class="dot"></i>' : ''}<div class="muted small">Code ${pl.code} · <b id="adm-elo">${pl.rating}</b> Elo</div></div>
        <span class="pill coin-pill"><i class="coin"></i><b id="adm-coins">${fmtNum(pl.coins)}</b></span></div>
      <div class="adm-quick">${[100, 500, 1000, 5000, 10000].map((n) => `<button class="btn gold sm" data-amt="${n}">+${fmtNum(n)}</button>`).join('')}</div>
      <form id="adm-custom" class="adm-row"><input id="adm-amt" type="number" placeholder="Eigener Betrag (minus zum Abziehen)"><button class="btn primary">Ausführen</button></form>
      <h4 class="adm-h">🏆 Elo <span class="muted small">(${pl.rating})</span></h4>
      <div class="adm-quick">${[-100, -50, -10, 10, 50, 100].map((n) => `<button class="btn sm ${n > 0 ? 'good' : 'danger'}" data-elo="${n}">${n > 0 ? '+' : '−'}${Math.abs(n)}</button>`).join('')}</div>
      <form id="adm-elo-form" class="adm-row"><input id="adm-elo-amt" type="number" placeholder="Elo +/- (z. B. 250 oder -30)"><button class="btn primary" data-mode="add">± Ändern</button><button class="btn" data-mode="set" type="button" id="adm-elo-set">= Setzen</button></form>
      <div class="adm-row"><button class="btn sm" id="adm-view">👁️ Profil ansehen</button><button class="btn sm danger" id="adm-clear">🧹 Song, Banner & Bio entfernen</button></div>
    </div>`;
    $('#adm-view', ov.el).onclick = () => showPlayerProfile(pl.id);
    $('#adm-clear', ov.el).onclick = () => confirmBox('Profil säubern?', `Song, eigenes Bannerbild und Bio von @${esc(pl.name)} werden entfernt.`, 'Entfernen', async () => {
      const r = await emit('admin:clearProfile', { query: pl.code });
      r.error ? toast(esc(r.error), 'warn') : toast('🧹 Entfernt', 'good');
    });
    const give = async (amount) => {
      const r = await emit('admin:coins', { query: pl.code, amount });
      if (r.error) return toast(esc(r.error), 'warn');
      if (r.profile) setProfile(r.profile, { coinsAnim: true });
      toast(`✅ @${esc(r.player.name)}: ${amount > 0 ? '+' : ''}${fmtNum(amount)} Münzen (jetzt ${fmtNum(r.player.coins)})`, 'good');
      show(r.player);
    };
    $$('[data-amt]', ov.el).forEach((b) => b.onclick = () => give(+b.dataset.amt));
    const elo = async (payload) => {
      const r = await emit('admin:elo', { query: pl.code, ...payload });
      if (r.error) return toast(esc(r.error), 'warn');
      if (r.profile) setProfile(r.profile);
      toast(`🏆 @${esc(r.player.name)}: ${r.change >= 0 ? '+' : ''}${r.change} Elo (jetzt ${r.player.rating})`, 'good');
      show(r.player);
    };
    $$('[data-elo]', ov.el).forEach((b) => b.onclick = () => elo({ amount: +b.dataset.elo }));
    $('#adm-elo-form', ov.el).onsubmit = (e) => { e.preventDefault(); const n = +$('#adm-elo-amt', ov.el).value; if (n) elo({ amount: n }); };
    $('#adm-elo-set', ov.el).onclick = () => {
      const v = $('#adm-elo-amt', ov.el).value;
      if (v === '' || +v < 0) return toast('Gib den neuen Elo-Wert ein (0 bis 5.000).', 'warn');
      confirmBox('Elo setzen?', `Elo von @${esc(pl.name)} auf <b>${+v}</b> setzen?`, 'Setzen', () => elo({ set: +v }));
    };
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
// Profile kurz zwischenspeichern (und schon beim Antippen laden), damit sie sofort aufgehen
const profileCache = new Map(); // id -> { at, p: Promise }
function fetchProfile(id) {
  const c = profileCache.get(id);
  if (c && Date.now() - c.at < 20_000) return c.p;
  const p = emit('profile:get', { id });
  profileCache.set(id, { at: Date.now(), p });
  p.then((r) => { if (!r.profile) profileCache.delete(id); });
  return p;
}
async function showPlayerProfile(id) {
  if (!id) return;
  const ov = openOverlay('<div class="pp-loading"><span class="spinner"></span> Profil wird geladen…</div>', { wide: true, onClose: stopProfileMusic });
  ov.el.classList.add('pp-modal');
  const r = await fetchProfile(id);
  if (!ov.root.isConnected) return; // schon wieder zu
  if (r.error || !r.profile) { ov.close(); return toast(esc(r.error || 'Profil nicht gefunden.'), 'warn'); }
  const u = r.profile;
  const adm = state.profile?.admin ? emit('admin:profile', { id }) : null;
  ov.el.innerHTML = `<div class="pp-wrap">${profileCardHTML(u)}
    ${adm ? '<div class="pc-sec adm-vs" id="adm-vs"><h4>🛡️ Admin: Bilanz gegen Gegner</h4><p class="muted small">Lade…</p></div>' : ''}
    <div class="pc-sec"><h4>🕹️ Letzte Partien</h4>
    <ul class="history">${u.history.length ? u.history.map((h) => `<li>${avatar(h.oppAvatar, 30)}<div><b>${esc(h.opponent)}</b> ${h.type === 'bot' ? '<span class="tag">Bot</span>' : ''}<div class="muted" style="font-size:12px">${REASONS[h.reason] || ''} · ${timeAgo(h.at)}</div></div>
      <div class="res"><b class="res-${h.outcome}">${h.outcome === 'win' ? 'Sieg' : h.outcome === 'loss' ? 'Niederlage' : 'Remis'}</b>${h.type === 'online' && h.rating ? `<div class="muted">${h.rating > 0 ? '+' : ''}${h.rating} Elo</div>` : ''}</div></li>`).join('') : '<li class="muted">Noch keine Partien.</li>'}</ul></div>
    <p class="muted small" style="text-align:center">Mitglied seit ${new Date(u.createdAt || Date.now()).toLocaleDateString('de-DE')}</p>
    <div class="modal-actions"><button class="btn primary" data-x>Schließen</button></div></div>`;
  $('[data-x]', ov.el).onclick = ov.close;
  wireProfileMusic(ov.el, emit);
  if (adm) adm.then((ar) => {
    const box = $('#adm-vs', ov.el); if (!box) return;
    box.outerHTML = adminVsHTML(ar.admin, u);
    $$('.vs-table tr[data-uid]', ov.el).forEach((tr) => tr.onclick = () => { ov.close(); showPlayerProfile(tr.dataset.uid); });
  });
}

// Wer hat wie oft gegen wen gewonnen – nur für Admins
function adminVsHTML(a, u) {
  if (!a) return '<div class="pc-sec"><p class="form-error">Bilanz konnte nicht geladen werden.</p></div>';
  const row = (o, isBot) => {
    const n = o.w + o.l + o.d, rate = n ? Math.round((o.w / n) * 100) : 0;
    return `<tr${o.id ? ` data-uid="${esc(o.id)}" class="clickable"` : ''}><td><div class="who">${isBot ? '🤖' : avatar(o.avatar, 26)}<span>${esc(o.name)}${o.code ? ` <span class="muted small">${o.code}</span>` : ''}${o.online ? ' <i class="dot"></i>' : ''}</span></div></td>
      <td class="res-win"><b>${o.w}</b></td><td class="res-loss"><b>${o.l}</b></td><td class="res-draw">${o.d}</td>
      <td><div class="vs-bar"><i style="width:${rate}%"></i></div><span class="muted small">${rate}%</span></td>
      <td class="${o.elo >= 0 ? 'res-win' : 'res-loss'}">${isBot ? '–' : `${o.elo > 0 ? '+' : ''}${o.elo}`}</td><td class="muted small">${o.unrated ? `⚖️ ${o.unrated}` : ''}</td></tr>`;
  };
  const table = (list, isBot) => list.length ? `<table class="lb vs-table"><thead><tr><th>${isBot ? 'Bot' : 'Gegner'}</th><th>Siege</th><th>Niederl.</th><th>Remis</th><th>Siegquote</th><th>Elo</th><th></th></tr></thead><tbody>${list.map((o) => row(o, isBot)).join('')}</tbody></table>` : '<p class="muted small">Noch keine Partien.</p>';
  const tw = a.vs.reduce((s, o) => s + o.w, 0), tl = a.vs.reduce((s, o) => s + o.l, 0);
  return `<div class="pc-sec adm-vs"><h4>🛡️ Admin: Bilanz gegen Gegner <span class="muted small">Code ${a.code} · ${fmtNum(a.coins)} Münzen · ${a.registered ? 'Konto' : 'Gast'}</span></h4>
    <p class="muted small" style="margin:0 0 8px">${esc(u.name)} hat online <b class="res-win">${tw}</b>× gewonnen und <b class="res-loss">${tl}</b>× verloren – gegen ${a.vs.length} verschiedene Gegner. ⚖️ = davon nicht gewertet (Fair-Play-Check). Ältere Partien zählen nur, soweit sie in den letzten 50 Partien stehen.</p>
    ${table(a.vs, false)}
    <h4 style="margin-top:14px">🤖 Gegen Bots</h4>${table(a.vsBot, true)}</div>`;
}

function showBotProfile(b) {
  const ov = openOverlay(`<div class="pp"><div class="pp-head">${avatar({ type: 'emoji', value: b.avatar, color: 'rgba(255,255,255,.08)' }, 84)}<div><h2>${esc(b.name)} <span class="tag">Bot</span></h2>
    <div class="muted">${b.level} · „${esc(b.quote)}"</div></div><div class="pp-elo"><b>${eloText(b)}</b><span>Elo</span></div></div>
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
  if (!['play', 'bots', 'shop', 'leaderboard', 'profile', 'game', 'four'].includes(view)) view = 'play';
  if (view === 'game' && !state.game && !state.bot) view = 'play';
  if (view === 'four' && !state.four) view = 'play';
  if (state.view === 'four' && view !== 'four' && fourActive()) { toast('Du spielst gerade 4er-Schach – gib erst auf oder spiel zu Ende.', 'warn'); return; }
  if (state.view === 'game' && view !== 'game' && state.game?.spectator) stopWatching();
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
          <div><b id="hero-elo">${p.rating}</b><span>dein Elo</span></div>
        </div>
      </div>
      <div class="hero-board"><div class="hero-tilt"></div></div>
    </div>
    <div class="card live-card idle" id="card-live"></div>
    <div class="card four-card" id="card-four"></div>
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
  renderRandomCard(); renderInviteCard(); renderFourCard(); refreshLive();
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
  if (r.four) toast('👥 Du bist in der 4er-Lobby!', 'good');
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

const inviteLink = (code) => `${location.origin}/?join=${code}`;
function renderInviteCard() {
  const el = $('#card-invite'); if (!el) return;
  if (state.room) {
    const queens = state.roomVariant === 'queens';
    const hidden = !!state.codeHidden;
    el.innerHTML = `<div class="ic">${queens ? '👑' : '✉️'}</div><h3>Private Lobby ${queens ? '<span class="tag queen-tag">👑 Queen-Modus</span>' : ''}</h3>
      <p>Schick deinem Freund den Code oder den Link. Das Spiel startet, sobald er beitritt.</p>
      <div class="code-wrap ${hidden ? 'hidden-code' : ''}">${codeDigits(state.room)}<button class="code-eye" id="room-eye" title="${hidden ? 'Code anzeigen' : 'Code verstecken'}">${hidden ? '👁️ Code anzeigen' : '🙈'}</button></div>
      <div class="searching" style="flex-direction:row;justify-content:center;padding:0"><span class="spinner"></span><span class="muted">Warte auf Gegner…</span></div>
      <div class="room-actions"><button class="btn" id="room-big">🔍 Groß zeigen</button><button class="btn" id="room-copy">📋 Code</button><button class="btn" id="room-link">🔗 Link</button><button class="btn danger" id="room-cancel">✕ Schließen</button></div>`;
    $('#room-eye').onclick = () => { state.codeHidden = !hidden; renderInviteCard(); };
    $('#room-copy').onclick = () => copy(state.room, 'Einladungscode kopiert!');
    $('#room-link').onclick = () => copy(inviteLink(state.room), 'Einladungslink kopiert – einfach schicken!');
    $('#room-big').onclick = () => showBigCode(state.room, queens);
    $('#room-cancel').onclick = () => { socket.emit('room:cancel'); state.room = null; renderInviteCard(); };
  } else {
    const v = state.roomVariant || null;
    el.innerHTML = `<div class="ic">✉️</div><h3>Private Lobby</h3>
      <p>Erzeuge einen Code und spiel mit einem Freund – auch im Queen-Modus.</p>
      <div class="seg mode-seg" id="mode-seg"><button data-v="" class="${!v ? 'on' : ''}">♟️ Normal</button><button data-v="queens" class="${v === 'queens' ? 'on' : ''}">👑 Queen-Modus</button></div>
      ${v === 'queens' ? '<p class="muted small" style="margin:0">Beide haben nur Damen (außer dem König). Zählt nicht für Elo.</p>' : ''}
      <div class="seg" id="time-seg">${TIMES.map(([t, l]) => `<button data-t="${t}" class="${t === state.roomTime ? 'on' : ''}">${l}</button>`).join('')}</div>
      <button class="btn primary block" id="room-btn">🔐 Lobby erstellen</button>`;
    $$('#mode-seg button').forEach((b) => b.onclick = () => { state.roomVariant = b.dataset.v || null; renderInviteCard(); });
    $$('#time-seg button').forEach((b) => b.onclick = () => { state.roomTime = +b.dataset.t; renderInviteCard(); });
    $('#room-btn').onclick = async () => {
      const r = await emit('room:create', { timeMs: state.roomTime, variant: state.roomVariant || null });
      if (r.error) return toast(esc(r.error), 'warn');
      state.room = r.code; state.roomVariant = r.variant || null; renderInviteCard(); sound.notify();
    };
  }
}
// Code riesig anzeigen (z. B. um ihn im Klassenzimmer zu zeigen)
function showBigCode(code, queens) {
  const ov = openOverlay(`<div class="big-code">
    <div class="muted">${queens ? '👑 Queen-Modus · ' : ''}Einladungscode</div>
    <div class="big-digits">${[...code].map((d, i) => `<span style="animation-delay:${i * 70}ms">${d}</span>`).join('')}</div>
    <div class="muted small">oder Link öffnen: <b>${esc(inviteLink(code).replace(/^https?:\/\//, ''))}</b></div>
    <div class="modal-actions"><button class="btn" data-l>🔗 Link kopieren</button><button class="btn primary" data-x>Fertig</button></div></div>`, { wide: true });
  $('[data-x]', ov.el).onclick = ov.close;
  $('[data-l]', ov.el).onclick = () => copy(inviteLink(code), 'Einladungslink kopiert!');
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

// ================================================================ Live zuschauen
async function refreshLive() {
  const el = $('#card-live'); if (!el) return;
  const { list = [] } = await emit('live:list');
  const mine = state.profile?.id;
  const games = list.filter((g) => g.players.w.id !== mine && g.players.b.id !== mine);
  el.classList.toggle('idle', !games.length);
  if (!games.length) {
    el.innerHTML = `<div class="live-head"><span class="live-dot off"></span><h3>Live zuschauen</h3><span class="muted small">Gerade läuft kein Zufallsmatch – sobald jemand über „Gegner suchen“ spielt, kannst du hier live zuschauen.</span></div>`;
    return;
  }
  el.innerHTML = `<div class="live-head"><span class="live-dot"></span><h3>Live zuschauen</h3><span class="muted small">${games.length} Zufallsmatch${games.length > 1 ? 'es' : ''} läuft gerade</span></div>
    <div class="live-list">${games.slice(0, 6).map((g) => `<button class="live-item" data-watch="${esc(g.id)}">
      <span class="lv-p">${avatar(g.players.w.avatar, 30)}<b>${esc(g.players.w.name)}</b><small>${g.players.w.rating}</small></span>
      <span class="lv-vs">VS<small>${g.moves} Züge${g.watchers ? ` · 👀 ${g.watchers}` : ''}</small></span>
      <span class="lv-p right"><small>${g.players.b.rating}</small><b>${esc(g.players.b.name)}</b>${avatar(g.players.b.avatar, 30)}</span>
      <span class="lv-go">👀 Zuschauen</span></button>`).join('')}</div>`;
  $$('[data-watch]', el).forEach((b) => b.onclick = () => watchGame(b.dataset.watch));
}
async function watchGame(id) {
  if (state.game?.active && !state.game.spectator) return toast('Du spielst gerade selbst.', 'warn');
  const r = await emit('watch:start', { id });
  if (r.error) { toast(esc(r.error), 'warn'); refreshLive(); return; }
  const d = r.game;
  state.bot = null;
  const g = state.game = { ...d, active: true, spectator: true, sans: d.moves.map((m) => m.san), clockAt: performance.now(), marks: {}, fens: [], anaChess: d.startFen ? new Chess(d.startFen) : new Chess() };
  for (const m of d.moves) { g.fens.push(g.anaChess.fen()); try { g.anaChess.move(m.san); } catch { /* egal */ } }
  setupBoardLook(d.board, d.skins, 'w');
  const last = d.moves.at(-1);
  board.load(d.fen, last ? { from: last.from, to: last.to } : null, false);
  renderOnline(); setBanner('');
  go('game');
  toast(`👀 Du schaust live zu: <b>${esc(d.players.w.name)}</b> vs <b>${esc(d.players.b.name)}</b>`, 'good');
}
function stopWatching() {
  if (!state.game?.spectator) return;
  socket.emit('watch:stop');
  state.game = null;
}
socket.on('game:watchers', ({ id, n }) => { if (state.game?.id === id) { state.game.watchers = n; renderOnline(); } });

// ================================================================ 4er-Schach
const FOUR_TIMES = [[180000, '3 Min'], [300000, '5 Min'], [600000, '10 Min']];
const fourDot = (c) => `<i class="fdot" style="--fc:${COLOR_HEX[c]}"></i>`;
function renderFourCard() {
  const el = $('#card-four'); if (!el) return;
  const l = state.fourLobby, me = state.profile?.id;
  const t = state.fourTime || 300000;
  if (l) {
    const host = l.host === me;
    const hidden = !!state.codeHidden;
    el.innerHTML = `<div class="four-head"><div class="ic">👥</div><div><h3>4er-Lobby</h3><p>Teile den Code – bis zu 4 Spieler. ${host ? 'Freie Plätze füllst du mit Bots.' : 'Der Gastgeber startet das Spiel.'}</p></div></div>
      <div class="four-lobby">
        <div class="code-wrap ${hidden ? 'hidden-code' : ''}">${codeDigits(l.code)}<button class="code-eye" id="four-eye">${hidden ? '👁️ Code anzeigen' : '🙈'}</button></div>
        <div class="four-seats">${[0, 1, 2, 3].map((i) => { const p = l.players[i]; return p ? `<div class="seat on">${avatar(p.avatar, 34)}<b>${esc(p.name)}</b>${p.id === l.host ? '<span class="tag">Host</span>' : ''}</div>` : '<div class="seat"><span class="seat-empty">🤖</span><span class="muted">frei – wird Bot</span></div>'; }).join('')}</div>
      </div>
      <div class="room-actions four-actions-row">
        <button class="btn" id="four-big">🔍 Groß zeigen</button><button class="btn" id="four-link">🔗 Link</button>
        ${host ? `<button class="btn primary" id="four-go">▶ Starten (${4 - l.players.length} Bot${4 - l.players.length === 1 ? '' : 's'})</button>` : '<span class="muted small" style="align-self:center">Warte auf den Start…</span>'}
        <button class="btn danger" id="four-leave">✕ Verlassen</button>
      </div>`;
    $('#four-eye').onclick = () => { state.codeHidden = !hidden; renderFourCard(); };
    $('#four-big').onclick = () => showBigCode(l.code, false);
    $('#four-link').onclick = () => copy(inviteLink(l.code), 'Einladungslink kopiert!');
    $('#four-leave').onclick = () => { socket.emit('four:leave'); state.fourLobby = null; renderFourCard(); };
    const goBtn = $('#four-go'); if (goBtn) goBtn.onclick = async () => { const r = await emit('four:start'); if (r.error) toast(esc(r.error), 'warn'); };
  } else {
    el.innerHTML = `<div class="four-head"><div class="ic">👥</div><div><h3>4er-Schach <span class="tag new-tag">NEU</span></h3>
      <p>Vier Spieler, ein riesiges Brett – jeder gegen jeden. Wer matt ist, fliegt raus, der Letzte gewinnt. Leere Plätze übernehmen Bots.</p></div></div>
      <div class="four-row">
        <div class="seg" id="four-time">${FOUR_TIMES.map(([v, lb]) => `<button data-t="${v}" class="${v === t ? 'on' : ''}">${lb}</button>`).join('')}</div>
        <button class="btn primary" id="four-create">👥 Lobby erstellen</button>
        <button class="btn" id="four-solo">🤖 Gegen 3 Bots</button>
      </div>
      <p class="muted small" style="margin:0">Platz 1: ${coinHTML(300)} · Platz 2: ${coinHTML(120)} · Platz 3: ${coinHTML(60)} · Platz 4: ${coinHTML(25)} – mit Bots weniger. Freunde treten mit dem Code bei „Code eingeben“ bei.</p>`;
    $$('#four-time button').forEach((b) => b.onclick = () => { state.fourTime = +b.dataset.t; renderFourCard(); });
    $('#four-create').onclick = async () => {
      const r = await emit('four:create', { timeMs: t });
      if (r.error) return toast(esc(r.error), 'warn');
      state.fourLobby = r.lobby; renderFourCard(); sound.notify();
    };
    $('#four-solo').onclick = async () => { const r = await emit('four:solo', { timeMs: t }); if (r.error) toast(esc(r.error), 'warn'); };
  }
}
socket.on('four:lobby', (l) => {
  if (l.closed) { state.fourLobby = null; if (!l.started) toast('Die 4er-Lobby wurde geschlossen.', 'warn'); }
  else { if (state.fourLobby && l.players.length > state.fourLobby.players.length) sound.notify(); state.fourLobby = l; }
  renderFourCard();
});

let fourBoard = null, fourTimer = null;
function ensureFourView() {
  const root = $('#view-four');
  if (!root.querySelector('#fboard')) {
    root.innerHTML = `<div class="four-layout">
      <div class="four-board-wrap"><div id="fboard"></div></div>
      <div class="four-side">
        <div class="card four-status" id="four-status"></div>
        <div class="card four-players" id="four-players"></div>
        <div class="card four-actions" id="four-actions"></div>
      </div></div>`;
    fourBoard = new FourBoard($('#fboard'), { onMove: async (from, to) => {
      const r = await emit('four:move', { from, to });
      if (r.error) { toast(esc(r.error), 'warn'); fourBoard.set({ ...state.four }, state.four.you); }
    } });
  }
  const b = findItem('board', state.profile?.equipped.board) || BOARDS[0];
  fourBoard.setTheme(b.light, b.dark);
}
function fourClockLeft(c) {
  const g = state.four; let v = g.clock[c];
  if (g.status === 'playing' && g.turn === c) v -= performance.now() - g.clockAt;
  return Math.max(0, v);
}
function renderFourSide() {
  const g = state.four; if (!g) return;
  const order = [0, 1, 2, 3];
  const reasonTxt = { checkmate: 'Schachmatt', stalemate: 'Patt', resign: 'aufgegeben', timeout: 'Zeit abgelaufen', abandon: 'Verbindung weg', points: 'weniger Material' };
  const outOf = Object.fromEntries(g.out.map((o) => [o.color, o.reason]));
  $('#four-players').innerHTML = `<h4>Spieler</h4>${order.map((c) => {
    const p = g.players[c], alive = g.alive[c];
    return `<div class="fp ${g.turn === c && alive && g.status === 'playing' ? 'turn' : ''} ${alive ? '' : 'out'} ${c === g.you ? 'me' : ''}" style="--fc:${COLOR_HEX[c]}" data-c="${c}">
      ${fourDot(c)}${avatar(p.avatar, 32)}
      <div class="fp-name"><b>${esc(p.name)}</b><span>${COLOR_NAMES[c]}${c === g.you ? ' · Du' : ''}${p.bot ? ' · Bot' : ''}${!p.bot && p.online === false && alive ? ' · 📡 offline' : ''}</span></div>
      <div class="fp-right">${alive ? `<span class="fp-clock" data-c="${c}">${fmtClock(fourClockLeft(c))}</span>` : `<span class="fp-out">☠️ ${reasonTxt[outOf[c]] || 'raus'}</span>`}</div>
    </div>`;
  }).join('')}`;
  const meAlive = g.alive[g.you];
  let st;
  if (g.status === 'over') st = '🏁 Partie beendet';
  else if (!meAlive) st = '👀 Du bist ausgeschieden – du kannst weiter zuschauen.';
  else if (g.turn === g.you) st = `${fourDot(g.you)} <b>Du bist am Zug!</b>`;
  else st = `${fourDot(g.turn)} ${esc(g.players[g.turn].name)} (${COLOR_NAMES[g.turn]}) ist am Zug…`;
  $('#four-status').innerHTML = st;
  $('#four-actions').innerHTML = g.status === 'playing' && meAlive
    ? '<button class="btn danger block" id="four-resign">🏳️ Aufgeben</button>'
    : '<button class="btn block" id="four-exit">↩️ Zur Lobby</button>';
  const rs = $('#four-resign'); if (rs) rs.onclick = () => confirmBox('Aufgeben?', 'Du scheidest aus, deine Figuren werden grau.', 'Aufgeben', () => socket.emit('four:resign'));
  const ex = $('#four-exit'); if (ex) ex.onclick = () => { if (state.four?.status === 'playing') socket.emit('four:leave'); state.four = null; go('play'); };
}
function tickFourClocks() {
  if (!state.four || state.view !== 'four') return;
  for (const el of $$('.fp-clock')) {
    const c = +el.dataset.c, left = fourClockLeft(c);
    el.textContent = fmtClock(left);
    el.classList.toggle('low', left < 30000 && state.four.turn === c);
  }
}
window.__fourState = () => state.four; // für Tests
function applyFour(d, move = null) {
  state.four = { ...d, clockAt: performance.now() };
  ensureFourView();
  fourBoard.set(state.four, d.you, move);
  renderFourSide();
  clearInterval(fourTimer); fourTimer = setInterval(tickFourClocks, 250);
}
socket.on('four:start', (d) => {
  $$('.overlay').forEach((o) => o.remove());
  state.fourLobby = null; renderFourCard();
  applyFour(d);
  go('four');
  if (!d.resumed) { sound.start(); toast(`👥 4er-Schach! Du spielst ${fourDot(d.you)} <b>${COLOR_NAMES[d.you]}</b>`, 'good'); }
  else toast('4er-Spiel fortgesetzt', 'good');
});
socket.on('four:state', (d) => {
  if (!state.four || state.four.id !== d.id) return;
  const before = state.four;
  applyFour(d, d.move || null);
  const ev = d.events || [];
  if (d.move) (ev.some((e) => e.type === 'capture') ? sound.capture() : sound.move());
  if (ev.some((e) => e.type === 'check' && e.color === d.you)) { sound.check(); toast('⚠️ <b>Schach!</b> Dein König wird angegriffen.', 'warn'); }
  else if (ev.some((e) => e.type === 'check')) sound.check();
  for (const e of ev) {
    if (e.type === 'out') {
      const why = { checkmate: 'ist schachmatt', stalemate: 'ist patt', resign: 'hat aufgegeben', timeout: 'hat keine Zeit mehr', abandon: 'ist zu lange weg', points: 'hat weniger Material' }[e.reason] || 'ist raus';
      toast(`☠️ ${fourDot(e.color)} <b>${esc(d.players[e.color].name)}</b> ${why}!`, e.color === d.you ? 'warn' : 'good');
      if (e.reason === 'checkmate') sound.boom?.();
      const row = $(`.fp[data-c="${e.color}"]`); if (row) { row.classList.remove('boom'); void row.offsetWidth; row.classList.add('boom'); }
      $('#fboard')?.classList.remove('fb-shake'); void $('#fboard')?.offsetWidth; $('#fboard')?.classList.add('fb-shake');
    }
    if (e.type === 'offline') toast(`📡 ${esc(d.players[e.color].name)} hat die Verbindung verloren.`, 'warn');
  }
  if (before.turn !== d.you && d.turn === d.you && d.status === 'playing' && d.alive[d.you]) sound.notify();
});
socket.on('four:over', (d) => {
  if (d.profile) setProfile(d.profile, { coinsAnim: true });
  const inView = state.four && state.four.id === d.id;
  if (inView) applyFour(d);
  const win = d.place === 1;
  win ? sound.win() : sound.notify();
  if (win) confetti();
  const medal = ['🥇', '🥈', '🥉', '4.'];
  const ov = openOverlay(`<div class="result-head ${win ? 'win' : 'draw'}"><div class="result-icon">${win ? '🏆' : medal[d.place - 1]}</div>
      <h2>${win ? 'Du gewinnst das 4er-Schach!' : `Platz ${d.place}`}</h2><p class="muted">4er-Schach · ${d.bots ? `mit ${d.bots} Bot${d.bots > 1 ? 's' : ''}` : 'nur Menschen'}</p></div>
    <ol class="four-rank">${d.ranking.map((r) => `<li class="${r.color === d.you ? 'me' : ''}"><span>${medal[r.place - 1]}</span>${fourDot(r.color)}<b>${esc(r.name)}</b>${r.bot ? '<span class="tag">Bot</span>' : ''}<span class="muted small">${r.reason ? { checkmate: 'matt', stalemate: 'patt', resign: 'aufgegeben', timeout: 'Zeit', abandon: 'weg', points: 'weniger Material' }[r.reason] : 'Sieger'}</span></li>`).join('')}</ol>
    <div class="reward"><span class="pill coin-pill"><i class="coin" style="width:24px;height:24px"></i><b>+${d.coins}</b> Münzen</span></div>
    ${d.unrated ? `<div class="unrated">⚖️ <b>Nicht gewertet</b><span>${esc(d.unrated)}</span></div>` : ''}
    <div class="modal-actions"><button class="btn" data-r="lobby">Zur Lobby</button><button class="btn primary" data-r="again">🤖 Nochmal gegen Bots</button></div>`);
  if (d.coins > 0) setTimeout(() => coinRain($('.reward .coin-pill', ov.el), $('#coin-count').parentElement, Math.min(18, 4 + Math.round(d.coins / 20)), (i) => { if (i % 3 === 0) sound.coin(); }), 350);
  $$('[data-r]', ov.el).forEach((b) => b.onclick = async () => {
    ov.close(); state.four = null;
    if (b.dataset.r === 'again') { const r = await emit('four:solo', { timeMs: state.fourTime || 300000 }); if (r.error) toast(esc(r.error), 'warn'); }
    else go('play');
  });
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
    if (state.game?.spectator) return false;
    if (state.game?.active) return c === state.game.you && !state.game.clock?.paused;
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

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
function countPieces(fen) {
  const cnt = { w: { p: 0, n: 0, b: 0, r: 0, q: 0 }, b: { p: 0, n: 0, b: 0, r: 0, q: 0 } };
  for (const ch of fen.split(' ')[0]) { const l = ch.toLowerCase(); if (cnt.w[l] != null) cnt[ch === l ? 'b' : 'w'][l]++; }
  return cnt;
}
function captured(fen) {
  const vals = { p: 1, n: 3, b: 3, r: 5, q: 9 };
  const cnt = countPieces(fen);
  const start = countPieces((state.game ? state.game.startFen : state.bot?.startFen) || START_FEN);
  const mat = (c) => Object.entries(cnt[c]).reduce((s, [t, n]) => s + n * vals[t], 0);
  // Von Farbe c geschlagene Figuren = fehlende gegnerische Figuren (gemessen an der Startstellung)
  const taken = (c) => { const o = c === 'w' ? 'b' : 'w'; const out = []; for (const t of ['q', 'r', 'b', 'n', 'p']) for (let i = cnt[o][t]; i < start[o][t]; i++) out.push([t, o]); return out; };
  const startDiff = Object.keys(vals).reduce((s, t) => s + (start.w[t] - start.b[t]) * vals[t], 0);
  return { taken, diff: mat('w') - mat('b') - startDiff };
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
  const st = player.style || {};
  el.style.setProperty('--acc', st.accent || '#7c5cff');
  el.innerHTML = `<span class="mini-fr fr-${st.frame || 'keiner'}">${avatar(player.avatar, 44)}</span>
    <div><div class="pname"><span class="nf-${st.nameFx || 'keiner'}" data-text="${esc(player.name)}">${esc(player.name)}</span>${st.admin ? '<span class="admin-tag">ADMIN</span>' : ''} ${tag ? `<span class="tag">${tag}</span>` : ''} <span class="prating">${player.rating ?? ''} Elo</span></div>
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
  if (state.game?.spectator) socket.emit('watch:stop');
  closeVote();
  $$('.overlay').forEach((o) => o.remove());
  state.bot = null;
  state.searching = false; state.room = null;
  const g = state.game = { ...d, active: true, sans: d.moves.map((m) => m.san), clockAt: performance.now(), marks: {}, fens: [], anaChess: d.startFen ? new Chess(d.startFen) : new Chess() };
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
    if (d.variant === 'queens') toast('👑 <b>Queen-Modus!</b> Alle Figuren sind Damen.', 'good');
  } else toast('Spiel fortgesetzt', 'good');
  if (d.drawOffer && d.drawOffer !== d.you) showDrawOffer();
});

function renderSpectator() {
  const g = state.game;
  const clk = (c) => g.clock.unlimited ? null : fmtClock(clockLeft(c));
  const bottom = 'w', top = 'b'; // Drehen tauscht die Leisten per CSS
  renderBar($('#bar-top'), g.players[top], top, { clock: clk(top), tag: top === 'w' ? 'Weiß' : 'Schwarz' });
  renderBar($('#bar-bottom'), g.players[bottom], bottom, { clock: clk(bottom), tag: bottom === 'w' ? 'Weiß' : 'Schwarz' });
  const turn = board.chess.turn();
  $('#bar-top').classList.toggle('turn', g.active && turn === top);
  $('#bar-bottom').classList.toggle('turn', g.active && turn === bottom);
  renderMoves(g.sans);
  if (g.active) setStatus(`<span class="live-dot"></span> <b>LIVE</b> · ${esc(g.players[turn].name)} ist am Zug${board.chess.inCheck() ? ' – <span style="color:var(--bad)">Schach!</span>' : ''}${g.watchers ? ` · 👀 ${g.watchers}` : ''}`);
  $('#game-actions').innerHTML = `<button class="btn" id="flip-btn">🔄 Brett drehen</button><button class="btn danger" id="watch-stop">🚪 Beenden</button>`;
  $('#emotes').hidden = true;
  $('#flip-btn').onclick = () => { flipBoard(); renderSpectator(); };
  $('#watch-stop').onclick = () => go('play');
}
function renderOnline() {
  const g = state.game; if (!g) return;
  if (g.spectator) return renderSpectator();
  const opp = g.you === 'w' ? 'b' : 'w';
  const clk = (c) => g.clock.unlimited ? null : fmtClock(clockLeft(c));
  renderBar($('#bar-top'), g.players[opp], opp, { clock: clk(opp) });
  renderBar($('#bar-bottom'), g.players[g.you], g.you, { clock: clk(g.you), tag: 'Du' });
  const turn = board.chess.turn();
  $('#bar-top').classList.toggle('turn', g.active && turn === opp);
  $('#bar-bottom').classList.toggle('turn', g.active && turn === g.you);
  renderMoves(g.sans);
  if (g.active && g.clock?.paused) setStatus('⏸️ Pausiert – warte auf deinen Gegner…');
  else if (g.active && g.watchers) setStatus((turn === g.you ? '🟢 Du bist am Zug' : `⏳ ${esc(g.players[opp].name)} ist am Zug`) + ` · <span title="Zuschauer">👀 ${g.watchers}</span>`);
  else if (g.active) setStatus(turn === g.you ? '🟢 Du bist am Zug' + (board.chess.inCheck() ? ' – <span style="color:var(--bad)">Schach!</span>' : '') : `⏳ ${esc(g.players[opp].name)} ist am Zug`);
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
  if (g.spectator) return;
  if (s.drawOffer && s.drawOffer !== g.you && prevOffer !== s.drawOffer) showDrawOffer();
  if (!s.drawOffer) setBanner('');
  if (s.resumed || s.resumedAfterUpdate) { clearInterval(state.oppTimer); setBanner(''); toast('▶️ Weiter geht\'s – beide sind wieder da!', 'good'); }
  if (s.drawDeclined && g.drawOffer == null && prevOffer === g.you) toast('Remisangebot abgelehnt', 'warn');
});

function showDrawOffer() {
  sound.notify();
  setBanner(`<div>🤝 <b>${esc(state.game.players[state.game.you === 'w' ? 'b' : 'w'].name)}</b> bietet Remis an.</div>
    <div class="row"><button class="btn sm good" id="da">Annehmen</button><button class="btn sm" id="dd">Ablehnen</button></div>`);
  $('#da').onclick = () => socket.emit('game:draw', { action: 'accept' });
  $('#dd').onclick = () => { socket.emit('game:draw', { action: 'decline' }); setBanner(''); };
}

socket.on('game:opponent', ({ online, deadline, update, paused }) => {
  if (!state.game?.active) return;
  clearInterval(state.oppTimer);
  if (online) { setBanner(''); toast('Gegner ist wieder da', 'good'); return; }
  const upd = () => {
    const s = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
    if (s <= 0) clearInterval(state.oppTimer);
    setBanner(update
      ? `<div>⏸️ Kurze Pause wegen Update – warte auf deinen Gegner (<b>${s}s</b>). Die Uhr steht still.</div>`
      : paused
        ? `<div>⏸️ <b>Spiel pausiert</b> – dein Gegner hat keine Verbindung. Die Uhr steht. Kommt er in <b>${s}s</b> nicht zurück, verliert er.</div>`
        : `<div>📡 Dein Gegner hat die Verbindung verloren. Sieg in <b>${s}s</b>, falls er nicht zurückkommt.</div>`);
  };
  upd(); state.oppTimer = setInterval(upd, 1000);
});

socket.on('game:emote', ({ emote }) => showEmote(emote));
socket.on('game:cancelled', () => {
  if (!state.game) return;
  clearInterval(state.oppTimer); setBanner('');
  state.game.active = false; renderOnline();
  toast('Die Partie wurde nach dem Update ohne Wertung beendet, weil dein Gegner nicht zurückkam.', 'warn');
});
function showEmote(e) {
  const el = $('#emote-pop');
  el.textContent = e; el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
}

socket.on('game:over', async (d) => {
  const g = state.game; if (!g || g.id !== d.id) return;
  if (d.spectator) return spectatorOver(g, d);
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
    await playFinisher({ finisher: d.finisher, fen: d.fen, boardTheme: d.board, skins: d.skins, loserColor, winnerName: d.winnerName, attackerSq: board.lastMove?.to });
  }
  if (d.reason === 'resign') await throwBoard();
  setProfile(d.profile, { coinsAnim: true });
  showResult({ outcome: d.outcome, reason: d.reason, coins: d.coins, rating: d.ratingChange, online: true, unrated: d.unrated, variant: d.variant });
});

async function spectatorOver(g, d) {
  g.active = false;
  if (d.fen !== board.fen) board.load(d.fen, board.lastMove, true);
  const winner = d.result === 'w' ? d.players.w : d.result === 'b' ? d.players.b : null;
  setStatus(winner ? `🏆 ${esc(winner.name)} gewinnt` : '🤝 Remis');
  if (d.finisher) {
    await mateFx();
    const { playFinisher } = await import('./finisher.js');
    await playFinisher({ finisher: d.finisher, fen: d.fen, boardTheme: d.board, skins: d.skins, loserColor: d.result === 'w' ? 'b' : 'w', winnerName: d.winnerName, attackerSq: board.lastMove?.to });
  }
  if (d.reason === 'resign') await throwBoard();
  sound.notify();
  const ov = openOverlay(`<div class="result-head ${winner ? 'win' : 'draw'}"><div class="result-icon">${winner ? '🏆' : '🤝'}</div>
      <h2>${winner ? `${esc(winner.name)} gewinnt!` : 'Remis'}</h2><p class="muted">${REASONS[d.reason] || ''} · Live-Match</p></div>
    <div class="modal-actions"><button class="btn" data-r="lobby">Zur Lobby</button><button class="btn primary" data-r="more">📺 Weitere Live-Matches</button></div>`);
  $$('[data-r]', ov.el).forEach((b) => b.onclick = () => { ov.close(); state.game = null; go('play'); if (b.dataset.r === 'more') setTimeout(() => $('#card-live')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 300); });
}

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

function showResult({ outcome, reason, coins, rating, online, bot, training = false, unrated = null, variant = null }) {
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
      ${training ? `<span class="pill">${training === 'queens' ? '👑 Queen-Modus – nur zum Spaß' : '🎓 Training – ohne Münzen'}</span>` : `<span class="pill coin-pill"><i class="coin" style="width:24px;height:24px"></i><b>+${coins}</b> ${coinLabel}</span>`}
      ${online ? `<span class="pill" style="color:${rating >= 0 ? 'var(--good)' : 'var(--bad)'}"><b>${rating >= 0 ? '+' : ''}${rating}</b> Elo</span>` : ''}
    </div>
    ${unrated ? `<div class="unrated">⚖️ <b>Nicht gewertet</b><span>${esc(unrated)}</span></div>` : variant === 'queens' ? '<p class="muted" style="text-align:center;font-size:13px;margin-top:12px">👑 Queen-Modus zählt nicht für Elo.</p>' : ''}
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
    if (r === 'rematch' && bot) startBot(bot.id, { queens: !!state.lastQueens });
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
  root.innerHTML = `<button class="train-toggle ${state.training ? 'on' : ''}" id="train-toggle">
      <span class="tt-icon">🎓</span>
      <span class="tt-text"><b>Trainingsmodus ${state.training ? 'AN' : 'AUS'}</b>
        <small>${state.training ? 'Tipps, Stellungsbewertung und Züge zurücknehmen – dafür keine Münzen.' : 'Antippen zum Üben: Tipps vom Bot, Bewertung der Stellung, Züge zurücknehmen.'}</small></span>
      <span class="tt-switch"><i></i></span>
    </button>
    <div class="section-title"><div><h2>Gegen Bots spielen</h2><p>Sieben Gegner – vom völligen Noob bis zu Hugo, der Legende. Je stärker der Bot, desto mehr Münzen.</p></div>
    <div><div class="muted" style="font-size:13px;margin-bottom:6px">Deine Farbe</div><div class="color-pick" id="color-pick">
      <button data-c="w" title="Weiß">♔</button><button data-c="random" title="Zufall">🎲</button><button data-c="b" title="Schwarz">♚</button></div></div></div>
    <div class="bots-grid">${BOTS.map((b, i) => `
      <div class="card bot-card ${b.legend ? 'legend' : ''}" style="--bc:${b.color}">
        <div class="bot-top">${avatar({ type: 'emoji', value: b.avatar, color: 'rgba(255,255,255,.08)' }, 64)}
          <div><h3>${esc(b.name)}</h3><div class="muted" style="font-size:13px">${b.level} · ${b.legend ? '<b class="inf">∞</b>' : `~${b.elo}`} Elo</div>
          <div class="lvl">${BOTS.map((_, j) => `<i class="${j <= i ? 'on' : ''}"></i>`).join('')}</div></div></div>
        <blockquote>„${esc(b.quote)}"</blockquote>
        <div class="bot-meta"><span>Sieg: <b>${state.training ? '<span class="muted">Training</span>' : coinHTML(b.reward)}</b></span><span>Finisher: <b>${FINISHERS.find((f) => f.id === b.finisher).icon}</b></span></div>
        <button class="btn primary block" data-bot="${b.id}">Herausfordern</button>
        ${b.legend ? `<button class="btn block queen-btn" data-queens="${b.id}">👑 Queen-Modus <small>alle deine Figuren sind Damen</small></button>` : ''}
      </div>`).join('')}</div>`;
  const pickColor = () => $$('#color-pick button').forEach((b) => b.classList.toggle('on', b.dataset.c === state.botColor));
  $$('#color-pick button').forEach((b) => b.onclick = () => { state.botColor = b.dataset.c; pickColor(); });
  pickColor();
  $$('[data-bot]', root).forEach((b) => b.onclick = () => startBot(+b.dataset.bot));
  $$('[data-queens]', root).forEach((b) => b.onclick = () => startBot(+b.dataset.queens, { queens: true }));
  $('#train-toggle', root).onclick = () => {
    state.training = !state.training;
    localStorage.setItem('training', state.training ? '1' : '0');
    toast(state.training ? '🎓 Trainingsmodus an – üb ganz entspannt!' : 'Trainingsmodus aus – jetzt geht es um Münzen.', state.training ? 'good' : '');
    renderBots();
  };
}

// ---------------------------------------------------------------- Trainer (eigener Worker, damit der Bot nicht warten muss)
let trainer = null, trainReq = 0;
function trainerThink(fen, history, timeMs) {
  if (!trainer) trainer = new Worker(new URL('./engine-worker.js', import.meta.url), { type: 'module' });
  const id = 'tr' + (++trainReq);
  return new Promise((resolve) => {
    const onMsg = (e) => { if (e.data.id === id) { trainer.removeEventListener('message', onMsg); resolve(e.data.move); } };
    trainer.addEventListener('message', onMsg);
    trainer.postMessage({ id, fen, history, cfg: { maxDepth: 30, timeMs } });
  });
}
// Bewertung aus Sicht von Weiß (Bauerneinheiten), Matt als ±999
async function updateEval() {
  const s = state.bot;
  if (!s?.training) return;
  const fen = s.chess.fen(), ply = s.moves.length;
  let score;
  if (s.chess.isCheckmate()) score = s.chess.turn() === 'w' ? -100000 : 100000;
  else if (s.chess.isGameOver()) score = 0;
  else {
    const r = await trainerThink(fen, s.fens.slice(-60), 450);
    if (!r || state.bot !== s || s.moves.length !== ply) return;
    score = s.chess.turn() === 'w' ? r.score : -r.score;
  }
  s.eval = score;
  renderEval();
}
function renderEval() {
  const s = state.bot, box = $('#eval-box');
  if (!s || !box || s.eval == null) return;
  const sc = s.eval, mate = Math.abs(sc) > 90000;
  const pawns = sc / 100;
  const white = mate ? (sc > 0 ? 100 : 0) : Math.max(4, Math.min(96, 50 + Math.atan(pawns / 3) * 30));
  const mine = s.color === 'w' ? sc : -sc;
  const txt = mate ? (mine > 0 ? 'Du hast ein Matt in der Hand!' : 'Achtung: Matt droht!')
    : Math.abs(pawns) < 0.4 ? 'Ausgeglichen' : mine > 0 ? (Math.abs(pawns) > 3 ? 'Du stehst klar besser' : 'Du stehst etwas besser') : (Math.abs(pawns) > 3 ? `${esc(s.bot.name)} steht klar besser` : `${esc(s.bot.name)} steht etwas besser`);
  box.innerHTML = `<div class="eval-bar"><i style="width:${white}%"></i></div>
    <div class="eval-txt"><b>${mate ? '#' : (pawns > 0 ? '+' : '') + pawns.toFixed(1)}</b><span>${txt}</span></div>`;
}
async function showHint() {
  const s = state.bot;
  if (!s || s.over || s.thinking || s.chess.turn() !== s.color) return;
  const btn = $('#hint-btn'); if (btn) { btn.disabled = true; btn.textContent = '💡 Denke nach…'; }
  const r = await trainerThink(s.chess.fen(), s.fens.slice(-60), 1200);
  if (state.bot !== s || !r) return;
  board.coachHint = { from: r.from, to: r.to }; board._highlights();
  const san = new Chess(s.chess.fen()).move({ from: r.from, to: r.to, promotion: r.promotion || 'q' })?.san;
  toast(`💡 Tipp: <b>${esc(san || r.from + '-' + r.to)}</b>`, 'good');
  if (btn) { btn.disabled = false; btn.textContent = '💡 Tipp'; }
}
function clearHint() { if (board.coachHint) { board.coachHint = null; board._highlights(); } }

let worker = null, reqId = 0;
function getWorker() {
  if (!worker) worker = new Worker(new URL('./engine-worker.js', import.meta.url), { type: 'module' });
  return worker;
}

// Queen-Modus: alle eigenen Figuren außer dem König sind Damen (15 Stück!)
function queenFen(color) {
  return color === 'w'
    ? 'rnbqkbnr/pppppppp/8/8/8/8/QQQQQQQQ/QQQQKQQQ w - - 0 1'
    : 'qqqqkqqq/qqqqqqqq/8/8/8/8/PPPPPPPP/RNBQKBNR w - - 0 1';
}
function startBot(id, { queens = false } = {}) {
  if (state.game?.active) return toast('Du bist gerade in einem Online-Spiel.', 'warn');
  const bot = BOTS.find((b) => b.id === id);
  const color = state.botColor === 'random' ? (Math.random() < 0.5 ? 'w' : 'b') : state.botColor;
  state.game = null;
  const startFen = queens ? queenFen(color) : null;
  state.lastQueens = queens;
  state.bot = { bot, color, chess: startFen ? new Chess(startFen) : new Chess(), startFen, queens, moves: [], fens: [], marks: {}, over: false, thinking: false, token: ++reqId, training: !!state.training, eval: 0 };
  clearHint();
  const p = state.profile;
  setupBoardLook(p.equipped.board, { w: p.equipped.pieces, b: p.equipped.pieces }, color);
  board.load(state.bot.chess.fen(), null, false);
  setBanner('');
  renderBotGame();
  go('game');
  sound.start();
  if (color === 'b') botThink();
}

function botPlayer(b) { return { name: b.name, avatar: { type: 'emoji', value: b.avatar, color: 'rgba(255,255,255,.08)' }, rating: eloText(b), bot: b }; }

function renderBotGame() {
  const s = state.bot; if (!s) return;
  const opp = s.color === 'w' ? 'b' : 'w';
  renderBar($('#bar-top'), botPlayer(s.bot), opp, { thinking: s.thinking, tag: s.queens ? '👑 Queen-Modus' : s.training ? '🎓 Training' : s.bot.level });
  renderBar($('#bar-bottom'), state.profile, s.color, { tag: 'Du' });
  const turn = s.chess.turn();
  $('#bar-top').classList.toggle('turn', !s.over && turn === opp);
  $('#bar-bottom').classList.toggle('turn', !s.over && turn === s.color);
  renderMoves(s.chess.history());
  if (!s.over) setStatus(turn === s.color ? '🟢 Du bist am Zug' + (s.chess.inCheck() ? ' – <span style="color:var(--bad)">Schach!</span>' : '') : `🤖 ${esc(s.bot.name)} überlegt…`);
  $('#game-actions').innerHTML = s.over
    ? `<button class="btn primary" id="bot-again">🔁 Nochmal</button><button class="btn" data-view="bots">Anderer Bot</button>`
    : s.training
      ? `<div id="eval-box" class="eval-box"></div>
         <button class="btn good" id="hint-btn" ${s.thinking || s.chess.turn() !== s.color ? 'disabled' : ''}>💡 Tipp</button><button class="btn" id="undo-btn" ${s.moves.length < 1 || s.thinking ? 'disabled' : ''}>↩️ Zurück</button>
         <button class="btn danger" id="bot-resign">🏳️ Aufgeben</button><button class="btn" id="flip-btn">🔄 Drehen</button>`
      : `<button class="btn danger" id="bot-resign">🏳️ Aufgeben</button><button class="btn" id="flip-btn">🔄 Brett drehen</button>`;
  if (s.training && !s.over) renderEval();
  const hb = $('#hint-btn'); if (hb) hb.onclick = showHint;
  $('#emotes').hidden = true;
  const again = $('#bot-again'); if (again) again.onclick = () => startBot(s.bot.id, { queens: s.queens });
  const undo = $('#undo-btn'); if (undo) undo.onclick = () => {
    const n = s.chess.turn() === s.color ? 2 : 1;
    for (let i = 0; i < n && s.moves.length; i++) { s.chess.undo(); s.moves.pop(); s.fens.pop(); delete s.marks[s.chess.history().length]; }
    const last = s.chess.history({ verbose: true }).at(-1);
    clearHint();
    board.load(s.chess.fen(), last ? { from: last.from, to: last.to } : null, true);
    renderBotGame();
    updateEval();
    if (s.chess.turn() !== s.color) botThink(); // nur Bot-Zug zurückgenommen (z. B. ganz am Anfang)
  };
  const rs = $('#bot-resign'); if (rs) rs.onclick = () => confirmBox('Aufgeben?', `Gegen ${esc(s.bot.name)} aufgeben?`, 'Aufgeben', () => finishBot(true));
  const fb = $('#flip-btn'); if (fb) fb.onclick = flipBoard;
}

function botPlayerMove(m) {
  const s = state.bot;
  s.fens.push(s.chess.fen());
  const mv = s.chess.move({ from: m.from, to: m.to, promotion: m.promotion });
  s.moves.push({ from: m.from, to: m.to, promotion: m.promotion });
  clearHint();
  playMoveSound(mv, s.chess.inCheck());
  renderBotGame();
  updateEval();
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
  updateEval();
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
  clearHint();
  const req = s.training || s.queens ? Promise.resolve({ coins: 0 }) : emit('bot:finish', { botId: s.bot.id, color: s.color, moves: s.moves, resigned });
  if (reason === 'checkmate') {
    await mateFx();
    const { playFinisher } = await import('./finisher.js');
    const p = state.profile;
    await playFinisher({
      finisher: outcome === 'win' ? p.equipped.finisher : s.bot.finisher, fen: c.fen(), boardTheme: p.equipped.board,
      skins: { w: p.equipped.pieces, b: p.equipped.pieces }, loserColor: c.turn(), winnerName: outcome === 'win' ? p.name : s.bot.name, attackerSq: c.history({ verbose: true }).at(-1)?.to,
    });
  }
  if (reason === 'resign') await throwBoard();
  const r = await req;
  if (r?.profile) setProfile(r.profile, { coinsAnim: true });
  showResult({ outcome, reason, coins: r?.coins ?? 0, bot: s.bot, training: s.training ? 'training' : s.queens ? 'queens' : false });
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
      const card = html(`<div class="card shop-item bundle ${!missing.length ? 'equipped' : ''} ${bd.isNew ? 'ultra' : ''}">
        <span class="ribbon">${bd.discount >= 1 ? 'GRATIS' : `-${Math.round(bd.discount * 100)} %`}</span>
        ${bd.isNew ? '<span class="ribbon new">NEU · ULTRA</span>' : ''}
        <div class="prev bundle-prev"><div class="bp-board"></div><button class="bp-fin" title="Finisher-Vorschau">${findItem('finisher', fId).icon}<small>▶ Vorschau</small></button></div>
        <h4>${bd.icon} ${esc(bd.name)}</h4><p>${esc(bd.desc)}</p><ul class="bundle-list">${names}</ul>
        <div style="display:flex;align-items:center;justify-content:space-between;gap:10px">
          ${missing.length ? `<span><s class="muted small">${fmtNum(full)}</s> ${price === 0 ? '<b style="color:var(--good)">Kostenlos</b>' : coinHTML(price)}</span>` : '<span class="muted small">✔ Alles freigeschaltet</span>'}
          ${missing.length ? `<button class="btn sm ${price === 0 ? 'good' : 'gold'}" data-bundle ${p.coins < price ? 'disabled' : ''}>${price === 0 ? '🎁 Gratis holen' : 'Paket kaufen'}</button>` : ''}
        </div></div>`);
      $('.bp-board', card).appendChild(miniBoard(bId, { w: pId, b: pId }));
      $('.bp-fin', card).onclick = () => previewFinisher(fId);
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
      const colors = { klassisch: '#f5c542', feuerwerk: '#ff3d6e', blitz: '#39b6ff', meteor: '#ff7a1a', kristall: '#9be7ff', loch: '#8a3dff', glitch: '#39ff7a', tornado: '#cbb89a', samurai: '#ff2d55', laser: '#38d9ff', kanone: '#ffb347', erdbeben: '#ff5a1a', hammer: '#7fd4ff', midas: '#ffc53d', ak: '#ff8a3a', feuersturm: '#ff4a1a', rakete: '#ff9a3a', ufo: '#7fff9a', supernova: '#cfe8ff', portal: '#9a7cff', krake: '#b46cff', bowling: '#5a3cff', schwerkraft: '#8ab4ff', shuriken: '#d7dde4', lawine: '#e8f4ff', viertewand: '#bfe9ff', riss: '#ff4fd8' };
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
  await playFinisher({ finisher: id, fen: 'r1bqkb1r/pppp1Qpp/2n2n2/4p3/2B1P3/8/PPPP1PPP/RNB1K1NR b KQkq - 0 4', boardTheme: p.equipped.board, skins: { w: p.equipped.pieces, b: p.equipped.pieces }, loserColor: 'b', winnerName: p.name, subtitle: 'Vorschau', attackerSq: 'f7' });
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
        <div class="muted" style="margin-top:6px">⏱️ ${fmtPlaytime(p.playMs)} gespielt · Elo <b style="color:var(--text)">${p.rating}</b> · Spielercode <b style="color:var(--text);letter-spacing:.1em">${p.code}</b> <button class="btn sm" id="pc-copy" style="padding:4px 8px">📋</button></div>
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
  renderStudio(root, p);
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

// ================================================================ Profil-Studio
function renderStudio(root, p) {
  const c = p.custom || {};
  const opt = (k, labelFn) => PROFILE_OPTIONS[k].filter(([id]) => id !== 'admin' || p.admin).map(([id, label]) => `<button class="st-opt ${c[k] === id ? 'on' : ''}" data-k="${k}" data-v="${id}" title="${esc(label)}">${labelFn(id, label)}</button>`).join('');
  const box = html(`<section class="card studio">
    <div class="card-head"><h3>🎬 Profil-Studio</h3><span class="muted small">So sehen andere dein Profil – alles kostenlos</span></div>
    <div class="studio-grid">
      <div class="studio-prev">${profileCardHTML({ ...p, online: true }, { own: true })}</div>
      <div class="studio-ctrl">
        <h4>Banner</h4><div class="st-row">${opt('banner', (id, l) => `<span class="st-sw bn-${id}"></span><span>${esc(l)}</span>`)}</div>
        <label class="btn sm st-upload">🖼️ Eigenes Bannerbild hochladen<input type="file" accept="image/*" id="st-banner" hidden></label>
        <h4>Avatar-Rahmen</h4><div class="st-row">${opt('frame', (id, l) => `<span class="st-fr fr-${id}"><span class="avatar" style="--s:26px;--c:#334">♞</span></span><span>${esc(l)}</span>`)}</div>
        <h4>Namenseffekt</h4><div class="st-row">${opt('nameFx', (id, l) => `<b class="nf-${id}" data-text="${esc(l)}">${esc(l)}</b>`)}</div>
        <h4>Partikel</h4><div class="st-row">${opt('particles', (id, l) => esc(l))}</div>
        <h4>Akzentfarbe</h4><div class="color-grid">${PROFILE_OPTIONS.accent.map((col) => `<button data-k="accent" data-v="${col}" class="${c.accent === col ? 'on' : ''}" style="background:${col}"></button>`).join('')}</div>
        <h4>Bio</h4><form id="st-bio" class="adm-row"><input name="bio" maxlength="80" value="${esc(c.bio || '')}" placeholder="Ein Satz über dich (max. 80 Zeichen)"><button class="btn primary sm">Speichern</button></form>
        <h4>Lieblings-Finisher (Vitrine)</h4>
        <select id="st-showcase" class="st-select"><option value="">– keiner –</option>${p.owned.finisher.map((id) => `<option value="${id}" ${c.showcase === id ? 'selected' : ''}>${findItem('finisher', id)?.icon} ${esc(findItem('finisher', id)?.name)}</option>`).join('')}</select>
        <h4>Inventar</h4>
        <label class="st-toggle"><input type="checkbox" id="st-inv" ${c.showInventory !== false ? 'checked' : ''}><span></span> Inventar für andere sichtbar</label>
        <h4>🎵 Profilsong</h4>
        <p class="muted small">Spielt leise ab, wenn jemand dein Profil öffnet (Lautstärke begrenzt, Besucher können stummschalten). MP3/OGG/M4A, max. 3 MB. Lade nur Musik hoch, die du verwenden darfst.</p>
        ${p.music ? `<div class="st-song"><b>🎶 ${esc(p.music.title)}</b>
            <form id="st-mtitle" class="adm-row"><input name="t" maxlength="40" value="${esc(p.music.title)}" placeholder="Songtitel"><button class="btn sm">Titel speichern</button></form>
            <label class="st-vol">Lautstärke <input type="range" id="st-mvol" min="0" max="100" value="${Math.round((p.music.volume ?? 0.6) * 100)}"></label>
            <div class="st-row"><label class="btn sm">🔁 Anderen Song<input type="file" accept="audio/*" id="st-music" hidden></label><button class="btn sm danger" id="st-mdel">Song entfernen</button></div></div>`
          : `<label class="btn primary sm st-upload">⬆️ Song hochladen<input type="file" accept="audio/*" id="st-music" hidden></label>`}
      </div>
    </div></section>`);
  root.appendChild(box);
  wireProfileMusic(box, emit, { autoplay: false });
  const keepScroll = async (fn) => { const y = scrollY; await fn(); renderProfile(); scrollTo(0, y); };
  const save = (custom) => keepScroll(async () => { const r = await emit('profile:custom', { custom }); if (r.error) return toast(esc(r.error), 'warn'); setProfile(r.profile); });
  $$('[data-k]', box).forEach((b) => b.onclick = () => {
    if (b.dataset.k === 'banner' && b.dataset.v === 'bild' && !c.bannerImg) { $('#st-banner', box).click(); return; }
    save({ [b.dataset.k]: b.dataset.v });
  });
  $('#st-bio', box).onsubmit = (e) => { e.preventDefault(); save({ bio: e.target.bio.value }); };
  $('#st-showcase', box).onchange = (e) => save({ showcase: e.target.value || null });
  $('#st-inv', box).onchange = (e) => save({ showInventory: e.target.checked });
  $('#st-banner', box).onchange = async (e) => {
    const f = e.target.files[0]; if (!f) return;
    try { const img = await resizeBanner(f); save({ bannerImg: img, banner: 'bild' }); } catch { toast('Bild konnte nicht geladen werden.', 'warn'); }
  };
  const mfile = $('#st-music', box);
  if (mfile) mfile.onchange = async (e) => {
    const f = e.target.files[0]; if (!f) return;
    if (f.size > MUSIC_MAX_BYTES) return toast(`Der Song ist zu groß (${(f.size / 1e6).toFixed(1)} MB). Maximal 3 MB – kürze ihn oder nimm eine niedrigere Qualität.`, 'warn');
    toast('⏳ Song wird hochgeladen…');
    const data = await new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = rej; fr.readAsDataURL(f); });
    const title = f.name.replace(/\.[^.]+$/, '').slice(0, 40);
    keepScroll(async () => { const r = await emit('profile:music', { data, title }); if (r.error) return toast(esc(r.error), 'warn'); setProfile(r.profile); toast('🎵 Profilsong gespeichert!', 'good'); });
  };
  const mt = $('#st-mtitle', box);
  if (mt) mt.onsubmit = (e) => { e.preventDefault(); keepScroll(async () => { const r = await emit('profile:music', { title: e.target.t.value }); if (r.error) return toast(esc(r.error), 'warn'); setProfile(r.profile); }); };
  const mv = $('#st-mvol', box);
  if (mv) mv.onchange = async () => { const r = await emit('profile:music', { volume: mv.value / 100 }); if (r.error) return toast(esc(r.error), 'warn'); setProfile(r.profile); toast('🔊 Lautstärke gespeichert', 'good'); };
  const md = $('#st-mdel', box);
  if (md) md.onclick = () => keepScroll(async () => { stopProfileMusic(); const r = await emit('profile:music', { remove: true }); if (r.error) return toast(esc(r.error), 'warn'); setProfile(r.profile); });
}

function resizeBanner(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const W = 1200, H = 400, c = document.createElement('canvas'); c.width = W; c.height = H;
      const sc = Math.max(W / img.width, H / img.height), w = img.width * sc, h = img.height * sc;
      c.getContext('2d').drawImage(img, (W - w) / 2, (H - h) / 2, w, h);
      URL.revokeObjectURL(img.src);
      resolve(c.toDataURL('image/jpeg', 0.78));
    };
    img.onerror = reject; img.src = URL.createObjectURL(file);
  });
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
      <td>${styledWho(u, 36, u.online ? '<i class="dot" title="online"></i>' : '')}</td>
      <td><b>${u.rating}</b></td><td><span class="res-win">${u.stats.wins}</span> / <span class="res-loss">${u.losses}</span> / <span class="res-draw">${u.draws}</span></td><td>${u.botWins}</td></tr>`).join('')}
    </tbody></table>` : '<p class="muted">Noch keine Partien gespielt – sei der Erste!</p>';
  $$('tr[data-uid]', root).forEach((tr) => {
    tr.onpointerenter = tr.onpointerdown = () => fetchProfile(tr.dataset.uid);
    tr.onclick = () => showPlayerProfile(tr.dataset.uid);
  });
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
