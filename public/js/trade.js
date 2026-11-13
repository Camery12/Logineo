// Handel unter Freunden: Angebot zusammenstellen, Angebote ansehen, annehmen/ablehnen/zurückziehen.
import { findItem } from './catalog.js';
import { pieceURL } from './pieces.js';

let H = null;
export const initTrade = (helpers) => { H = helpers; };
const KIND_LABEL = { board: '🎨 Bretter', pieces: '♟️ Figuren', shape: '🔷 Formen', finisher: '💥 Finisher' };
const meId = () => H.state.profile?.id;

function itemIcon(kind, id) {
  const it = findItem(kind, id);
  if (kind === 'board') return `<i class="tr-ic" style="background:linear-gradient(135deg, ${it.light} 50%, ${it.dark} 50%)"></i>`;
  if (kind === 'pieces') return `<i class="tr-ic" style="background-image:${pieceURL('k', 'w', id).replace(/"/g, '&quot;')};background-size:85%;background-color:rgba(255,255,255,.08)"></i>`;
  return `<i class="tr-ic emo">${it.icon || '✨'}</i>`;
}
const chip = (kind, id, attrs = '') => { const it = findItem(kind, id); return `<button class="tr-chip" data-k="${kind}" data-id="${id}" ${attrs}>${itemIcon(kind, id)}<span><b>${H.esc(it.name)}</b><small>${H.fmtNum(it.price)} 🪙</small></span></button>`; };
const summary = (side) => [...side.items.map(([k, id]) => `<span class="tr-sum">${itemIcon(k, id)}${H.esc(findItem(k, id)?.name || id)}</span>`), side.coins ? `<span class="tr-sum">🪙 ${H.fmtNum(side.coins)} Münzen</span>` : ''].filter(Boolean).join('') || '<span class="muted small">nichts</span>';

// ---------------------------------------------------------------- Angebot erstellen
export async function openTrade(friendId) {
  const r = await H.emit('trade:inventory', { id: friendId });
  if (r.error) return H.toast(H.esc(r.error), 'warn');
  const f = r.friend, pick = { give: new Set(), want: new Set() };
  const theirsHas = (k, id) => r.theirs[k].includes(id), mineHas = (k, id) => r.mine[k].includes(id);
  const col = (side, inv, otherHas, title) => `<div class="tr-col"><h4>${title}</h4>
    ${Object.entries(KIND_LABEL).map(([k, l]) => { const list = inv[k].filter((id) => !otherHas(k, id)); return list.length ? `<div class="tr-kind"><small class="muted">${l}</small><div class="tr-chips">${list.map((id) => chip(k, id, `data-side="${side}"`)).join('')}</div></div>` : ''; }).join('') || '<p class="muted small">Nichts zum Tauschen (Teile, die der andere schon hat, und klassische Teile fallen weg).</p>'}
    <label class="tr-coins">🪙 Münzen <input type="number" min="0" id="tr-${side}-coins" placeholder="0"></label></div>`;
  const ov = H.openOverlay(`<div class="tr"><h2>🔁 Handeln mit ${H.esc(f.name)}</h2><p class="muted small">Wähle aus, was du gibst und was du dafür möchtest. ${H.esc(f.name)} kann annehmen oder ablehnen – erst dann wird getauscht. Das Angebot gilt 24 Stunden.</p>
    <div class="tr-cols">${col('give', r.mine, theirsHas, `Du gibst <small class="muted">(du hast ${H.fmtNum(r.myCoins)} 🪙)</small>`)}<div class="tr-arrow">⇄</div>${col('want', r.theirs, mineHas, `Du bekommst von ${H.esc(f.name)}`)}</div>
    <input id="tr-note" maxlength="120" placeholder="Nachricht dazu (optional)" class="tr-note">
    <div class="form-error" id="tr-err"></div>
    <div class="modal-actions"><button class="btn" data-x>Abbrechen</button><button class="btn primary" data-send>📨 Angebot senden</button></div></div>`, { wide: true });
  H.$$('.tr-chip', ov.el).forEach((b) => b.onclick = () => { const s = pick[b.dataset.side], key = `${b.dataset.k}|${b.dataset.id}`; s.has(key) ? s.delete(key) : s.add(key); b.classList.toggle('on', s.has(key)); });
  H.$('[data-x]', ov.el).onclick = ov.close;
  H.$('[data-send]', ov.el).onclick = async () => {
    const items = (s) => [...s].map((x) => x.split('|'));
    const res = await H.emit('trade:offer', { to: friendId, note: H.$('#tr-note', ov.el).value,
      give: { items: items(pick.give), coins: +H.$('#tr-give-coins', ov.el).value || 0 }, want: { items: items(pick.want), coins: +H.$('#tr-want-coins', ov.el).value || 0 } });
    if (res.error) { H.$('#tr-err', ov.el).textContent = res.error; return; }
    ov.close(); H.toast(`📨 Angebot an ${H.esc(f.name)} gesendet`, 'good'); renderTradeList();
  };
}

// ---------------------------------------------------------------- Angebot ansehen
export function showTrade(t) {
  const mine = t.from === meId(), other = mine ? t.toUser : t.fromUser;
  const iGive = mine ? t.give : t.want, iGet = mine ? t.want : t.give;
  const status = { open: mine ? '⏳ Wartet auf Antwort' : '📨 Neues Angebot für dich', done: '✅ Getauscht', declined: '❌ Abgelehnt', cancelled: '↩️ Zurückgezogen', expired: '⌛ Abgelaufen', failed: `⚠️ Nicht möglich${t.reason ? `: ${H.esc(t.reason)}` : ''}` }[t.status];
  const ov = H.openOverlay(`<div class="tr"><h2>🔁 Handel mit ${H.esc(other.name)}</h2><p class="muted">${status}</p>
    ${t.note ? `<p class="tr-quote">„${H.esc(t.note)}“</p>` : ''}
    <div class="tr-cols view"><div class="tr-col"><h4>Du bekommst</h4><div class="tr-sums">${summary(iGet)}</div></div><div class="tr-arrow">⇄</div><div class="tr-col"><h4>Du gibst</h4><div class="tr-sums">${summary(iGive)}</div></div></div>
    <div class="modal-actions">${t.status === 'open' ? (mine ? '<button class="btn danger" data-a="cancel">↩️ Zurückziehen</button>' : '<button class="btn danger" data-a="no">Ablehnen</button><button class="btn good" data-a="yes">✅ Annehmen</button>') : ''}<button class="btn" data-x>Schließen</button></div></div>`);
  H.$('[data-x]', ov.el).onclick = ov.close;
  H.$$('[data-a]', ov.el).forEach((b) => b.onclick = async () => {
    const a = b.dataset.a;
    const res = a === 'cancel' ? await H.emit('trade:cancel', { id: t.id }) : await H.emit('trade:respond', { id: t.id, accept: a === 'yes' });
    if (res.error) return H.toast(H.esc(res.error), 'warn');
    ov.close();
    if (res.profile) H.setProfile(res.profile, { coinsAnim: true });
    if (a === 'yes') { H.sound.win(); H.confetti(); H.toast('🎉 Handel abgeschlossen!', 'good'); }
    renderTradeList();
  });
}

// ---------------------------------------------------------------- Liste im Freunde-Tab
export async function renderTradeList() {
  const box = H.$('#tr-list'); if (!box) return;
  const r = await H.emit('trade:list');
  if (!r.open) return;
  const row = (t) => { const mine = t.from === meId(), other = mine ? t.toUser : t.fromUser;
    return `<button class="fr-row tr-row ${mine ? '' : 'hl'}" data-tid="${t.id}">${H.avatar(other.avatar, 30)}<div class="fr-name"><b>${H.esc(other.name)}</b><span>${mine ? '⏳ wartet auf Antwort' : '📨 bietet dir einen Handel an'}</span></div><span class="tr-badge">🔁</span></button>`; };
  box.innerHTML = r.open.length || r.recent.length ? `<div class="fr-h-row"><h4 class="fr-h">Handel ${r.open.filter((t) => t.to === meId()).length ? `<span class="nav-badge inline">${r.open.filter((t) => t.to === meId()).length}</span>` : ''}</h4></div>${r.open.map(row).join('')}
    ${r.recent.length ? `<details class="tr-recent"><summary class="muted small">Letzte Händel</summary>${r.recent.map((t) => `<button class="fr-row tr-row" data-tid="${t.id}"><span class="muted small">${{ done: '✅', declined: '❌', cancelled: '↩️', expired: '⌛', failed: '⚠️' }[t.status]} ${H.esc((t.from === meId() ? t.toUser : t.fromUser).name)}</span></button>`).join('')}</details>` : ''}` : '';
  const all = [...r.open, ...r.recent];
  H.$$('[data-tid]', box).forEach((b) => b.onclick = () => showTrade(all.find((t) => t.id === b.dataset.tid)));
}

export function onTradeUpdate({ trade: t, incoming, done }) {
  const mine = t.from === meId();
  if (incoming && !mine) {
    H.sound.notify();
    H.notify({ avatarObj: t.fromUser.avatar, title: `🔁 ${H.esc(t.fromUser.name)} bietet dir einen Handel an`, text: t.note ? `„${H.esc(t.note)}“` : 'Schau es dir an!', timeout: 20000, actions: [{ label: 'Ansehen', cls: 'primary', onClick: () => showTrade(t) }] });
  } else if (mine && t.status === 'done') { H.sound.win(); H.toast(`🎉 ${H.esc(t.toUser.name)} hat deinen Handel angenommen!`, 'good'); }
  else if (mine && t.status === 'declined') H.toast(`❌ ${H.esc(t.toUser.name)} hat deinen Handel abgelehnt.`, 'warn');
  if (H.state.view === 'friends') renderTradeList();
}
