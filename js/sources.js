// Sources externes de paroles.
//
// Chaque source déclare ce qu'elle sait réellement faire. Seule LRCLIB est branchée :
// API publique gratuite, sans clé, qui renvoie les paroles complètes (champ plainLyrics)
// et autorise les appels depuis un navigateur (CORS). Les paroles sont contribuées par sa
// communauté : elles doivent être vérifiées avant l'ajout, et la source est conservée.
//
// Pour ajouter une source : un objet { id, name, search?, fromUrl?, matchUrl? } dans SOURCES.

const LRCLIB = 'https://lrclib.net/api';

const lrclib = {
  id: 'lrclib',
  name: 'LRCLIB',
  site: 'https://lrclib.net',
  async search(title, artist) {
    const p = new URLSearchParams();
    if (title && artist) { p.set('track_name', title); p.set('artist_name', artist); }
    else p.set('q', title || artist);
    const res = await fetchJson(`${LRCLIB}/search?${p}`);
    return res.filter(r => !r.instrumental && r.plainLyrics).slice(0, 25).map(toResult);
  },
  matchUrl: url => /^https?:\/\/(www\.)?lrclib\.net\/.*?(\d+)\/?$/.test(url),
  async fromUrl(url) {
    const id = url.match(/(\d+)\/?$/)[1];
    return toResult(await fetchJson(`${LRCLIB}/get/${id}`));
  },
};

function toResult(r) {
  return {
    sourceId: 'lrclib',
    sourceName: 'LRCLIB',
    sourceUrl: `${LRCLIB}/get/${r.id}`,
    title: r.trackName || r.name,
    artist: r.artistName,
    album: r.albumName || '',
    duration: r.duration,
    lyrics: r.plainLyrics || '',
  };
}

async function fetchJson(url) {
  if (!navigator.onLine) throw new Error('Pas de connexion internet : la recherche en ligne est indisponible. Vos morceaux enregistrés restent accessibles.');
  let res;
  try { res = await fetch(url, { headers: { 'Accept': 'application/json' } }); }
  catch { throw new Error('La source LRCLIB ne répond pas. Réessayez plus tard ou collez les paroles manuellement.'); }
  if (res.status === 404) throw new Error('Aucune parole trouvée pour ce lien.');
  if (res.status === 429) throw new Error('Trop de requêtes vers LRCLIB. Patientez quelques instants.');
  if (!res.ok) throw new Error(`La source a renvoyé une erreur (${res.status}).`);
  return res.json();
}

export const SOURCES = [lrclib];

export async function searchLyrics(title, artist) {
  return lrclib.search(title.trim(), artist.trim());
}

// Import depuis un lien. Renvoie { ok: true, result } ou { ok: false, reason }.
export async function importFromUrl(url) {
  let u;
  try { u = new URL(url.trim()); } catch { return { ok: false, reason: "Ce lien n'est pas une adresse web valide." }; }
  const src = SOURCES.find(s => s.matchUrl && s.matchUrl(u.href));
  if (src) {
    try { return { ok: true, result: await src.fromUrl(u.href) }; }
    catch (e) { return { ok: false, reason: e.message }; }
  }
  return {
    ok: false,
    reason: `Le site « ${u.hostname} » n'est pas pris en charge. Une application installée dans le navigateur ne peut pas lire le contenu d'une page d'un autre site (restriction de sécurité des navigateurs), et la plupart des sites de paroles ou réseaux sociaux n'autorisent pas cette récupération. Copiez le texte depuis la page puis collez-le ci-dessous : le lien sera conservé comme source.`,
    url: u.href,
  };
}

// --- Images d'artiste et d'album (Deezer) ---------------------------------
//
// API publique Deezer : gratuite, sans clé. Elle n'autorise pas les appels directs depuis
// un navigateur (pas d'en-tête CORS), mais propose le JSONP. Les images (1000 × 1000 px)
// sont, elles, servies avec CORS : elles peuvent être dessinées et exportées dans une carte.
// Images à usage personnel ; leurs droits appartiennent aux artistes et labels.

const DEEZER = 'https://api.deezer.com';

function jsonp(path, params = {}) {
  if (!navigator.onLine) return Promise.reject(new Error('Pas de connexion internet : la recherche d\'images est indisponible.'));
  return new Promise((resolve, reject) => {
    const cb = 'verso_dz_' + Math.random().toString(36).slice(2);
    const q = new URLSearchParams({ ...params, output: 'jsonp', callback: cb });
    const s = document.createElement('script');
    const done = () => { delete window[cb]; s.remove(); clearTimeout(t); };
    const t = setTimeout(() => { done(); reject(new Error('Deezer ne répond pas. Réessayez plus tard.')); }, 12000);
    window[cb] = data => { done(); data && data.error ? reject(new Error('Deezer : ' + (data.error.message || 'erreur'))) : resolve(data); };
    s.onerror = () => { done(); reject(new Error('Deezer est inaccessible.')); };
    s.src = `${DEEZER}${path}?${q}`;
    document.head.append(s);
  });
}

const simplify = s => String(s || '').toLocaleLowerCase('fr').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

// Reconnaît l'artiste et l'album d'un morceau et propose des images.
// Renvoie { artist, album, images: [{ url, thumb, label, kind }] }.
export async function findArtwork(title, artist) {
  const mainArtist = String(artist || '').split(/\s+(?:feat\.?|ft\.?|&|x|avec)\s+|,/i)[0].trim();
  let track = null;
  if (title) {
    const r = await jsonp('/search', { q: `artist:"${mainArtist}" track:"${title}"`, limit: 10 });
    const list = r.data || [];
    track = list.find(t => simplify(t.artist.name) === simplify(mainArtist)) || list[0] || null;
    if (!track) {
      const r2 = await jsonp('/search', { q: `${mainArtist} ${title}`, limit: 5 });
      track = (r2.data || [])[0] || null;
    }
  }
  let art = track ? track.artist : null;
  if (!art && mainArtist) {
    const ra = await jsonp('/search/artist', { q: mainArtist, limit: 5 });
    art = (ra.data || []).find(a => simplify(a.name) === simplify(mainArtist)) || (ra.data || [])[0] || null;
  }
  if (!art && !track) return { artist: null, album: null, images: [] };
  const images = [];
  const seen = new Set();
  const add = (url, thumb, label, kind) => { if (url && !seen.has(url) && !/\/images\/(artist|cover)\/\/|d41d8cd98f00b204e9800998ecf8427e/.test(url)) { seen.add(url); images.push({ url, thumb: thumb || url, label, kind }); } };
  if (track) add(track.album.cover_xl, track.album.cover_medium, `Album « ${track.album.title} »`, 'album');
  if (art) add(art.picture_xl, art.picture_medium, art.name, 'artist');
  if (art) {
    try {
      const albums = await jsonp(`/artist/${art.id}/albums`, { limit: 24 });
      for (const a of albums.data || []) add(a.cover_xl, a.cover_medium, `Album « ${a.title} »`, 'album');
    } catch { /* la liste des albums est facultative */ }
  }
  return { artist: art ? art.name : null, album: track ? track.album.title : null, images };
}

// Télécharge une image proposée (pour l'enregistrer dans la carte ou le morceau).
export async function fetchImage(url) {
  let res;
  try { res = await fetch(url, { mode: 'cors' }); } catch { throw new Error("Impossible de télécharger l'image."); }
  if (!res.ok) throw new Error(`Téléchargement de l'image impossible (${res.status}).`);
  return res.blob();
}

// --- Discographie (Deezer) et paroles en lot (LRCLIB) ----------------------

export async function searchArtists(q) {
  const r = await jsonp('/search/artist', { q, limit: 8 });
  return (r.data || []).map(a => ({ id: a.id, name: a.name, picture: a.picture_medium, fans: a.nb_fan, albums: a.nb_album }));
}

export async function searchTracks(q) {
  const r = await jsonp('/search', { q, limit: 8 });
  return (r.data || []).map(t => ({ title: t.title, artist: t.artist ? t.artist.name : '', album: t.album ? t.album.title : '', thumb: t.album ? t.album.cover_small : '', duration: t.duration }));
}

export async function searchAlbums(q) {
  const r = await jsonp('/search/album', { q, limit: 8 });
  return (r.data || []).map(a => ({ id: a.id, title: a.title, artist: a.artist ? a.artist.name : '', artistId: a.artist ? a.artist.id : null, thumb: a.cover_medium, type: a.record_type }));
}

// Tous les albums, EP et singles de l'artiste (pagination Deezer).
export async function artistAlbums(id) {
  const out = [];
  let index = 0;
  for (let page = 0; page < 10; page++) {
    const r = await jsonp(`/artist/${id}/albums`, { limit: 100, index });
    out.push(...(r.data || []));
    if (!r.next) break;
    index += 100;
  }
  return out.map(a => ({ id: a.id, title: a.title, cover: a.cover_xl, thumb: a.cover_medium, year: (a.release_date || '').slice(0, 4), type: a.record_type, explicit: a.explicit_lyrics }));
}

export async function albumTracks(id) {
  const a = await jsonp(`/album/${id}`);
  const tracks = (a.tracks && a.tracks.data) || [];
  return {
    title: a.title, artist: a.artist ? a.artist.name : '', year: (a.release_date || '').slice(0, 4), cover: a.cover_xl,
    tracks: tracks.map((t, i) => ({ title: t.title, artist: t.artist ? t.artist.name : '', duration: t.duration, trackNo: t.track_position || i + 1, link: t.link })),
  };
}

// Sépare « Titre (feat. X) » en titre et invités.
export function splitFeat(title) {
  const m = String(title).match(/^(.*?)\s*[([]\s*(?:feat\.?|ft\.?|featuring|avec)\s+([^)\]]+)[)\]]\s*(.*)$/i);
  return m ? { title: (m[1] + (m[3] ? ' ' + m[3] : '')).trim(), featuring: m[2].trim() } : { title: String(title).trim(), featuring: '' };
}

// Paroles d'un titre précis : correspondance exacte, puis recherche (durée à ±3 s).
export async function findLyrics(title, artist, album, duration) {
  // D'abord les paroles partagées par les utilisateurs de Verso (si un compte est ouvert).
  try { const { sharedLyrics } = await import('./shared-lyrics.js'); const r = await sharedLyrics(title, artist); if (r) return r; } catch { /* LRCLIB ensuite */ }
  // La correspondance exacte exige une durée (1 à 3600 s) : sans elle, on passe à la recherche.
  if (duration >= 1) {
    const get = new URLSearchParams({ track_name: title, artist_name: artist, album_name: album || '', duration: Math.round(duration) });
    try {
      const res = await fetch(`${LRCLIB}/get?${get}`);
      if (res.ok) { const r = await res.json(); if (r.plainLyrics && !r.instrumental) return toResult(r); }
      if (res.status === 429 || res.status === 503) await new Promise(r => setTimeout(r, 2000));
    } catch { /* on tente la recherche */ }
  }
  const url = `${LRCLIB}/search?${new URLSearchParams({ track_name: title, artist_name: artist })}`;
  let list = [];
  for (let attempt = 0; attempt < 3; attempt++) {
    try { list = await fetchJson(url); break; }
    catch (e) { if (!/erreur \((429|503)\)|Trop de requêtes/.test(e.message) || attempt === 2) break; await new Promise(r => setTimeout(r, 1500 * (attempt + 1))); }
  }
  if (!Array.isArray(list)) list = [];
  const ok = list.filter(r => r.plainLyrics && !r.instrumental);
  const best = ok.find(r => !duration || Math.abs((r.duration || 0) - duration) <= 3) || ok[0];
  return best ? toResult(best) : null;
}

export async function artistInfo(id) {
  const a = await jsonp(`/artist/${id}`);
  return { id: a.id, name: a.name, picture: a.picture_xl, thumb: a.picture_medium, fans: a.nb_fan, albums: a.nb_album, link: a.link };
}

// --- Biographie (Wikipédia) ------------------------------------------------
//
// API publique de Wikipédia : gratuite, sans clé, appels autorisés depuis un navigateur
// (paramètre origin=*). Textes sous licence CC BY-SA : la source est toujours affichée.

const MUSIC_RE = /chanteu|rappeu|musicien|groupe|artiste|compositeu|auteur-compositeu|chanteur|DJ|duo|singer|rapper|band|musician|producteur/i;

async function wiki(lang, params) {
  if (!navigator.onLine) throw new Error('Pas de connexion internet : biographie indisponible.');
  const q = new URLSearchParams({ ...params, format: 'json', origin: '*', formatversion: '2' });
  const res = await fetch(`https://${lang}.wikipedia.org/w/api.php?${q}`);
  if (res.status === 429) throw new Error('Wikipédia est momentanément surchargé. Réessayez dans un instant.');
  if (!res.ok) throw new Error(`Wikipédia a renvoyé une erreur (${res.status}).`);
  return res.json();
}

// Cherche la page de l'artiste (français, puis anglais) et renvoie son introduction.
export async function artistBio(name) {
  for (const lang of ['fr', 'en']) {
    const s = await wiki(lang, { action: 'query', list: 'search', srsearch: name, srlimit: 6 });
    const hits = (s.query && s.query.search) || [];
    const simple = t => simplify(t.replace(/\s*\(.*\)$/, ''));
    const pick = hits.find(h => simple(h.title) === simplify(name) && MUSIC_RE.test(h.snippet + h.title))
      || hits.find(h => simple(h.title) === simplify(name))
      || hits.find(h => simplify(h.title).startsWith(simplify(name)) && MUSIC_RE.test(h.snippet));
    if (!pick) continue;
    const r = await wiki(lang, { action: 'query', prop: 'extracts|info', exintro: 1, explaintext: 1, inprop: 'url', redirects: 1, titles: pick.title });
    const page = r.query && r.query.pages && r.query.pages[0];
    if (!page || !page.extract || /homonymie|may refer to|peut désigner/i.test(page.extract.slice(0, 200))) continue;
    return { text: page.extract.trim(), url: page.fullurl || `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(page.title)}`, title: page.title, lang };
  }
  return null;
}

// --- Tendances (Deezer, adaptées au pays de l'utilisateur) -----------------
export async function charts() {
  const [all, africa] = await Promise.all([jsonp('/chart/0'), jsonp('/editorial/2/charts').catch(() => ({}))]);
  const tr = t => ({ title: t.title, artist: t.artist.name, artistId: t.artist.id, cover: t.album && t.album.cover_medium, rank: t.position });
  const al = a => ({ title: a.title, artist: a.artist.name, artistId: a.artist.id, cover: a.cover_medium });
  return {
    tracks: ((all.tracks && all.tracks.data) || []).map(tr),
    albums: ((all.albums && all.albums.data) || []).map(al),
    africa: ((africa.tracks && africa.tracks.data) || []).map(tr),
  };
}
