// Paroles partagées entre les comptes Verso (Firestore, collection « lyrics »).
// Toute parole ajoutée ou corrigée par un utilisateur connecté est publiée ; les titres
// « paroles manquantes » des autres se complètent, et les corrections se propagent
// tant que la copie locale n'a pas été modifiée à la main.
import { db } from './db.js';
import { fb, currentUser } from './social.js';

const slug = s => String(s || '').toLocaleLowerCase('fr').replace(/œ/g, 'oe').replace(/æ/g, 'ae')
  .normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 140);
const mainArtist = a => String(a || '').split(/,|&| feat\.? | ft\.? | x /i)[0].trim();
export const lyricsKey = (title, artist) => {
  const t = slug(title), a = slug(mainArtist(artist));
  return t && a ? `${t}__${a}` : '';
};

// Empreinte courte des paroles (détecte une modification locale).
export function hash(s) {
  let h = 2166136261;
  for (const c of String(s || '')) { h ^= c.codePointAt(0); h = Math.imul(h, 16777619) >>> 0; }
  return h.toString(36);
}

const toResult = d => ({ sourceId: 'verso', sourceName: 'Verso (communauté)', sourceUrl: '', title: d.title, artist: d.artist,
  album: d.album || '', lyrics: d.lyrics, sharedKey: d.key, sharedAt: d.updatedAt ? d.updatedAt.toMillis() : 0, byHandle: d.byHandle || '' });

// Paroles partagées d'un titre (null si absentes, hors connexion ou sans compte).
export async function sharedLyrics(title, artist) {
  const key = lyricsKey(title, artist);
  if (!key || !navigator.onLine || !(await currentUser())) return null;
  const { F, fs } = await fb();
  const s = await F.getDoc(F.doc(fs, 'lyrics', key));
  return s.exists() && s.data().lyrics ? toResult({ key, ...s.data() }) : null;
}

// Publie les paroles d'un morceau (création ou correction) avec une révision d'historique.
async function publish(song, user) {
  const key = lyricsKey(song.title, song.artist); if (!key) return null;
  const { F, fs } = await fb();
  const prof = (await db.setting('profile', null)) || {};
  const ref = F.doc(fs, 'lyrics', key);
  const cur = await F.getDoc(ref);
  const lyrics = String(song.lyrics).slice(0, 20000);
  if (cur.exists() && cur.data().lyrics === lyrics) return cur.data().updatedAt;
  const b = F.writeBatch(fs);
  const base = { lyrics, by: user.uid, byHandle: String(prof.handle || '').slice(0, 30), updatedAt: F.serverTimestamp() };
  if (cur.exists()) b.update(ref, base);
  else b.set(ref, { ...base, title: String(song.title).slice(0, 200), artist: mainArtist(song.artist).slice(0, 200),
    album: String(song.album || '').slice(0, 200), createdAt: F.serverTimestamp() });
  b.set(F.doc(F.collection(ref, 'revisions')), { ...base });
  await b.commit();
  return (await F.getDoc(ref)).data().updatedAt;
}

// Après chaque enregistrement local d'un morceau : publie si ses paroles ont changé.
let busy = false;
export async function onSongSaved(song) {
  if (busy || !song || song.deletedAt || song.missingLyrics || !String(song.lyrics || '').trim()) return;
  const h = hash(song.lyrics);
  if (song.sharedHash === h) return;
  if (!(await db.setting('shareLyrics', true))) return;
  const user = await currentUser(); if (!user || !navigator.onLine) return;
  try {
    const at = await publish(song, user);
    const cur = await db.get('songs', song.id); if (!cur || hash(cur.lyrics) !== h) return;
    cur.sharedKey = lyricsKey(cur.title, cur.artist); cur.sharedHash = h; cur.sharedAt = at ? at.toMillis() : Date.now();
    busy = true; try { await db.put('songs', cur); } finally { busy = false; }
  } catch (e) { console.warn('Publication des paroles impossible :', e.code || e.message); }
}

// Synchronisation : complète les paroles manquantes et applique les corrections publiées
// (seulement si la copie locale n'a pas été retouchée depuis la dernière synchronisation).
export async function syncLibrary({ force = false } = {}) {
  const user = await currentUser(); if (!user || !navigator.onLine) return 0;
  const last = await db.setting('lyricsSyncAt', 0);
  if (!force && Date.now() - last < 15 * 60 * 1000) return 0;
  await db.setSetting('lyricsSyncAt', Date.now());
  const { F, fs } = await fb();
  const songs = (await db.all('songs')).filter(s => !s.deletedAt);
  const wanted = new Map();
  for (const s of songs) {
    const key = lyricsKey(s.title, s.artist); if (!key) continue;
    const linked = s.sharedHash && s.sharedHash === hash(s.lyrics);
    if (s.missingLyrics || !String(s.lyrics || '').trim() || linked) (wanted.get(key) || wanted.set(key, []).get(key)).push(s);
    else if (!s.sharedHash) onSongSaved(s); // paroles jamais publiées : on les partage
  }
  let n = 0;
  const keys = [...wanted.keys()];
  for (let i = 0; i < keys.length; i += 30) {
    const snap = await F.getDocs(F.query(F.collection(fs, 'lyrics'), F.where(F.documentId(), 'in', keys.slice(i, i + 30))));
    for (const d of snap.docs) {
      const r = d.data(), at = r.updatedAt ? r.updatedAt.toMillis() : 0;
      for (const s of wanted.get(d.id)) {
        if (!r.lyrics || (s.sharedAt && at <= s.sharedAt && !s.missingLyrics)) continue;
        Object.assign(s, { lyrics: r.lyrics, missingLyrics: false, sharedKey: d.id, sharedHash: hash(r.lyrics), sharedAt: at,
          sourceName: s.sourceName || 'Verso (communauté)', updatedAt: Date.now() });
        busy = true; try { await db.put('songs', s); } finally { busy = false; }
        n++;
      }
    }
  }
  return n;
}

// Branche la publication sur tout enregistrement de morceau (formulaire, album, discographie…).
export function installSharedLyrics() {
  const put = db.put;
  db.put = async (store, value) => {
    const r = await put(store, value);
    if (store === 'songs' && !busy) onSongSaved(value);
    return r;
  };
  const run = () => syncLibrary().then(n => { if (n) import('./app.js').then(a => a.toast(`${n} parole${n > 1 ? 's' : ''} ajoutée${n > 1 ? 's' : ''} par la communauté Verso`)); }).catch(() => {});
  setTimeout(run, 4000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) run(); });
}
