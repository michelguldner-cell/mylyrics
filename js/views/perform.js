// Mode concert : plein écran noir, navigation entre chansons, accords on/off, taille de police, wake lock.
import { h, toast } from '../ui.js';
import { getSong, getSetlist, listSongs, getSettings, setSetting, saveSong } from '../db.js';
import { renderSongHTML } from '../render.js';

let wakeLock = null;
let onKey = null;
let onVisible = null;

async function requestWakeLock() {
  try {
    if ('wakeLock' in navigator) wakeLock = await navigator.wakeLock.request('screen');
  } catch (e) { /* refusé ou non supporté */ }
}
function releaseWakeLock() { if (wakeLock) { wakeLock.release().catch(() => {}); wakeLock = null; } }

export async function mount(ctx, { songId, setlistId, index = 0 }) {
  const settings = await getSettings();
  let songs = [];
  let setlistName = '';
  if (songId) {
    const s = await getSong(songId);
    if (!s || s.deleted) { toast('Chanson introuvable'); ctx.navigate('#/'); return; }
    songs = [s];
  } else {
    const sl = await getSetlist(setlistId);
    if (!sl || sl.deleted) { toast('Setlist introuvable'); ctx.navigate('#/setlists'); return; }
    setlistName = sl.name;
    const byId = new Map((await listSongs()).map((s) => [s.id, s]));
    songs = sl.songIds.map((id) => byId.get(id)).filter(Boolean);
    if (!songs.length) { toast('Setlist vide'); ctx.navigate('#/setlist/' + sl.id); return; }
  }
  let i = Math.min(Math.max(0, index), songs.length - 1);
  let showChords = settings.showChords;
  let fontSize = settings.fontSize;
  const backHash = songId ? '#/song/' + songId : '#/setlist/' + setlistId;

  const ttl = h('div', { class: 'ttl' });
  const chordsBtn = h('button', { class: 'icon-btn', 'aria-label': 'Accords', title: 'Accords', onclick: () => { showChords = !showChords; setSetting('showChords', showChords); applyChords(); } }, '♯');
  const sizesBtn = h('button', { class: 'icon-btn', 'aria-label': 'Tailles', onclick: toggleSizes }, 'Aa');
  const sizes = h('div', { class: 'sizes', hidden: true });
  const prev = h('button', { class: 'icon-btn nav', 'aria-label': 'Précédente', onclick: () => go(i - 1) }, '‹');
  const next = h('button', { class: 'icon-btn nav', 'aria-label': 'Suivante', onclick: () => go(i + 1) }, '›');
  const listBtn = h('button', { class: 'icon-btn', 'aria-label': 'Liste', onclick: toggleDrawer }, '☰');
  const quit = h('button', { class: 'icon-btn', 'aria-label': 'Quitter', onclick: () => ctx.navigate(backHash) }, '✕');
  const canFs = !!document.documentElement.requestFullscreen;
  const fsBtn = h('button', { class: 'icon-btn', 'aria-label': 'Plein écran', onclick: toggleFullscreen }, '⛶');
  // Un tap sur le texte masque/affiche la barre (mode immersif)
  const content = h('div', { class: 'content', onclick: () => {
    if (!drawer.hidden) { drawer.hidden = true; return; }
    if (!sizes.hidden) { sizes.hidden = true; return; }
    root.classList.toggle('immersive');
  } });
  const songEl = h('div', { class: 'song' });
  const meta = h('div', { class: 'meta' });
  content.append(meta, songEl);
  const drawer = h('div', { class: 'drawer', hidden: true });
  const edgeL = h('div', { class: 'edge l', onclick: () => go(i - 1) });
  const edgeR = h('div', { class: 'edge r', onclick: () => go(i + 1) });
  const root = h('div', { class: 'perform' },
    h('div', { class: 'bar' }, quit, ttl, songs.length > 1 ? prev : null, songs.length > 1 ? next : null, chordsBtn, sizesBtn, canFs ? fsBtn : null, songs.length > 1 ? listBtn : null),
    content, songs.length > 1 ? edgeL : null, songs.length > 1 ? edgeR : null, drawer, sizes);
  ctx.el().append(root);

  // Balayage horizontal
  let tx = 0, ty = 0;
  content.addEventListener('touchstart', (e) => { tx = e.touches[0].clientX; ty = e.touches[0].clientY; }, { passive: true });
  content.addEventListener('touchend', (e) => {
    const dx = e.changedTouches[0].clientX - tx, dy = e.changedTouches[0].clientY - ty;
    if (Math.abs(dx) > 80 && Math.abs(dx) > Math.abs(dy) * 2) go(dx < 0 ? i + 1 : i - 1);
  }, { passive: true });

  onKey = (e) => {
    if (e.target.tagName === 'INPUT') return;
    if (['ArrowRight', 'PageDown', ' '].includes(e.key)) { e.preventDefault(); go(i + 1); }
    else if (['ArrowLeft', 'PageUp'].includes(e.key)) { e.preventDefault(); go(i - 1); }
    else if (e.key === 'Escape') ctx.navigate(backHash);
    else if (e.key === '+') setSize('fontSize', 2);
    else if (e.key === '-') setSize('fontSize', -2);
    else if (e.key.toLowerCase() === 'c') chordsBtn.click();
    else if (e.key.toLowerCase() === 'f') toggleFullscreen();
    else if (e.key.toLowerCase() === 'h') root.classList.toggle('immersive');
  };
  document.addEventListener('keydown', onKey);
  onVisible = () => { if (document.visibilityState === 'visible') requestWakeLock(); };
  document.addEventListener('visibilitychange', onVisible);
  requestWakeLock();

  function toggleFullscreen() {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else document.documentElement.requestFullscreen().catch(() => {});
  }
  // Tailles (texte, titres de section, accords) : propres à chaque chanson, sinon valeurs par défaut des Réglages.
  const SIZE_KEYS = [['fontSize', 'Texte', ''], ['sectionSize', 'Sections', 'sec'], ['chordSize', 'Accords', 'chd']];
  const CSS_VAR = { fontSize: '--song-size', sectionSize: '--section-size', chordSize: '--chord-size' };
  let sizeTimer = null;
  const sizeOf = (key) => songs[i][key] || settings[key];
  function applySize() {
    for (const [key] of SIZE_KEYS) document.documentElement.style.setProperty(CSS_VAR[key], sizeOf(key) + 'px');
    fontSize = sizeOf('fontSize');
    if (!sizes.hidden) renderSizes();
  }
  function setSize(key, delta) {
    const s = songs[i];
    s[key] = Math.min(72, Math.max(10, sizeOf(key) + delta));
    applySize();
    clearTimeout(sizeTimer);
    sizeTimer = setTimeout(() => saveSong(s), 600); // regroupe les appuis rapides
  }
  function renderSizes() {
    const s = songs[i];
    const hasOverride = SIZE_KEYS.some(([k]) => s[k]);
    sizes.replaceChildren(
      ...SIZE_KEYS.map(([key, label, cls]) => h('div', { class: 'srow' },
        h('span', { class: 'lbl ' + cls }, label),
        h('button', { class: 'btn sq', 'aria-label': label + ' moins', onclick: () => setSize(key, -2) }, '−'),
        h('span', { class: 'val' }, sizeOf(key)),
        h('button', { class: 'btn sq', 'aria-label': label + ' plus', onclick: () => setSize(key, 2) }, '+'))),
      h('div', { class: 'srow' },
        h('span', { class: 'lbl' }, 'Accords'),
        h('button', { class: 'btn' + (showChords ? ' on' : ''), onclick: () => chordsBtn.click() }, showChords ? 'Affichés' : 'Masqués')),
      h('button', { class: 'btn', disabled: !hasOverride, onclick: () => {
        SIZE_KEYS.forEach(([k]) => delete s[k]); applySize(); saveSong(s); toast('Tailles par défaut rétablies');
      } }, 'Rétablir les tailles par défaut'),
    );
  }
  function toggleSizes() {
    sizes.hidden = !sizes.hidden;
    drawer.hidden = true;
    if (!sizes.hidden) renderSizes();
  }
  function applyChords() {
    songEl.classList.toggle('nochords', !showChords);
    chordsBtn.classList.toggle('on', showChords);
    chordsBtn.title = showChords ? 'Masquer les accords' : 'Afficher les accords';
    if (!sizes.hidden) renderSizes();
  }
  function go(n) {
    if (n < 0 || n >= songs.length) return;
    i = n;
    if (setlistId) history.replaceState(null, '', `#/play/${setlistId}/${i}`);
    show();
  }
  function show() {
    const s = songs[i];
    ttl.replaceChildren(s.title, songs.length > 1 ? h('small', {}, `${i + 1}/${songs.length}`) : null);
    meta.textContent = s.artist || '';
    meta.hidden = !s.artist;
    songEl.innerHTML = renderSongHTML(s.body);
    applySize();
    applyChords();
    content.scrollTop = 0;
    prev.disabled = i === 0; next.disabled = i === songs.length - 1;
    document.title = s.title + ' · MyLyrics';
  }
  function toggleDrawer() {
    sizes.hidden = true;
    if (!drawer.hidden) { drawer.hidden = true; return; }
    drawer.replaceChildren(
      h('div', { style: 'padding:4px 12px 8px;color:var(--muted);font-size:13px' }, setlistName),
      h('ul', { class: 'list', style: 'padding:0 8px' }, ...songs.map((s, k) => h('li', { class: k === i ? 'current' : '' },
        h('div', { class: 'num' }, k + 1),
        h('div', { class: 'main', onclick: () => { drawer.hidden = true; go(k); } }, h('div', { class: 't' }, s.title))))),
    );
    drawer.hidden = false;
  }
  show();
  if (!sessionStorage.getItem('mylyrics.hintImmersive')) {
    sessionStorage.setItem('mylyrics.hintImmersive', '1');
    toast('Touchez le texte pour masquer ou afficher la barre', 3500);
  }
}

export function unmount() {
  releaseWakeLock();
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  if (onKey) document.removeEventListener('keydown', onKey);
  if (onVisible) document.removeEventListener('visibilitychange', onVisible);
  onKey = onVisible = null;
}
