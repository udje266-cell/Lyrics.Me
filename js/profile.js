// Profil façon TikTok : avatar, pseudo, bio, compteurs et grille des créations.
// Sans compte, le profil reste sur l'appareil ; avec un compte Verso, il est publié
// (nom, pseudo, bio, photo) pour que vos amis vous trouvent.
import { db } from './db.js';
import { compressImage } from './render.js';
import { esc, toast, safe, openDialog, blobUrl, confirmDialog } from './app.js';
import { currentUser, syncProfile, signOut, unreadCount, errMsg, cleanHandle, fb } from './social.js';

export async function getProfile() {
  return (await db.setting('profile', null)) || { name: '', handle: '', bio: '', avatar: null };
}

const gear = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>';

let tab = 'cards';

export async function renderProfile() {
  const view = document.getElementById('view');
  const pr = await getProfile();
  const cards = (await db.all('cards')).filter(c => !c.draft).sort((a, b) => b.updatedAt - a.updatedAt);
  const songs = (await db.all('songs')).filter(s => !s.deletedAt);
  const passages = (await db.all('passages')).sort((a, b) => b.createdAt - a.createdAt);
  const favs = songs.filter(s => s.favorite);
  const artists = new Set(songs.map(s => s.artist.trim().toLowerCase())).size;
  const av = pr.avatar ? `<img class="pf-avatar" src="${blobUrl('avatar' + (pr.updatedAt || 0), pr.avatar)}" alt="" width="96" height="96">` : `<span class="pf-avatar ph" aria-hidden="true">${esc((pr.name || pr.handle || 'V')[0].toUpperCase())}</span>`;
  const stat = (n, l) => `<div><b>${n}</b><span>${l}</span></div>`;
  const user = await currentUser();
  const published = user ? await db.setting('published', {}) : {};
  let friendsN = 0;
  if (user) try { const { F, fs } = await fb(); friendsN = (await F.getDocs(F.query(F.collection(fs, 'friendships'), F.where('members', 'array-contains', user.uid)))).size; } catch {}
  const unread = user ? await unreadCount().catch(() => 0) : 0;
  const mail = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/></svg>';
  view.innerHTML = `
    <div class="pf-top"><a class="icon-btn ghost pf-gear" href="#/reglages" aria-label="Réglages">${gear}</a>
      ${user ? `<a class="icon-btn ghost pf-gear pf-mail" href="#/messages" aria-label="Messages${unread ? ` (${unread} non lus)` : ''}">${mail}${unread ? `<span class="so-dot">${unread}</span>` : ''}</a>` : ''}</div>
    <div class="pf-head">
      <button type="button" class="pf-av-btn" id="pf-av" aria-label="Changer la photo de profil">${av}</button>
      <h1>${esc(pr.name || 'Mon profil')}</h1>
      <p class="pf-handle">${pr.handle ? '@' + esc(pr.handle) : '<span class="muted">Choisissez un pseudo</span>'}</p>
      <div class="pf-stats">${user ? `<a href="#/amis">${stat(friendsN, 'Amis')}</a>` : ''}${stat(cards.length, 'Créations')}${stat(songs.length, 'Morceaux')}${stat(passages.length, 'Passages')}${user ? '' : stat(artists, 'Artistes')}</div>
      <div class="row pf-btns"><button class="btn" id="pf-edit">Modifier le profil</button>${user ? '<a class="btn" href="#/amis">Ajouter des amis</a>' : ''}</div>
      ${user ? '' : '<a class="btn primary pf-join" href="#/compte">Créer un compte ou se connecter</a><p class="small muted" style="margin:0">Pour ajouter des amis et vous envoyer des messages.</p>'}
      ${pr.bio ? `<p class="pf-bio">${esc(pr.bio)}</p>` : ''}
    </div>
    <div class="pf-tabs" role="tablist">
      <button role="tab" data-pt="cards" aria-selected="${tab === 'cards'}">Créations</button>
      ${user ? `<button role="tab" data-pt="pub" aria-selected="${tab === 'pub'}">Publiées</button>` : ''}
      <button role="tab" data-pt="favs" aria-selected="${tab === 'favs'}">Favoris</button>
      <button role="tab" data-pt="passages" aria-selected="${tab === 'passages'}">Passages</button>
    </div>
    <div id="pf-body"></div>
    <p class="small muted" style="text-align:center;margin-top:24px">${user ? `Connecté avec ${esc(user.email || '')} · <button type="button" class="link" id="pf-out">Se déconnecter</button>` : 'Profil personnel, enregistré sur cet appareil uniquement.'}</p>`;
  if (user) view.querySelector('#pf-out').onclick = async () => {
    if (!(await confirmDialog('Se déconnecter de votre compte Verso ? Votre bibliothèque reste sur ce téléphone.', 'Se déconnecter'))) return;
    await signOut(); toast('Déconnecté'); renderProfile();
  };
  const body = view.querySelector('#pf-body');
  const draw = () => {
    view.querySelectorAll('[data-pt]').forEach(b => b.setAttribute('aria-selected', b.dataset.pt === tab));
    if (tab === 'cards') body.innerHTML = cards.length ? `<div class="pf-grid">${cards.map(c => `<a href="${user && published[c.id] !== undefined ? '#/post/' + c.id : '#/studio/' + c.id}" aria-label="${esc(c.title)}">${c.thumb ? `<img src="${blobUrl('thumb-' + c.id + c.updatedAt, c.thumb)}" alt="" loading="lazy">` : ''}</a>`).join('')}</div>`
      : '<div class="empty">Vos cartes apparaîtront ici.<br><br><a class="btn primary" href="#/bibliotheque">Créer une carte</a></div>';
    if (tab === 'pub') {
      body.innerHTML = '<p class="muted small" style="text-align:center">Chargement…</p>';
      import('./posts.js').then(async m => {
        try {
          const posts = await m.postsOf(user.uid);
          if (tab !== 'pub') return;
          const vis = await db.setting('visibility', 'friends');
          body.innerHTML = `<p class="small muted pf-vis">${vis === 'public' ? '🌍 Visibles par tous les comptes Verso' : '👥 Visibles par vos amis'} · <a href="#/reglages">Modifier</a></p>`
            + (posts.length ? m.postGrid(posts) : '<div class="empty">Vos cartes enregistrées apparaissent ici une fois publiées.</div>');
        } catch (e) { body.innerHTML = `<div class="notice err">${esc(errMsg(e))}</div>`; }
      });
    }
    if (tab === 'favs') body.innerHTML = favs.length ? `<ul class="songs">${favs.map(s => `<li class="song"><a class="main" href="#/morceau/${s.id}"><div style="min-width:0"><div class="t">${esc(s.title)}</div><div class="a">${esc(s.artist)}</div></div></a></li>`).join('')}</ul>`
      : '<div class="empty">Touchez ☆ sur un morceau pour l\'ajouter à vos favoris.</div>';
    if (tab === 'passages') body.innerHTML = passages.length ? passages.map(p => `<a class="card-box" style="display:block;text-decoration:none;color:inherit;margin-bottom:8px" href="#/morceau/${p.songId}"><div style="white-space:pre-line">${esc(p.text)}</div><div class="small muted" style="margin-top:6px">${esc(p.title)}, ${esc(p.artist)}</div></a>`).join('')
      : '<div class="empty">Gardez vos passages préférés depuis la page d\'un morceau.</div>';
  };
  view.querySelectorAll('[data-pt]').forEach(b => b.onclick = () => { tab = b.dataset.pt; draw(); });
  draw();

  const pickAvatar = () => new Promise(res => {
    const i = document.createElement('input'); i.type = 'file'; i.accept = 'image/*';
    i.onchange = async () => { const f = i.files[0]; if (!f) return res(null); try { res(await compressImage(f, 512)); } catch (e) { toast(e.message, { err: true }); res(null); } };
    i.click();
  });
  const save = async p => {
    p.updatedAt = Date.now();
    if (user) {
      try { p.handle = await syncProfile(p); }
      catch (e) { toast(errMsg(e), { err: true }); return false; }
    }
    await safe(() => db.setSetting('profile', p));
    return true;
  };
  view.querySelector('#pf-av').onclick = async () => { const b = await pickAvatar(); if (b) { pr.avatar = b; await save(pr); renderProfile(); } };
  view.querySelector('#pf-edit').onclick = async () => {
    const v = await openDialog(`<form method="dialog" class="stack"><h3>Modifier le profil</h3>
      <div><label for="pf-n">Nom</label><input id="pf-n" value="${esc(pr.name)}" autocomplete="name"></div>
      <div><label for="pf-h">Pseudo</label><input id="pf-h" value="${esc(pr.handle)}" placeholder="monpseudo…" autocomplete="username" spellcheck="false"></div>
      <div><label for="pf-b">Bio</label><textarea id="pf-b" style="min-height:80px" maxlength="160">${esc(pr.bio)}</textarea></div>
      <p class="small muted">Le pseudo sert aussi de signature par défaut sur vos cartes.</p>
      <div class="row" style="justify-content:flex-end"><button value="no">Annuler</button><button value="ok" class="primary">Enregistrer</button></div></form>`);
    if (v !== 'ok') return;
    const d = document.getElementById('dialog');
    pr.name = d.querySelector('#pf-n').value.trim();
    const oldHandle = pr.handle;
    pr.handle = user ? cleanHandle(d.querySelector('#pf-h').value) : d.querySelector('#pf-h').value.trim().replace(/^@+/, '').replace(/\s+/g, '').slice(0, 30);
    pr.bio = d.querySelector('#pf-b').value.trim();
    if (!(await save(pr))) { pr.handle = oldHandle; return; }
    if (pr.handle && !(await db.setting('signature', ''))) await db.setSetting('signature', '@' + pr.handle);
    toast('Profil enregistré'); renderProfile();
  };
}
