// Point d'entrée : routeur hash + enregistrement du service worker.
import { $, $$ } from './ui.js';
import { getSettings } from './db.js';
import { handleOAuthReturn, autoSync } from './drive.js';
import * as library from './views/library.js';
import * as songEdit from './views/song-edit.js';
import * as setlists from './views/setlists.js';
import * as setlistEdit from './views/setlist-edit.js';
import * as perform from './views/perform.js';
import * as settings from './views/settings.js';

export const APP_VERSION = '1.0.4';

const routes = [
  { re: /^\/?$/, view: library, tab: 'library' },
  { re: /^\/song\/([^/]+)$/, view: songEdit, tab: 'library' },
  { re: /^\/setlists$/, view: setlists, tab: 'setlists' },
  { re: /^\/setlist\/([^/]+)$/, view: setlistEdit, tab: 'setlists' },
  { re: /^\/play\/song\/([^/]+)$/, view: perform, tab: null, args: (m) => ({ songId: m[1] }) },
  { re: /^\/play\/([^/]+)\/(\d+)$/, view: perform, tab: null, args: (m) => ({ setlistId: m[1], index: +m[2] }) },
  { re: /^\/settings$/, view: settings, tab: 'settings' },
];

let current = null;

export function navigate(hash) { location.hash = hash; }

// Contexte passé aux vues : conteneur, barre du haut, navigation.
export const ctx = {
  el: () => $('#view'),
  setTitle(t) { $('#title').textContent = t; document.title = t === 'MyLyrics' ? t : `${t} · MyLyrics`; },
  setBack(hash) { const b = $('#back'); b.hidden = !hash; b.onclick = hash ? () => navigate(hash) : null; },
  setActions(...els) { const a = $('#actions'); a.replaceChildren(...els); },
  fullscreen(on) { document.body.classList.toggle('fullscreen', !!on); },
  navigate,
};

async function route() {
  const path = location.hash.replace(/^#/, '') || '/';
  if (current && current.view.unmount) { try { current.view.unmount(); } catch (e) { console.error(e); } }
  for (const r of routes) {
    const m = path.match(r.re);
    if (!m) continue;
    ctx.fullscreen(!r.tab);
    ctx.setBack(null); ctx.setActions();
    $$('#tabs a').forEach((a) => a.classList.toggle('active', a.dataset.tab === r.tab));
    const args = r.args ? r.args(m) : { id: m[1] };
    current = { view: r.view, args };
    const el = ctx.el(); el.replaceChildren(); el.scrollTop = 0;
    try { await r.view.mount(ctx, args); } catch (e) { console.error(e); el.textContent = 'Erreur : ' + e.message; }
    return;
  }
  navigate('#/');
}

async function init() {
  // Retour OAuth Google (token dans le hash) avant le routage
  if (handleOAuthReturn()) return; // la fonction redirige elle-même
  const s = await getSettings();
  document.documentElement.style.setProperty('--song-size', s.fontSize + 'px');
  document.documentElement.style.setProperty('--section-size', s.sectionSize + 'px');
  document.documentElement.style.setProperty('--chord-size', s.chordSize + 'px');
  window.addEventListener('hashchange', route);
  await route();
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').catch((e) => console.warn('SW', e));
  }
  autoSync().catch((e) => console.warn('sync auto', e));
}

init();
