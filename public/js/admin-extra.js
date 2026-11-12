// Erweitertes Admin-Panel: Anti-Cheat, Statistik, Events & Shop, Moderation, Protokoll, System,
// dazu Zusatz-Aktionen im Spieler- und Live-Tab. Helfer (H) kommen aus app.js.
import { BOARDS, PIECES, FINISHERS, SHAPES } from './catalog.js';

let H = null;
export const initAdminExtra = (helpers) => { H = helpers; };

const KINDS = { board: ['🎨 Brett', BOARDS], pieces: ['♟️ Figuren', PIECES], shape: ['🔷 Form', SHAPES], finisher: ['💥 Finisher', FINISHERS] };
const fmtDate = (t) => (t ? new Date(t).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '–');
const fmtDur = (s) => { s = Math.floor(s); const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60); return `${d ? d + ' Tg. ' : ''}${h} Std. ${m} Min.`; };
const mb = (n) => `${(n / 1048576).toFixed(0)} MB`;
const ask = async (ev, data, okMsg) => { const r = await H.emit(ev, data); if (r.error) { H.toast(H.esc(r.error), 'warn'); return null; } if (okMsg) H.toast(okMsg, 'good'); return r; };
const bars = (rows, { label = (r) => r.k, value = (r) => r.n, color = 'var(--accent)' } = {}) => {
  const max = Math.max(1, ...rows.map(value));
  return `<div class="ax-bars">${rows.map((r) => `<div class="ax-bar"><span class="ax-bl">${label(r)}</span><i style="--w:${(value(r) / max) * 100}%;--c:${color}"></i><b>${H.fmtNum(value(r))}</b></div>`).join('') || '<p class="muted small">Keine Daten.</p>'}</div>`;
};
const cols = (vals, labels) => {
  const max = Math.max(1, ...vals);
  return `<div class="ax-cols">${vals.map((v, i) => `<div class="ax-col" title="${labels[i]}: ${v}"><i style="--h:${(v / max) * 100}%"></i><b>${v}</b><span>${labels[i].slice(8)}.${labels[i].slice(5, 7)}</span></div>`).join('')}</div>`;
};
const scoreBar = (n) => `<span class="ax-score ${n >= 80 ? 'hi' : n >= 30 ? 'mid' : 'lo'}"><i style="--w:${Math.min(100, n)}%"></i><b>${n}</b></span>`;
const toggle = (id, on, label, sub = '') => `<label class="ax-toggle"><input type="checkbox" id="${id}" ${on ? 'checked' : ''}><span class="ax-sw"></span><span><b>${label}</b>${sub ? `<small>${sub}</small>` : ''}</span></label>`;
function download(name, mime, data) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob(['﻿' + data], { type: mime + ';charset=utf-8' }));
  a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

// ================================================================ 🛡️ Anti-Cheat
export async function tabAntiCheat(box, sub = 'cases') {
  box.innerHTML = `<div class="tabs ax-sub">${[['cases', '🚩 Verdachtsfälle'], ['pairs', '👥 Auffällige Paare'], ['ip', '🌐 Gleiche Verbindung'], ['settings', '⚙️ Einstellungen']].map(([k, l]) => `<button data-sub="${k}" class="${k === sub ? 'on' : ''}">${l}</button>`).join('')}</div><div id="ax-body"><p class="muted">Lade…</p></div>`;
  H.$$('[data-sub]', box).forEach((b) => b.onclick = () => tabAntiCheat(box, b.dataset.sub));
  const body = H.$('#ax-body', box);
  if (sub === 'cases') {
    const all = !!box.dataset.all;
    const r = await ask('ac:list', { all }); if (!r) return;
    body.innerHTML = `<div class="adm-row" style="justify-content:space-between"><span class="muted small">Punkte aus den letzten 14 Tagen. Ab 30 Punkten genauer hinschauen, ab 80 ist es sehr wahrscheinlich Betrug. Anti-Cheat ist ${r.settings.enabled ? '<b class="res-win">AN</b>' : '<b class="res-loss">AUS</b>'}.</span>
      <span><label class="ax-inline"><input type="checkbox" id="ac-all" ${all ? 'checked' : ''}> auch erledigte</label> <button class="btn sm" id="ac-scan">🔎 Alle Spieler scannen</button></span></div>
      <div class="ax-cases">${r.list.length ? r.list.map((u) => `<div class="ax-case" data-q="${u.code}">
        <div class="ax-case-head">${H.avatar(u.avatar, 36)}<div><b>${H.esc(u.name)}</b> ${u.online ? '<i class="dot"></i>' : ''}${u.trusted ? ' <span class="tag">✅ vertraut</span>' : ''}${u.ban ? ' <span class="tag ban-tag">gesperrt</span>' : ''}<div class="muted small">Code ${u.code} · ${u.rating} Elo · zuletzt ${u.online ? 'online' : fmtDate(u.lastSeen)}</div></div>${scoreBar(u.acScore)}</div>
        <ul class="ax-flags">${u.flags.map((f) => `<li class="${f.cleared ? 'done' : ''}"><span>🚩 <b>${H.esc(f.label)}</b> – ${H.esc(f.detail)}</span><small>${fmtDate(f.at)}</small>${f.gameId ? `<button class="btn sm" data-replay="${H.esc(f.gameId)}">🎬</button>` : ''}${f.cleared ? '' : `<button class="btn sm" data-clear1="${f.id}" title="Diesen Hinweis erledigen">✓</button>`}</li>`).join('')}</ul>
        <div class="adm-row"><input class="ax-note" placeholder="Notiz zum Fall…" value="${H.esc(u.note)}" maxlength="300"><button class="btn sm" data-act="note">💾</button></div>
        <div class="adm-quick"><button class="btn sm" data-act="profile">👤 Profil</button><button class="btn sm" data-act="player">🛠️ Spieler-Tab</button><button class="btn sm good" data-act="clear">✓ Alles erledigt</button>
          <button class="btn sm" data-act="trust">${u.trusted ? '❎ Nicht mehr vertrauen' : '✅ Vertrauen (ignorieren)'}</button><button class="btn sm danger" data-act="ban1">⛔ 1 Tag</button><button class="btn sm danger" data-act="ban7">⛔ 7 Tage</button><button class="btn sm danger" data-act="elo0">🏆 Elo auf 0</button></div>
      </div>`).join('') : '<div class="rp-empty"><div style="font-size:40px">🛡️</div><b>Keine Verdachtsfälle</b><span class="muted small">Alles sauber – oder noch keine Partien.</span></div>'}</div>`;
    H.$('#ac-all', body).onchange = (e) => { box.dataset.all = e.target.checked ? '1' : ''; tabAntiCheat(box, 'cases'); };
    H.$('#ac-scan', body).onclick = async () => { const rr = await ask('ac:scan', {}); if (rr) { H.toast(`🔎 Scan fertig: ${rr.flagged} Treffer`, 'good'); tabAntiCheat(box, 'cases'); } };
    H.$$('[data-replay]', body).forEach((b) => b.onclick = () => H.openReplay(b.dataset.replay, { admin: true }));
    for (const c of H.$$('.ax-case', body)) {
      const q = c.dataset.q, reload = () => tabAntiCheat(box, 'cases');
      H.$$('[data-clear1]', c).forEach((b) => b.onclick = async () => { if (await ask('ac:clear', { query: q, flagId: b.dataset.clear1 })) reload(); });
      H.$$('[data-act]', c).forEach((b) => b.onclick = async () => {
        const a = b.dataset.act;
        if (a === 'note') return ask('ac:note', { query: q, note: H.$('.ax-note', c).value }, '💾 Notiz gespeichert');
        if (a === 'profile') return H.showPlayerProfile(q);
        if (a === 'player') return H.openPlayerTab(q);
        if (a === 'clear') { if (await ask('ac:clear', { query: q })) reload(); return; }
        if (a === 'trust') { if (await ask('ac:trust', { query: q, trusted: b.textContent.includes('Vertrauen (') })) reload(); return; }
        if (a === 'ban1' || a === 'ban7') return H.confirmBox('Sperren?', `Spieler ${q} sperren (Betrugsverdacht)?`, 'Sperren', async () => { if (await ask('admin:ban', { query: q, minutes: a === 'ban1' ? 1440 : 10080, reason: 'Betrugsverdacht (Anti-Cheat)' }, '⛔ Gesperrt')) reload(); });
        if (a === 'elo0') return H.confirmBox('Elo zurücksetzen?', 'Die Elo dieses Spielers wird auf 0 gesetzt.', 'Auf 0 setzen', async () => { if (await ask('admin:elo', { query: q, set: 0 }, '🏆 Elo auf 0 gesetzt')) reload(); });
      });
    }
  }
  if (sub === 'pairs') {
    const r = await ask('ac:pairs', {}); if (!r) return;
    body.innerHTML = `<p class="muted small">Spieler-Paare mit mindestens 3 Partien gegeneinander in den letzten 7 Tagen. Viele Siege nur in eine Richtung = typisches Elo-Farming.</p>
      <table class="lb vs-table"><thead><tr><th>Spieler A</th><th>Spieler B</th><th>Partien</th><th>A gewinnt</th><th>B gewinnt</th><th>Remis</th><th>ungewertet</th><th></th></tr></thead><tbody>
      ${r.list.map((e) => `<tr class="${e.sameIp ? 'ax-hot' : ''}"><td>${H.esc(e.A.name)} ${e.A.acScore ? scoreBar(e.A.acScore) : ''}</td><td>${H.esc(e.B.name)} ${e.B.acScore ? scoreBar(e.B.acScore) : ''}</td><td><b>${e.n}</b>${e.sameIp ? ' 🌐' : ''}</td><td class="res-win">${e.aw}</td><td class="res-win">${e.bw}</td><td>${e.d}</td><td>${e.unrated}</td>
        <td><button class="btn sm danger" data-undo="${e.A.code}|${e.B.code}">↩️ Farm rückgängig</button></td></tr>`).join('') || '<tr><td colspan="8" class="muted">Keine auffälligen Paare.</td></tr>'}</tbody></table>
      <p class="muted small">🌐 = beide nutzen dieselbe Internet-Verbindung. „Farm rückgängig“ annulliert alle gewerteten Partien der beiden aus den letzten 7 Tagen (Elo & Münzen zurück).</p>`;
    H.$$('[data-undo]', body).forEach((b) => b.onclick = () => { const [a, c] = b.dataset.undo.split('|'); H.confirmBox('Elo-Farm rückgängig machen?', 'Alle gewerteten Partien zwischen den beiden aus den letzten 7 Tagen werden annulliert.', 'Rückgängig', async () => { const rr = await ask('ac:undoFarm', { a, b: c, days: 7 }); if (rr) { H.toast(rr.n ? `↩️ ${rr.n} Partien annulliert – Elo & Münzen zurückgebucht` : 'ℹ️ Keine gewerteten Partien gefunden – es gab nichts zurückzunehmen (Anti-Cheat hatte sie schon nicht gewertet).', rr.n ? 'good' : ''); tabAntiCheat(box, 'pairs'); } }); });
  }
  if (sub === 'ip') {
    const r = await ask('ac:ipgroups', {}); if (!r) return;
    body.innerHTML = `<p class="muted small">Konten, die sich über dieselbe Internet-Verbindung angemeldet haben (gespeichert wird nur ein anonymer Fingerabdruck, keine IP-Adresse). Geschwister in einem WLAN sind normal – verdächtig wird es erst, wenn sie gegeneinander spielen.</p>
      ${r.list.map((g) => `<div class="ax-ipgroup">${g.map((u) => `<button class="grp-mem" data-q="${u.code}">${H.avatar(u.avatar, 24)}<span>${H.esc(u.name)} · ${u.rating} Elo${u.acScore ? ` · 🚩${u.acScore}` : ''}</span></button>`).join('')}</div>`).join('') || '<p class="muted">Keine gemeinsamen Verbindungen gefunden.</p>'}`;
    H.$$('[data-q]', body).forEach((b) => b.onclick = () => H.openPlayerTab(b.dataset.q));
  }
  if (sub === 'settings') {
    const r = await ask('ac:list', {}); if (!r) return;
    const s = r.settings;
    body.innerHTML = `<div class="ax-grid2"><div>
        ${toggle('ac-enabled', s.enabled, 'Anti-Cheat aktiv', 'Partien werden auf Betrugsmuster geprüft')}
        ${toggle('ac-autoUnrate', s.autoUnrate, 'Verdächtige Partien nicht werten', 'Gleiche Verbindung oder 4+ Siege gegen denselben Gegner in 24 Std. → keine Elo & Münzen')}
        ${toggle('ac-notify', s.notify, 'Admins sofort benachrichtigen', 'Popup bei jedem neuen Verdacht')}
        ${toggle('ac-autoBan', s.autoBan, 'Automatisch sperren', 'Sperrt 24 Std., sobald die Punkte die Grenze erreichen')}
        <label class="field"><span>Grenze für automatische Sperre (Punkte)</span><input type="number" id="ac-banAt" min="20" max="1000" value="${s.banAt}"></label></div>
      <div><h4 class="adm-h">Erkennungen</h4>${Object.entries(r.types).map(([k, t]) => toggle('det-' + k, s.detectors[k] !== false, t.label, `${t.w} Punkte`)).join('')}</div></div>
      <div class="modal-actions"><button class="btn primary" id="ac-save">💾 Speichern</button></div>`;
    H.$('#ac-save', body).onclick = async () => {
      const ac = { banAt: +H.$('#ac-banAt', body).value, detectors: {} };
      for (const k of ['enabled', 'autoUnrate', 'notify', 'autoBan']) ac[k] = H.$('#ac-' + k, body).checked;
      for (const k of Object.keys(r.types)) ac.detectors[k] = H.$('#det-' + k, body).checked;
      await ask('ac:settings', { ac }, '💾 Anti-Cheat-Einstellungen gespeichert');
    };
  }
}

// ================================================================ 📈 Statistik
export async function tabStats(box) {
  const r = await ask('adm:stats2', {}); if (!r) return;
  const tile = (v, l, sub = '') => `<div class="adm-tile"><b>${v}</b><span>${l}</span>${sub ? `<small>${sub}</small>` : ''}</div>`;
  const decided = r.white + r.black;
  const RS = H.REASONS;
  box.innerHTML = `<div class="adm-tiles">
      ${tile(r.active24, 'aktiv (24 Std.)', `${r.active7} in 7 Tagen`)}${tile(r.peakToday, 'Online-Spitze heute')}${tile(r.avgPlies, 'Ø Halbzüge', 'pro Online-Partie')}
      ${tile(decided ? Math.round((r.white / decided) * 100) + ' %' : '–', 'Weiß gewinnt', `Schwarz ${decided ? Math.round((r.black / decided) * 100) : 0} % · ${r.draws} Remis`)}
      ${tile(H.fmtNum(r.coinsTotal), 'Münzen im Umlauf')}${tile(H.fmtNum(r.spentTotal), 'Münzen im Shop ausgegeben', 'Wert aller gekauften Teile')}
      ${tile(H.fmtNum(r.friendships), 'Freundschaften')}${tile(r.groups, 'Gruppen')}</div>
    <div class="ax-grid2">
      <div><h4 class="adm-h">♟️ Partien pro Tag (14 Tage)</h4>${cols(r.games, r.days)}</div>
      <div><h4 class="adm-h">👋 Neue Spieler pro Tag</h4>${cols(r.newUsers, r.days)}</div>
      <div><h4 class="adm-h">🏆 Elo-Verteilung</h4>${bars(r.elo, { label: (x) => `${x.k}–${x.k + 99}` })}</div>
      <div><h4 class="adm-h">🏁 Wie Partien enden</h4>${bars(r.reasons, { label: (x) => RS[x.r] || x.r, color: '#f59e0b' })}</div>
      <div><h4 class="adm-h">⏱️ Bedenkzeiten</h4>${bars(r.times, { label: (x) => (x.t ? `${x.t / 60000} Min` : '∞'), color: '#22d3ee' })}</div>
      <div><h4 class="adm-h">🤖 Bots: Siege der Spieler</h4>${bars(r.bots, { label: (b) => `${b.avatar} ${H.esc(b.name)} <small>(${b.n ? Math.round((b.wins / b.n) * 100) : 0} %)</small>`, value: (b) => b.n, color: '#10b981' })}</div>
      <div><h4 class="adm-h">🎨 Beliebteste Bretter</h4>${bars(r.boards, { label: (x) => H.esc(x.name), color: '#ec4899' })}</div>
      <div><h4 class="adm-h">♟️ Beliebteste Skins</h4>${bars(r.pieces, { label: (x) => H.esc(x.name), color: '#8b5cf6' })}</div>
      <div><h4 class="adm-h">🔷 Beliebteste Formen</h4>${bars(r.shapes, { label: (x) => H.esc(x.name), color: '#3b82f6' })}</div>
      <div><h4 class="adm-h">💥 Beliebteste Finisher</h4>${bars(r.finishers, { label: (x) => H.esc(x.name), color: '#ef4444' })}</div>
    </div><p class="muted small">Grundlage: die letzten ${H.fmtNum(r.matchesCounted)} Partien im Archiv und alle Spielerprofile.</p>`;
}

// ================================================================ 🎉 Events & Shop
export async function tabEvents(box) {
  const r = await ask('adm:settings', {}); if (!r) return;
  const s = r.settings;
  box.innerHTML = `<div class="ax-grid2">
    <div class="ax-panel"><h4>🎉 Münz-Event</h4><p class="muted small">Alle Belohnungen (online, 2v2/4er, Bots) werden multipliziert. ${r.settings.coinMultActive > 1 ? `<b class="res-win">Läuft gerade: ×${r.settings.coinMultActive}${s.coinMultUntil ? ` bis ${fmtDate(s.coinMultUntil)}` : ''}</b>` : 'Gerade kein Event.'}</p>
      <div class="seg" id="ev-mult">${[1, 1.5, 2, 3, 5].map((m) => `<button data-m="${m}" class="${s.coinMult === m ? 'on' : ''}">×${m}</button>`).join('')}</div>
      <label class="field"><span>Dauer in Stunden (0 = bis ich es ausschalte)</span><input type="number" id="ev-hours" min="0" max="720" value="0"></label>
      <button class="btn primary" id="ev-mult-go">🎉 Event setzen</button></div>
    <div class="ax-panel"><h4>🏷️ Shop-Rabatt</h4><p class="muted small">Gilt für alle Bretter, Figuren, Formen, Finisher und Pakete.</p>
      <div class="seg" id="ev-disc">${[0, 10, 20, 30, 50].map((d) => `<button data-d="${d}" class="${s.shopDiscount === d ? 'on' : ''}">${d ? `−${d} %` : 'Kein Rabatt'}</button>`).join('')}</div>
      <div class="adm-row"><input type="number" id="ev-disc-n" min="0" max="90" placeholder="eigener Wert in %"><button class="btn" id="ev-disc-go">Setzen</button></div></div>
    <div class="ax-panel"><h4>📣 Banner oben auf der Seite</h4><p class="muted small">Bleibt sichtbar, bis du es leerst (z. B. „Wochenend-Turnier um 18 Uhr!“).</p>
      <div class="adm-row"><input id="ev-banner" maxlength="160" value="${H.esc(s.banner)}" placeholder="Text für alle…"><button class="btn primary" id="ev-banner-go">Zeigen</button><button class="btn" id="ev-banner-off">Leeren</button></div></div>
    <div class="ax-panel"><h4>🎁 Münzen verschenken</h4>
      <div class="adm-row"><input type="number" id="ev-give" placeholder="Betrag, z. B. 500"><button class="btn gold" data-give="1">An alle online</button><button class="btn" data-give="0">An wirklich alle</button></div>
      <h4 style="margin-top:14px">💰 Startguthaben neuer Spieler</h4>
      <div class="adm-row"><input type="number" id="ev-start" min="0" placeholder="Standard: 250" value="${s.startCoins ?? ''}"><button class="btn" id="ev-start-go">Speichern</button></div></div>
    <div class="ax-panel"><h4>🚦 Spielmodi & Wartung</h4>
      ${toggle('ev-maintenance', s.maintenance, 'Wartungsmodus', 'Keine neuen Online-Partien, Lobbys oder Herausforderungen – laufende Partien gehen weiter')}
      <div class="adm-row"><input id="ev-mtext" maxlength="160" value="${H.esc(s.maintenanceText)}" placeholder="Wartungs-Nachricht"></div>
      ${toggle('ev-randomOff', s.randomOff, 'Zufallsmatch ausschalten')}
      ${toggle('ev-fourOff', s.fourOff, '2 vs 2 und 4er-Schach ausschalten')}
      ${toggle('ev-chatMute', s.chatMute, 'Chat für alle stummschalten', 'Freunde- und Gruppenchat (Admins dürfen weiter schreiben)')}
      <button class="btn primary" id="ev-modes-go">💾 Speichern</button></div>
  </div>`;
  const set = async (obj, msg) => { if (await ask('adm:settings', { set: obj }, msg)) tabEvents(box); };
  let mult = s.coinMult;
  H.$$('#ev-mult button', box).forEach((b) => b.onclick = () => { mult = +b.dataset.m; H.$$('#ev-mult button', box).forEach((x) => x.classList.toggle('on', x === b)); });
  H.$('#ev-mult-go', box).onclick = () => set({ coinMult: mult, coinMultHours: +H.$('#ev-hours', box).value || 0 }, mult > 1 ? `🎉 Münz-Event ×${mult} läuft!` : 'Münz-Event beendet');
  H.$$('#ev-disc button', box).forEach((b) => b.onclick = () => set({ shopDiscount: +b.dataset.d }, `🏷️ Shop-Rabatt: ${b.dataset.d} %`));
  H.$('#ev-disc-go', box).onclick = () => set({ shopDiscount: +H.$('#ev-disc-n', box).value || 0 }, '🏷️ Rabatt gesetzt');
  H.$('#ev-banner-go', box).onclick = () => set({ banner: H.$('#ev-banner', box).value }, '📣 Banner ist live');
  H.$('#ev-banner-off', box).onclick = () => set({ banner: '' }, 'Banner entfernt');
  H.$$('[data-give]', box).forEach((b) => b.onclick = () => {
    const amount = +H.$('#ev-give', box).value; if (!amount) return H.toast('Gib einen Betrag ein.', 'warn');
    H.confirmBox('Münzen verschenken?', `${H.fmtNum(amount)} Münzen an ${b.dataset.give === '1' ? 'alle, die gerade online sind' : '<b>alle Spieler</b>'}?`, 'Verschenken', async () => { const rr = await ask('adm:giveAll', { amount, onlineOnly: b.dataset.give === '1' }); if (rr) H.toast(`🎁 An ${rr.reached} Spieler verschenkt`, 'good'); });
  });
  H.$('#ev-start-go', box).onclick = () => set({ startCoins: H.$('#ev-start', box).value }, '💰 Startguthaben gespeichert');
  H.$('#ev-modes-go', box).onclick = () => set({ maintenance: H.$('#ev-maintenance', box).checked, maintenanceText: H.$('#ev-mtext', box).value, randomOff: H.$('#ev-randomOff', box).checked, fourOff: H.$('#ev-fourOff', box).checked, chatMute: H.$('#ev-chatMute', box).checked }, '💾 Gespeichert');
}

// ================================================================ 👤 Spieler: Zusatz-Aktionen (unter der bisherigen Karte)
export async function playerExtras(host, code) {
  const r = await ask('adm:player', { query: code }); if (!r) return;
  const p = r.player;
  const el = document.createElement('div');
  el.className = 'adm-card ax-player';
  el.innerHTML = `<h4 class="adm-h">📋 Übersicht</h4>
    <div class="ax-facts"><span>🛡️ Anti-Cheat ${scoreBar(p.acScore)}${p.trusted ? ' ✅' : ''}</span><span>🕒 ${p.online ? '<b class="res-win">online</b>' : `zuletzt ${fmtDate(p.lastSeen)}`}</span><span>📅 seit ${new Date(r.createdAt || 0).toLocaleDateString('de-DE')}</span>
      <span>${r.registered ? '🔐 Konto' : '👤 Gast'}</span><span>🔇 ${p.mute ? (p.mute === -1 ? 'dauerhaft stumm' : `stumm bis ${fmtDate(p.mute)}`) : 'darf chatten'}</span><span>⚠️ ${r.warnings.length} Verwarnungen</span>
      <span>♟️ ${r.stats.games} online · ${r.stats.botGames || 0} Bot · 4er ${r.stats.four?.games || 0} · 2v2 ${r.stats.teams?.games || 0}</span></div>
    ${r.gameId ? `<div class="adm-row ax-live"><b>🔴 Spielt gerade</b><button class="btn sm primary" data-a="watch">👀 Zuschauen</button><button class="btn sm" data-a="endDraw">🤝 Als Remis beenden</button><button class="btn sm danger" data-a="endAbort">✖️ Ohne Wertung abbrechen</button></div>` : ''}
    <h4 class="adm-h">📝 Admin-Notiz <span class="muted small">(nur für Admins)</span></h4>
    <div class="adm-row"><input id="ax-note" maxlength="500" value="${H.esc(r.note)}" placeholder="z. B. „hat sich entschuldigt“"><button class="btn sm" data-a="note">💾</button></div>
    <h4 class="adm-h">💬 Nachricht & Verwarnung</h4>
    <div class="adm-row"><input id="ax-msg" maxlength="300" placeholder="Text…"><button class="btn sm primary" data-a="dm">📨 Privat-Popup</button><button class="btn sm danger" data-a="warn">⚠️ Verwarnen</button></div>
    <div class="adm-quick">${[[10, '10 Min'], [60, '1 Std.'], [1440, '1 Tag'], [-1, 'dauerhaft']].map(([m, l]) => `<button class="btn sm" data-mute="${m}">🔇 ${l}</button>`).join('')}<button class="btn sm good" data-mute="0">🔊 Entstummen</button><button class="btn sm danger" data-a="kick">👢 Trennen</button></div>
    <h4 class="adm-h">🛠️ Konto</h4>
    <div class="adm-row"><input id="ax-name" maxlength="16" placeholder="Neuer Name (leer = Zufallsname)"><button class="btn sm" data-a="rename">✏️ Umbenennen</button></div>
    <div class="adm-row"><input id="ax-coins" type="number" placeholder="Münzen exakt setzen" value="${p.coins}"><button class="btn sm" data-a="setCoins">= Setzen</button></div>
    <div class="adm-quick"><button class="btn sm" data-a="avatar">🖼️ Bild zurücksetzen</button><button class="btn sm danger" data-a="stats">📊 Statistik zurücksetzen</button>${r.registered ? '<button class="btn sm" data-a="pw">🔑 Neues Passwort</button>' : ''}
      <button class="btn sm" data-a="acclear">🛡️ Anti-Cheat-Hinweise löschen</button><button class="btn sm" data-a="trust">${p.trusted ? '❎ Nicht mehr vertrauen' : '✅ Vertrauen'}</button></div>
    <h4 class="adm-h">🎒 Inventar</h4>
    <div class="ax-inv">${Object.entries(KINDS).map(([k, [label, list]]) => `<div><b>${label}</b><div class="ax-chips">${(r.owned[k] || ['klassisch']).map((id) => `<span class="ax-chip ${r.equipped[k] === id ? 'on' : ''}">${H.esc(list.find((x) => x.id === id)?.name || id)}${id !== 'klassisch' ? `<button data-take="${k}|${id}" title="Entziehen">✕</button>` : ''}</span>`).join('')}</div></div>`).join('')}</div>
    <div class="adm-row"><select id="ax-kind" class="st-select" style="width:auto">${Object.entries(KINDS).map(([k, [l]]) => `<option value="${k}">${l}</option>`).join('')}</select><select id="ax-item" class="st-select"></select><button class="btn sm gold" data-a="give">🎁 Schenken</button></div>
    <div class="ax-grid2">
      <div><h4 class="adm-h">👥 Freunde (${r.friends.length})</h4><div class="ax-chips">${r.friends.map((f) => `<button class="ax-chip" data-open="${f.id}">${f.online ? '🟢' : '⚪'} ${H.esc(f.name)}</button>`).join('') || '<span class="muted small">keine</span>'}</div>
        <h4 class="adm-h">💬 Gruppen</h4><div class="ax-chips">${r.groups.map((g) => `<span class="ax-chip">👥 ${H.esc(g.name)} (${g.n})</span>`).join('') || '<span class="muted small">keine</span>'}</div>
        <h4 class="adm-h">🌐 Gleiche Verbindung</h4><div class="ax-chips">${r.siblings.map((s) => `<button class="ax-chip" data-open="${s.code}">${H.esc(s.name)}${s.acScore ? ` 🚩${s.acScore}` : ''}</button>`).join('') || '<span class="muted small">keine anderen Konten</span>'}</div></div>
      <div><h4 class="adm-h">🕹️ Letzte Partien</h4><ul class="ax-mini">${r.history.map((h) => `<li ${h.matchId ? `data-replay="${H.esc(h.matchId)}" class="clickable"` : ''}><b class="res-${h.outcome}">${{ win: 'S', loss: 'N', draw: 'R' }[h.outcome]}</b> ${H.esc(h.opponent)} <small>${H.REASONS[h.reason] || ''}${h.unrated ? ' · ⚖️' : ''} · ${H.timeAgo(h.at)}</small></li>`).join('') || '<li class="muted">keine</li>'}</ul></div>
    </div>
    <h4 class="adm-h">🚩 Anti-Cheat-Hinweise</h4><ul class="ax-mini">${r.ac.map((f) => `<li class="${f.cleared ? 'done' : ''}">${H.esc(f.label)} – ${H.esc(f.detail)} <small>${fmtDate(f.at)}</small></li>`).join('') || '<li class="muted">keine</li>'}</ul>
    <h4 class="adm-h">📜 Admin-Aktionen zu diesem Spieler</h4><ul class="ax-mini">${r.log.map((e) => `<li><b>${H.esc(e.by)}</b>: ${H.esc(e.action)} ${H.esc(e.detail)} <small>${fmtDate(e.at)}</small></li>`).join('') || '<li class="muted">keine</li>'}</ul>
    ${r.warnings.length ? `<h4 class="adm-h">⚠️ Verwarnungen</h4><ul class="ax-mini">${r.warnings.map((w) => `<li>${H.esc(w.text)} <small>${H.esc(w.by)} · ${fmtDate(w.at)}</small></li>`).join('')}</ul>` : ''}`;
  host.querySelector('.ax-player')?.remove();
  host.appendChild(el);
  const q = p.code, again = () => playerExtras(host, q);
  const fillItems = () => { const [, list] = KINDS[H.$('#ax-kind', el).value]; H.$('#ax-item', el).innerHTML = list.filter((x) => x.id !== 'klassisch').map((x) => `<option value="${x.id}">${H.esc(x.name)} (${H.fmtNum(x.price)})</option>`).join(''); };
  H.$('#ax-kind', el).onchange = fillItems; fillItems();
  H.$$('[data-take]', el).forEach((b) => b.onclick = () => { const [kind, id] = b.dataset.take.split('|'); H.confirmBox('Gegenstand entziehen?', `„${H.esc(id)}“ wird aus dem Inventar entfernt.`, 'Entziehen', async () => { if (await ask('adm:item', { query: q, kind, id, give: false }, 'Entzogen')) again(); }); });
  H.$$('[data-open]', el).forEach((b) => b.onclick = () => H.openPlayerTab(b.dataset.open));
  H.$$('[data-replay]', el).forEach((b) => b.onclick = () => H.openReplay(b.dataset.replay, { admin: true }));
  H.$$('[data-mute]', el).forEach((b) => b.onclick = async () => { if (await ask('adm:mute', { query: q, minutes: +b.dataset.mute }, +b.dataset.mute ? '🔇 Stummgeschaltet' : '🔊 Entstummt')) again(); });
  H.$$('[data-a]', el).forEach((b) => b.onclick = async () => {
    const a = b.dataset.a, msg = H.$('#ax-msg', el).value;
    const acts = {
      watch: () => H.watchGame(r.gameId),
      endDraw: () => H.confirmBox('Als Remis beenden?', 'Die laufende Partie endet sofort als Remis (mit Wertung).', 'Beenden', async () => { if (await ask('adm:endGame', { query: q, mode: 'draw' }, 'Partie beendet')) again(); }),
      endAbort: () => H.confirmBox('Partie abbrechen?', 'Die laufende Partie wird ohne Wertung abgebrochen.', 'Abbrechen', async () => { if (await ask('adm:endGame', { query: q, mode: 'abort' }, 'Partie abgebrochen')) again(); }),
      note: () => ask('adm:note', { query: q, note: H.$('#ax-note', el).value }, '💾 Notiz gespeichert'),
      dm: async () => { const rr = await ask('adm:dm', { query: q, text: msg }); if (rr) H.toast(rr.delivered ? '📨 Zugestellt' : '📨 Spieler ist offline – nicht zugestellt', rr.delivered ? 'good' : 'warn'); },
      warn: async () => { const rr = await ask('adm:warn', { query: q, text: msg }); if (rr) { H.toast(rr.delivered ? '⚠️ Verwarnung angezeigt' : '⚠️ Verwarnung gespeichert (offline)', 'good'); again(); } },
      kick: () => ask('adm:kick', { query: q }, '👢 Getrennt'),
      rename: async () => { const rr = await ask('adm:rename', { query: q, name: H.$('#ax-name', el).value }); if (rr) { H.toast(`✏️ Heißt jetzt ${H.esc(rr.name)}`, 'good'); again(); } },
      setCoins: async () => { if (await ask('adm:setCoins', { query: q, coins: +H.$('#ax-coins', el).value }, '💰 Münzen gesetzt')) again(); },
      avatar: () => ask('adm:resetAvatar', { query: q }, '🖼️ Profilbild zurückgesetzt'),
      stats: () => H.confirmBox('Statistik zurücksetzen?', 'Partien, Siege, Niederlagen und Verlauf werden gelöscht (Elo & Münzen bleiben).', 'Zurücksetzen', async () => { if (await ask('adm:resetStats', { query: q }, '📊 Zurückgesetzt')) again(); }),
      pw: () => H.confirmBox('Neues Passwort erzeugen?', 'Das alte Passwort funktioniert danach nicht mehr. Gib das neue dem Spieler persönlich.', 'Erzeugen', async () => { const rr = await ask('adm:resetPw', { query: q }); if (rr) H.openOverlay(`<h2>🔑 Neues Passwort</h2><p class="muted">Für @${H.esc(p.name)}:</p><div class="big-digits" style="font-size:32px">${H.esc(rr.password)}</div><div class="modal-actions"><button class="btn primary" onclick="this.closest('.overlay').remove()">OK</button></div>`); }),
      acclear: async () => { if (await ask('ac:clear', { query: q }, '🛡️ Hinweise gelöscht')) again(); },
      trust: async () => { if (await ask('ac:trust', { query: q, trusted: !p.trusted }, p.trusted ? 'Nicht mehr vertraut' : '✅ Vertraut')) again(); },
      give: async () => { if (await ask('adm:item', { query: q, kind: H.$('#ax-kind', el).value, id: H.$('#ax-item', el).value, give: true }, '🎁 Geschenkt')) again(); },
    };
    acts[a]?.();
  });
}

// ================================================================ 💬 Moderation
export async function tabModeration(box, sub = 'groups') {
  box.innerHTML = `<div class="tabs ax-sub">${[['groups', '👥 Gruppen'], ['dm', '💬 Privatchat lesen'], ['blocked', '🚫 Blockierte Nachrichten']].map(([k, l]) => `<button data-sub="${k}" class="${k === sub ? 'on' : ''}">${l}</button>`).join('')}</div><div id="ax-body"><p class="muted">Lade…</p></div>`;
  H.$$('[data-sub]', box).forEach((b) => b.onclick = () => tabModeration(box, b.dataset.sub));
  const body = H.$('#ax-body', box);
  const msgList = (msgs, nameOf) => `<div class="ax-chat">${msgs.map((m) => m.sys ? `<div class="ch-sys">${H.esc(m.text)}</div>` : `<div class="ax-msg"><b>${H.esc(nameOf(m))}</b> ${H.esc(m.text)}<small>${fmtDate(m.at)}</small></div>`).join('') || '<p class="muted">Keine Nachrichten.</p>'}</div>`;
  if (sub === 'groups') {
    const r = await ask('adm:groups', {}); if (!r) return;
    body.innerHTML = r.list.map((g) => `<div class="adm-match ax-group" data-id="${g.id}"><span class="am-icon">👥</span><span class="am-who"><b>${H.esc(g.name)}</b> <small class="muted">· ${g.n} Mitglieder · Chef: ${H.esc(g.owner)}</small><br><small class="muted">${g.members.map(H.esc).join(', ')}</small></span>
      <span class="am-res"><small>${g.last ? H.esc(g.last.text.slice(0, 40)) : ''}</small><small>${fmtDate(g.last?.at || g.createdAt)}</small></span>
      <span class="adm-quick"><button class="btn sm" data-g="read">👁️ Lesen</button><button class="btn sm" data-g="ren">✏️</button><button class="btn sm" data-g="clr">🧹</button><button class="btn sm danger" data-g="del">🗑️</button></span></div>`).join('') || '<p class="muted">Noch keine Gruppen.</p>';
    for (const row of H.$$('.ax-group', body)) {
      const id = row.dataset.id, name = H.$('b', row).textContent;
      H.$$('[data-g]', row).forEach((b) => b.onclick = async () => {
        const a = b.dataset.g;
        if (a === 'read') { const rr = await ask('adm:groupChat', { id }); if (rr) { const ov = H.openOverlay(`<h2>👥 ${H.esc(rr.name)}</h2>${msgList(rr.msgs, (m) => m.name || '?')}<div class="modal-actions"><button class="btn primary" data-x>Schließen</button></div>`, { wide: true }); H.$('[data-x]', ov.el).onclick = ov.close; } }
        if (a === 'ren') { const n = prompt('Neuer Gruppenname:', name); if (n && await ask('adm:groupRename', { id, name: n }, '✏️ Umbenannt')) tabModeration(box, 'groups'); }
        if (a === 'clr') H.confirmBox('Chatverlauf leeren?', `Alle Nachrichten in „${H.esc(name)}“ werden gelöscht.`, 'Leeren', async () => { if (await ask('adm:groupClear', { id }, '🧹 Geleert')) tabModeration(box, 'groups'); });
        if (a === 'del') H.confirmBox('Gruppe löschen?', `„${H.esc(name)}“ wird mit allen Nachrichten gelöscht.`, 'Löschen', async () => { if (await ask('adm:groupDelete', { id }, '🗑️ Gelöscht')) tabModeration(box, 'groups'); });
      });
    }
  }
  if (sub === 'dm') {
    body.innerHTML = `<p class="muted small">Privatchat zwischen zwei Spielern lesen, z. B. nach einer Meldung. Wird im Protokoll vermerkt.</p>
      <form class="adm-row" id="ax-dm"><input name="a" placeholder="Spieler 1 (Name oder Code)"><input name="b" placeholder="Spieler 2"><button class="btn primary">Lesen</button></form><div id="ax-dm-out"></div>`;
    H.$('#ax-dm', body).onsubmit = async (e) => {
      e.preventDefault();
      const rr = await ask('adm:dmChat', { a: e.target.a.value, b: e.target.b.value }); if (!rr) return;
      H.$('#ax-dm-out', body).innerHTML = msgList(rr.msgs, (m) => (m.from === rr.a.id ? rr.a.name : rr.b.name));
    };
  }
  if (sub === 'blocked') {
    const r = await ask('adm:chatBlocks', {}); if (!r) return;
    body.innerHTML = `<p class="muted small">Nachrichten, die der Wortfilter gestoppt hat (sie wurden nicht zugestellt).</p>
      <ul class="ax-mini">${r.list.map((m) => `<li><b>${H.esc(m.name)}</b>: „${H.esc(m.text)}“ <small>${fmtDate(m.at)}</small> <button class="btn sm" data-p="${H.esc(m.uid)}">🛠️</button></li>`).join('') || '<li class="muted">Nichts blockiert.</li>'}</ul>`;
    H.$$('[data-p]', body).forEach((b) => b.onclick = () => H.openPlayerTab(b.dataset.p));
  }
}

// ================================================================ 📜 Protokoll
const LOG_ACTIONS = [['', 'Alle'], ['anticheat', '🛡️ Anti-Cheat'], ['ban', '⛔ Sperren'], ['coins', '💰 Münzen'], ['elo', '🏆 Elo'], ['annul', '⚖️ Annullieren'], ['settings', '🎉 Einstellungen'], ['warn', '⚠️ Verwarnungen']];
export async function tabLog(box) {
  const q = box.dataset.q || '', action = box.dataset.action || '';
  box.innerHTML = `<form class="adm-row" id="lg-f"><input id="lg-q" placeholder="Suche (Admin, Spieler, Text)…" value="${H.esc(q)}"><select id="lg-a" class="st-select" style="width:auto">${LOG_ACTIONS.map(([k, l]) => `<option value="${k}" ${k === action ? 'selected' : ''}>${l}</option>`).join('')}</select><button class="btn primary">Filtern</button><button type="button" class="btn" id="lg-exp">⬇️ Export</button></form><div id="lg-list"><p class="muted">Lade…</p></div>`;
  H.$('#lg-f', box).onsubmit = (e) => { e.preventDefault(); box.dataset.q = H.$('#lg-q', box).value; box.dataset.action = H.$('#lg-a', box).value; tabLog(box); };
  H.$('#lg-exp', box).onclick = async () => { const r = await ask('adm:export', { what: 'log' }); if (r) download(r.name, r.mime, r.data); };
  const r = await ask('adm:log', { q, action }); if (!r) return;
  H.$('#lg-list', box).innerHTML = `<div class="adm-matches">${r.list.map((e) => `<div class="adm-match"><span class="am-icon">${{ anticheat: '🛡️', ban: '⛔', unban: '✅', coins: '💰', elo: '🏆', annul: '⚖️', warn: '⚠️', mute: '🔇', kick: '👢', settings: '🎉', 'give-all': '🎁' }[e.action] || '🛠️'}</span>
    <span class="am-who"><b>${H.esc(e.by)}</b> · ${H.esc(e.action)}${e.target ? ` → <b class="clickable" data-p="${H.esc(e.target.id)}">${H.esc(e.target.name)}</b>` : ''}<br><small class="muted">${H.esc(e.detail)}</small></span><span class="am-when">${fmtDate(e.at)}</span></div>`).join('') || '<p class="muted">Keine Einträge.</p>'}</div>`;
  H.$$('[data-p]', box).forEach((b) => b.onclick = () => H.openPlayerTab(b.dataset.p));
}

// ================================================================ 🔴 Live: Warteschlange & Lobbys
export async function liveExtras(box) {
  const r = await ask('adm:lobbies', {}); if (!r) return;
  const el = document.createElement('div');
  el.innerHTML = `<h4 class="adm-h">🎲 Warteschlange (${r.queue.length}) ${r.queue.length ? '<button class="btn sm danger" id="lx-qclr">Leeren</button>' : ''}</h4>
    ${r.queue.map((q) => `<div class="adm-match"><span class="am-icon">⏳</span><span class="am-who"><b>${H.esc(q.name)}</b> <small class="muted">${q.rating} Elo</small></span><span class="am-res"><small>${q.timeMs / 60000} Min · sucht seit ${Math.round((Date.now() - q.since) / 1000)} s</small></span></div>`).join('') || '<p class="muted small">Niemand sucht gerade.</p>'}
    <h4 class="adm-h">🔐 Offene Lobbys</h4>
    ${[...r.rooms.map((l) => ({ ...l, kind: l.variant === 'queens' ? '👑 Privat (Queen)' : '✉️ Privat', who: l.host })), ...r.four.map((l) => ({ ...l, kind: l.teams ? '🤝 2 vs 2' : '👥 4er', who: l.players.join(', ') }))].map((l) => `<div class="adm-match"><span class="am-icon">🚪</span><span class="am-who"><b>${l.kind}</b> · Code ${l.code} <small class="muted">${H.esc(l.who)}</small></span><span class="am-res"><small>${l.timeMs ? l.timeMs / 60000 + ' Min' : '∞'}</small></span><button class="btn sm danger" data-close="${l.code}">Schließen</button></div>`).join('') || '<p class="muted small">Keine offenen Lobbys.</p>'}
    <h4 class="adm-h">👥 Laufende 2v2/4er-Spiele</h4>
    ${r.fourGames.map((g) => `<div class="adm-match"><span class="am-icon">${g.teams ? '🤝' : '👥'}</span><span class="am-who">${g.players.map(H.esc).join(' · ')}</span><span class="am-res"><small>${g.ply} Halbzüge</small></span><button class="btn sm danger" data-four="${g.id}">✖️ Abbrechen</button></div>`).join('') || '<p class="muted small">Keine.</p>'}`;
  box.appendChild(el);
  const again = () => { el.remove(); liveExtras(box); };
  const qc = H.$('#lx-qclr', el); if (qc) qc.onclick = async () => { if (await ask('adm:queueClear', {}, 'Warteschlange geleert')) again(); };
  H.$$('[data-close]', el).forEach((b) => b.onclick = async () => { if (await ask('adm:lobbyClose', { code: b.dataset.close }, 'Lobby geschlossen')) again(); });
  H.$$('[data-four]', el).forEach((b) => b.onclick = () => H.confirmBox('Spiel abbrechen?', 'Das 2v2/4er-Spiel wird ohne Wertung beendet.', 'Abbrechen', async () => { if (await ask('adm:fourEnd', { id: b.dataset.four }, 'Abgebrochen')) again(); }));
}

// ================================================================ ⚙️ System
export async function tabSystem(box) {
  const r = await ask('adm:system', {}); if (!r) return;
  const tile = (v, l, sub = '') => `<div class="adm-tile"><b>${v}</b><span>${l}</span>${sub ? `<small>${sub}</small>` : ''}</div>`;
  box.innerHTML = `<div class="adm-tiles">${tile('v' + H.esc(r.version), 'Version', `Node ${H.esc(r.node)}`)}${tile(fmtDur(r.uptime), 'Server läuft seit')}${tile(mb(r.rss), 'Arbeitsspeicher', `davon ${mb(r.heap)} JavaScript`)}
      ${tile(r.sockets, 'Verbindungen', `${r.online} Spieler online · Spitze heute ${r.peakToday}`)}${tile(r.db, 'Datenbank', `${H.fmtNum(r.users)} Profile`)}${tile(r.games + r.four, 'laufende Partien', `${r.games} normal · ${r.four} 2v2/4er`)}</div>
    <div class="ax-grid2"><div class="ax-panel"><h4>🔧 Werkzeuge</h4><div class="adm-quick">
      <button class="btn" id="sy-save">💾 Jetzt speichern</button><button class="btn danger" id="sy-reload">🔄 Alle Seiten neu laden</button></div>
      <p class="muted small">„Alle Seiten neu laden“ lädt die Website bei allen, die gerade nicht spielen, neu (z. B. nach einem Update).</p></div>
    <div class="ax-panel"><h4>⬇️ Export</h4><div class="adm-quick"><button class="btn" data-exp="players">👤 Spieler (CSV/Excel)</button><button class="btn" data-exp="matches">♟️ Partien (JSON)</button><button class="btn" data-exp="log">📜 Protokoll (JSON)</button></div></div>
    <div class="ax-panel"><h4>🚦 Status</h4><ul class="ax-mini"><li>Wartungsmodus: <b>${r.settings.maintenance ? '🛠️ AN' : 'aus'}</b></li><li>Münz-Event: <b>${r.settings.coinMult > 1 ? '×' + r.settings.coinMult : 'aus'}</b></li><li>Shop-Rabatt: <b>${r.settings.shopDiscount} %</b></li><li>Zufallsmatch: <b>${r.settings.randomOff ? 'aus' : 'an'}</b> · 2v2/4er: <b>${r.settings.fourOff ? 'aus' : 'an'}</b> · Chat: <b>${r.settings.chatMute ? 'stumm' : 'an'}</b></li></ul></div></div>`;
  H.$('#sy-save', box).onclick = () => ask('adm:saveNow', {}, '💾 Gespeichert');
  H.$('#sy-reload', box).onclick = () => H.confirmBox('Alle Seiten neu laden?', 'Spieler, die gerade nicht in einer Partie sind, laden die Seite neu.', 'Neu laden', () => ask('adm:reloadAll', {}, '🔄 Signal gesendet'));
  H.$$('[data-exp]', box).forEach((b) => b.onclick = async () => { const rr = await ask('adm:export', { what: b.dataset.exp }); if (rr) download(rr.name, rr.mime, rr.data); });
}
