#!/usr/bin/env node
// Convertit une sauvegarde OnSong (fichier .backup = ZIP contenant OnSong.sqlite3)
// en fichier de sauvegarde MyLyrics (JSON) à restaurer via Réglages → Restaurer une sauvegarde.
//
// Usage : node tools/onsong-import.mjs OnSong.backup [sortie.json]
// Nécessite Node 22.5+ (module node:sqlite).

import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { inflateRawSync } from 'node:zlib';
import { DatabaseSync } from 'node:sqlite';
import { normalizeImport, isSectionLine } from '../js/parser.js';

const [,, input, output = 'mylyrics-depuis-onsong.json'] = process.argv;
if (!input) { console.error('Usage : node tools/onsong-import.mjs OnSong.backup [sortie.json]'); process.exit(1); }

// --- Lecture minimale d'un ZIP : extrait OnSong.sqlite3 ---
function extractFromZip(buf, wanted) {
  const eocd = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (eocd < 0) throw new Error('Archive ZIP invalide');
  let count = buf.readUInt16LE(eocd + 10);
  let off = buf.readUInt32LE(eocd + 16);
  // ZIP64 ?
  if (off === 0xffffffff || count === 0xffff) {
    const loc = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x06, 0x07]));
    const z64 = Number(buf.readBigUInt64LE(loc + 8));
    count = Number(buf.readBigUInt64LE(z64 + 32));
    off = Number(buf.readBigUInt64LE(z64 + 48));
  }
  for (let k = 0; k < count; k++) {
    if (buf.readUInt32LE(off) !== 0x02014b50) throw new Error('Entrée ZIP invalide');
    const method = buf.readUInt16LE(off + 10);
    let csize = buf.readUInt32LE(off + 20);
    const nlen = buf.readUInt16LE(off + 28), elen = buf.readUInt16LE(off + 30), clen = buf.readUInt16LE(off + 32);
    let lho = buf.readUInt32LE(off + 42);
    const name = buf.toString('utf8', off + 46, off + 46 + nlen);
    if (csize === 0xffffffff || lho === 0xffffffff) {
      // champ extra ZIP64
      let p = off + 46 + nlen; const end = p + elen;
      while (p < end) {
        const id = buf.readUInt16LE(p), sz = buf.readUInt16LE(p + 2);
        if (id === 1) {
          let q = p + 4;
          if (buf.readUInt32LE(off + 24) === 0xffffffff) q += 8; // usize
          if (csize === 0xffffffff) { csize = Number(buf.readBigUInt64LE(q)); q += 8; }
          if (lho === 0xffffffff) lho = Number(buf.readBigUInt64LE(q));
        }
        p += 4 + sz;
      }
    }
    if (name === wanted) {
      const ln = buf.readUInt16LE(lho + 26), le = buf.readUInt16LE(lho + 28);
      const start = lho + 30 + ln + le;
      const data = buf.subarray(start, start + csize);
      return method === 8 ? inflateRawSync(data) : Buffer.from(data);
    }
    off += 46 + nlen + elen + clen;
  }
  throw new Error(`${wanted} introuvable dans l'archive`);
}

const zip = readFileSync(input);
const dbBytes = extractFromZip(zip, 'OnSong.sqlite3');
const tmp = mkdtempSync(join(tmpdir(), 'onsong-'));
const dbPath = join(tmp, 'OnSong.sqlite3');
writeFileSync(dbPath, dbBytes);
const db = new DatabaseSync(dbPath, { readOnly: true });

const SKIP_SONGS = new Set(['welcome_to_onsong', 'template_sample_song']);
const SKIP_SETS = new Set(['welcome_to_song']);
const now = Date.now();

const songs = [];
const songIds = new Set();
for (const r of db.prepare('SELECT ID, title, byline, content FROM Song').all()) {
  if (SKIP_SONGS.has(r.ID) || !r.content || !r.content.trim()) continue;
  const id = 'onsong-' + r.ID.toLowerCase();
  // Retire les lignes titre / artiste en tête du contenu (convention OnSong)
  const lines = r.content.replace(/\r\n?/g, '\n').split('\n');
  const dbTitle = (r.title || '').trim();
  let byline = (r.byline || '').trim();
  if (isSectionLine(byline)) byline = ''; // OnSong a pris un titre de section pour un artiste
  if (lines[0] && lines[0].trim() === dbTitle) {
    lines.shift();
    if (byline && lines[0] !== undefined && lines[0].trim() === byline) lines.shift();
  }
  const { title, artist, body } = normalizeImport('\n' + lines.join('\n'), dbTitle);
  songs.push({ id, title: dbTitle || title, artist: byline || artist, body, updatedAt: now, deleted: false });
  songIds.add(id);
}

const setlists = [];
for (const s of db.prepare('SELECT ID, title, archived FROM SongSet').all()) {
  if (SKIP_SETS.has(s.ID)) continue;
  const items = db.prepare('SELECT songID FROM SongSetItem WHERE setID = ? ORDER BY orderIndex').all(s.ID);
  const songIdsInSet = items.map((i) => 'onsong-' + i.songID.toLowerCase()).filter((id) => songIds.has(id));
  if (!songIdsInSet.length) continue;
  setlists.push({ id: 'onsong-set-' + s.ID.toLowerCase(), name: s.title, songIds: songIdsInSet, updatedAt: now, deleted: false });
}
db.close();
rmSync(tmp, { recursive: true, force: true });

writeFileSync(output, JSON.stringify({ app: 'mylyrics', version: 1, exportedAt: now, songs, setlists }, null, 1));
console.log(`${songs.length} chansons, ${setlists.length} setlists → ${output}`);
for (const sl of setlists) console.log(`  • ${sl.name} (${sl.songIds.length})`);
