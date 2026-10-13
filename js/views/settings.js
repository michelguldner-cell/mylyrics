import { h, toast, formatDate, confirmDialog } from '../ui.js';
import { getSettings, setSetting } from '../db.js';
import { exportBackup, pickBackupFile, restoreBackup } from '../backup.js';
import { isConnected, connect, disconnect, sync } from '../drive.js';
import { APP_VERSION } from '../app.js';

export async function mount(ctx) {
  ctx.setTitle('Réglages');
  const s = await getSettings();

  // --- Affichage ---
  function sizeRow(key, label) {
    const val = h('span', { style: 'min-width:52px;text-align:center' }, s[key] + ' px');
    const set = (v) => { s[key] = Math.min(72, Math.max(10, v)); val.textContent = s[key] + ' px'; setSetting(key, s[key]); };
    return h('div', { class: 'row' }, h('span', { style: 'flex:1.4' }, label),
      h('button', { class: 'btn', onclick: () => set(s[key] - 2) }, '−'), val, h('button', { class: 'btn', onclick: () => set(s[key] + 2) }, '+'));
  }
  const chordsChk = h('input', { type: 'checkbox', checked: s.showChords, onchange: (e) => setSetting('showChords', e.target.checked) });

  // --- Google Drive ---
  const clientId = h('input', { type: 'text', value: s.driveClientId || '', placeholder: '1234567890-xxxx.apps.googleusercontent.com', autocapitalize: 'off', spellcheck: 'false',
    onchange: (e) => setSetting('driveClientId', e.target.value.trim()) });
  const status = h('div', { class: 'hint' });
  const connectBtn = h('button', { class: 'btn', onclick: async () => {
    if (isConnected()) { disconnect(); refreshDrive(); return; }
    await setSetting('driveClientId', clientId.value.trim());
    if (!clientId.value.trim()) { toast('Renseignez d’abord le Client ID'); return; }
    connect();
  } });
  const syncBtn = h('button', { class: 'btn primary', onclick: async () => {
    syncBtn.disabled = true;
    try { const r = await sync(); toast(`Synchronisé : ${r.songs} chansons, ${r.setlists} setlists` + (r.snapshot ? ' · copie datée ajoutée à l’historique' : '')); }
    catch (e) { toast('Sync impossible : ' + e.message, 4000); }
    syncBtn.disabled = false; refreshDrive();
  } }, 'Synchroniser maintenant');
  async function refreshDrive() {
    const st = await getSettings();
    const on = isConnected();
    connectBtn.textContent = on ? 'Se déconnecter' : 'Se connecter à Google Drive';
    syncBtn.hidden = !on;
    status.textContent = (on ? 'Connecté. ' : 'Non connecté. ') + 'Dernière sync : ' + formatDate(st.lastSyncAt) + (navigator.onLine ? '' : ' (hors ligne)');
  }
  refreshDrive();

  // --- Sauvegarde ---
  const exportBtn = h('button', { class: 'btn', onclick: () => exportBackup() }, 'Exporter une sauvegarde (JSON)');
  const restoreBtn = h('button', { class: 'btn', onclick: async () => {
    const f = await pickBackupFile(); if (!f) return;
    try { const r = await restoreBackup(f); toast(`Restauré : ${r.songs.filter((x) => !x.deleted).length} chansons, ${r.setlists.filter((x) => !x.deleted).length} setlists`); }
    catch (e) { toast('Restauration impossible : ' + e.message, 4000); }
  } }, 'Restaurer une sauvegarde');

  ctx.el().append(
    h('h2', {}, 'Affichage'),
    h('div', { class: 'card stack' },
      h('label', {}, 'Tailles par défaut (mode concert)'),
      sizeRow('fontSize', 'Texte'), sizeRow('sectionSize', 'Titres de section'), sizeRow('chordSize', 'Accords'),
      h('div', { class: 'hint' }, 'En mode concert, le bouton « Aa » règle et mémorise ces trois tailles pour la chanson affichée. Les valeurs ci-dessus servent aux chansons sans réglage propre.'),
      h('label', { class: 'row', style: 'color:var(--fg);font-size:15px' }, chordsChk, h('span', {}, 'Afficher les accords par défaut'))),
    h('h2', {}, 'Google Drive'),
    h('div', { class: 'card stack' },
      h('label', {}, 'Client ID OAuth (pré-rempli, à ne changer que si vous créez votre propre projet Google Cloud)'), clientId,
      status, connectBtn, syncBtn,
      h('div', { class: 'hint' }, 'Le fichier « MyLyrics/mylyrics.json » dans votre Drive contient toutes les chansons et setlists. Synchronisez chaque appareil avant et après vos modifications. À chaque synchronisation qui change quelque chose, une copie datée est déposée dans « MyLyrics/Historique » (30 dernières conservées) ; ces copies se restaurent avec « Restaurer une sauvegarde ».')),
    h('h2', {}, 'Sauvegarde locale'),
    h('div', { class: 'card stack' }, exportBtn, restoreBtn,
      h('div', { class: 'hint' }, 'La restauration fusionne avec les données existantes (la version la plus récente de chaque chanson gagne).')),
    h('div', { class: 'hint', style: 'text-align:center;margin-top:24px' }, `MyLyrics v${APP_VERSION}`),
  );
}
