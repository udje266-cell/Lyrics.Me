// Import de la discographie d'un artiste : albums et pochettes (Deezer), titres, paroles (LRCLIB).
// Tout est enregistré localement ; les titres sans paroles sont marqués « paroles manquantes ».
import { db, uid } from './db.js';
import { compressImage } from './render.js';
import { searchArtists, artistAlbums, albumTracks, splitFeat, findLyrics, fetchImage } from './sources.js';
import { esc, norm, toast, safe, go } from './app.js';
import { liveAlbums } from './albums.js';

const $ = (s, r = document.getElementById('view')) => r.querySelector(s);
const $$ = (s, r = document.getElementById('view')) => [...r.querySelectorAll(s)];
const TYPES = { album: 'Album', ep: 'EP', single: 'Single', compile: 'Compilation' };
const pause = ms => new Promise(r => setTimeout(r, ms));

export async function renderDiscography() {
  const view = document.getElementById('view');
  view.innerHTML = `<h1>Importer une discographie</h1>
    <div class="seg" style="margin-bottom:18px">${[['manuel', 'Morceau'], ['album', 'Album'], ['discographie', 'Artiste'], ['recherche', 'Recherche'], ['lien', 'Lien']].map(([k, l]) => `<button type="button" data-mode="${k}" class="${k === 'discographie' ? 'on' : ''}">${l}</button>`).join('')}</div>
    <p class="small muted">Verso récupère les albums, EP et singles d'un artiste avec leurs pochettes (Deezer), puis les paroles disponibles (LRCLIB). Les titres sans paroles sont ajoutés avec la mention « paroles manquantes ». Connexion internet nécessaire.</p>
    <form id="dform" class="row field"><input id="d-q" aria-label="Nom de l'artiste" placeholder="Nom de l'artiste, ex. Magic System…" style="flex:1" autocomplete="off"><button class="primary">Chercher</button></form>
    <div id="dres"></div>`;
  $$('[data-mode]').forEach(b => b.onclick = () => go('#/ajouter/' + b.dataset.mode));
  $('#dform').onsubmit = async e => {
    e.preventDefault();
    const q = $('#d-q').value.trim(); if (!q) return;
    const out = $('#dres');
    out.innerHTML = '<p class="muted">Recherche…</p>';
    try {
      const list = await searchArtists(q);
      if (!list.length) { out.innerHTML = '<div class="notice">Aucun artiste trouvé. Vérifiez l\'orthographe.</div>'; return; }
      out.innerHTML = `<p class="small muted">Choisissez l'artiste :</p>` + list.map((a, i) => `<button class="result row" data-a="${i}" style="gap:12px;display:flex">
        <img src="${esc(a.picture)}" alt="" width="52" height="52" style="border-radius:50%" loading="lazy"><span><b>${esc(a.name)}</b><br><span class="small muted">${a.albums} sortie(s) · ${a.fans.toLocaleString('fr-FR')} fans</span></span></button>`).join('');
      $$('[data-a]', out).forEach(b => b.onclick = () => go('#/artiste/' + list[+b.dataset.a].id));
    } catch (err) { out.innerHTML = `<div class="notice err">${esc(err.message)}</div>`; }
  };
  // Venue de la page d'un artiste : on passe directement au choix des sorties.
  let pre = null;
  try { pre = JSON.parse(sessionStorage.getItem('verso-disco') || 'null'); sessionStorage.removeItem('verso-disco'); } catch {}
  if (pre) { $('#d-q').value = pre.name; pickAlbums(pre, pre.only); }
}

async function pickAlbums(artist, only = null) {
  const out = $('#dres');
  out.innerHTML = `<p class="muted">Chargement de la discographie de ${esc(artist.name)}…</p>`;
  let albums;
  try { albums = await artistAlbums(artist.id); }
  catch (err) { out.innerHTML = `<div class="notice err">${esc(err.message)}</div>`; return; }
  const existing = new Set((await liveAlbums()).map(a => norm(a.title) + '|' + norm(a.artist)));
  albums.sort((a, b) => (b.year || '').localeCompare(a.year || ''));
  out.innerHTML = `<h2>${esc(artist.name)}</h2>
    <div class="row field">${Object.entries(TYPES).map(([k, l]) => `<button type="button" class="chip ${k !== 'compile' ? 'on' : ''}" data-type="${k}">${l}s</button>`).join('')}
      <button type="button" class="chip" id="d-all">Tout cocher</button><button type="button" class="chip" id="d-none">Tout décocher</button></div>
    <div id="d-list">${albums.map((a, i) => {
      const have = existing.has(norm(a.title) + '|' + norm(artist.name));
      return `<label class="row song" data-kind="${esc(a.type)}" style="cursor:pointer;margin:0;color:inherit">
        <input type="checkbox" data-i="${i}" ${!have && (only ? String(a.id) === String(only) : a.type !== 'compile') ? 'checked' : ''} ${have ? 'disabled' : ''} style="width:22px;height:22px;accent-color:var(--accent)">
        <img class="cover" src="${esc(a.thumb)}" alt="" width="52" height="52" loading="lazy">
        <span style="min-width:0;flex:1"><span class="t" style="display:block">${esc(a.title)}</span><span class="a">${TYPES[a.type] || a.type}${a.year ? ', ' + a.year : ''}${have ? ' — déjà dans la bibliothèque' : ''}</span></span></label>`;
    }).join('')}</div>
    <div class="selbar" style="position:sticky;bottom:calc(var(--nav-h) + 8px);margin-top:12px"><div class="row spread"><b id="d-count"></b><button class="primary" id="d-go">Importer la sélection</button></div>
      <div id="d-prog" class="small muted" aria-live="polite" style="margin-top:6px"></div></div>`;
  const count = () => { const n = $$('#d-list input:checked').length; $('#d-count').textContent = `${n} sortie${n > 1 ? 's' : ''}`; $('#d-go').disabled = !n; };
  $$('#d-list input').forEach(c => c.onchange = count);
  $$('[data-type]').forEach(b => b.onclick = () => {
    b.classList.toggle('on');
    $$(`#d-list [data-kind="${b.dataset.type}"] input:not(:disabled)`).forEach(c => { c.checked = b.classList.contains('on'); });
    count();
  });
  $('#d-all').onclick = () => { $$('#d-list input:not(:disabled)').forEach(c => { c.checked = true; }); count(); };
  $('#d-none').onclick = () => { $$('#d-list input').forEach(c => { c.checked = false; }); count(); };
  count();
  $('#d-go').onclick = () => runImport(artist, $$('#d-list input:checked').map(c => albums[+c.dataset.i]));
}

let cancelled = false;
async function runImport(artist, selection) {
  cancelled = false;
  const prog = $('#d-prog'), btn = $('#d-go');
  btn.textContent = 'Arrêter'; btn.classList.remove('primary');
  btn.onclick = () => { cancelled = true; btn.disabled = true; btn.textContent = 'Arrêt…'; };
  $$('#d-list input').forEach(c => { c.disabled = true; });
  const songs = (await db.all('songs')).filter(s => !s.deletedAt);
  const stats = { albums: 0, tracks: 0, lyrics: 0, missing: 0, skipped: 0 };
  const say = t => { prog.textContent = t; };
  for (const [ai, a] of selection.entries()) {
    if (cancelled) break;
    say(`Album ${ai + 1}/${selection.length} : ${a.title}…`);
    try {
      const detail = await albumTracks(a.id);
      let cover = null;
      try { cover = await compressImage(await fetchImage(a.cover), 1200); } catch { /* pochette facultative */ }
      const now = Date.now();
      const album = { id: uid(), title: a.title, artist: artist.name, year: a.year, lang: '', collection: '', tags: [], cover, note: '', sourceUrl: '', sourceName: 'Deezer', createdAt: now, updatedAt: now };
      await safe(() => db.put('albums', album));
      stats.albums++;
      for (const [ti, t] of detail.tracks.entries()) {
        if (cancelled) break;
        const { title, featuring } = splitFeat(t.title);
        say(`Album ${ai + 1}/${selection.length} « ${a.title} » — titre ${ti + 1}/${detail.tracks.length} : ${title}`);
        const dup = songs.find(s => norm(s.title) === norm(title) && norm(s.artist) === norm(artist.name));
        if (dup) {
          // Déjà présent (souvent un single repris sur l'album) : on le rattache sans doublon.
          if (!dup.albumId) { dup.albumId = album.id; dup.album = album.title; dup.trackNo = t.trackNo; if (!dup.cover) dup.cover = cover; dup.updatedAt = Date.now(); await safe(() => db.put('songs', dup)); }
          stats.skipped++; continue;
        }
        let found = null;
        try { found = await findLyrics(title, artist.name, a.title, t.duration); } catch { /* source indisponible */ }
        const s = {
          id: uid(), title, artist: artist.name, featuring, album: album.title, albumId: album.id, trackNo: t.trackNo,
          lyrics: found ? found.lyrics : '', missingLyrics: !found,
          sourceName: found ? 'LRCLIB' : '', sourceUrl: found ? found.sourceUrl : t.link || '',
          lang: '', collection: '', tags: [], note: '', cover, favorite: false,
          createdAt: Date.now(), updatedAt: Date.now(),
        };
        await safe(() => db.put('songs', s));
        songs.push(s);
        stats.tracks++; found ? stats.lyrics++ : stats.missing++;
        await pause(250); // respecte les sources gratuites
      }
    } catch (err) { toast(`« ${a.title} » : ${err.message}`, { err: true }); }
  }
  say(`${cancelled ? 'Import arrêté. ' : 'Import terminé. '}${stats.albums} sortie(s), ${stats.tracks} titre(s) ajouté(s) : ${stats.lyrics} avec paroles, ${stats.missing} avec paroles manquantes${stats.skipped ? `, ${stats.skipped} déjà présent(s) rattaché(s)` : ''}.`);
  btn.disabled = false; btn.classList.add('primary'); btn.textContent = 'Voir la bibliothèque';
  btn.onclick = () => go('#/bibliotheque');
  toast(`${stats.tracks} titre(s) importé(s)`);
}
