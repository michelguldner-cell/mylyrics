// Import de fichiers texte (.txt, .onsong, .pro, .cho, .chordpro, .crd) dans la bibliothèque.
import { normalizeImport } from './parser.js';
import { saveSong, uid, listSongs } from './db.js';

export function pickFiles() {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file'; input.multiple = true;
    input.accept = '.txt,.onsong,.pro,.cho,.chordpro,.crd,.chopro,text/plain';
    input.onchange = () => resolve([...input.files]);
    input.oncancel = () => resolve([]);
    input.click();
  });
}

function readText(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    r.readAsText(file, 'utf-8');
  });
}

// Importe une liste de File ; renvoie { imported, updated }.
export async function importFiles(files) {
  const existing = await listSongs();
  const byTitle = new Map(existing.map((s) => [s.title.toLowerCase(), s]));
  let imported = 0, updated = 0;
  for (const f of files) {
    const text = await readText(f);
    const fallback = f.name.replace(/\.[^.]+$/, '');
    const { title, artist, body } = normalizeImport(text, fallback);
    const prev = byTitle.get(title.toLowerCase());
    if (prev) { prev.artist = artist || prev.artist; prev.body = body; await saveSong(prev); updated++; }
    else { const song = { id: uid(), title, artist, body, deleted: false }; await saveSong(song); byTitle.set(title.toLowerCase(), song); imported++; }
  }
  return { imported, updated };
}
