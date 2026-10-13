// Synchronisation Google Drive : OAuth 2.0 implicite par redirection + API REST Drive v3.
import { getSettings, setSetting, exportData, importData, db } from './db.js';

const SCOPE = 'https://www.googleapis.com/auth/drive.file';
const TOKEN_KEY = 'mylyrics.gtoken';
const FOLDER = 'MyLyrics';
const FILENAME = 'mylyrics.json';
const API = 'https://www.googleapis.com/drive/v3';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3';

function redirectUri() {
  return location.origin + location.pathname; // sans hash, sans query
}

function getToken() {
  try {
    const t = JSON.parse(localStorage.getItem(TOKEN_KEY) || 'null');
    if (t && t.expiresAt > Date.now() + 30_000) return t.access_token;
  } catch (e) { /* ignore */ }
  return null;
}

export function isConnected() { return !!getToken(); }

export async function connect() {
  const s = await getSettings();
  if (!s.driveClientId) throw new Error('Client ID manquant');
  sessionStorage.setItem('mylyrics.returnHash', location.hash || '#/settings');
  const p = new URLSearchParams({
    client_id: s.driveClientId,
    redirect_uri: redirectUri(),
    response_type: 'token',
    scope: SCOPE,
    include_granted_scopes: 'true',
    prompt: 'select_account',
    state: 'mylyrics',
  });
  location.href = 'https://accounts.google.com/o/oauth2/v2/auth?' + p.toString();
}

export function disconnect() {
  localStorage.removeItem(TOKEN_KEY);
}

// Appelé au chargement : si l'URL contient un access_token, le stocke et nettoie l'URL. Renvoie true si redirection.
export function handleOAuthReturn() {
  const hash = location.hash.replace(/^#/, '');
  if (!hash.includes('access_token=')) return false;
  const p = new URLSearchParams(hash);
  const token = p.get('access_token');
  const expires = +(p.get('expires_in') || 3600);
  if (token) localStorage.setItem(TOKEN_KEY, JSON.stringify({ access_token: token, expiresAt: Date.now() + expires * 1000 }));
  const back = sessionStorage.getItem('mylyrics.returnHash') || '#/settings';
  sessionStorage.removeItem('mylyrics.returnHash');
  location.replace(location.pathname + back);
  return true;
}

async function api(path, opts = {}, base = API) {
  const token = getToken();
  if (!token) throw new Error('Non connecté à Google Drive');
  const res = await fetch(base + path, { ...opts, headers: { Authorization: 'Bearer ' + token, ...(opts.headers || {}) } });
  if (res.status === 401) { disconnect(); throw new Error('Session Google expirée, reconnectez-vous'); }
  if (!res.ok) throw new Error('Drive ' + res.status + ' ' + (await res.text()).slice(0, 200));
  return res;
}

async function findOrCreateFolder() {
  const q = encodeURIComponent(`name='${FOLDER}' and mimeType='application/vnd.google-apps.folder' and trashed=false`);
  const r = await (await api(`/files?q=${q}&fields=files(id)&spaces=drive`)).json();
  if (r.files && r.files.length) return r.files[0].id;
  const c = await (await api('/files', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: FOLDER, mimeType: 'application/vnd.google-apps.folder' }) })).json();
  return c.id;
}

async function findFile(folderId) {
  const s = await getSettings();
  if (s.driveFileId) {
    const r = await fetch(`${API}/files/${s.driveFileId}?fields=id,trashed`, { headers: { Authorization: 'Bearer ' + getToken() } });
    if (r.ok) { const j = await r.json(); if (!j.trashed) return j.id; }
  }
  const q = encodeURIComponent(`name='${FILENAME}' and '${folderId}' in parents and trashed=false`);
  const r = await (await api(`/files?q=${q}&fields=files(id)`)).json();
  const id = r.files && r.files[0] ? r.files[0].id : null;
  if (id) await setSetting('driveFileId', id);
  return id;
}

async function download(fileId) {
  const r = await api(`/files/${fileId}?alt=media`);
  return r.json();
}

async function upload(fileId, folderId, data) {
  const meta = fileId ? {} : { name: FILENAME, parents: [folderId] };
  const boundary = 'mylyrics' + Date.now();
  const body = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n${JSON.stringify(data)}\r\n--${boundary}--`;
  const path = fileId ? `/files/${fileId}?uploadType=multipart` : '/files?uploadType=multipart';
  const r = await (await api(path, { method: fileId ? 'PATCH' : 'POST', headers: { 'Content-Type': `multipart/related; boundary=${boundary}` }, body }, UPLOAD)).json();
  if (!fileId && r.id) await setSetting('driveFileId', r.id);
  return r.id;
}

// Sync complète : télécharge, fusionne, écrit en local, renvoie le résultat fusionné.
export async function sync() {
  if (!navigator.onLine) throw new Error('Hors ligne');
  const folderId = await findOrCreateFolder();
  const fileId = await findFile(folderId);
  let remote = { songs: [], setlists: [] };
  if (fileId) {
    try { remote = await download(fileId); } catch (e) { console.warn('Lecture Drive', e); }
    if (!remote || !Array.isArray(remote.songs)) remote = { songs: [], setlists: [] };
  }
  const merged = await importData(remote);
  const data = { ...(await exportData()), songs: merged.songs, setlists: merged.setlists };
  await upload(fileId, folderId, data);
  await setSetting('lastSyncAt', Date.now());
  return { songs: merged.songs.filter((x) => !x.deleted).length, setlists: merged.setlists.filter((x) => !x.deleted).length };
}

// Tentative silencieuse à l'ouverture (si connecté, en ligne, et dernière sync > 10 min).
export async function autoSync() {
  if (!navigator.onLine || !isConnected()) return;
  const s = await getSettings();
  if (Date.now() - (s.lastSyncAt || 0) < 10 * 60 * 1000) return;
  await sync();
}
