// Cinematic-Profilkarte: Banner, Rahmen, Namenseffekt, Partikel, Bio, Spielzeit, Vitrine, Inventar, Profilsong
import { findItem, PROFILE_OPTIONS, MUSIC_MAX_VOLUME, DEFAULT_CUSTOM } from './catalog.js';
import { pieceURL } from './pieces.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export function fmtPlaytime(ms = 0) {
  const min = Math.floor(ms / 60000);
  if (min < 1) return 'unter 1 Min.';
  if (min < 60) return `${min} Min.`;
  const h = Math.floor(min / 60), m = min % 60;
  if (h < 48) return `${h} Std.${m ? ` ${m} Min.` : ''}`;
  return `${Math.floor(h / 24)} Tage ${h % 24} Std.`;
}

const avatarHTML = (a, size) => {
  if (a?.type === 'image') return `<span class="avatar" style="--s:${size}px;background-image:url('${a.value}')"></span>`;
  return `<span class="avatar" style="--s:${size}px;--c:${a?.color || '#333'}">${esc(a?.value || '♟')}</span>`;
};

function particlesHTML(kind) {
  if (!kind || kind === 'keine') return '';
  let h = '';
  for (let i = 0; i < 26; i++) {
    const x = Math.random() * 100, d = Math.random() * -12, dur = 5 + Math.random() * 7, sz = 3 + Math.random() * 6, hue = Math.floor(Math.random() * 360);
    h += `<i style="--x:${x}%;--d:${d}s;--t:${dur}s;--z:${sz}px;--h:${hue}"></i>`;
  }
  return `<div class="pc-particles pt-${kind}">${h}</div>`;
}

// u: öffentliches Profil (oder eigenes priv-Profil)
export function profileCardHTML(u, { own = false } = {}) {
  const c = { ...DEFAULT_CUSTOM, ...(u.custom || {}) };
  const s = u.stats || {};
  const rate = s.games ? Math.round((s.wins / s.games) * 100) : 0;
  const show = c.showcase ? findItem('finisher', c.showcase) : null;
  const bannerStyle = c.banner === 'bild' && c.bannerImg ? `style="--img:url('${c.bannerImg}')"` : '';
  const inv = u.inventory || (own ? u.owned : null);
  const invHTML = inv ? `
    <div class="pc-sec"><h4>🎒 Inventar <span class="muted small">${inv.board.length + inv.pieces.length + inv.finisher.length} Teile${own && c.showInventory === false ? ' · 🔒 nur für dich sichtbar' : ''}</span></h4>
      <div class="pc-inv">
        ${inv.board.map((id) => { const b = findItem('board', id); return b ? `<span class="inv-chip" title="${esc(b.name)}"><i class="sw" style="background:linear-gradient(135deg, ${b.light} 50%, ${b.dark} 50%)"></i>${esc(b.name)}</span>` : ''; }).join('')}
        ${inv.pieces.map((id) => { const p = findItem('pieces', id); return p ? `<span class="inv-chip" title="${esc(p.name)}"><i class="sw pc-piece" style="background-image:${pieceURL('k', 'w', id).replace(/"/g, '&quot;')}"></i>${esc(p.name)}</span>` : ''; }).join('')}
        ${inv.finisher.map((id) => { const f = findItem('finisher', id); return f ? `<span class="inv-chip" title="${esc(f.name)}"><i class="sw ic">${f.icon}</i>${esc(f.name)}</span>` : ''; }).join('')}
      </div></div>` : `<div class="pc-sec"><h4>🎒 Inventar</h4><p class="muted small">🔒 ${esc(u.name)} hat das Inventar versteckt.</p></div>`;
  return `<div class="pc" style="--acc:${c.accent}">
    <div class="pc-banner bn-${c.banner}" ${bannerStyle}>${particlesHTML(c.particles)}<div class="pc-vignette"></div></div>
    <div class="pc-head">
      <div class="pc-av fr-${c.frame}">${avatarHTML(u.avatar, 104)}</div>
      <div class="pc-id">
        <h2 class="pc-name nf-${c.nameFx}" data-text="${esc(u.name)}">${esc(u.name)}</h2>
        <div class="pc-tags">${u.style?.admin ? '<span class="admin-tag">🛡️ ADMIN</span>' : ''}${u.registered ? '<span class="tag">Konto</span>' : '<span class="tag">Gast</span>'}${u.online ? '<span class="tag on"><i class="dot"></i> online</span>' : ''}<span class="tag">⏱️ ${fmtPlaytime(u.playMs)} gespielt</span></div>
        ${c.bio ? `<p class="pc-bio">„${esc(c.bio)}“</p>` : ''}
      </div>
      <div class="pc-elo"><b>${u.rating ?? 0}</b><span>Elo</span></div>
    </div>
    ${u.music ? `<div class="pc-music"><button class="pc-play" data-music="${esc(u.id)}">▶</button><div class="pc-mtitle"><span class="muted small">🎵 Profilsong</span><b>${esc(u.music.title)}</b></div><div class="pc-eq"><i></i><i></i><i></i><i></i></div><input class="pc-vol" type="range" min="0" max="100" value="70" title="Lautstärke"></div>` : ''}
    <div class="pc-stats">
      <div><b>${s.games || 0}</b><span>Partien</span></div><div><b style="color:var(--good)">${s.wins || 0}</b><span>Siege</span></div>
      <div><b style="color:var(--bad)">${s.losses || 0}</b><span>Niederlagen</span></div><div><b>${rate}%</b><span>Siegquote</span></div>
      <div><b>${s.botWins || 0}</b><span>Bot-Siege</span></div><div><b>${s.mates || 0}</b><span>Schachmatts</span></div>
    </div>
    ${show ? `<div class="pc-sec pc-showcase"><span class="sc-icon">${show.icon}</span><div><span class="muted small">🏆 Lieblings-Finisher</span><b>${esc(show.name)}</b><p class="muted small">${esc(show.desc)}</p></div></div>` : ''}
    <div class="pc-sec"><h4>🎨 Ausgerüstet</h4><div class="pc-inv">
      <span class="inv-chip"><i class="sw" style="background:linear-gradient(135deg, ${findItem('board', u.equipped?.board)?.light} 50%, ${findItem('board', u.equipped?.board)?.dark} 50%)"></i>${esc(findItem('board', u.equipped?.board)?.name || '')}</span>
      <span class="inv-chip"><i class="sw pc-piece" style="background-image:${pieceURL('k', 'w', u.equipped?.pieces || 'klassisch').replace(/"/g, '&quot;')}"></i>${esc(findItem('pieces', u.equipped?.pieces)?.name || '')}</span>
      <span class="inv-chip"><i class="sw ic">${findItem('finisher', u.equipped?.finisher)?.icon || '♚'}</i>${esc(findItem('finisher', u.equipped?.finisher)?.name || '')}</span>
    </div></div>
    ${invHTML}
  </div>`;
}

// Profilsong abspielen – Lautstärke ist hart begrenzt (MUSIC_MAX_VOLUME)
let current = null;
export function stopProfileMusic() { if (current) { current.audio.pause(); current.audio.src = ''; current = null; } }
export function wireProfileMusic(root, emit, { autoplay = true } = {}) {
  const btn = root.querySelector('[data-music]');
  if (!btn) return;
  const vol = root.querySelector('.pc-vol');
  const box = root.querySelector('.pc-music');
  let audio = null, loading = false, ownerVol = 0.6;
  const muted = () => localStorage.getItem('profileMusicMuted') === '1';
  const apply = () => { if (audio) audio.volume = Math.min(MUSIC_MAX_VOLUME, MUSIC_MAX_VOLUME * ownerVol * (vol.value / 100)); };
  const setPlaying = (p) => { btn.textContent = p ? '❚❚' : '▶'; box.classList.toggle('playing', p); };
  const start = async () => {
    if (audio) { if (audio.paused) { audio.play().then(() => setPlaying(true)).catch(() => {}); localStorage.setItem('profileMusicMuted', '0'); } else { audio.pause(); setPlaying(false); localStorage.setItem('profileMusicMuted', '1'); } return; }
    if (loading) return; loading = true; btn.textContent = '…';
    const r = await emit('music:get', { id: btn.dataset.music });
    loading = false;
    if (!r.data) { btn.textContent = '✕'; return; }
    stopProfileMusic();
    audio = new Audio(r.data); audio.loop = true; ownerVol = r.volume ?? 0.6; apply();
    current = { audio };
    audio.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
  };
  btn.onclick = () => start();
  vol.oninput = apply;
  if (autoplay && !muted()) start();
}
