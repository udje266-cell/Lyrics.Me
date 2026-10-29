// Recherche (loupe) : artistes (Deezer) et contenu de la bibliothèque.
import { db } from './db.js';
import { searchArtists } from './sources.js';
import { esc, norm } from './app.js';
import { liveAlbums } from './albums.js';

let lastQ = '';

export async function renderSearch() {
  const view = document.getElementById('view');
  document.body.classList.add('search-mode');
  view.innerHTML = `<form class="search-bar" id="sform" role="search">
      <button type="button" class="icon-btn ghost" onclick="history.back()" aria-label="Retour">←</button>
      <input type="search" id="sq" name="q" value="${esc(lastQ)}" placeholder="Artiste, titre, album ou paroles…" aria-label="Rechercher" autocomplete="off" enterkeyhint="search">
    </form>
    <div id="sres"></div>`;
  const songs = (await db.all('songs')).filter(s => !s.deletedAt);
  const albums = await liveAlbums();
  const input = view.querySelector('#sq'), out = view.querySelector('#sres');
  let timer = 0, token = 0;
  const run = async () => {
    const q = input.value.trim(); lastQ = q;
    const n = norm(q);
    if (!q) { out.innerHTML = '<p class="muted small" style="margin-top:20px">Cherchez un artiste pour voir sa biographie et sa discographie, ou un mot de vos paroles.</p>'; return; }
    const mine = songs.filter(s => norm(s.title + ' ' + s.artist).includes(n) || norm(s.lyrics).includes(n)).slice(0, 8);
    const myAlbums = albums.filter(a => norm(a.title + ' ' + a.artist).includes(n)).slice(0, 6);
    const local = `${myAlbums.length ? `<section><h2>Mes albums</h2><ul class="songs">${myAlbums.map(a => `<li class="song"><a class="main" href="#/album/${a.id}"><div style="min-width:0"><div class="t">${esc(a.title)}</div><div class="a">${esc(a.artist)}</div></div></a></li>`).join('')}</ul></section>` : ''}
      ${mine.length ? `<section><h2>Mes morceaux</h2><ul class="songs">${mine.map(s => `<li class="song"><a class="main" href="#/morceau/${s.id}"><div style="min-width:0"><div class="t">${esc(s.title)}</div><div class="a">${esc(s.artist)}</div></div></a></li>`).join('')}</ul></section>` : ''}`;
    out.innerHTML = `<section><h2>Artistes</h2><div id="s-art" class="muted small">${navigator.onLine ? 'Recherche…' : 'Hors connexion : recherche d\'artistes indisponible.'}</div></section>${local}`;
    if (!navigator.onLine) return;
    const my = ++token;
    try {
      const list = await searchArtists(q);
      if (my !== token) return;
      out.querySelector('#s-art').outerHTML = list.length ? `<div class="s-artists">${list.map(a => `<a href="#/artiste/${a.id}"><img src="${esc(a.picture)}" alt="" width="88" height="88" loading="lazy"><span>${esc(a.name)}</span></a>`).join('')}</div>`
        : '<p class="muted small">Aucun artiste trouvé.</p>';
    } catch (e) { if (my === token) out.querySelector('#s-art').textContent = e.message; }
  };
  input.oninput = () => { clearTimeout(timer); timer = setTimeout(run, 350); };
  view.querySelector('#sform').onsubmit = e => { e.preventDefault(); clearTimeout(timer); run(); input.blur(); };
  run();
  setTimeout(() => input.focus(), 50);
  return () => document.body.classList.remove('search-mode');
}
