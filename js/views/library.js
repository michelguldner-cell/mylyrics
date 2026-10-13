import { h, toast } from '../ui.js';
import { listSongs, saveSong, uid } from '../db.js';
import { pickFiles, importFiles } from '../importer.js';

let search = '';

export async function mount(ctx) {
  ctx.setTitle('Bibliothèque');
  const addBtn = h('button', { class: 'icon-btn', 'aria-label': 'Nouvelle chanson', onclick: async () => {
    const song = await saveSong({ id: uid(), title: 'Nouvelle chanson', artist: '', body: '', deleted: false });
    ctx.navigate('#/song/' + song.id);
  } }, '+');
  const importBtn = h('button', { class: 'icon-btn text', onclick: async () => {
    const files = await pickFiles();
    if (!files.length) return;
    try {
      const r = await importFiles(files);
      toast(`${r.imported} importée(s), ${r.updated} mise(s) à jour`);
      render();
    } catch (e) { toast('Import impossible : ' + e.message); }
  } }, 'Importer');
  ctx.setActions(importBtn, addBtn);

  const input = h('input', { type: 'search', placeholder: 'Rechercher titre, artiste, texte…', value: search,
    oninput: (e) => { search = e.target.value; render(); } });
  const list = h('ul', { class: 'list' });
  const count = h('div', { class: 'hint', style: 'margin:6px 2px' });
  ctx.el().append(h('div', { class: 'stack' }, input, count, list));

  async function render() {
    const songs = await listSongs();
    const q = search.trim().toLowerCase();
    const shown = q ? songs.filter((s) => (s.title + ' ' + s.artist + ' ' + s.body).toLowerCase().includes(q)) : songs;
    count.textContent = `${shown.length} chanson${shown.length > 1 ? 's' : ''}`;
    list.replaceChildren(...shown.map((s) => h('li', {},
      h('div', { class: 'main', onclick: () => ctx.navigate('#/song/' + s.id) },
        h('div', { class: 't' }, s.title), s.artist ? h('div', { class: 's' }, s.artist) : null),
      h('button', { class: 'icon-btn', 'aria-label': 'Jouer', onclick: () => ctx.navigate('#/play/song/' + s.id) }, '▶'),
    )));
    if (!shown.length) list.append(h('li', { class: 'empty' }, songs.length ? 'Aucun résultat.' : 'Bibliothèque vide. Touchez + pour écrire une chanson, ou « Importer » pour charger vos fichiers OnSong (.txt, .onsong, .pro…).'));
  }
  render();
}
