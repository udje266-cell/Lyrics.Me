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
