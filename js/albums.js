// Albums : fiche d'album (titre, artiste, année, pochette) et ses morceaux.
import { db, uid } from './db.js';
import { compressImage } from './render.js';
import { esc, norm, toast, safe, go, openDialog, confirmDialog, blobUrl, pickArtwork } from './app.js';

const $ = (s, r = document.getElementById('view')) => r.querySelector(s);
const $$ = (s, r = document.getElementById('view')) => [...r.querySelectorAll(s)];

export const liveAlbums = async () => (await db.all('albums')).filter(a => !a.deletedAt);

export const albumCover = (a, cls = 'cover') => a.cover
  ? `<img class="${cls}" src="${blobUrl('album-' + a.id + a.updatedAt, a.cover)}" alt="">`
  : `<span class="${cls}">💿</span>`;

const sortTracks = list => list.sort((a, b) => (a.trackNo || 999) - (b.trackNo || 999) || a.createdAt - b.createdAt);

// Rattache un morceau à l'album existant du même nom et du même artiste (et reprend sa pochette).
export async function attachAlbum(song) {
  if (!song.album) { delete song.albumId; return; }
  const a = (await liveAlbums()).find(x => norm(x.title) === norm(song.album) && norm(x.artist) === norm(song.artist));
  if (!a) { delete song.albumId; return; }
  song.albumId = a.id;
  if (!song.cover && a.cover) song.cover = a.cover;
}

export function albumRow(a, count) {
  return `<li class="song"><a class="main" href="#/album/${a.id}">${albumCover(a)}<div style="min-width:0">
    <div class="t">${esc(a.title)}</div><div class="a">${esc(a.artist)}${a.year ? ' · ' + esc(a.year) : ''} · ${count} morceau${count > 1 ? 'x' : ''}</div></div></a></li>`;
}

// --- Formulaire d'album ---------------------------------------------------

function trackBlock(i, t = {}) {
  return `<div class="card-box field" data-track="${i}">
    <div class="row spread"><h3 style="margin:0">Morceau <span data-num>${i + 1}</span></h3><button type="button" class="icon-btn ghost danger" data-rmtrack aria-label="Retirer ce morceau">✕</button></div>
    <div class="grid2" style="margin-top:8px"><div><label>Titre *</label><input data-f="title" value="${esc(t.title)}" required></div>
      <div><label>Artistes invités</label><input data-f="featuring" value="${esc(t.featuring)}"></div></div>
    <div style="margin-top:8px"><div class="row spread"><label>Paroles</label>
      <label class="btn ghost small" style="margin:0;color:var(--accent)">Importer un .txt<input type="file" data-txt accept=".txt,text/plain" hidden></label></div>
      <textarea data-f="lyrics" style="min-height:140px" placeholder="Collez les paroles (ou laissez vide pour plus tard)">${esc(t.lyrics)}</textarea></div>
  </div>`;
}

async function readTxt(f) {
  let text = await f.text();
  if (text.includes('�')) text = new TextDecoder('windows-1252').decode(await f.arrayBuffer());
  return text.replace(/\r\n?/g, '\n');
}

export async function renderAlbumForm(id) {
  const view = document.getElementById('view');
  const album = id ? await db.get('albums', id) : {};
  if (id && !album) return go('#/bibliotheque');
  const tracks = id ? sortTracks((await db.all('songs')).filter(s => s.albumId === id && !s.deletedAt)) : [];
  let cover = album.cover || null;
  view.innerHTML = `<h1>${id ? 'Modifier l\'album' : 'Ajouter un album'}</h1>
    ${id ? '' : `<div class="seg" style="margin-bottom:18px">${[['manuel', 'Morceau'], ['album', 'Album'], ['recherche', 'Recherche'], ['lien', 'Lien']].map(([k, l]) => `<button type="button" data-mode="${k}" class="${k === 'album' ? 'on' : ''}">${l}</button>`).join('')}</div>`}
    <form id="albumform" class="stack" autocomplete="off">
      <div class="grid2">
        <div><label for="a-title">Titre de l'album *</label><input id="a-title" required value="${esc(album.title)}"></div>
        <div><label for="a-artist">Artiste *</label><input id="a-artist" required value="${esc(album.artist)}"></div>
        <div><label for="a-year">Année</label><input id="a-year" inputmode="numeric" value="${esc(album.year)}"></div>
        <div><label for="a-lang">Langue</label><input id="a-lang" value="${esc(album.lang || 'Français')}"></div>
        <div><label for="a-col">Collection</label><input id="a-col" value="${esc(album.collection)}"></div>
        <div><label for="a-tags">Étiquettes</label><input id="a-tags" value="${esc((album.tags || []).join(', '))}" placeholder="Séparées par des virgules"></div>
      </div>
      <div class="row" style="align-items:flex-end">
        <div id="a-cover-prev">${cover ? `<img class="cover" src="${URL.createObjectURL(cover)}" alt="">` : ''}</div>
        <div style="flex:1"><label for="a-cover">Pochette</label><input type="file" id="a-cover" accept="image/*"></div>
        <button type="button" id="a-find">🎵 Trouver la pochette</button>
      </div>
      <div><label for="a-src">Lien de la publication</label><input id="a-src" type="url" value="${esc(album.sourceUrl)}" placeholder="https://…"></div>
      <div><label for="a-note">Note personnelle</label><textarea id="a-note" style="min-height:70px">${esc(album.note)}</textarea></div>
      ${id ? `<div class="card-box"><h3>Ordre des morceaux</h3>${tracks.length ? tracks.map(t => `<div class="row" style="margin-bottom:6px"><input data-order="${t.id}" value="${t.trackNo || ''}" inputmode="numeric" style="width:64px"><span>${esc(t.title)}</span></div>`).join('') : '<p class="small muted">Aucun morceau.</p>'}
        <p class="small muted">Pour ajouter un morceau, utilisez « Ajouter un morceau » sur la page de l'album.</p></div>`
      : `<h2 style="margin-top:12px">Morceaux</h2><div id="tracks">${trackBlock(0)}</div>
        <div class="row"><button type="button" id="addtrack">＋ Ajouter un morceau</button>
          <label class="btn" style="margin:0;color:inherit">Importer plusieurs .txt<input type="file" id="multitxt" accept=".txt,text/plain" multiple hidden></label></div>
        <p class="small muted">Chaque fichier .txt devient un morceau (son nom de fichier sert de titre). La pochette de l'album est reprise par chaque morceau.</p>`}
      <div class="row" style="justify-content:flex-end"><button type="button" class="ghost" onclick="history.back()">Annuler</button><button class="primary">${id ? 'Enregistrer' : 'Ajouter l\'album'}</button></div>
    </form>`;
  $$('[data-mode]').forEach(b => b.onclick = () => go('#/ajouter/' + b.dataset.mode));
  $('#a-cover').onchange = async e => {
    const f = e.target.files[0]; if (!f) return;
    try { cover = await compressImage(f, 1200); $('#a-cover-prev').innerHTML = `<img class="cover" src="${URL.createObjectURL(cover)}" alt="">`; }
    catch (err) { toast(err.message, { err: true }); }
  };
  $('#a-find').onclick = async () => {
    const firstTrack = view.querySelector('[data-f=title]');
    const r = await pickArtwork(firstTrack ? firstTrack.value.trim() : '', $('#a-artist').value.trim());
    if (r) { cover = r.blob; $('#a-cover-prev').innerHTML = `<img class="cover" src="${URL.createObjectURL(cover)}" alt="">`; }
  };
  const renumber = () => $$('[data-track]').forEach((el, i) => { el.querySelector('[data-num]').textContent = i + 1; });
  const bindTrack = el => {
    el.querySelector('[data-rmtrack]').onclick = () => { if ($$('[data-track]').length > 1) { el.remove(); renumber(); } };
    el.querySelector('[data-txt]').onchange = async e => {
      const f = e.target.files[0]; if (!f) return;
      el.querySelector('[data-f=lyrics]').value = await readTxt(f);
      const t = el.querySelector('[data-f=title]'); if (!t.value) t.value = f.name.replace(/\.txt$/i, '');
    };
  };
  const addTrack = t => {
    const wrap = document.createElement('div');
    wrap.innerHTML = trackBlock($$('[data-track]').length, t);
    const el = wrap.firstElementChild; $('#tracks').append(el); bindTrack(el); return el;
  };
  if (!id) {
    $$('[data-track]').forEach(bindTrack);
    $('#addtrack').onclick = () => addTrack().querySelector('[data-f=title]').focus();
    $('#multitxt').onchange = async e => {
      const files = [...e.target.files].sort((a, b) => a.name.localeCompare(b.name, 'fr', { numeric: true }));
      for (const f of files) {
        const title = f.name.replace(/\.txt$/i, '').replace(/^\d+\s*[-._)]\s*/, '');
        const empty = $$('[data-track]').find(el => !el.querySelector('[data-f=title]').value && !el.querySelector('[data-f=lyrics]').value);
        const el = empty || addTrack();
        el.querySelector('[data-f=title]').value = title;
        el.querySelector('[data-f=lyrics]').value = await readTxt(f);
      }
      toast(`${files.length} fichier(s) importé(s) : vérifiez les titres.`);
    };
  }

  $('#albumform').onsubmit = async e => {
    e.preventDefault();
    const now = Date.now();
    const a = {
      ...album, id: album.id || uid(),
      title: $('#a-title').value.trim(), artist: $('#a-artist').value.trim(), year: $('#a-year').value.trim(),
      lang: $('#a-lang').value.trim(), collection: $('#a-col').value.trim(),
      tags: [...new Set($('#a-tags').value.split(',').map(t => t.trim()).filter(Boolean))],
      sourceUrl: $('#a-src').value.trim(), note: $('#a-note').value.trim(), cover,
      createdAt: album.createdAt || now, updatedAt: now,
    };
    const dup = (await liveAlbums()).find(o => o.id !== a.id && norm(o.title) === norm(a.title) && norm(o.artist) === norm(a.artist));
    if (dup && !await confirmDialog(`L'album « ${dup.title} » de ${dup.artist} existe déjà. L'ajouter quand même ?`, 'Ajouter quand même')) return;
    await safe(() => db.put('albums', a));
    if (!id) {
      const existing = await db.all('songs');
      let n = 0;
      for (const [i, el] of $$('[data-track]').entries()) {
        const title = el.querySelector('[data-f=title]').value.trim();
        if (!title) continue;
        const dupSong = existing.find(o => !o.deletedAt && norm(o.title) === norm(title) && norm(o.artist) === norm(a.artist));
        if (dupSong) { dupSong.album = a.title; dupSong.albumId = a.id; dupSong.trackNo = i + 1; if (!dupSong.cover) dupSong.cover = a.cover; dupSong.updatedAt = now; await safe(() => db.put('songs', dupSong)); n++; continue; }
        await safe(() => db.put('songs', {
          id: uid(), title, artist: a.artist, featuring: el.querySelector('[data-f=featuring]').value.trim(),
          album: a.title, albumId: a.id, trackNo: i + 1,
          lyrics: el.querySelector('[data-f=lyrics]').value.replace(/\r\n?/g, '\n').replace(/\s+$/, ''),
          lang: a.lang, collection: a.collection, tags: a.tags, sourceUrl: a.sourceUrl, note: '', cover: a.cover,
          createdAt: now + i, updatedAt: now + i,
        }));
        n++;
      }
      toast(`Album ajouté avec ${n} morceau${n > 1 ? 'x' : ''}`);
    } else {
      // Propage les changements aux morceaux de l'album.
      for (const t of tracks) {
        const ord = view.querySelector(`[data-order="${t.id}"]`);
        t.trackNo = ord && ord.value ? parseInt(ord.value, 10) || null : t.trackNo;
        t.album = a.title;
        if (!t.cover || t.cover === album.cover) t.cover = a.cover;
        t.updatedAt = now;
        await safe(() => db.put('songs', t));
      }
      toast('Album enregistré');
    }
    go('#/album/' + a.id);
  };
}

// --- Page d'un album ------------------------------------------------------

export async function renderAlbum(id) {
  const view = document.getElementById('view');
  const a = await db.get('albums', id);
  if (!a || a.deletedAt) { view.innerHTML = '<div class="empty">Cet album n\'existe plus.<br><br><a href="#/bibliotheque">Bibliothèque</a></div>'; return; }
  const tracks = sortTracks((await db.all('songs')).filter(s => s.albumId === id && !s.deletedAt));
  view.innerHTML = `
    <div class="song-head">${albumCover(a)}<div style="min-width:0">
      <div class="small muted">Album</div><h1 style="margin-bottom:4px">${esc(a.title)}</h1>
      <div class="muted">${esc(a.artist)}${a.year ? ' · ' + esc(a.year) : ''} · ${tracks.length} morceau${tracks.length > 1 ? 'x' : ''}</div></div></div>
    <div class="row" style="margin-bottom:14px">
      <button class="primary" id="addsong">＋ Ajouter un morceau</button>
      <a class="btn" href="#/album/${id}/modifier">Modifier l'album</a>
      ${a.sourceUrl ? `<a class="btn" href="${esc(a.sourceUrl)}" target="_blank" rel="noopener">Source ↗</a>` : ''}
      <button class="ghost danger" id="delalbum">Supprimer</button>
    </div>
    ${a.note ? `<div class="notice" style="margin-bottom:16px">${esc(a.note)}</div>` : ''}
    <ul class="songs">${tracks.map((t, i) => `<li class="song"><span class="muted" style="width:28px;text-align:right">${t.trackNo || i + 1}</span>
      <a class="main" href="#/morceau/${t.id}"><div style="min-width:0"><div class="t">${esc(t.title)}</div>
      <div class="a">${t.featuring ? 'feat. ' + esc(t.featuring) + ' · ' : ''}${t.lyrics && t.lyrics.trim() ? '' : '<span style="color:var(--danger)">paroles à ajouter</span>'}</div></div></a></li>`).join('') || '<div class="empty">Aucun morceau dans cet album.</div>'}</ul>`;
  $('#addsong').onclick = () => {
    try { sessionStorage.setItem('verso-prefill', JSON.stringify({ album: a.title, artist: a.artist, albumId: a.id, trackNo: tracks.length + 1, lang: a.lang, collection: a.collection, tags: a.tags })); } catch {}
    go('#/ajouter/manuel');
  };
  $('#delalbum').onclick = async () => {
    const v = await openDialog(`<form method="dialog"><h3>Supprimer « ${esc(a.title)} » ?</h3><p class="small">Les cartes déjà créées sont conservées dans tous les cas.</p>
      <div class="stack"><button value="album" style="width:100%">Supprimer l'album seulement (garder les morceaux)</button>
      <button value="all" class="danger" style="width:100%">Album et morceaux (mis à la corbeille)</button><button value="" class="ghost" style="width:100%">Annuler</button></div></form>`);
    if (!v) return;
    const now = Date.now();
    for (const t of tracks) {
      if (v === 'all') t.deletedAt = now; else delete t.albumId;
      t.updatedAt = now; await safe(() => db.put('songs', t));
    }
    a.deletedAt = now; a.updatedAt = now; await safe(() => db.put('albums', a));
    toast(v === 'all' ? 'Album et morceaux mis à la corbeille' : 'Album supprimé, morceaux conservés');
    go('#/bibliotheque');
  };
}
