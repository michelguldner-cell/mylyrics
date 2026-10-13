import { h, toast, formatDate, confirmDialog } from '../ui.js';
import { getSettings, setSetting } from '../db.js';
import { exportBackup, pickBackupFile, restoreBackup } from '../backup.js';
import { isConnected, connect, disconnect, sync } from '../drive.js';
import { APP_VERSION } from '../app.js';

export async function mount(ctx) {
  ctx.setTitle('Réglages');
  const s = await getSettings();

  // --- Affichage ---
  const sizeVal = h('span', {}, s.fontSize + ' px');
  const sizeRow = h('div', { class: 'row' },
    h('button', { class: 'btn', onclick: () => setSize(s.fontSize - 2) }, 'A−'),
    sizeVal,
    h('button', { class: 'btn', onclick: () => setSize(s.fontSize + 2) }, 'A+'));
  function setSize(v) { s.fontSize = Math.min(60, Math.max(12, v)); sizeVal.textContent = s.fontSize + ' px'; setSetting('fontSize', s.fontSize); document.documentElement.style.setProperty('--song-size', s.fontSize + 'px'); }
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
    try { const r = await sync(); toast(`Synchronisé : ${r.songs} chansons, ${r.setlists} setlists`); }
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
      h('label', {}, 'Taille du texte par défaut'), sizeRow,
      h('div', { class: 'hint' }, 'En mode concert, A− / A+ règle et mémorise la taille de la chanson affichée. Cette valeur sert aux chansons sans réglage propre.'),
      h('label', { class: 'row', style: 'color:var(--fg);font-size:15px' }, chordsChk, h('span', {}, 'Afficher les accords par défaut'))),
    h('h2', {}, 'Google Drive'),
    h('div', { class: 'card stack' },
      h('label', {}, 'Client ID OAuth (voir README)'), clientId,
      status, connectBtn, syncBtn,
      h('div', { class: 'hint' }, 'Le fichier « MyLyrics/mylyrics.json » dans votre Drive contient toutes les chansons et setlists. Synchronisez chaque appareil avant et après vos modifications.')),
    h('h2', {}, 'Sauvegarde locale'),
    h('div', { class: 'card stack' }, exportBtn, restoreBtn,
      h('div', { class: 'hint' }, 'La restauration fusionne avec les données existantes (la version la plus récente de chaque chanson gagne).')),
    h('div', { class: 'hint', style: 'text-align:center;margin-top:24px' }, `MyLyrics v${APP_VERSION}`),
  );
}
