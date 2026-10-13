import { h, toast, promptDialog, confirmDialog } from '../ui.js';
import { listSetlists, saveSetlist, deleteSetlist, uid } from '../db.js';

export async function mount(ctx) {
  ctx.setTitle('Setlists');
  ctx.setActions(h('button', { class: 'icon-btn', 'aria-label': 'Nouvelle setlist', onclick: async () => {
    const name = await promptDialog('Nom de la setlist', 'Concert ' + new Date().toLocaleDateString('fr-FR'));
    if (!name) return;
    const sl = await saveSetlist({ id: uid(), name, songIds: [], deleted: false });
    ctx.navigate('#/setlist/' + sl.id);
  } }, '+'));

  const list = h('ul', { class: 'list' });
  ctx.el().append(list);
  async function render() {
    const sls = await listSetlists();
    list.replaceChildren(...sls.map((sl) => h('li', {},
      h('div', { class: 'main', onclick: () => ctx.navigate('#/setlist/' + sl.id) },
        h('div', { class: 't' }, sl.name), h('div', { class: 's' }, `${sl.songIds.length} chanson${sl.songIds.length > 1 ? 's' : ''}`)),
      h('button', { class: 'icon-btn', 'aria-label': 'Jouer', disabled: !sl.songIds.length, onclick: () => ctx.navigate(`#/play/${sl.id}/0`) }, '▶'),
      h('button', { class: 'icon-btn', 'aria-label': 'Supprimer', onclick: async () => {
        if (!(await confirmDialog(`Supprimer la setlist « ${sl.name} » ?`))) return;
        await deleteSetlist(sl.id); toast('Supprimée'); render();
      } }, '🗑'),
    )));
    if (!sls.length) list.append(h('li', { class: 'empty' }, 'Aucune setlist. Touchez + pour en créer une, puis ajoutez-y des chansons de la bibliothèque.'));
  }
  render();
}
