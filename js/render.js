// Rendu HTML d'une chanson analysée.
import { parseSong } from './parser.js';
import { esc } from './ui.js';

export function renderSongHTML(body) {
  const { sections } = parseSong(body);
  let html = '';
  for (const s of sections) {
    const chordsOnly = s.lines.length && s.lines.every((l) => l.type === 'chords' || l.type === 'blank');
    if (s.title) html += `<div class="section${chordsOnly ? ' chordsonly' : ''}">${esc(s.title)}</div>`;
    for (const l of s.lines) {
      switch (l.type) {
        case 'blank': html += '<div class="line blank"></div>'; break;
        case 'comment': html += `<div class="line comment">${esc(l.text)}</div>`; break;
        case 'meta': html += `<div class="line comment">${esc(l.text)}</div>`; break;
        case 'chords': html += `<div class="line chordline">${esc(l.text)}</div>`; break;
        case 'lyric':
          if (!l.hasChords) html += `<div class="line">${esc(l.parts.map((p) => p.text).join(''))}</div>`;
          else {
            html += '<div class="line withchords">';
            for (const p of l.parts) {
              const t = p.text === '' ? ' ' : esc(p.text);
              html += `<span class="part${p.text === '' ? ' nolyr' : ''}"><span class="chord">${esc(p.chord ?? '')}</span>${t}</span>`;
            }
            html += '</div>';
            html += `<div class="line plain">${esc(l.parts.map((p) => p.text).join('').replace(/\s+$/, ''))}</div>`;
          }
          break;
      }
    }
  }
  return html || '<div class="line comment">(vide)</div>';
}
