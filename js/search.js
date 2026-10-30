// Recherche (loupe) : artistes (Deezer) et contenu de la bibliothèque.
import { db } from './db.js';
import { searchArtists, searchTracks, searchAlbums } from './sources.js';
import { esc, norm, go, openNowPlaying } from './app.js';
import { liveAlbums } from './albums.js';

let lastQ = '';

export async function renderSearch() {
  const view = document.getElementById('view');
  document.body.classList.add('search-mode');
  view.innerHTML = `<form class="search-bar" id="sform" role="search">
      <button type="button" class="icon-btn ghost" onclick="history.back()" aria-label="Retour">←</button>
      <input type="search" id="sq" name="q" value="${esc(lastQ)}" placeholder="Titre, artiste, album ou paroles…" aria-label="Rechercher" autocomplete="off" enterkeyhint="search">
    </form>
    <div id="sres"></div>`;
  const songs = (await db.all('songs')).filter(s => !s.deletedAt);
  const albums = await liveAlbums();
  const input = view.querySelector('#sq'), out = view.querySelector('#sres');
  let timer = 0, token = 0;
  const run = async () => {
    const q = input.value.trim(); lastQ = q;
    const n = norm(q);
    if (!q) { out.innerHTML = '<p class="muted small" style="margin-top:20px">Cherchez un titre, un artiste ou un album, ou un mot de vos paroles.</p>'; return; }
    const mine = songs.filter(s => norm(s.title + ' ' + s.artist).includes(n) || norm(s.lyrics).includes(n)).slice(0, 8);
    const myAlbums = albums.filter(a => norm(a.title + ' ' + a.artist).includes(n)).slice(0, 6);
    const local = `${myAlbums.length ? `<section><h2>Mes albums</h2><ul class="songs">${myAlbums.map(a => `<li class="song"><a class="main" href="#/album/${a.id}"><div style="min-width:0"><div class="t">${esc(a.title)}</div><div class="a">${esc(a.artist)}</div></div></a></li>`).join('')}</ul></section>` : ''}
      ${mine.length ? `<section><h2>Mes morceaux</h2><ul class="songs">${mine.map(s => `<li class="song"><a class="main" href="#/morceau/${s.id}"><div style="min-width:0"><div class="t">${esc(s.title)}</div><div class="a">${esc(s.artist)}</div></div></a></li>`).join('')}</ul></section>` : ''}`;
    const wait = navigator.onLine ? 'Recherche…' : 'Hors connexion : recherche en ligne indisponible.';
    out.innerHTML = `${local}<section><h2>Titres</h2><div id="s-trk" class="muted small">${wait}</div></section>
      <section><h2>Artistes</h2><div id="s-art" class="muted small">${wait}</div></section>
      <section><h2>Albums</h2><div id="s-alb" class="muted small">${wait}</div></section>`;
    if (!navigator.onLine) return;
    const my = ++token;
    const fill = async (sel, load, html, bind) => {
      try {
        const list = await load(q);
        if (my !== token) return;
        const el = out.querySelector(sel);
        el.outerHTML = list.length ? html(list) : '<p class="muted small">Aucun résultat.</p>';
        if (list.length && bind) bind(list);
      } catch (e) { if (my === token) out.querySelector(sel).textContent = e.message; }
    };
    fill('#s-trk', searchTracks, list => `<ul class="songs" id="s-trk-l">${list.map((t, i) => `<li class="song"><button type="button" class="main" data-t="${i}">
        <img class="cover" src="${esc(t.thumb)}" alt="" width="48" height="48" loading="lazy"><div style="min-width:0"><div class="t">${esc(t.title)}</div><div class="a">${esc(t.artist)}${t.album ? ' · ' + esc(t.album) : ''}</div></div></button></li>`).join('')}</ul>`,
      list => out.querySelectorAll('[data-t]').forEach(b => b.onclick = () => openNowPlaying(list[+b.dataset.t])));
    fill('#s-art', searchArtists, list => `<div class="s-artists">${list.map(a => `<a href="#/artiste/${a.id}"><img src="${esc(a.picture)}" alt="" width="88" height="88" loading="lazy"><span>${esc(a.name)}</span></a>`).join('')}</div>`);
    fill('#s-alb', searchAlbums, list => `<div class="releases">${list.map((a, i) => `<div class="release"><button type="button" data-al="${i}" aria-label="Importer ${esc(a.title)}">
        <img src="${esc(a.thumb)}" alt="" width="250" height="250" loading="lazy"><span class="r-t">${esc(a.title)}</span><span class="r-m">${esc(a.artist)}</span></button></div>`).join('')}</div>`,
      list => out.querySelectorAll('[data-al]').forEach(b => b.onclick = () => {
        const a = list[+b.dataset.al];
        try { sessionStorage.setItem('verso-disco', JSON.stringify({ id: a.artistId, name: a.artist, only: String(a.id) })); } catch {}
        go('#/ajouter/discographie');
      }));
  };
  input.oninput = () => { clearTimeout(timer); timer = setTimeout(run, 350); };
  view.querySelector('#sform').onsubmit = e => { e.preventDefault(); clearTimeout(timer); run(); input.blur(); };
  run();
  setTimeout(() => input.focus(), 50);
  return () => document.body.classList.remove('search-mode');
}
