// Wrapper IndexedDB minimal : stores songs, setlists, settings.
const DB_NAME = 'mylyrics';
const DB_VERSION = 1;
let dbp = null;

function open() {
  if (dbp) return dbp;
  dbp = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('songs')) db.createObjectStore('songs', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('setlists')) db.createObjectStore('setlists', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('settings')) db.createObjectStore('settings', { keyPath: 'key' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbp;
}

function tx(store, mode, fn) {
  return open().then((db) => new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const s = t.objectStore(store);
    let result;
    const r = fn(s);
    if (r && typeof r.onsuccess !== 'undefined') r.onsuccess = () => { result = r.result; };
    t.oncomplete = () => resolve(result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  }));
}

export const db = {
  getAll: (store) => tx(store, 'readonly', (s) => s.getAll()),
  get: (store, id) => tx(store, 'readonly', (s) => s.get(id)),
  put: (store, obj) => tx(store, 'readwrite', (s) => s.put(obj)),
  putMany: (store, objs) => tx(store, 'readwrite', (s) => { objs.forEach((o) => s.put(o)); }),
  delete: (store, id) => tx(store, 'readwrite', (s) => s.delete(id)),
  clear: (store) => tx(store, 'readwrite', (s) => s.clear()),
};

export function uid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
}

// ---- Chansons ----
export async function listSongs() {
  const all = await db.getAll('songs');
  return all.filter((s) => !s.deleted).sort((a, b) => a.title.localeCompare(b.title, 'fr', { sensitivity: 'base' }));
}
export const getSong = (id) => db.get('songs', id);
export async function saveSong(song) {
  song.updatedAt = Date.now();
  await db.put('songs', song);
  return song;
}
export async function deleteSong(id) {
  const s = await db.get('songs', id);
  if (!s) return;
  s.deleted = true; s.updatedAt = Date.now();
  await db.put('songs', s);
}

// ---- Setlists ----
export async function listSetlists() {
  const all = await db.getAll('setlists');
  return all.filter((s) => !s.deleted).sort((a, b) => a.name.localeCompare(b.name, 'fr', { sensitivity: 'base' }));
}
export const getSetlist = (id) => db.get('setlists', id);
export async function saveSetlist(sl) {
  sl.updatedAt = Date.now();
  await db.put('setlists', sl);
  return sl;
}
export async function deleteSetlist(id) {
  const s = await db.get('setlists', id);
  if (!s) return;
  s.deleted = true; s.updatedAt = Date.now();
  await db.put('setlists', s);
}

// ---- Réglages ----
// Client ID OAuth du projet Google Cloud « MyLyrics » (identifiant public : seules les URL de l'app peuvent l'utiliser).
export const DEFAULT_DRIVE_CLIENT_ID = '269156092008-f9flp7pk9gdu9hfkv2tib7mrnghlvqsg.apps.googleusercontent.com';
const DEFAULTS = { fontSize: 18, sectionSize: 12, chordSize: 13, showChords: true, driveClientId: DEFAULT_DRIVE_CLIENT_ID, driveFileId: '', lastSyncAt: 0 };
let settingsCache = null;
export async function getSettings() {
  if (settingsCache) return settingsCache;
  const rows = await db.getAll('settings');
  settingsCache = { ...DEFAULTS };
  rows.forEach((r) => { settingsCache[r.key] = r.value; });
  if (!settingsCache.driveClientId) settingsCache.driveClientId = DEFAULT_DRIVE_CLIENT_ID;
  return settingsCache;
}
export async function setSetting(key, value) {
  const s = await getSettings();
  s[key] = value;
  await db.put('settings', { key, value });
}

// ---- Fusion (sync Drive / restauration JSON) ----
// Retourne { songs, setlists } fusionnés : par id, le updatedAt le plus récent gagne.
export function mergeData(local, remote) {
  const merge = (a = [], b = []) => {
    const map = new Map();
    a.forEach((x) => map.set(x.id, x));
    b.forEach((x) => {
      const cur = map.get(x.id);
      if (!cur || (x.updatedAt || 0) > (cur.updatedAt || 0)) map.set(x.id, x);
    });
    return [...map.values()];
  };
  return { songs: merge(local.songs, remote.songs), setlists: merge(local.setlists, remote.setlists) };
}
export async function exportData() {
  return { app: 'mylyrics', version: 1, exportedAt: Date.now(), songs: await db.getAll('songs'), setlists: await db.getAll('setlists') };
}
export async function importData(data) {
  const local = await exportData();
  const merged = mergeData(local, data);
  await db.putMany('songs', merged.songs);
  await db.putMany('setlists', merged.setlists);
  return merged;
}
