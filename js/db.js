// Stockage local (IndexedDB). Toutes les données restent dans ce navigateur, sur cet appareil.
const DB_NAME = 'verso';
const DB_VERSION = 1;
export const STORES = ['songs', 'passages', 'cards', 'templates', 'settings'];

let dbPromise = null;

function open() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const name of STORES) {
        if (!db.objectStoreNames.contains(name)) {
          db.createObjectStore(name, { keyPath: name === 'settings' ? 'key' : 'id' });
        }
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

export class StorageError extends Error {
  constructor(cause) {
    const quota = cause && (cause.name === 'QuotaExceededError' || /quota/i.test(cause.message || ''));
    super(quota
      ? "Espace de stockage insuffisant : l'enregistrement a échoué. Libérez de la place (corbeille, anciennes créations) ou exportez une sauvegarde."
      : "L'enregistrement a échoué : " + (cause && cause.message ? cause.message : 'erreur inconnue'));
    this.quota = quota;
    this.cause = cause;
  }
}

function tx(store, mode, fn) {
  return open().then(db => new Promise((resolve, reject) => {
    let t;
    try { t = db.transaction(store, mode); } catch (e) { reject(new StorageError(e)); return; }
    const s = t.objectStore(store);
    let result;
    try { result = fn(s); } catch (e) { reject(new StorageError(e)); return; }
    t.oncomplete = () => resolve(result && 'result' in result ? result.result : result);
    t.onerror = () => reject(new StorageError(t.error));
    t.onabort = () => reject(new StorageError(t.error));
  }));
}

export const db = {
  get: (store, id) => tx(store, 'readonly', s => s.get(id)),
  all: (store) => tx(store, 'readonly', s => s.getAll()),
  put: (store, value) => tx(store, 'readwrite', s => s.put(value)),
  del: (store, id) => tx(store, 'readwrite', s => s.delete(id)),
  clear: (store) => tx(store, 'readwrite', s => s.clear()),
  async setting(key, fallback) {
    const r = await db.get('settings', key);
    return r ? r.value : fallback;
  },
  setSetting: (key, value) => db.put('settings', { key, value }),
};

export function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

// --- Sauvegarde complète -------------------------------------------------

function blobToDataURL(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

async function dataURLToBlob(url) {
  return (await fetch(url)).blob();
}

// Parcourt un objet et remplace les Blob par {__blob: dataURL} (ou l'inverse).
async function mapBlobs(value, toJson) {
  if (toJson && value instanceof Blob) return { __blob: await blobToDataURL(value) };
  if (!toJson && value && typeof value === 'object' && typeof value.__blob === 'string') return dataURLToBlob(value.__blob);
  if (Array.isArray(value)) return Promise.all(value.map(v => mapBlobs(v, toJson)));
  if (value && typeof value === 'object' && !(value instanceof Blob)) {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = await mapBlobs(v, toJson);
    return out;
  }
  return value;
}

export async function exportBackup() {
  const data = { app: 'verso', format: 1, exportedAt: new Date().toISOString() };
  for (const s of STORES) data[s] = await mapBlobs(await db.all(s), true);
  return new Blob([JSON.stringify(data)], { type: 'application/json' });
}

// Fusionne une sauvegarde : un élément déjà présent (même identifiant) n'est remplacé
// que si la version importée est plus récente. Aucun doublon n'est créé.
export async function importBackup(file) {
  let data;
  try { data = JSON.parse(await file.text()); } catch { throw new Error("Ce fichier n'est pas une sauvegarde Verso valide."); }
  if (data.app !== 'verso') throw new Error("Ce fichier n'est pas une sauvegarde Verso.");
  const report = { added: 0, updated: 0, skipped: 0 };
  for (const s of STORES) {
    for (const raw of data[s] || []) {
      const item = await mapBlobs(raw, false);
      const key = s === 'settings' ? item.key : item.id;
      const existing = await db.get(s, key);
      if (!existing) { await db.put(s, item); report.added++; }
      else if ((item.updatedAt || 0) > (existing.updatedAt || 0)) { await db.put(s, item); report.updated++; }
      else report.skipped++;
    }
  }
  return report;
}
