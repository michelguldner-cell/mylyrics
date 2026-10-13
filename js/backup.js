// Sauvegarde / restauration JSON.
import { exportData, importData } from './db.js';
import { download } from './ui.js';

export async function exportBackup() {
  const data = await exportData();
  const d = new Date();
  const stamp = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  download(`mylyrics-sauvegarde-${stamp}.json`, JSON.stringify(data, null, 1));
}

export function pickBackupFile() {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file'; input.accept = '.json,application/json';
    input.onchange = () => resolve(input.files[0] || null);
    input.oncancel = () => resolve(null);
    input.click();
  });
}

export async function restoreBackup(file) {
  const text = await file.text();
  const data = JSON.parse(text);
  if (!data || data.app !== 'mylyrics' || !Array.isArray(data.songs)) throw new Error('Fichier de sauvegarde invalide');
  return importData(data);
}
