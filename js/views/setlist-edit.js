import { h, toast, promptDialog, sheet } from '../ui.js';
import { getSetlist, saveSetlist, listSongs } from '../db.js';

export async function mount(ctx, { id }) {
  const sl = await getSetlist(id);
  if (!sl || sl.deleted) { toast('Setlist introuvable'); ctx.navigate('#/setlists'); return; }
  ctx.setTitle(sl.name);
  ctx.setBack('#/setlists');
  ctx.setActions(
    h('button', { class: 'icon-btn text', onclick: async () => {
      const name = await promptDialog('Renommer la setlist', sl.name);
      if (!name) return; sl.name = name; await saveSetlist(sl); ctx.setTitle(name);
    } }, 'Renommer'),
    h('button', { class: 'icon-btn', 'aria-label': 'Jouer', onclick: () => { if (sl.songIds.length) ctx.navigate(`#/play/${sl.id}/0`); } }, '▶'),
  );

  const list = h('ul', { class: 'list' });
  const addBtn = h('button', { class: 'btn primary block', onclick: openPicker }, '+ Ajouter des chansons');
  const playBtn = h('button', { class: 'btn block', onclick: () => ctx.navigate(`#/play/${sl.id}/0`) }, '▶ Jouer la setlist');
  ctx.el().append(h('div', { class: 'stack' }, addBtn, list, playBtn));

  let songsById = new Map();
  async function refreshSongs() { songsById = new Map((await listSongs()).map((s) => [s.id, s])); }

  async function persist() { sl.songIds = sl.songIds.filter((x) => songsById.has(x)); await saveSetlist(sl); render(); }

  async function render() {
    await refreshSongs();
    const items = sl.songIds.map((sid, i) => {
      const s = songsById.get(sid);
      const li = h('li', { draggable: 'true', 'data-i': i },
        h('div', { class: 'num' }, i + 1),
        h('div', { class: 'main', onclick: () => ctx.navigate(`#/play/${sl.id}/${i}`) },
          h('div', { class: 't' }, s ? s.title : '(chanson supprimée)'), s && s.artist ? h('div', { class: 's' }, s.artist) : null),
        h('button', { class: 'icon-btn', 'aria-label': 'Monter', disabled: i === 0, onclick: () => move(i, i - 1) }, '↑'),
        h('button', { class: 'icon-btn', 'aria-label': 'Descendre', disabled: i === sl.songIds.length - 1, onclick: () => move(i, i + 1) }, '↓'),
        h('button', { class: 'icon-btn', 'aria-label': 'Retirer', onclick: () => { sl.songIds.splice(i, 1); persist(); } }, '✕'),
      );
      li.addEventListener('dragstart', (e) => { e.dataTransfer.setData('text/plain', String(i)); li.classList.add('dragging'); });
      li.addEventListener('dragend', () => li.classList.remove('dragging'));
      li.addEventListener('dragover', (e) => e.preventDefault());
      li.addEventListener('drop', (e) => { e.preventDefault(); const from = +e.dataTransfer.getData('text/plain'); if (!isNaN(from) && from !== i) move(from, i); });
      return li;
    });
    list.replaceChildren(...items);
    if (!items.length) list.append(h('li', { class: 'empty' }, 'Setlist vide.'));
    playBtn.hidden = !items.length;
  }
  function move(from, to) {
    const [x] = sl.songIds.splice(from, 1);
    sl.songIds.splice(to, 0, x);
    persist();
  }

  async function openPicker() {
    await refreshSongs();
    const search = h('input', { type: 'search', placeholder: 'Rechercher…' });
    const ul = h('ul', { class: 'list' });
    const close = () => closeSheet();
    const content = h('div', { class: 'stack', style: 'min-height:0' },
      h('div', { class: 'row' }, search, h('button', { class: 'btn', style: 'flex:0 0 auto', onclick: () => close() }, 'Fermer')),
      ul);
    const closeSheet = sheet(content);
    function renderList() {
      const q = search.value.trim().toLowerCase();
      const all = [...songsById.values()].filter((s) => !q || (s.title + ' ' + s.artist).toLowerCase().includes(q));
      ul.replaceChildren(...all.map((s) => {
        const inList = sl.songIds.includes(s.id);
        return h('li', {},
          h('div', { class: 'main', onclick: async () => {
            if (inList) sl.songIds = sl.songIds.filter((x) => x !== s.id); else sl.songIds.push(s.id);
            await saveSetlist(sl); renderList(); render();
          } }, h('div', { class: 't' }, s.title), s.artist ? h('div', { class: 's' }, s.artist) : null),
          h('span', { style: 'color:var(--accent);font-size:20px;width:28px;text-align:center' }, inList ? '✓' : ''));
      }));
      if (!all.length) ul.append(h('li', { class: 'empty' }, 'Aucune chanson.'));
    }
    search.addEventListener('input', renderList);
    renderList();
    setTimeout(() => search.focus(), 50);
  }

  render();
}
