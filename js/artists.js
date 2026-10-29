// Page d'un artiste : photo, biographie (Wikipédia), discographie (Deezer) et titres de la bibliothèque.
// La page est mise en cache localement pour rester consultable hors connexion.
import { db } from './db.js';
import { compressImage } from './render.js';
import { searchArtists, artistInfo, artistAlbums, artistBio, fetchImage } from './sources.js';
import { esc, norm, go, blobUrl } from './app.js';
import { liveAlbums } from './albums.js';

const $ = (s, r = document.getElementById('view')) => r.querySelector(s);
const $$ = (s, r = document.getElementById('view')) => [...r.querySelectorAll(s)];
const SECTIONS = [['album', 'Albums'], ['ep', 'EP'], ['single', 'Singles'], ['compile', 'Compilations']];

export const artistHref = name => '#/artiste/nom/' + encodeURIComponent(name);

// Lien depuis un nom (page d'un morceau, d'un album…) : cache local, sinon recherche Deezer.
export async function renderArtistByName(name) {
  const cached = (await db.all('artists')).find(a => norm(a.name) === norm(name));
  if (cached) return renderArtist(cached.deezerId);
  try {
    const list = await searchArtists(name);
    const hit = list.find(a => norm(a.name) === norm(name)) || list[0];
    if (hit) { history.replaceState(null, '', '#/artiste/' + hit.id); return renderArtist(hit.id); }
  } catch { /* hors connexion : page locale seulement */ }
  return renderLocalArtist(name);
}

async function localWork(name) {
  const songs = (await db.all('songs')).filter(s => !s.deletedAt && norm(s.artist) === norm(name));
  const albums = (await liveAlbums()).filter(a => norm(a.artist) === norm(name));
  return { songs, albums };
}

function songsSection(songs) {
  if (!songs.length) return '';
  const list = [...songs].sort((a, b) => a.title.localeCompare(b.title, 'fr'));
  return `<section><h2>Dans ma bibliothèque <span class="muted small">${songs.length} titre${songs.length > 1 ? 's' : ''}</span></h2>
    <ul class="songs">${list.slice(0, 50).map(s => `<li class="song"><a class="main" href="#/morceau/${s.id}"><div style="min-width:0"><div class="t">${esc(s.title)}</div>
      <div class="a">${s.album ? esc(s.album) : ''}${s.lyrics && s.lyrics.trim() ? '' : ' <span class="missing">(paroles manquantes)</span>'}</div></div></a></li>`).join('')}</ul>
    ${list.length > 50 ? `<p class="small muted">… et ${list.length - 50} autres, dans la bibliothèque.</p>` : ''}</section>`;
}

async function renderLocalArtist(name) {
  const view = document.getElementById('view');
  const { songs } = await localWork(name);
  view.innerHTML = `<div class="artist-head"><span class="artist-pic ph">“</span><div><h1>${esc(name)}</h1>
    <p class="small muted">Hors connexion : biographie et discographie indisponibles pour l'instant.</p></div></div>${songsSection(songs) || '<div class="empty">Aucun titre de cet artiste.</div>'}`;
}

export async function renderArtist(id) {
  const view = document.getElementById('view');
  const key = 'dz' + id;
  let cached = await db.get('artists', key);
  const paint = async (a, status = '') => {
    const { songs, albums: mine } = await localWork(a.name);
    const owned = new Set(mine.map(x => norm(x.title)));
    const byType = {};
    for (const r of a.releases || []) (byType[r.type] = byType[r.type] || []).push(r);
    const pic = a.picture ? `<img class="artist-pic" src="${blobUrl('artist-' + key + a.updatedAt, a.picture)}" alt="" width="160" height="160">` : '<span class="artist-pic ph">“</span>';
    const bio = a.bio;
    view.innerHTML = `
      <div class="artist-head">${pic}<div style="min-width:0"><h1>${esc(a.name)}</h1>
        <p class="small muted">${a.fans ? a.fans.toLocaleString('fr-FR') + ' fans sur Deezer · ' : ''}${(a.releases || []).length} sortie${(a.releases || []).length > 1 ? 's' : ''}${songs.length ? ` · ${songs.length} titre${songs.length > 1 ? 's' : ''} chez vous` : ''}</p>
        <div class="row"><button class="primary" id="imp-all">Importer la discographie</button></div></div></div>
      ${status ? `<p class="small muted">${status}</p>` : ''}
      <section><h2>Biographie</h2>${bio ? `<div class="bio${bio.text.length > 700 ? ' long' : ' open'}" id="bio">${bio.text.split(/\n+/).filter(Boolean).map(p => `<p>${esc(p)}</p>`).join('')}</div>
        ${bio.text.length > 700 ? '<button class="ghost" id="bio-more">Lire la suite</button>' : ''}
        <p class="small muted">Source : <a href="${esc(bio.url)}" target="_blank" rel="noopener">Wikipédia${bio.lang !== 'fr' ? ' (en anglais)' : ''}</a>, texte sous licence CC BY-SA.</p>`
        : `<p class="muted">${a.bioError ? esc(a.bioError) : 'Aucune biographie trouvée sur Wikipédia pour cet artiste.'}</p>`}</section>
      ${SECTIONS.filter(([t]) => byType[t]).map(([t, label]) => `<section><h2>${label} <span class="muted small">${byType[t].length}</span></h2>
        <div class="releases">${byType[t].map(r => {
          const have = owned.has(norm(r.title));
          const local = have ? mine.find(x => norm(x.title) === norm(r.title)) : null;
          return `<div class="release">${have ? `<a href="#/album/${local.id}">` : `<button type="button" data-imp="${r.id}" aria-label="Importer ${esc(r.title)}">`}
            <img src="${esc(r.thumb)}" alt="" width="250" height="250" loading="lazy">
            <span class="r-t">${esc(r.title)}</span><span class="r-m">${r.year || ''}${have ? ' · dans ma bibliothèque' : ' · importer'}</span>${have ? '</a>' : '</button>'}</div>`;
        }).join('')}</div></section>`).join('')}
      ${songsSection(songs)}`;
    if ($('#bio-more')) $('#bio-more').onclick = () => { $('#bio').classList.add('open'); $('#bio-more').remove(); };
    const toDisco = only => { try { sessionStorage.setItem('verso-disco', JSON.stringify({ id: a.deezerId, name: a.name, only })); } catch {} go('#/ajouter/discographie'); };
    $('#imp-all').onclick = () => toDisco(null);
    $$('[data-imp]').forEach(b => b.onclick = () => toDisco(b.dataset.imp));
  };

  if (cached) await paint(cached, navigator.onLine ? 'Mise à jour…' : 'Hors connexion : dernière version enregistrée.');
  else view.innerHTML = '<p class="muted">Chargement de l\'artiste…</p>';
  if (!navigator.onLine) { if (!cached) view.innerHTML = '<div class="notice err">Pas de connexion internet : cet artiste n\'a pas encore été consulté.</div>'; return; }

  try {
    const info = await artistInfo(id);
    const releases = await artistAlbums(id);
    let bio = cached && cached.bio, bioError = '';
    try { bio = await artistBio(info.name) || null; } catch (e) { bioError = e.message; }
    let picture = cached && cached.picture;
    if (!picture && info.picture) { try { picture = await compressImage(await fetchImage(info.picture), 600); } catch {} }
    const a = { id: key, deezerId: info.id, name: info.name, fans: info.fans, releases, bio, bioError: bio ? '' : bioError, picture, updatedAt: Date.now() };
    await db.put('artists', a).catch(() => {});
    if (location.hash === '#/artiste/' + id) await paint(a);
  } catch (e) {
    if (cached) await paint(cached, 'Mise à jour impossible : ' + e.message);
    else view.innerHTML = `<div class="notice err">${esc(e.message)}</div>`;
  }
}
