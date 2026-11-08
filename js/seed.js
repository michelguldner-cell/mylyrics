// Données embarquées appliquées une fois par version : tempos connus des chansons de la bibliothèque,
// et nouvelles chansons à créer si elles n'existent pas encore.
import { db, listSongs, saveSong, getSettings, setSetting } from './db.js';
import { songTempo } from './metronome.js';

export const SEED_VERSION = 2;

// Tempos (BPM) des enregistrements originaux. Correspondance par titre (normalisé) + artiste.
export const KNOWN_TEMPOS = [
  { title: 'A MA Place', artist: 'Bauer - Zazie', bpm: 96 },
  { title: 'Alive', artist: 'Pearl Jam', bpm: 76 },
  { title: 'Big Me', artist: 'Foo Fighters', bpm: 131 },
  { title: 'Black', artist: 'Pearl Jam', bpm: 77 },
  { title: 'Breaking the Girl', artist: 'Red Hot Chili Peppers', bpm: 178 },
  { title: 'Broken', artist: 'Seether', bpm: 124 },
  { title: 'Bullet with Butterfly Wings', artist: 'The Smashing Pumpkins', bpm: 122 },
  { title: 'Change', artist: 'Blind Melon', bpm: 78 },
  { title: 'Creep', artist: 'Stone Temple Pilots', bpm: 108 },
  { title: 'Creep', artist: 'Radiohead', bpm: 92 },
  { title: 'Dejeuner en Paix', artist: 'Stephan Eicher', bpm: 126 },
  { title: 'Don\'t Cry', artist: 'Guns N\' Roses', bpm: 125 },
  { title: 'About a Girl', artist: 'Nirvana', bpm: 121 },
  { title: 'Drive', artist: 'Incubus', bpm: 91 },
  { title: 'Ederly Woman', artist: 'Pearl Jam', bpm: 120 },
  { title: 'Elderly Woman Behind the Counter in a Small Town', artist: 'Pearl Jam', bpm: 120 },
  { title: 'Fell on Black Days', artist: 'Soundgarden', bpm: 101 },
  { title: 'Go with the Flow', artist: 'QOTSA', bpm: 159 },
  { title: 'I Never Came', artist: 'QOTSA', bpm: 115 },
  { title: 'Il suffira d\'un signe', artist: 'Jean-Jacques Goldman', bpm: 125 },
  { title: 'Ironic', artist: 'Alanis Morissette', bpm: 85 },
  { title: 'Je ne veux pas rester sage', artist: 'Dolly', bpm: 98 },
  { title: 'Kiss from a Rose', artist: 'Seal', bpm: 132 },
  { title: 'My Friends', artist: 'Red Hot Chili Peppers', bpm: 82 },
  { title: 'No Excuses', artist: 'Alice in Chains', bpm: 117 },
  { title: 'Not An Addict', artist: 'K\'s Choice', bpm: 169 },
  { title: 'State of Love and Trust', artist: 'Pearl Jam', bpm: 165 },
  { title: 'Pennyroyal Tea', artist: 'Nirvana', bpm: 114 },
  { title: 'Plush', artist: 'Stone Temple Pilots', bpm: 72 },
  { title: 'Polly', artist: 'Nirvana', bpm: 121 },
  { title: 'Rape me', artist: 'Nirvana', bpm: 110 },
  { title: 'Save Tonight', artist: 'Eagle-Eye Cherry', bpm: 120 },
  { title: 'Sober', artist: 'Tool', bpm: 150 },
  { title: 'Sur la route', artist: 'De Palmas', bpm: 110 },
  { title: 'The Red', artist: 'Chevelle', bpm: 140 },
  { title: 'Through Glass', artist: 'Stone Sour', bpm: 105 },
  { title: 'Under the Bridge', artist: 'Red Hot Chili Peppers', bpm: 84 },
  { title: 'Waiting on an Angel', artist: 'Ben Harper', bpm: 118 },
  { title: 'Wonderwall', artist: 'Oasis', bpm: 87 },
];

// Nouvelles chansons (structure vide ; paroles à coller par l'utilisateur). « rev » : la fiche est remplacée
// sur les appareils où elle existe déjà, tant que l'utilisateur n'y a rien ajouté (texte encore égal au gabarit précédent).
export const NEW_SONGS = [
  { id: 'seed-about-a-girl', rev: 2, title: 'About a Girl', artist: 'Nirvana', tempo: 121, body: `Intro:

Couplet 1:
{c: coller ici les paroles du couplet 1}

Refrain:
{c: coller ici les paroles du refrain}

Couplet 2:
{c: coller ici les paroles du couplet 2}

Refrain:

Solo:

Couplet 3:
{c: coller ici les paroles du couplet 3}

Refrain:

Fin:
` },
  { id: 'seed-state-of-love-and-trust', rev: 2, title: 'State of Love and Trust', artist: 'Pearl Jam', tempo: 165, body: `Intro:

Couplet 1:
{c: coller ici les paroles du couplet 1}

Pré-refrain:
{c: coller ici les paroles du pré-refrain}

Refrain:
{c: coller ici les paroles du refrain}

Couplet 2:
{c: coller ici les paroles du couplet 2}

Refrain:

Pont:

Solo:

Couplet 3:
{c: coller ici les paroles du couplet 3}

Refrain:

Fin:
` },
];

const strip = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
// « Wonderwall 175bpm - Capo en 3 » → « wonderwall » ; « Creep (Capo4) » → « creep »
export function normTitle(t) {
  return strip(t).replace(/\(.*?\)/g, ' ').replace(/\s[-–—].*$/, ' ').replace(/\d+\s*bpm/g, ' ').replace(/capo.*$/g, ' ')
    .replace(/[’']/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
}
const artistKey = (a) => strip(a).replace(/[^a-z0-9]+/g, '');
function artistMatch(a, b) {
  const x = artistKey(a), y = artistKey(b);
  if (!x || !y) return true;
  return x === y || x.includes(y) || y.includes(x);
}

export function findTempo(song) {
  const t = normTitle(song.title);
  const hits = KNOWN_TEMPOS.filter((k) => normTitle(k.title) === t);
  if (!hits.length) return null;
  const best = hits.find((k) => artistMatch(k.artist, song.artist)) || (hits.length === 1 && !song.artist ? hits[0] : null);
  return best ? best.bpm : null;
}

// Applique les données embarquées. Renvoie le nombre de chansons modifiées/créées.
export async function applySeed() {
  const s = await getSettings();
  if ((s.seedVersion || 0) >= SEED_VERSION) return 0;
  let n = 0;
  const songs = await listSongs();
  for (const song of songs) {
    if (songTempo(song)) continue;
    const bpm = findTempo(song);
    if (bpm) { song.tempo = bpm; await saveSong(song); n++; }
  }
  const all = await db.getAll('songs');
  const ids = new Set(all.map((x) => x.id));
  for (const ns of NEW_SONGS) {
    const cur = all.find((x) => x.id === ns.id);
    if (!cur) { await saveSong({ ...ns, deleted: false }); n++; continue; }
    // Fiche d'une version précédente, jamais complétée (gabarit rev 1 avec accords) : on la remplace.
    const untouched = (cur.rev || 1) < ns.rev && /paroles du couplet 1 à coller/.test(cur.body || '');
    if (untouched && !cur.deleted) { await saveSong({ ...cur, title: ns.title, artist: ns.artist, body: ns.body, rev: ns.rev }); n++; }
  }
  await setSetting('seedVersion', SEED_VERSION);
  return n;
}
