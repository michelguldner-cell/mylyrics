import { h, toast, confirmDialog } from '../ui.js';
import { getSong, saveSong, deleteSong, getSettings } from '../db.js';
import { renderSongHTML } from '../render.js';

export async function mount(ctx, { id }) {
  const song = await getSong(id);
  if (!song || song.deleted) { toast('Chanson introuvable'); ctx.navigate('#/'); return; }
  const settings = await getSettings();
  ctx.setTitle(song.title);
  ctx.setBack('#/');

  const title = h('input', { type: 'text', value: song.title, placeholder: 'Titre' });
  const artist = h('input', { type: 'text', value: song.artist || '', placeholder: 'Artiste' });
  const body = h('textarea', { placeholder: 'Couplet 1:\n[G]Paroles avec [D]accords…', spellcheck: 'false', autocapitalize: 'off' });
  body.value = song.body || '';
  const preview = h('div', { class: 'song card', hidden: true });
  if (!settings.showChords) preview.classList.add('nochords');

  let dirty = false;
  const markDirty = () => { dirty = true; };
  [title, artist, body].forEach((el) => el.addEventListener('input', markDirty));

  async function save(silent) {
    song.title = title.value.trim() || 'Sans titre';
    song.artist = artist.value.trim();
    song.body = body.value;
    await saveSong(song);
    dirty = false;
    ctx.setTitle(song.title);
    if (!silent) toast('Enregistré');
  }

  const previewBtn = h('button', { class: 'icon-btn text', onclick: () => {
    const show = preview.hidden;
    if (show) { preview.innerHTML = renderSongHTML(body.value); }
    preview.hidden = !show; editor.hidden = show;
    previewBtn.textContent = show ? 'Éditer' : 'Aperçu';
  } }, 'Aperçu');
  const saveBtn = h('button', { class: 'icon-btn text', onclick: () => save(false) }, 'OK');
  ctx.setActions(previewBtn, h('button', { class: 'icon-btn', 'aria-label': 'Jouer', onclick: async () => { if (dirty) await save(true); ctx.navigate('#/play/song/' + song.id); } }, '▶'), saveBtn);

  const editor = h('div', { class: 'stack' },
    h('div', { class: 'row' }, title, artist),
    body,
    h('div', { class: 'hint', html: 'Format : une ligne finissant par <code>:</code> = titre de section (<code>Refrain:</code>). Accords entre crochets : <code>[G]Je chante [D]ici</code>. Une ligne d’accords seuls (<code>G D Em C</code>) est reconnue aussi.' }),
    h('button', { class: 'btn danger block', onclick: async () => {
      if (!(await confirmDialog(`Supprimer « ${song.title} » ?`))) return;
      await deleteSong(song.id); toast('Supprimée'); ctx.navigate('#/');
    } }, 'Supprimer cette chanson'),
  );
  ctx.el().append(editor, preview);

  // Sauvegarde automatique en quittant la vue
  mount.cleanup = async () => { if (dirty) await save(true); };
}

export function unmount() { if (mount.cleanup) { const f = mount.cleanup; mount.cleanup = null; f(); } }
