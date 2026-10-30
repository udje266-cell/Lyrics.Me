import { db, uid, exportBackup, importBackup } from './db.js';
import { searchLyrics, importFromUrl, findArtwork, fetchImage, findLyrics } from './sources.js';
import { compressImage, lightLogoURL } from './render.js';
import { mountStudio, newCard } from './studio.js';
import { renderAlbumForm, renderAlbum, attachAlbum, liveAlbums, albumRow } from './albums.js';
import { renderDiscography } from './discography.js';
import { renderArtist, renderArtistByName, artistHref } from './artists.js';
import { renderProfile } from './profile.js';
import { renderSearch } from './search.js';
import { loadNews, loadCharts, newsAvailable } from './feeds.js';

// --- Utilitaires ----------------------------------------------------------

const view = document.getElementById('view');
const $ = (s, r = view) => r.querySelector(s);
const $$ = (s, r = view) => [...r.querySelectorAll(s)];
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const norm = s => String(s || '').toLocaleLowerCase('fr').replace(/œ/g, 'oe').replace(/æ/g, 'ae').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[’']/g, "'").replace(/\s+/g, ' ').trim();
const fmtDate = t => new Date(t).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });

const recentToasts = new Map();
export function toast(msg, opts = {}) {
  // Un même message n'est jamais empilé : il n'est réaffiché qu'après 6 s.
  const now = Date.now();
  if (now - (recentToasts.get(msg) || 0) < 6000) return;
  recentToasts.set(msg, now);
  const el = document.createElement('div');
  el.className = 'toast' + (opts.err ? ' err' : '');
  el.innerHTML = `<span>${esc(msg)}</span>`;
  if (opts.action) {
    const b = document.createElement('button');
    b.textContent = opts.action.label;
    b.onclick = () => { opts.action.run(); el.remove(); };
    el.append(b);
  }
  document.getElementById('toasts').append(el);
  setTimeout(() => el.remove(), opts.duration || (opts.err ? 7000 : opts.action ? 6000 : 2800));
}

// Enveloppe les écritures : toute erreur de stockage est affichée clairement.
export async function safe(fn) {
  try { return await fn(); }
  catch (e) { console.error(e); toast(e.message || String(e), { err: true }); throw e; }
}

const dialog = document.getElementById('dialog');
export function openDialog(html, bind) {
  dialog.innerHTML = html;
  dialog.showModal();
  bind && bind(dialog);
  return new Promise(res => { dialog.onclose = () => res(dialog.returnValue); });
}
export function confirmDialog(message, okLabel = 'Confirmer', danger = false) {
  return openDialog(`<form method="dialog"><p>${esc(message)}</p><div class="row" style="justify-content:flex-end">
    <button value="no">Annuler</button><button value="ok" class="${danger ? 'danger' : 'primary'}">${esc(okLabel)}</button></div></form>`).then(v => v === 'ok');
}

// Fenêtre de choix d'une image d'artiste ou d'album (Deezer). Renvoie { blob, label } ou null.
const artworkCache = new Map();
export async function pickArtwork(title, artist) {
  let chosen = null;
  const key = (title || '') + '|' + (artist || '');
  const p = openDialog(`<form method="dialog"><h3>Images de l'artiste et de l'album</h3><div id="aw" class="small muted">Recherche de « ${esc(title || '')} » — ${esc(artist || '')}…</div>
    <div class="row" style="justify-content:flex-end;margin-top:12px"><button value="">Fermer</button></div></form>`);
  const box = dialog.querySelector('#aw');
  try {
    if (!artist && !title) throw new Error('Renseignez au moins le nom de l\'artiste.');
    const res = artworkCache.get(key) || await findArtwork(title, artist);
    artworkCache.set(key, res);
    if (!res.images.length) box.innerHTML = `<div class="notice">Aucune image trouvée pour cet artiste sur Deezer. Vérifiez l'orthographe du nom, ou utilisez une photo de votre galerie.</div>`;
    else {
      box.innerHTML = `<p>Reconnu : <b>${esc(res.artist || '')}</b>${res.album ? ' · album « ' + esc(res.album) + ' »' : ''}</p>
        <div class="gallery" style="grid-template-columns:repeat(auto-fill,minmax(96px,1fr))">${res.images.map((im, i) => `<button type="button" class="tile" data-aw="${i}" style="padding:0">
        <img src="${esc(im.thumb)}" alt="" loading="lazy"><div>${im.kind === 'artist' ? '👤 ' : '💿 '}${esc(im.label)}</div></button>`).join('')}</div>
        <p class="small muted">Images fournies par Deezer, pour un usage personnel. Leurs droits appartiennent aux artistes et à leurs labels.</p>`;
      box.querySelectorAll('[data-aw]').forEach(b => b.onclick = async () => {
        const im = res.images[+b.dataset.aw];
        b.style.opacity = .5;
        try { chosen = { blob: await compressImage(await fetchImage(im.url)), label: im.label + ' (Deezer)' }; dialog.close(); }
        catch (e) { toast(e.message, { err: true }); b.style.opacity = 1; }
      });
    }
  } catch (e) { box.innerHTML = `<div class="notice err">${esc(e.message)}</div>`; }
  await p;
  return chosen;
}

const urlCache = new Map();
export function blobUrl(key, blob) {
  if (!blob) return '';
  const c = urlCache.get(key);
  if (c && c.blob === blob) return c.url;
  if (c) URL.revokeObjectURL(c.url);
  const url = URL.createObjectURL(blob);
  urlCache.set(key, { blob, url });
  return url;
}
const coverHtml = (s, cls = 'cover') => s.cover
  ? `<img class="${cls}" src="${blobUrl('song-' + s.id + s.updatedAt, s.cover)}" alt="" width="52" height="52" loading="lazy">`
  : `<span class="${cls} ph" style="--ph:${placeholderTint(s.title + s.artist)}" aria-hidden="true">“</span>`;
// Pochette de remplacement : une teinte stable par morceau, tirée des Ambiances.
const PH_TINTS = ['#4f7a2a', '#0f5c6e', '#b23a7a', '#8a1f12', '#123a7a', '#6b4b2a', '#4a1f6b'];
function placeholderTint(str) { let h = 0; for (const c of String(str)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return PH_TINTS[h % PH_TINTS.length]; }

// Dans l'application Android (APK), l'enregistrement et le partage passent par le téléphone.
export const android = window.VersoAndroid || null;
export async function blobToBase64(blob) {
  const buf = new Uint8Array(await blob.arrayBuffer());
  let bin = '';
  for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
  return btoa(bin);
}
export async function nativeFile(blob, name, share) {
  const r = android[share ? 'shareFile' : 'saveFile'](name, blob.type || 'application/octet-stream', await blobToBase64(blob));
  if (String(r).startsWith('error:')) throw new Error('Enregistrement impossible : ' + r.slice(6));
}

export function download(blob, name) {
  if (android) { nativeFile(blob, name, false).catch(e => toast(e.message, { err: true })); return; }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

const songs = async () => (await db.all('songs'));
const liveSongs = async () => (await songs()).filter(s => !s.deletedAt);

// --- Routeur --------------------------------------------------------------

let cleanup = null;
const routes = [
  [/^\/?$/, renderHome, 'home'],
  [/^\/bibliotheque$/, renderLibrary, 'library'],
  [/^\/ajouter\/album$/, () => renderAlbumForm(), 'add'],
  [/^\/ajouter\/discographie$/, renderDiscography, 'add'],
  [/^\/ajouter(?:\/(manuel|recherche|lien))?$/, renderAdd, 'add'],
  [/^\/album\/([\w]+)$/, renderAlbum, 'library'],
  [/^\/artiste\/nom\/(.+)$/, renderArtistByName, 'library'],
  [/^\/artiste\/(\d+)$/, renderArtist, 'library'],
  [/^\/album\/([\w]+)\/modifier$/, renderAlbumForm, 'library'],
  [/^\/morceau\/([\w]+)$/, renderSong, 'library'],
  [/^\/morceau\/([\w]+)\/modifier$/, renderEdit, 'library'],
  [/^\/studio\/([\w]+)$/, (id) => mountStudio(view, id), 'gallery'],
  [/^\/creations$/, renderGallery, 'gallery'],
  [/^\/reglages$/, renderSettings, 'profile'],
  [/^\/profil$/, renderProfile, 'profile'],
  [/^\/recherche$/, renderSearch, 'search'],
];

// Logo : variante au mot blanc quand l'interface est sombre.
const darkMQ = matchMedia('(prefers-color-scheme: dark)');
const isDark = () => document.documentElement.dataset.theme === 'dark' || (!document.documentElement.dataset.theme && darkMQ.matches);
async function applyLogo() {
  if (window.VersoAndroid && window.VersoAndroid.setThemeColor) window.VersoAndroid.setThemeColor(getComputedStyle(document.documentElement).getPropertyValue('--bg').trim() || '#131a11');
  const url = isDark() ? await lightLogoURL() : null;
  document.querySelectorAll('img.brand-logo').forEach(i => { i.src = url || 'icons/logo.png'; });
}
darkMQ.addEventListener('change', applyLogo);

// Les navigations sont traitées l'une après l'autre : un écran lent à charger ne peut pas
// écraser l'écran demandé ensuite.
let routing = Promise.resolve();
const route = () => { routing = routing.then(doRoute, doRoute); return routing; };

let lastHash = location.hash;
async function doRoute() {
  if (dirtyForm && location.hash !== lastHash) {
    if (!confirm('Vos modifications ne sont pas enregistrées. Quitter quand même ?')) { history.replaceState(null, '', lastHash); return; }
    dirtyForm = false;
  }
  lastHash = location.hash;
  if (cleanup) { try { cleanup(); } catch {} cleanup = null; }
  document.body.classList.remove('reading', 'studio-mode');
  const path = decodeURIComponent(location.hash.slice(1) || '/');
  for (const [re, fn, nav] of routes) {
    const m = path.match(re);
    if (m) {
      $$('.nav a', document).forEach(a => a.classList.toggle('active', a.dataset.nav === nav));
      view.innerHTML = '';
      window.scrollTo(0, 0);
      try { cleanup = (await fn(...m.slice(1))) || null; applyLogo(); }
      catch (e) { console.error(e); view.innerHTML = `<div class="notice err">Une erreur est survenue : ${esc(e.message)}</div>`; }
      return;
    }
  }
  location.hash = '#/';
}
window.addEventListener('hashchange', route);
export const go = h => { location.hash = h; };

// --- Accueil --------------------------------------------------------------

// Accueil : un vers de votre bibliothèque, mis en page comme sur une carte.
function heroHtml(all) {
  const pool = [];
  for (const so of all) for (const l of (so.lyrics || '').split('\n')) {
    const t = l.trim();
    if (t.length > 14 && t.length < 70 && !/^[\[(]/.test(t)) pool.push({ t, so });
  }
  const pick = pool.length ? pool[Math.floor(Math.random() * pool.length)] : null;
  const actions = `<div class="hero-actions"><a class="btn primary" href="#/ajouter/manuel">Ajouter des paroles</a>
      <span class="hero-links"><a href="#/ajouter/album">un album</a><a href="#/ajouter/recherche">paroles en ligne</a><a href="#/ajouter/lien">depuis un lien</a></span></div>`;
  if (!pick) return `<div class="hero"><img class="hero-logo brand-logo" src="icons/logo.png" alt="Verso" width="2172" height="724" fetchpriority="high">
      <p class="hero-lede">Gardez les paroles que vous aimez et transformez vos passages préférés en cartes.</p>${actions}</div>`;
  const words = pick.t.split(' '), mid = Math.ceil(words.length / 2);
  const lines = words.length > 5 ? [words.slice(0, mid).join(' '), words.slice(mid).join(' ')] : [pick.t];
  return `<div class="hero">
      <a class="verse" href="#/morceau/${pick.so.id}" aria-label="Ouvrir ${esc(pick.so.title)}">${lines.map(l => `<span>${esc(l)}</span>`).join('')}</a>
      <p class="verse-src">${esc(pick.so.title)}, ${esc(pick.so.artist)}</p>${actions}</div>`;
}

async function renderHome() {
  const all = await liveSongs();
  const recent = all.sort((a, b) => b.createdAt - a.createdAt).slice(0, 5);
  const cards = await db.all('cards');
  const drafts = cards.filter(c => c.draft).sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 6);
  const passages = (await db.all('passages')).sort((a, b) => b.createdAt - a.createdAt).slice(0, 4);
  view.innerHTML = `
    <div id="np"></div>
    ${heroHtml(all)}
    <section id="news" hidden></section>
    <section id="trends" hidden></section>
    ${drafts.length ? `<section><div class="page-head"><h2>Brouillons</h2><a href="#/creations">Tout voir</a></div><div class="gallery">${drafts.map(tileHtml).join('')}</div></section>` : ''}
    <section><div class="page-head"><h2>Ajoutés récemment</h2><a href="#/bibliotheque">Bibliothèque</a></div>
      ${recent.length ? `<ul class="songs">${recent.map(x => songRow(x)).join('')}</ul>` : `<div class="empty">Votre bibliothèque est vide.<br><br><a class="btn primary" href="#/ajouter">Ajouter un premier morceau</a></div>`}
    </section>
    ${passages.length ? `<section><h2>Passages favoris</h2>${passages.map(p => `<a class="card-box" style="display:block;text-decoration:none;color:inherit;margin-bottom:8px" href="#/morceau/${p.songId}">
      <div style="white-space:pre-line">${esc(p.text)}</div><div class="small muted" style="margin-top:6px">${esc(p.title)} · ${esc(p.artist)}${p.note ? ' — ' + esc(p.note) : ''}</div></a>`).join('')}</section>` : ''}`;
  bindFavs();
  drawFeeds(false);
  loadNews().then(n => drawNews(n)).catch(() => {});
  loadCharts().then(c => drawTrends(c)).catch(() => {});
  const stop = watchNowPlaying();
  return stop;
}

const ago = t => {
  if (!t) return '';
  const m = Math.round((Date.now() - t) / 60000);
  if (m < 60) return `il y a ${Math.max(1, m)} min`;
  if (m < 1440) return `il y a ${Math.round(m / 60)} h`;
  return new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' }).format(t);
};

async function drawFeeds() {
  drawNews(await db.setting('newsCache', null));
  drawTrends(await db.setting('chartsCache', null));
}

function drawNews(n) {
  const el = $('#news'); if (!el) return;
  if (!n || !n.items || !n.items.length) { el.hidden = true; return; }
  el.hidden = false;
  el.innerHTML = `<div class="page-head"><h2>Actualités</h2><span class="small muted">${ago(n.at)}</span></div>
    <div class="news">${n.items.map(i => `<a class="news-item" href="${esc(i.link)}" target="_blank" rel="noopener">
      ${i.img ? `<img src="${esc(i.img)}" alt="" loading="lazy" width="260" height="146">` : '<span class="news-ph" aria-hidden="true">“</span>'}
      <span class="news-t">${esc(i.title)}</span><span class="news-m">${esc(i.source)}${i.date ? ', ' + ago(i.date) : ''}</span></a>`).join('')}</div>`;
}

function drawTrends(c) {
  const el = $('#trends'); if (!el) return;
  if (!c || !(c.tracks || []).length) { el.hidden = true; return; }
  el.hidden = false;
  const row = (t, k) => `<li class="song"><span class="rank">${k + 1}</span><a class="main" href="#/artiste/${t.artistId}">${t.cover ? `<img class="cover" src="${esc(t.cover)}" alt="" width="52" height="52" loading="lazy">` : ''}
    <div style="min-width:0"><div class="t">${esc(t.title)}</div><div class="a">${esc(t.artist)}</div></div></a></li>`;
  el.innerHTML = `<div class="page-head"><h2>Tendances</h2><span class="small muted">Deezer</span></div>
    <div class="seg trend-tabs" style="margin-bottom:10px"><button class="on" data-tr="tracks">Top du moment</button>${(c.africa || []).length ? '<button data-tr="africa">Musique africaine</button>' : ''}</div>
    <ul class="songs" id="trend-list">${c.tracks.slice(0, 10).map(row).join('')}</ul>
    ${(c.albums || []).length ? `<h3 style="margin-top:18px">Albums du moment</h3><div class="releases">${c.albums.slice(0, 6).map(a => `<div class="release"><a href="#/artiste/${a.artistId}"><img src="${esc(a.cover)}" alt="" width="250" height="250" loading="lazy"><span class="r-t">${esc(a.title)}</span><span class="r-m">${esc(a.artist)}</span></a></div>`).join('')}</div>` : ''}`;
  el.querySelectorAll('[data-tr]').forEach(b => b.onclick = () => {
    el.querySelectorAll('[data-tr]').forEach(x => x.classList.toggle('on', x === b));
    el.querySelector('#trend-list').innerHTML = c[b.dataset.tr].slice(0, 10).map(row).join('');
  });
}

// --- Musique en cours (application Android) -------------------------------
function watchNowPlaying() {
  if (!android || !android.nowPlaying) return null;
  let last = '';
  const tick = async () => {
    const el = $('#np'); if (!el) return;
    if (!android.nowPlayingAllowed()) {
      if (await db.setting('npDismissed', false)) { el.innerHTML = ''; return; }
      el.innerHTML = `<div class="np np-off"><div><b>Afficher la musique que vous écoutez</b><br><span class="small muted">Verso peut reconnaître le titre joué par Spotify, YouTube Music, Deezer, Boomplay… pour ouvrir ses paroles en un geste.</span></div>
        <div class="row"><button class="primary" id="np-on">Activer</button><button class="ghost" id="np-no">Plus tard</button></div></div>`;
      el.querySelector('#np-on').onclick = () => android.openNowPlayingSettings();
      el.querySelector('#np-no').onclick = async () => { await db.setSetting('npDismissed', true); el.innerHTML = ''; };
      return;
    }
    let np = null;
    try { np = JSON.parse(android.nowPlaying() || 'null'); } catch {}
    const key = np && np.title ? np.title + '|' + np.artist + '|' + np.playing : '';
    if (key === last) return;
    last = key;
    if (!np || !np.title) { el.innerHTML = ''; return; }
    el.innerHTML = `<div class="np"><span class="np-eq${np.playing ? ' on' : ''}" aria-hidden="true"><i></i><i></i><i></i></span>
      <div style="min-width:0;flex:1"><span class="small muted">${np.playing ? 'En écoute' : 'En pause'} sur ${esc(np.app || 'une application')}</span>
      <div class="np-t">${esc(np.title)}</div><div class="small muted">${esc(np.artist || '')}</div></div>
      <button class="primary" id="np-ly">Paroles</button></div>`;
    el.querySelector('#np-ly').onclick = () => openNowPlaying(np);
  };
  tick();
  const t = setInterval(tick, 8000);
  const vis = () => { if (!document.hidden) tick(); };
  document.addEventListener('visibilitychange', vis);
  return () => { clearInterval(t); document.removeEventListener('visibilitychange', vis); };
}

async function openNowPlaying(np) {
  const artist = String(np.artist || '').split(/,|&| feat\.? | ft\.? /i)[0].trim();
  const mine = (await liveSongs()).find(s => norm(s.title) === norm(np.title) && (!artist || norm(s.artist) === norm(artist)));
  if (mine) return go('#/morceau/' + mine.id);
  const btn = $('#np-ly'); if (btn) { btn.disabled = true; btn.textContent = 'Recherche…'; }
  let r = null;
  try { r = await findLyrics(np.title, artist, np.album || '', 0); } catch {}
  const pre = { title: np.title, artist, album: np.album || '', lyrics: r ? r.lyrics : '', sourceName: r ? 'LRCLIB' : '', sourceUrl: r ? r.sourceUrl : '' };
  try { sessionStorage.setItem('verso-prefill', JSON.stringify(pre)); } catch {}
  if (!r) toast('Paroles introuvables sur LRCLIB : collez-les pour ajouter ce titre.');
  go('#/ajouter/manuel');
}


function tileHtml(c) {
  return `<a class="tile" href="#/studio/${c.id}">${c.thumb ? `<img src="${blobUrl('thumb-' + c.id + c.updatedAt, c.thumb)}" alt="Aperçu de la carte" width="324" height="324" loading="lazy">` : '<img alt="">'}
    <div>${c.draft ? '<span class="badge">Brouillon · </span>' : ''}<b>${esc(c.title || 'Sans titre')}</b><br><span class="muted">${esc(c.artist || '')}</span></div></a>`;
}

const hasLyrics = s => !!(s.lyrics && s.lyrics.trim());

function songRow(s, extra = '') {
  return `<li class="song"><a class="main" href="#/morceau/${s.id}">${coverHtml(s)}<div style="min-width:0">
    <div class="t">${esc(s.title)}</div><div class="a">${esc(s.artist)}${s.featuring ? ' feat. ' + esc(s.featuring) : ''}${s.album ? ' · ' + esc(s.album) : ''}</div>${hasLyrics(s) ? '' : '<div class="missing">(paroles manquantes)</div>'}${extra}</div></a>
    <button class="icon-btn ghost fav ${s.favorite ? 'on' : ''}" data-fav="${s.id}" aria-label="Favori : ${esc(s.title)}" aria-pressed="${!!s.favorite}">${s.favorite ? '★' : '☆'}</button></li>`;
}

function bindFavs() {
  $$('[data-fav]').forEach(b => b.onclick = async () => {
    const s = await db.get('songs', b.dataset.fav);
    s.favorite = !s.favorite; s.updatedAt = Date.now();
    await safe(() => db.put('songs', s));
    b.classList.toggle('on', s.favorite); b.textContent = s.favorite ? '★' : '☆'; b.setAttribute('aria-pressed', s.favorite);
  });
}

// --- Bibliothèque ---------------------------------------------------------

const lib = { q: '', sort: 'date', lang: '', collection: '', tag: '', fav: false, trash: false, albums: false, missing: false, artists: false };

async function renderLibrary() {
  const all = await songs();
  const live = all.filter(s => !s.deletedAt);
  const langs = [...new Set(live.map(s => s.lang).filter(Boolean))].sort();
  const cols = [...new Set(live.map(s => s.collection).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'fr'));
  const tags = [...new Set(live.flatMap(s => s.tags || []))].sort((a, b) => a.localeCompare(b, 'fr'));
  const trashCount = all.length - live.length;
  view.innerHTML = `
    <div class="page-head"><h1>Ma bibliothèque</h1><a class="btn primary" href="#/ajouter">＋ Ajouter</a></div>
    <div class="field"><input type="search" id="q" aria-label="Rechercher dans la bibliothèque" name="recherche" placeholder="Titre, artiste, album ou phrase des paroles…" value="${esc(lib.q)}" autocomplete="off"></div>
    <div class="chips" style="margin-bottom:8px">
      <button class="chip ${lib.artists ? 'on' : ''}" id="f-artists">Artistes</button>
      <button class="chip ${lib.albums ? 'on' : ''}" id="f-albums">💿 Albums</button>
      <button class="chip ${lib.fav ? 'on' : ''}" id="f-fav">★ Favoris</button>
      ${live.some(x => !hasLyrics(x)) ? `<button class="chip ${lib.missing ? 'on' : ''}" id="f-missing">Paroles manquantes (${live.filter(x => !hasLyrics(x)).length})</button>` : ''}
      ${cols.map(c => `<button class="chip ${lib.collection === c ? 'on' : ''}" data-col="${esc(c)}">${esc(c)}</button>`).join('')}
    </div>
    <div class="row" style="margin-bottom:12px">
      <select id="sort" style="width:auto"><option value="date">Date d'ajout</option><option value="title">Titre</option><option value="artist">Artiste</option></select>
      ${langs.length ? `<select id="lang" style="width:auto"><option value="">Toutes langues</option>${langs.map(l => `<option ${lib.lang === l ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>` : ''}
      ${tags.length ? `<select id="tag" style="width:auto"><option value="">Toutes étiquettes</option>${tags.map(t => `<option ${lib.tag === t ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select>` : ''}
      <button class="chip ${lib.trash ? 'on' : ''}" id="f-trash">Corbeille (${trashCount})</button>
    </div>
    <div id="count" class="small muted"></div>
    <ul class="songs" id="list"></ul>`;
  $('#sort').value = lib.sort;

  const albums = await liveAlbums();
  const draw = () => {
    const q = norm(lib.q);
    if (lib.artists) {
      const counts = new Map();
      for (const x of live) { const k = x.artist.trim(); if (k) counts.set(k, (counts.get(k) || 0) + 1); }
      const list = [...counts].filter(([n]) => !q || norm(n).includes(q)).sort((a, b) => a[0].localeCompare(b[0], 'fr'));
      $('#count').textContent = `${list.length} artiste${list.length > 1 ? 's' : ''}`;
      $('#list').innerHTML = list.map(([n, c]) => `<li class="song"><a class="main" href="${artistHref(n)}"><span class="cover ph" style="--ph:${placeholderTint(n)};border-radius:50%" aria-hidden="true">“</span>
        <div style="min-width:0"><div class="t">${esc(n)}</div><div class="a">${c} titre${c > 1 ? 's' : ''}</div></div></a></li>`).join('') || '<div class="empty">Aucun artiste.</div>';
      return;
    }
    if (lib.albums) {
      const list = albums.filter(a => !q || norm([a.title, a.artist, a.year].join(' ')).includes(q)).sort((a, b) => lib.sort === 'title' ? a.title.localeCompare(b.title, 'fr') : lib.sort === 'artist' ? a.artist.localeCompare(b.artist, 'fr') : b.createdAt - a.createdAt);
      $('#count').textContent = `${list.length} album${list.length > 1 ? 's' : ''}`;
      $('#list').innerHTML = list.map(a => albumRow(a, live.filter(x => x.albumId === a.id).length)).join('') || `<div class="empty">Aucun album.<br><br><a class="btn primary" href="#/ajouter/album">Ajouter un album</a></div>`;
      return;
    }
    let list = lib.trash ? all.filter(s => s.deletedAt) : live;
    if (!lib.trash) {
      if (lib.fav) list = list.filter(s => s.favorite);
      if (lib.missing) list = list.filter(s => !hasLyrics(s));
      if (lib.collection) list = list.filter(s => s.collection === lib.collection);
      if (lib.lang) list = list.filter(s => s.lang === lib.lang);
      if (lib.tag) list = list.filter(s => (s.tags || []).includes(lib.tag));
    }
    const rows = [];
    for (const s of list) {
      if (!q) { rows.push({ s }); continue; }
      const meta = norm([s.title, s.artist, s.featuring, s.album].join(' '));
      if (meta.includes(q)) { rows.push({ s }); continue; }
      const line = (s.lyrics || '').split('\n').find(l => norm(l).includes(q));
      if (line) rows.push({ s, line });
      else if (norm(s.lyrics).includes(q)) rows.push({ s, line: '' });
    }
    const cmp = { date: (a, b) => b.s.createdAt - a.s.createdAt, title: (a, b) => a.s.title.localeCompare(b.s.title, 'fr'), artist: (a, b) => a.s.artist.localeCompare(b.s.artist, 'fr') || a.s.title.localeCompare(b.s.title, 'fr') }[lib.sort];
    rows.sort(cmp);
    $('#count').textContent = `${rows.length} morceau${rows.length > 1 ? 'x' : ''}${lib.trash ? ' dans la corbeille' : ''}`;
    const hl = line => {
      const i = norm(line).indexOf(q);
      // norm() garde la même longueur pour les caractères latins courants : surlignage approximatif suffisant.
      return i < 0 ? esc(line) : esc(line.slice(0, i)) + '<mark>' + esc(line.slice(i, i + q.length)) + '</mark>' + esc(line.slice(i + q.length));
    };
    $('#list').innerHTML = rows.length ? rows.map(({ s, line }) => lib.trash
      ? `<li class="song">${coverHtml(s)}<div style="flex:1;min-width:0"><div class="t">${esc(s.title)}</div><div class="a">${esc(s.artist)} · supprimé le ${fmtDate(s.deletedAt)}</div></div>
         <button data-restore="${s.id}">Restaurer</button><button class="icon-btn danger" data-purge="${s.id}" aria-label="Supprimer définitivement">✕</button></li>`
      : songRow(s, line ? `<div class="match">« ${hl(line)} »</div>` : '')).join('')
      : `<div class="empty">${lib.trash ? 'La corbeille est vide.' : all.length ? 'Aucun morceau ne correspond.' : 'Aucun morceau pour le moment.'}</div>`;
    bindFavs();
    $$('[data-restore]').forEach(b => b.onclick = async () => {
      const s = all.find(x => x.id === b.dataset.restore); delete s.deletedAt; s.updatedAt = Date.now();
      await safe(() => db.put('songs', s)); toast('Morceau restauré'); renderLibrary();
    });
    $$('[data-purge]').forEach(b => b.onclick = async () => {
      if (!await confirmDialog('Supprimer définitivement ce morceau ? Les cartes déjà créées sont conservées.', 'Supprimer', true)) return;
      await safe(() => db.del('songs', b.dataset.purge)); renderLibrary();
    });
  };
  draw();
  $('#q').oninput = e => { lib.q = e.target.value; draw(); };
  $('#sort').onchange = e => { lib.sort = e.target.value; draw(); };
  if ($('#lang')) $('#lang').onchange = e => { lib.lang = e.target.value; draw(); };
  if ($('#tag')) $('#tag').onchange = e => { lib.tag = e.target.value; draw(); };
  $('#f-fav').onclick = () => { lib.fav = !lib.fav; lib.albums = false; renderLibrary(); };
  $('#f-albums').onclick = () => { lib.albums = !lib.albums; lib.artists = false; renderLibrary(); };
  $('#f-artists').onclick = () => { lib.artists = !lib.artists; lib.albums = false; renderLibrary(); };
  if ($('#f-missing')) $('#f-missing').onclick = () => { lib.missing = !lib.missing; lib.albums = false; renderLibrary(); };
  $('#f-trash').onclick = () => { lib.trash = !lib.trash; renderLibrary(); };
  $$('[data-col]').forEach(b => b.onclick = () => { lib.collection = lib.collection === b.dataset.col ? '' : b.dataset.col; renderLibrary(); });
}

// --- Ajout ----------------------------------------------------------------

async function songForm(song, { submitLabel, intro = '' } = {}) {
  const live = await liveSongs();
  const albums = await liveAlbums();
  const cols = [...new Set(live.map(s => s.collection).filter(Boolean).concat(['Amour', 'Gospel', 'Rap ivoirien', 'Motivation', 'Nostalgie']))];
  const tags = [...new Set(live.flatMap(s => s.tags || []))];
  return `${intro}
  <form id="songform" class="stack" autocomplete="off">
    <div class="grid2">
      <div><label for="f-title">Titre *</label><input id="f-title" required value="${esc(song.title)}"></div>
      <div><label for="f-artist">Artiste *</label><input id="f-artist" required value="${esc(song.artist)}"></div>
      <div><label for="f-feat">Artistes invités</label><input id="f-feat" value="${esc(song.featuring)}" placeholder="Séparés par des virgules"></div>
      <div><label for="f-album">Album</label><input id="f-album" list="dl-album" value="${esc(song.album)}">
        <datalist id="dl-album">${albums.map(a => `<option value="${esc(a.title)}">${esc(a.artist)}</option>`).join('')}</datalist></div>
    </div>
    <div>
      <div class="row spread"><label for="f-lyrics">Paroles *</label>
        <label class="btn ghost small" style="margin:0;color:var(--accent)">Importer un .txt<input type="file" id="f-txt" accept=".txt,text/plain" hidden></label></div>
      <textarea id="f-lyrics" ${song.missingLyrics ? '' : 'required'} placeholder="[Couplet 1]&#10;Collez les paroles ici…&#10;&#10;[Refrain]&#10;…">${esc(song.lyrics)}</textarea>
      <div class="small muted">Les paragraphes, retours à la ligne et indications comme [Refrain] sont conservés tels quels.</div>
    </div>
    <div class="grid2">
      <div><label for="f-lang">Langue</label><input id="f-lang" list="dl-lang" value="${esc(song.lang || 'Français')}">
        <datalist id="dl-lang">${['Français', 'Anglais', 'Nouchi', 'Espagnol', 'Portugais', 'Lingala', 'Dioula', 'Wolof', 'Yoruba', 'Plusieurs'].map(l => `<option>${l}</option>`).join('')}</datalist></div>
      <div><label for="f-col">Collection</label><input id="f-col" list="dl-col" value="${esc(song.collection)}" placeholder="Ex. Gospel">
        <datalist id="dl-col">${cols.map(c => `<option>${esc(c)}</option>`).join('')}</datalist></div>
    </div>
    <div><label for="f-tags">Étiquettes</label><input id="f-tags" value="${esc((song.tags || []).join(', '))}" placeholder="Séparées par des virgules${tags.length ? ' — ex. ' + esc(tags.slice(0, 3).join(', ')) : ''}"></div>
    <div><label for="f-src">Lien vers la publication d'origine</label><input id="f-src" type="url" value="${esc(song.sourceUrl)}" placeholder="https://…">
      ${song.sourceName ? `<div class="small muted" style="margin-top:4px">Source des paroles : ${esc(song.sourceName)}</div>` : ''}</div>
    <div class="row" style="align-items:flex-end">
      <div id="cover-prev">${song.cover ? `<img class="cover" src="${URL.createObjectURL(song.cover)}" alt="Pochette" width="52" height="52">` : ''}</div>
      <div style="flex:1"><label for="f-cover">Pochette ou image</label><input type="file" id="f-cover" accept="image/*"></div>
      <button type="button" id="f-findcover">🎵 Trouver la pochette</button>
      ${song.cover ? '<button type="button" id="f-nocover" class="ghost">Retirer</button>' : ''}
    </div>
    <div><label for="f-note">Note personnelle</label><textarea id="f-note" style="min-height:80px">${esc(song.note)}</textarea></div>
    <div class="row" style="justify-content:flex-end"><button type="button" class="ghost" onclick="history.back()">Annuler</button><button class="primary">${esc(submitLabel)}</button></div>
  </form>`;
}

// Prévient avant de quitter un formulaire modifié et non enregistré.
let dirtyForm = false;
window.addEventListener('beforeunload', e => { if (dirtyForm) { e.preventDefault(); e.returnValue = ''; } });
export function guardForm(form) {
  dirtyForm = false;
  form.addEventListener('input', () => { dirtyForm = true; });
  form.addEventListener('submit', () => { dirtyForm = false; }, true);
}
export const isDirty = () => dirtyForm;
export const clearDirty = () => { dirtyForm = false; };

function bindSongForm(song, onSaved) {
  guardForm($('#songform'));
  let cover = song.cover || null;
  $('#f-txt').onchange = async e => {
    const f = e.target.files[0]; if (!f) return;
    let text = await f.text();
    if (text.includes('�')) text = new TextDecoder('windows-1252').decode(await f.arrayBuffer());
    $('#f-lyrics').value = text.replace(/\r\n?/g, '\n');
    if (!$('#f-title').value) $('#f-title').value = f.name.replace(/\.txt$/i, '');
    toast('Fichier importé : vérifiez le texte.');
  };
  $('#f-cover').onchange = async e => {
    const f = e.target.files[0]; if (!f) return;
    try { cover = await compressImage(f, 1200); $('#cover-prev').innerHTML = `<img class="cover" src="${URL.createObjectURL(cover)}" alt="">`; }
    catch (err) { toast(err.message, { err: true }); }
  };
  $('#f-findcover').onclick = async () => {
    const r = await pickArtwork($('#f-title').value.trim(), $('#f-artist').value.trim());
    if (r) { cover = r.blob; $('#cover-prev').innerHTML = `<img class="cover" src="${URL.createObjectURL(cover)}" alt="">`; toast('Image choisie : elle sera enregistrée avec le morceau.'); }
  };
  if ($('#f-nocover')) $('#f-nocover').onclick = () => { cover = null; $('#cover-prev').innerHTML = ''; };
  $('#songform').onsubmit = async e => {
    e.preventDefault();
    const now = Date.now();
    const s = {
      ...song,
      id: song.id || uid(),
      title: $('#f-title').value.trim(), artist: $('#f-artist').value.trim(),
      featuring: $('#f-feat').value.trim(), album: $('#f-album').value.trim(),
      lyrics: $('#f-lyrics').value.replace(/\r\n?/g, '\n').replace(/\s+$/, ''),
      lang: $('#f-lang').value.trim(), collection: $('#f-col').value.trim(),
      tags: [...new Set($('#f-tags').value.split(',').map(t => t.trim()).filter(Boolean))],
      sourceUrl: $('#f-src').value.trim(), note: $('#f-note').value.trim(), cover,
      createdAt: song.createdAt || now, updatedAt: now,
    };
    if (!s.lyrics.trim() && !song.missingLyrics) { toast('Les paroles sont vides.', { err: true }); return; }
    s.missingLyrics = !s.lyrics.trim();
    await attachAlbum(s);
    const dup = (await liveSongs()).find(o => o.id !== s.id && norm(o.title) === norm(s.title) && norm(o.artist) === norm(s.artist));
    if (dup && !await confirmDialog(`« ${dup.title} » de ${dup.artist} est déjà dans votre bibliothèque. L'ajouter quand même ?`, 'Ajouter quand même')) return;
    await safe(() => db.put('songs', s));
    toast(song.id ? 'Modifications enregistrées' : 'Morceau ajouté à la bibliothèque');
    onSaved(s);
  };
}

async function renderAdd(mode = 'manuel') {
  const tabs = `<div class="seg" style="margin-bottom:18px">${[['manuel', 'Morceau'], ['album', 'Album'], ['recherche', 'Paroles en ligne'], ['lien', 'Lien']].map(([k, l]) => `<button data-mode="${k}" class="${mode === k ? 'on' : ''}">${l}</button>`).join('')}</div>`;
  view.innerHTML = `<h1>Ajouter un morceau</h1>${tabs}<div id="addbody"></div>`;
  $$('[data-mode]').forEach(b => b.onclick = () => go('#/ajouter/' + b.dataset.mode));
  const body = $('#addbody');
  const showForm = async (song, intro) => {
    body.innerHTML = await songForm(song, { submitLabel: 'Ajouter à ma bibliothèque', intro });
    bindSongForm(song, s => go('#/morceau/' + s.id));
  };
  const review = (r) => showForm({ title: r.title, artist: r.artist, album: r.album, lyrics: r.lyrics, sourceUrl: r.sourceUrl, sourceName: r.sourceName },
    `<div class="notice" style="margin-bottom:14px">Paroles fournies par <b>${esc(r.sourceName)}</b> (base collaborative). Vérifiez et corrigez le texte avant de l'ajouter : ce n'est pas forcément la version officielle de l'artiste. Vous pouvez remplacer le lien par celui de la publication d'origine.</div>`);

  if (mode === 'manuel') {
    let pre = {};
    try { pre = JSON.parse(sessionStorage.getItem('verso-prefill') || '{}'); sessionStorage.removeItem('verso-prefill'); } catch {}
    return showForm(pre, pre.album ? `<div class="notice" style="margin-bottom:14px">Nouveau morceau de l'album <b>${esc(pre.album)}</b> (piste ${pre.trackNo}).</div>` : '');
  }
  if (mode === 'recherche') {
    body.innerHTML = `<form id="sform" class="stack"><div class="grid2"><div><label for="s-title">Titre</label><input id="s-title"></div><div><label for="s-artist">Artiste</label><input id="s-artist"></div></div>
      <button class="primary">Rechercher</button><p class="small muted">Source : LRCLIB (lrclib.net), base de paroles libre et gratuite, sans compte. Nécessite une connexion internet.</p></form><div id="results"></div>`;
    $('#sform').onsubmit = async e => {
      e.preventDefault();
      const t = $('#s-title').value, a = $('#s-artist').value;
      if (!t.trim() && !a.trim()) return;
      const out = $('#results');
      out.innerHTML = '<p class="muted">Recherche…</p>';
      try {
        const res = await searchLyrics(t, a);
        if (!res.length) { out.innerHTML = `<div class="notice">Aucune parole trouvée pour cette recherche dans LRCLIB. Essayez une autre orthographe, ou <a href="#/ajouter/manuel">collez les paroles manuellement</a>.</div>`; return; }
        out.innerHTML = `<p class="small muted">${res.length} résultat(s) — choisissez la bonne version :</p>` + res.map((r, i) => `<button class="result" data-i="${i}"><b>${esc(r.title)}</b> — ${esc(r.artist)}
          <div class="small muted">${r.album ? 'Album : ' + esc(r.album) + ' · ' : ''}${r.duration ? Math.floor(r.duration / 60) + ' min ' + String(Math.round(r.duration % 60)).padStart(2, '0') + ' · ' : ''}Source : ${esc(r.sourceName)}</div>
          <div class="small muted" style="margin-top:4px;white-space:pre-line">${esc(r.lyrics.split('\n').slice(0, 2).join('\n'))}…</div></button>`).join('');
        $$('.result', out).forEach(b => b.onclick = () => review(res[b.dataset.i]));
      } catch (err) { out.innerHTML = `<div class="notice err">${esc(err.message)}</div>`; }
    };
    return;
  }
  // Lien
  body.innerHTML = `<form id="lform" class="stack"><div><label for="l-url">Lien de la page</label><input id="l-url" type="url" placeholder="https://…" required></div>
    <button class="primary">Récupérer</button>
    <p class="small muted">Liens pris en charge : pages LRCLIB (ex. lrclib.net/api/get/123). Pour les autres sites (publication de l'artiste, réseaux sociaux…), le lien est conservé comme source et vous collez le texte.</p></form><div id="lres"></div>`;
  $('#lform').onsubmit = async e => {
    e.preventDefault();
    const out = $('#lres');
    out.innerHTML = '<p class="muted">Récupération…</p>';
    const r = await importFromUrl($('#l-url').value);
    if (r.ok) { out.innerHTML = ''; return review(r.result); }
    out.innerHTML = '';
    await showForm({ sourceUrl: r.url || $('#l-url').value }, `<div class="notice err" style="margin-bottom:14px"><b>Import automatique impossible.</b> ${esc(r.reason)}</div>`);
    $('#f-lyrics').focus();
  };
}

async function renderEdit(id) {
  const s = await db.get('songs', id);
  if (!s) return go('#/bibliotheque');
  view.innerHTML = `<h1>Modifier</h1>` + await songForm(s, { submitLabel: 'Enregistrer' });
  bindSongForm(s, () => go('#/morceau/' + id));
}

// --- Page d'un morceau ----------------------------------------------------

const SECTION_RE = /^\s*(\[.*\]|\(.*\)|((couplet|refrain|pont|intro|outro|pré-refrain|pre-refrain|chorus|verse|bridge|hook|interlude)\b[^a-z]{0,20}:?))\s*$/i;

async function renderSong(id) {
  const s = await db.get('songs', id);
  if (!s) { view.innerHTML = '<div class="empty">Ce morceau n\'existe plus.<br><br><a href="#/bibliotheque">Retour à la bibliothèque</a></div>'; return; }
  const lines = (s.lyrics || '').split('\n');
  const passages = (await db.all('passages')).filter(p => p.songId === id).sort((a, b) => a.createdAt - b.createdAt);
  const cards = (await db.all('cards')).filter(c => c.songId === id).sort((a, b) => b.updatedAt - a.updatedAt);
  const size = await db.setting('readSize', 1.1);
  let ellipsis = true;
  const coverUrl = s.cover ? blobUrl('song-' + s.id + s.updatedAt, s.cover) : '';
  const icon = d => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${d}"/></svg>`;
  const I = {
    star: 'M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z',
    book: 'M4 5a2 2 0 0 1 2-2h5v17H6a2 2 0 0 0-2 2zM20 5a2 2 0 0 0-2-2h-5v17h5a2 2 0 0 1 2 2z',
    text: 'M4 7V5h11v2M9.5 5v14M7 19h5M14 12v-1.5h7V12M17.5 10.5V19M16 19h3',
    edit: 'M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4',
    link: 'M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5',
    trash: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13',
  };
  const hint = !(await db.setting('selHintSeen', false));

  view.innerHTML = `
    <header class="song-hero${coverUrl ? ' has-cover' : ''}" ${coverUrl ? `style="--cover:url('${coverUrl}')"` : ''}>
      <div class="song-hero-in">${coverHtml(s)}<div style="min-width:0">
        <h1>${esc(s.title)}</h1>
        <p class="song-by"><a href="${artistHref(s.artist)}">${esc(s.artist)}</a>${s.featuring ? ` <span class="muted">feat. ${esc(s.featuring)}</span>` : ''}</p>
        ${s.album ? `<p class="song-album">${s.albumId ? `<a href="#/album/${s.albumId}">${esc(s.album)}</a>` : esc(s.album)}</p>` : ''}
        ${s.collection || (s.tags || []).length ? `<div class="row small" style="margin-top:8px;gap:6px">${s.collection ? `<span class="tag">${esc(s.collection)}</span>` : ''}${(s.tags || []).map(t => `<span class="tag">#${esc(t)}</span>`).join('')}</div>` : ''}
      </div></div>
    </header>
    <nav class="song-tools" aria-label="Actions du morceau">
      <button id="fav" class="${s.favorite ? 'on' : ''}" aria-pressed="${!!s.favorite}">${icon(I.star)}<span>Favori</span></button>
      <button id="read" aria-pressed="false">${icon(I.book)}<span>Lecture</span></button>
      <button id="size" aria-expanded="false">${icon(I.text)}<span>Taille</span></button>
      <a href="#/morceau/${id}/modifier">${icon(I.edit)}<span>Modifier</span></a>
      ${s.sourceUrl ? `<a href="${esc(s.sourceUrl)}" target="_blank" rel="noopener">${icon(I.link)}<span>Source</span></a>` : ''}
      <button id="del" class="danger">${icon(I.trash)}<span>Supprimer</span></button>
    </nav>
    <div class="size-pop" id="sizepop" hidden><button class="icon-btn" id="minus" aria-label="Réduire le texte">A−</button><input type="range" id="sizer" min="0.9" max="2" step="0.05" value="${size}" aria-label="Taille du texte"><button class="icon-btn" id="plus" aria-label="Agrandir le texte">A+</button></div>
    ${s.note ? `<div class="notice" style="margin-bottom:16px">${esc(s.note)}</div>` : ''}
    ${hasLyrics(s) ? '' : `<div class="notice field"><b>(paroles manquantes)</b><br>Ce titre n'a pas encore de paroles.
      <div class="row" style="margin-top:10px"><a class="btn primary" href="#/morceau/${id}/modifier">Ajouter les paroles</a><button id="findly">Chercher sur LRCLIB</button></div></div>`}
    ${hasLyrics(s) && hint ? '<p class="sel-hint" id="selhint">Appuyez longuement sur un mot, puis étirez la sélection avec les poignées pour créer une carte.</p>' : ''}
    <article class="lyrics" id="lyrics" aria-label="Paroles" style="--lsize:${size}rem">${lines.map((l, i) => !l.trim() ? '<div class="gap" aria-hidden="true"></div>' : SECTION_RE.test(l) ? `<div class="sec">${esc(l.trim().replace(/^\[|\]$/g, ''))}</div>` : `<div class="ln" data-i="${i}">${esc(l)}</div>`).join('')}</article>
    ${s.sourceName ? `<p class="small muted lyrics-src">Paroles : ${esc(s.sourceName)}</p>` : ''}
    <section style="margin-top:28px"><h2>Passages favoris</h2><div id="passages"></div></section>
    <section><h2>Cartes de ce morceau</h2>${cards.length ? `<div class="gallery">${cards.map(tileHtml).join('')}</div>` : '<p class="muted small">Aucune carte pour l\'instant.</p>'}</section>
    <div class="selbar" id="selbar" hidden>
      <div class="preview" id="selprev" aria-live="polite"></div>
      <div class="row small" style="margin-bottom:8px;gap:6px"><button class="chip" id="addpiece">＋ Ajouter un autre passage</button><button class="chip on" id="ell">« … » entre passages</button><button class="chip" id="clear">Effacer</button></div>
      <div class="row"><button class="primary" style="flex:1" id="mkcard">Créer une carte</button><button id="keep">Garder le passage</button></div>
    </div>`;

  if ($('#findly')) $('#findly').onclick = async () => {
    const b = $('#findly'); b.disabled = true; b.textContent = 'Recherche…';
    try {
      const r = await findLyrics(s.title, s.artist, s.album, 0);
      if (!r) { toast('Toujours introuvable sur LRCLIB : ajoutez-les vous-même.'); b.disabled = false; b.textContent = 'Chercher sur LRCLIB'; return; }
      const v = await openDialog(`<form method="dialog"><h3>Paroles trouvées</h3><p class="small muted">${esc(r.title)} — ${esc(r.artist)} (LRCLIB). Vérifiez qu'il s'agit du bon titre.</p>
        <div class="card-box" style="white-space:pre-line;max-height:40dvh;overflow:auto">${esc(r.lyrics)}</div>
        <div class="row" style="justify-content:flex-end;margin-top:12px"><button value="no">Annuler</button><button value="ok" class="primary">Ajouter ces paroles</button></div></form>`);
      if (v !== 'ok') { b.disabled = false; b.textContent = 'Chercher sur LRCLIB'; return; }
      Object.assign(s, { lyrics: r.lyrics, missingLyrics: false, sourceName: 'LRCLIB', sourceUrl: s.sourceUrl || r.sourceUrl, updatedAt: Date.now() });
      await safe(() => db.put('songs', s)); toast('Paroles ajoutées'); renderSong(id);
    } catch (e) { toast(e.message, { err: true }); b.disabled = false; b.textContent = 'Chercher sur LRCLIB'; }
  };
  const drawPassages = () => {
    $('#passages').innerHTML = passages.map(p => `<div class="card-box" style="margin-bottom:8px"><div style="white-space:pre-line">${esc(p.text)}</div>
      ${p.note ? `<div class="small muted" style="margin-top:6px">${esc(p.note)}</div>` : ''}
      <div class="row" style="margin-top:8px"><button data-pcard="${p.id}">Créer une carte</button><button class="ghost" data-pnote="${p.id}">Note</button><button class="ghost danger" data-pdel="${p.id}">Retirer</button></div></div>`).join('') || '<p class="muted small">Aucun passage gardé. Sélectionnez des mots puis « Garder le passage ».</p>';
    $$('[data-pcard]').forEach(b => b.onclick = async () => { const p = passages.find(x => x.id === b.dataset.pcard); go('#/studio/' + (await newCard(s, p.text)).id); });
    $$('[data-pdel]').forEach(b => b.onclick = async () => { const i = passages.findIndex(x => x.id === b.dataset.pdel); const [p] = passages.splice(i, 1); await safe(() => db.del('passages', p.id)); drawPassages(); toast('Passage retiré', { action: { label: 'Annuler', run: async () => { passages.splice(i, 0, p); await db.put('passages', p); drawPassages(); } } }); });
    $$('[data-pnote]').forEach(b => b.onclick = () => editPassageNote(passages.find(x => x.id === b.dataset.pnote)));
  };
  const editPassageNote = p => openDialog(`<form method="dialog"><h3>Note sur ce passage</h3><p class="small muted" style="white-space:pre-line">${esc(p.text)}</p><textarea id="pn" style="min-height:100px">${esc(p.note || '')}</textarea>
    <div class="row" style="justify-content:flex-end;margin-top:12px"><button value="no">Annuler</button><button value="ok" class="primary">Enregistrer</button></div></form>`).then(async v => {
      if (v !== 'ok') return; p.note = dialog.querySelector('#pn').value.trim(); p.updatedAt = Date.now(); await safe(() => db.put('passages', p)); drawPassages();
    });
  drawPassages();

  // --- Sélection mot par mot (sélection native du téléphone) ------------
  // Un passage = { from: [ligne, position], to: [ligne, position] }, calé sur des mots entiers.
  const lyr = $('#lyrics');
  const lnEls = $$('.ln', lyr);
  const lineEl = i => lnEls.find(el => +el.dataset.i === i);
  let basket = [], current = null;
  const isWord = c => /[\p{L}\p{N}'’-]/u.test(c || '');
  function pieceFromSelection() {
    const sel = getSelection();
    if (!sel || sel.isCollapsed || !sel.rangeCount) return null;
    const r = sel.getRangeAt(0);
    if (!lyr.contains(r.commonAncestorContainer)) return null;
    const hit = lnEls.filter(el => r.intersectsNode(el));
    if (!hit.length) return null;
    const first = hit[0], last = hit[hit.length - 1];
    const fi = +first.dataset.i, li = +last.dataset.i;
    let fo = first.contains(r.startContainer) && r.startContainer.nodeType === 3 ? r.startOffset : 0;
    let lo = last.contains(r.endContainer) && r.endContainer.nodeType === 3 ? r.endOffset : lines[li].length;
    const ft = lines[fi], lt = lines[li];
    while (fo > 0 && isWord(ft[fo - 1])) fo--;          // ne coupe pas un mot au début
    while (lo < lt.length && isWord(lt[lo])) lo++;       // ni à la fin
    while (fo < ft.length && /\s/.test(ft[fo])) fo++;
    while (lo > 0 && /\s/.test(lt[lo - 1])) lo--;
    if (fi === li && lo <= fo) return null;
    return { from: [fi, fo], to: [li, lo] };
  }
  const textOf = p => {
    const out = [];
    for (let i = p.from[0]; i <= p.to[0]; i++) {
      if (!lineEl(i)) continue;
      const t = lines[i];
      out.push(t.slice(i === p.from[0] ? p.from[1] : 0, i === p.to[0] ? p.to[1] : t.length).trim());
    }
    return out.filter(Boolean).join('\n');
  };
  const cmp = (a, b) => a.from[0] - b.from[0] || a.from[1] - b.from[1];
  function excerpt() {
    const sorted = [...basket, ...(current ? [current] : [])].sort(cmp);
    // Passages qui se chevauchent : fusionnés pour ne rien répéter.
    const all = [];
    const after = (x, y) => x[0] > y[0] || (x[0] === y[0] && x[1] > y[1]);
    for (const p of sorted) {
      const last = all[all.length - 1];
      if (last && !after(p.from, last.to)) { if (after(p.to, last.to)) last.to = p.to; }
      else all.push({ from: [...p.from], to: [...p.to] });
    }
    let out = '';
    all.forEach((p, k) => {
      if (k) {
        const prev = all[k - 1];
        const between = lines.slice(prev.to[0] + 1, p.from[0]).some(l => l.trim() && !SECTION_RE.test(l));
        const cut = prev.to[1] < lines[prev.to[0]].trimEnd().length || p.from[1] > 0 || between || p.from[0] === prev.to[0];
        out += cut ? (ellipsis ? '\n…\n' : '\n\n') : '\n';
      }
      out += textOf(p);
    });
    return out;
  }
  // Passages déjà retenus, surlignés dans le texte (API Highlight, si disponible).
  function paintPieces() {
    if (!window.CSS || !CSS.highlights || typeof Highlight === 'undefined') return;
    const ranges = basket.map(p => {
      const r = document.createRange();
      r.setStart(lineEl(p.from[0]).firstChild, p.from[1]);
      r.setEnd(lineEl(p.to[0]).firstChild, p.to[1]);
      return r;
    });
    CSS.highlights.set('verso-pick', new Highlight(...ranges));
  }
  const update = () => {
    const ex = excerpt();
    $('#selbar').hidden = !ex;
    $('#selprev').textContent = ex;
    $('#addpiece').hidden = !current;
    $('#ell').hidden = basket.length + (current ? 1 : 0) < 2;
    $('#ell').classList.toggle('on', ellipsis);
    paintPieces();
  };
  let selTimer = 0;
  function onSel() {
    clearTimeout(selTimer);
    selTimer = setTimeout(() => {
      if (!document.body.contains(lyr)) { document.removeEventListener('selectionchange', onSel); return; }
      current = pieceFromSelection();
      if (current && $('#selhint')) { $('#selhint').remove(); db.setSetting('selHintSeen', true); }
      update();
    }, 120);
  }
  document.addEventListener('selectionchange', onSel);
  // Quand le doigt (ou la souris) se lève, la sélection affichée est recalée sur des mots entiers.
  let touching = false;
  const snap = () => setTimeout(() => {
    if (touching || !current || !document.body.contains(lyr)) return;
    const sel = getSelection(); if (!sel.rangeCount) return;
    const r = sel.getRangeAt(0), a = lineEl(current.from[0]).firstChild, z = lineEl(current.to[0]).firstChild;
    if (r.startContainer === a && r.startOffset === current.from[1] && r.endContainer === z && r.endOffset === current.to[1]) return;
    const nr = document.createRange(); nr.setStart(a, current.from[1]); nr.setEnd(z, current.to[1]);
    sel.removeAllRanges(); sel.addRange(nr);
  }, 250);
  lyr.addEventListener('touchstart', () => { touching = true; }, { passive: true });
  ['touchend', 'touchcancel'].forEach(ev => lyr.addEventListener(ev, () => { touching = false; snap(); }, { passive: true }));
  lyr.addEventListener('mouseup', snap);
  const clearHl = () => { if (window.CSS && CSS.highlights) CSS.highlights.delete('verso-pick'); };
  $('#addpiece').onclick = () => { if (!current) return; basket.push(current); current = null; getSelection().removeAllRanges(); update(); toast('Passage ajouté : sélectionnez-en un autre'); };
  $('#ell').onclick = () => { ellipsis = !ellipsis; update(); };
  $('#clear').onclick = () => { basket = []; current = null; getSelection().removeAllRanges(); clearHl(); update(); };
  $('#mkcard').onclick = async () => { const t = excerpt(); if (!t) return; clearHl(); go('#/studio/' + (await newCard(s, t)).id); };
  $('#keep').onclick = async () => {
    const p = { id: uid(), songId: id, title: s.title, artist: s.artist, text: excerpt(), note: '', createdAt: Date.now(), updatedAt: Date.now() };
    await safe(() => db.put('passages', p)); passages.push(p); drawPassages(); $('#clear').click();
    toast('Passage gardé', { action: { label: 'Ajouter une note', run: () => editPassageNote(p) } });
  };
  const setSize = v => { v = Math.min(2, Math.max(0.9, Math.round(v * 100) / 100)); lyr.style.setProperty('--lsize', v + 'rem'); $('#sizer').value = v; db.setSetting('readSize', v); return v; };
  let cur = size;
  $('#plus').onclick = () => { cur = setSize(cur + 0.1); };
  $('#minus').onclick = () => { cur = setSize(cur - 0.1); };
  $('#sizer').oninput = e => { cur = setSize(+e.target.value); };
  $('#size').onclick = () => { const p = $('#sizepop'); p.hidden = !p.hidden; $('#size').setAttribute('aria-expanded', !p.hidden); };
  $('#read').onclick = () => { const on = document.body.classList.toggle('reading'); $('#read').setAttribute('aria-pressed', on); $('#read').classList.toggle('on', on); };
  $('#fav').onclick = async () => { s.favorite = !s.favorite; s.updatedAt = Date.now(); await safe(() => db.put('songs', s)); $('#fav').classList.toggle('on', s.favorite); $('#fav').setAttribute('aria-pressed', s.favorite); };
  $('#del').onclick = async () => {
    s.deletedAt = Date.now(); s.updatedAt = Date.now();
    await safe(() => db.put('songs', s));
    go('#/bibliotheque');
    toast('Morceau placé dans la corbeille', { action: { label: 'Annuler', run: async () => { delete s.deletedAt; s.updatedAt = Date.now(); await db.put('songs', s); go('#/morceau/' + id); } } });
  };
  update();
}

// --- Galerie --------------------------------------------------------------

async function renderGallery() {
  const cards = (await db.all('cards')).sort((a, b) => b.updatedAt - a.updatedAt);
  const saved = cards.filter(c => !c.draft), drafts = cards.filter(c => c.draft);
  view.innerHTML = `<div class="page-head"><h1>Mes créations</h1></div>
    ${saved.length ? `<div class="gallery">${saved.map(tileHtml).join('')}</div>` : '<div class="empty">Aucune création enregistrée. Ouvrez un morceau, sélectionnez des lignes puis « Créer une carte ».</div>'}
    ${drafts.length ? `<section style="margin-top:28px"><div class="row spread"><h2>Brouillons</h2><button class="ghost danger" id="purge-drafts">Supprimer les brouillons</button></div><div class="gallery">${drafts.map(tileHtml).join('')}</div></section>` : ''}`;
  if ($('#purge-drafts')) $('#purge-drafts').onclick = async () => {
    if (!await confirmDialog(`Supprimer les ${drafts.length} brouillon(s) ?`, 'Supprimer', true)) return;
    for (const d of drafts) await db.del('cards', d.id);
    renderGallery();
  };
}

// --- Réglages -------------------------------------------------------------

async function renderSettings() {
  const theme = (() => { try { return localStorage.getItem('verso-theme') || 'auto'; } catch { return 'auto'; } })();
  const signature = await db.setting('signature', '');
  const est = navigator.storage && navigator.storage.estimate ? await navigator.storage.estimate().catch(() => null) : null;
  const persisted = navigator.storage && navigator.storage.persisted ? await navigator.storage.persisted().catch(() => false) : false;
  const counts = {};
  for (const s of ['songs', 'albums', 'artists', 'cards', 'passages', 'templates']) counts[s] = (await db.all(s)).length;
  const mb = b => (b / 1048576).toFixed(1).replace('.', ',') + ' Mo';
  view.innerHTML = `<h1>Réglages</h1>
    <section class="card-box"><h3>Apparence</h3><div class="seg" id="theme">${[['auto', 'Automatique'], ['dark', 'Sombre'], ['light', 'Clair']].map(([k, l]) => `<button data-t="${k}" class="${theme === k ? 'on' : ''}">${l}</button>`).join('')}</div>
      <div class="field" style="margin-top:14px"><label for="sig">Signature par défaut sur les cartes</label><input id="sig" value="${esc(signature)}" placeholder="Votre pseudonyme"></div></section>
    <section class="card-box"><h3>Mes données</h3>
      <div class="notice">Vos données sont enregistrées <b>uniquement sur cet appareil</b>, dans ce navigateur. Elles ne sont envoyées nulle part et ne sont <b>pas synchronisées</b> avec vos autres appareils. Exportez régulièrement une sauvegarde pour ne rien perdre (changement de téléphone, effacement des données du navigateur).</div>
      <p class="small">${counts.songs} morceau(x) · ${counts.albums} album(s) · ${counts.cards} carte(s) · ${counts.passages} passage(s) · ${counts.templates} modèle(s) personnel(s)${est ? `<br>Espace utilisé : ${mb(est.usage || 0)}${est.quota ? ' sur ' + mb(est.quota) + ' disponibles' : ''}` : ''}<br>
      Stockage protégé contre le nettoyage automatique : <b>${persisted ? 'oui' : 'non'}</b> ${persisted ? '' : '<button class="chip" id="persist">Demander la protection</button>'}</p>
      <div class="row"><button class="primary" id="backup">Exporter une sauvegarde</button><label class="btn" style="margin:0;color:var(--text)">Restaurer une sauvegarde<input type="file" id="restore" accept=".json,application/json" hidden></label></div>
      <p class="small muted">La sauvegarde (.json) contient les albums, paroles, notes, favoris, collections, passages, cartes, leurs réglages et leurs images. La restauration fusionne sans créer de doublons : un élément déjà présent n'est remplacé que par une version plus récente.</p></section>
    <section class="card-box"><h3>Sources de paroles</h3>
      <p class="small"><b>LRCLIB</b> (lrclib.net) — active. Gratuite, sans compte ni clé. Fournit les paroles complètes contribuées par sa communauté : à vérifier avant ajout. Recherche par titre et artiste, import depuis un lien LRCLIB.</p>
      <p class="small muted">Genius, Musixmatch et Spotify ne sont pas branchés : l'API publique de Genius ne fournit pas les paroles ; Musixmatch ne donne gratuitement que 30 % du texte et exige une clé et un contrat commercial pour le texte complet. Toute autre page web : collez le texte, le lien est conservé comme source.</p></section>
    <section class="card-box"><h3>Installer l'application</h3>${android ? '' : '<p class="small"><a class="btn primary" href="installer.html">Télécharger l\'application Android (APK)</a></p>'}<p class="small">Sur Android (Chrome) : menu ⋮ puis « Installer l'application » ou « Ajouter à l'écran d'accueil ». Sur ordinateur : icône d'installation dans la barre d'adresse.</p>
      <button id="install" hidden class="primary">Installer Verso</button></section>
    <p class="small muted" style="text-align:center">Verso · application personnelle, sans compte et sans publicité.</p>`;
  $$('[data-t]').forEach(b => b.onclick = () => {
    try { localStorage.setItem('verso-theme', b.dataset.t); } catch {}
    if (b.dataset.t === 'auto') delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = b.dataset.t;
    $$('[data-t]').forEach(x => x.classList.toggle('on', x === b));
    applyLogo();
  });
  $('#sig').onchange = e => safe(() => db.setSetting('signature', e.target.value.trim())).then(() => toast('Signature enregistrée'));
  if ($('#persist')) $('#persist').onclick = async () => { const ok = await navigator.storage.persist(); toast(ok ? 'Stockage protégé' : 'Le navigateur a refusé (installez l\'application pour améliorer la protection).', { err: !ok }); renderSettings(); };
  $('#backup').onclick = async () => {
    try {
      const blob = await exportBackup();
      download(blob, `verso-sauvegarde-${new Date().toISOString().slice(0, 10)}.json`);
      await db.setSetting('lastBackup', Date.now());
      toast('Sauvegarde exportée');
    } catch (e) { toast('Export impossible : ' + e.message, { err: true }); }
  };
  $('#restore').onchange = async e => {
    const f = e.target.files[0]; if (!f) return;
    try {
      const r = await importBackup(f);
      toast(`Restauration terminée : ${r.added} ajouté(s), ${r.updated} mis à jour, ${r.skipped} déjà présent(s).`, { duration: 7000 });
      renderSettings();
    } catch (err) { toast(err.message, { err: true }); }
  };
  if (installEvt) { $('#install').hidden = false; $('#install').onclick = () => { installEvt.prompt(); installEvt = null; $('#install').hidden = true; }; }
}

let installEvt = null;
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); installEvt = e; });

// --- Démarrage ------------------------------------------------------------

if ('serviceWorker' in navigator && location.protocol !== 'file:' && !android) navigator.serviceWorker.register('sw.js').catch(() => {});
if (navigator.storage && navigator.storage.persist) navigator.storage.persisted().then(p => { if (!p) navigator.storage.persist().catch(() => {}); });
route();
