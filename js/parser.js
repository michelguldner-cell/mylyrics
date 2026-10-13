// Analyse du texte d'une chanson (format OnSong / ChordPro simplifié).
//
// Format canonique stocké :
//   - Section : ligne se terminant par ":"       → ex. "Couplet 1:" / "Refrain:"
//   - Accords inline entre crochets               → "[G]Je chante [D]ici"
//   - Ligne composée uniquement d'accords         → "G   D   Em   C" (intro, solo…)
//   - Directives ChordPro minimales : {title:}, {t:}, {subtitle:}, {st:}, {artist:}, {comment:}, {c:}, {soc}, {eoc}, {sov}, {eov}
//   - Métadonnées OnSong ("Key: G", "Tempo: 120"…) affichées en gris

const CHORD_RE = /^[A-G][#b]?(?:maj|min|m|M|dim|aug|sus|add|\+|-|°|ø|\d|#|b|\(|\))*(?:\/[A-G][#b]?)?$/;
const SEP_RE = /^(?:\||\/|-|\.|x\d+|\(?\d*x\)?|N\.?C\.?|\(|\)|,)$/i;
const META_KEYS = ['key', 'tonalité', 'tonalite', 'tempo', 'capo', 'time', 'duration', 'flow', 'copyright', 'ccli', 'notes', 'book', 'number', 'keywords', 'topic', 'restrictions', 'transpose', 'pitch', 'midi', 'midi-index', 'bpm', 'auteur', 'author', 'album', 'year', 'année'];

export function isChordToken(tok) {
  return CHORD_RE.test(tok);
}

// Vrai si la ligne ne contient que des accords (et séparateurs).
export function isChordLine(line) {
  const toks = line.trim().split(/\s+/).filter(Boolean);
  if (!toks.length) return false;
  let chords = 0;
  for (const t of toks) {
    if (CHORD_RE.test(t)) chords++;
    else if (!SEP_RE.test(t)) return false;
  }
  return chords > 0;
}

export function isSectionLine(line) {
  const t = line.trim();
  return /^[^\[\]{}]{1,40}:$/.test(t) && !isMetaLine(t);
}

export function isMetaLine(line) {
  const m = line.trim().match(/^([A-Za-zÀ-ÿ\- ]{1,20}):\s*(.*)$/);
  return !!m && META_KEYS.includes(m[1].trim().toLowerCase());
}

// Traduit les en-têtes anglais usuels (Verse 1 → Couplet 1) ; le texte stocké n'est pas modifié.
const LABELS = [[/^pre-?chorus/i, 'Pré-refrain'], [/^chorus/i, 'Refrain'], [/^verse/i, 'Couplet'], [/^bridge/i, 'Pont'],
  [/^interlude/i, 'Interlude'], [/^instrumental/i, 'Instrumental'], [/^ending/i, 'Fin'], [/^tag/i, 'Coda']];
function sectionLabel(name) {
  for (const [re, fr] of LABELS) {
    const m = name.match(re);
    if (m) return fr + name.slice(m[0].length);
  }
  return name;
}

// Découpe "[G]Je chante [D]ici" en parts [{chord, text}].
export function splitInline(line) {
  const parts = [];
  const re = /\[([^\]]*)\]/g;
  let last = 0, m, chord = null;
  while ((m = re.exec(line))) {
    const text = line.slice(last, m.index);
    if (text || chord !== null) parts.push({ chord, text });
    chord = m[1];
    last = re.lastIndex;
  }
  const rest = line.slice(last);
  if (rest || chord !== null) parts.push({ chord, text: rest });
  return parts;
}

// Texte → { sections: [{ title, lines: [{type, text, parts}] }] }
export function parseSong(body) {
  const sections = [];
  let cur = { title: null, lines: [] };
  sections.push(cur);
  const push = (l) => cur.lines.push(l);
  const newSection = (title) => { cur = { title, lines: [] }; sections.push(cur); };

  for (const raw of (body || '').replace(/\r\n?/g, '\n').split('\n')) {
    const line = raw.replace(/\s+$/, '');
    const dm = line.match(/^\s*\{([^:}]+)(?::\s*(.*))?\}\s*$/);
    if (dm) {
      const key = dm[1].trim().toLowerCase();
      const val = (dm[2] || '').trim();
      if (['comment', 'c', 'ci', 'cb'].includes(key)) push({ type: 'comment', text: val });
      else if (['soc', 'start_of_chorus'].includes(key)) newSection(val || 'Refrain');
      else if (['sov', 'start_of_verse'].includes(key)) newSection(val || 'Couplet');
      else if (['sob', 'start_of_bridge'].includes(key)) newSection(val || 'Pont');
      // title/subtitle/artist/eoc/eov et autres directives : ignorées à l'affichage
      continue;
    }
    if (!line.trim()) { push({ type: 'blank' }); continue; }
    if (isSectionLine(line)) { newSection(sectionLabel(line.trim().slice(0, -1).trim())); continue; }
    if (isMetaLine(line)) { push({ type: 'meta', text: line.trim() }); continue; }
    if (!line.includes('[') && isChordLine(line)) { push({ type: 'chords', text: line }); continue; }
    if (line.includes('[')) {
      const parts = splitInline(line);
      push({ type: 'lyric', parts, hasChords: parts.some((p) => p.chord !== null) });
    } else {
      push({ type: 'lyric', parts: [{ chord: null, text: line }], hasChords: false });
    }
  }
  // Supprime la première section si vide et sans titre
  if (!sections[0].title && !sections[0].lines.length) sections.shift();
  // Retire les lignes vides en fin de section
  for (const s of sections) while (s.lines.length && s.lines[s.lines.length - 1].type === 'blank') s.lines.pop();
  return { sections };
}

// Fusionne une ligne d'accords avec la ligne de paroles qui suit → format inline.
export function mergeChordLine(chordLine, lyricLine) {
  const re = /\S+/g;
  let out = lyricLine;
  let offset = 0;
  let m;
  while ((m = re.exec(chordLine))) {
    const tok = m[0];
    if (!CHORD_RE.test(tok) && !SEP_RE.test(tok)) continue;
    const ins = CHORD_RE.test(tok) ? `[${tok}]` : tok;
    let pos = m.index + offset;
    if (pos > out.length) { out = out.padEnd(pos, ' '); }
    out = out.slice(0, pos) + ins + out.slice(pos);
    offset += ins.length;
  }
  return out;
}

// Normalise un texte importé : accords "au-dessus" → inline, directives title/artist extraites.
// Renvoie { title, artist, body }.
export function normalizeImport(text, fallbackTitle = '') {
  const lines = text.replace(/\r\n?/g, '\n').replace(/\t/g, '    ').split('\n');
  let title = '', artist = '';
  const body = [];

  // 1. Directives ChordPro de titre / artiste
  const rest = [];
  for (const l of lines) {
    const dm = l.match(/^\s*\{([^:}]+):\s*(.*)\}\s*$/);
    if (dm) {
      const k = dm[1].trim().toLowerCase(), v = dm[2].trim();
      if (['title', 't'].includes(k)) { title = v; continue; }
      if (['subtitle', 'st', 'artist', 'a'].includes(k)) { artist = artist || v; continue; }
    }
    rest.push(l);
  }

  // 2. Convention OnSong : ligne 1 = titre, ligne 2 = artiste (si suivie d'une ligne vide ou de métadonnées)
  let i = 0;
  while (i < rest.length && !rest[i].trim()) i++;
  const plain = (l) => l && l.trim() && !l.includes('[') && !isChordLine(l) && !isSectionLine(l) && !isMetaLine(l) && !/^\s*\{/.test(l);
  if (!title && plain(rest[i])) {
    title = rest[i].trim(); i++;
    const next = rest[i], after = rest[i + 1];
    if (plain(next) && (after === undefined || !after.trim() || isMetaLine(after))) { artist = next.trim(); i++; }
  }
  while (i < rest.length && !rest[i].trim()) i++;

  // 3. Fusion des lignes d'accords au-dessus des paroles
  for (; i < rest.length; i++) {
    const l = rest[i].replace(/\s+$/, '');
    const n = rest[i + 1];
    if (!l.includes('[') && isChordLine(l) && n !== undefined && n.trim() && !isChordLine(n) && !isSectionLine(n) && !isMetaLine(n) && !/^\s*\{/.test(n)) {
      body.push(mergeChordLine(l, n.replace(/\s+$/, '')));
      i++;
    } else {
      body.push(l);
    }
  }
  return { title: title || fallbackTitle, artist, body: body.join('\n').trim() + '\n' };
}
