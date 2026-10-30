// Créations publiées sur le profil : image de la carte, j'aime et commentaires (Firestore).
// Visibles par les amis, ou par tous les comptes si l'auteur l'autorise (Réglages → Confidentialité).
import { db } from './db.js';
import { esc, toast, go, confirmDialog } from './app.js';
import { fb, currentUser, publicProfile, avatarHtml, errMsg } from './social.js';

// --- Publication automatique des cartes enregistrées -------------------------

export const autoPublish = () => db.setting('autoPublish', true);

async function cardImage(card) {
  const { cardToBlob } = await import('./studio.js');
  const { blob } = await cardToBlob(card, null, 'image/jpeg', 0.85);
  const bmp = await createImageBitmap(blob);
  const s = Math.min(1, 900 / bmp.width);
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * s); c.height = Math.round(bmp.height * s);
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  let q = 0.82, url = c.toDataURL('image/jpeg', q);
  while (url.length > 880000 && q > 0.4) { q -= 0.12; url = c.toDataURL('image/jpeg', q); }
  return url;
}

export async function publishCard(card) {
  const user = await currentUser(); if (!user) throw new Error('Connectez-vous à votre compte Verso pour publier.');
  const { F, fs } = await fb();
  const ref = F.doc(fs, 'posts', card.id);
  const cur = await F.getDoc(ref).catch(() => null);
  if (cur && cur.exists() && !canEdit(cur.data())) throw Object.assign(new Error('Publication figée : modification impossible plus de 3 h après la publication.'), { code: 'locked' });
  await F.setDoc(ref, { owner: user.uid, image: await cardImage(card), title: String(card.title || '').slice(0, 200),
    artist: String(card.artist || '').slice(0, 200), excerpt: String(card.excerpt || '').slice(0, 1500),
    createdAt: cur && cur.exists() ? cur.data().createdAt : F.serverTimestamp(), updatedAt: F.serverTimestamp() });
  const map = await db.setting('published', {}); map[card.id] = card.updatedAt; await db.setSetting('published', map);
}

export const EDIT_MS = 3 * 3600 * 1000;
export const canEdit = post => !post.createdAt || Date.now() - post.createdAt.toMillis() < EDIT_MS;
const left = post => { const m = Math.max(0, Math.ceil((EDIT_MS - (Date.now() - post.createdAt.toMillis())) / 60000)); return m >= 60 ? `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}` : `${m} min`; };

export async function unpublishCard(id) {
  const user = await currentUser(); if (!user) return;
  const { F, fs } = await fb();
  await F.deleteDoc(F.doc(fs, 'posts', id)).catch(() => {});
  const map = await db.setting('published', {}); delete map[id]; await db.setSetting('published', map);
}

export async function isPublished(id) { return id in (await db.setting('published', {})); }

// Branche la publication sur l'enregistrement des cartes (hors brouillons, hors cartes privées).
const timers = new Map();
export function installPosts() {
  const put = db.put, del = db.del;
  db.put = async (store, value) => {
    const r = await put(store, value);
    if (store === 'cards' && value && !value.draft && !value.private) {
      clearTimeout(timers.get(value.id));
      timers.set(value.id, setTimeout(async () => {
        timers.delete(value.id);
        if (!(await autoPublish()) || !navigator.onLine || !(await currentUser())) return;
        const map = await db.setting('published', {});
        if (map[value.id] === value.updatedAt) return;
        const cur = await db.get('cards', value.id); if (!cur || cur.draft || cur.private) return;
        publishCard(cur).catch(e => {
          if (e.code === 'locked' || e.code === 'permission-denied') { map[value.id] = value.updatedAt; db.setSetting('published', map); toast('Carte publiée depuis plus de 3 h : vos modifications restent sur ce téléphone, la publication ne change plus.', { duration: 6000 }); }
          else console.warn('Publication impossible :', e.code || e.message);
        });
      }, 6000));
    }
    if (store === 'cards' && value && value.private && value.id) unpublishCard(value.id);
    return r;
  };
  db.del = async (store, id) => {
    const r = await del(store, id);
    if (store === 'cards') unpublishCard(id);
    return r;
  };
}

// Publie les cartes enregistrées qui ne le sont pas encore (après connexion ou activation).
export async function publishAll() {
  const map = await db.setting('published', {});
  const cards = (await db.all('cards')).filter(c => !c.draft && !c.private && map[c.id] !== c.updatedAt);
  let n = 0;
  for (const c of cards) { try { await publishCard(c); n++; } catch { /* suivante */ } }
  return n;
}
export async function unpublishAll() {
  for (const id of Object.keys(await db.setting('published', {}))) await unpublishCard(id);
}

// --- Grille des publications d'un profil -----------------------------------------

export async function postsOf(uid) {
  const { F, fs } = await fb();
  const s = await F.getDocs(F.query(F.collection(fs, 'posts'), F.where('owner', '==', uid), F.orderBy('createdAt', 'desc'), F.limit(60)));
  return s.docs.map(d => ({ id: d.id, ...d.data() }));
}

export const postGrid = posts => `<div class="pf-grid">${posts.map(p => `<a href="#/post/${p.id}" aria-label="${esc(p.title || 'Carte')}"><img src="${p.image}" alt="" loading="lazy"></a>`).join('')}</div>`;

// --- Page d'une publication : j'aime et commentaires --------------------------------

const ago = ts => {
  if (!ts) return '';
  const s = (Date.now() - ts.toMillis()) / 1000;
  if (s < 60) return "à l'instant";
  if (s < 3600) return Math.floor(s / 60) + ' min';
  if (s < 86400) return Math.floor(s / 3600) + ' h';
  if (s < 604800) return Math.floor(s / 86400) + ' j';
  return ts.toDate().toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
};

export async function renderPost(id) {
  const view = document.getElementById('view');
  const me = await currentUser(); if (!me) { go('#/compte'); return; }
  const { F, fs } = await fb();
  view.innerHTML = '<p class="muted">Chargement…</p>';
  const ref = F.doc(fs, 'posts', id);
  let post;
  try { const s = await F.getDoc(ref); if (!s.exists()) throw { code: 'not-found' }; post = { id, ...s.data() }; }
  catch (e) { view.innerHTML = `<div class="notice err">${e.code === 'not-found' ? 'Cette création n\'existe plus.' : e.code === 'permission-denied' ? 'Le profil de cette personne est réservé à ses amis.' : esc(errMsg(e))}</div>`; return; }
  const author = await publicProfile(post.owner).catch(() => ({ uid: post.owner, handle: '', name: '' }));
  const mine = post.owner === me.uid;
  view.innerHTML = `<div class="post">
    <div class="post-head"><button class="icon-btn ghost" onclick="history.back()" aria-label="Retour">←</button>
      <a class="so-link chat-who" href="${mine ? '#/profil' : '#/u/' + post.owner}">${avatarHtml(author, 36)}<div class="so-who"><b>${esc(author.name || '@' + author.handle)}</b><span class="small muted">@${esc(author.handle)} · ${ago(post.createdAt)}</span></div></a>
      ${mine ? '<button class="icon-btn ghost" id="p-more" aria-label="Retirer de mon profil">⋯</button>' : ''}</div>
    <img class="post-img" src="${post.image}" alt="${esc(post.excerpt)}">
    <div class="post-bar"><button class="post-like" id="p-like" aria-pressed="false"><span class="heart" aria-hidden="true">♡</span> <b id="p-n">0</b></button>
      <span class="muted small" id="p-cn"></span></div>
    ${mine ? (canEdit(post) && post.createdAt ? `<div class="notice post-edit"><span>✏️ Modifiable encore <b>${left(post)}</b></span><a class="btn small" href="#/studio/${id}">Modifier</a></div>`
      : '<p class="small muted post-edit">🔒 Publiée il y a plus de 3 h : elle ne peut plus être modifiée.</p>') : ''}
    ${post.title ? `<p class="post-meta"><b>${esc(post.title)}</b> · ${esc(post.artist)}</p>` : ''}
    <section class="post-comments"><h2>Commentaires</h2><div id="p-list" class="muted small">Chargement…</div>
      <form id="p-form" class="chat-bar post-form"><input id="p-text" maxlength="500" placeholder="Ajouter un commentaire…" autocomplete="off" aria-label="Commentaire" enterkeyhint="send"><button class="primary" aria-label="Publier">➤</button></form></section></div>`;
  const $ = s => view.querySelector(s);
  const likeRef = F.doc(fs, 'posts', id, 'likes', me.uid);
  let liked = false;
  const u1 = F.onSnapshot(F.collection(fs, 'posts', id, 'likes'), s => {
    liked = s.docs.some(d => d.id === me.uid);
    $('#p-n').textContent = s.size;
    $('#p-like').classList.toggle('on', liked); $('#p-like').setAttribute('aria-pressed', liked);
    $('#p-like .heart').textContent = liked ? '♥' : '♡';
  }, () => {});
  $('#p-like').onclick = async () => {
    try { liked ? await F.deleteDoc(likeRef) : await F.setDoc(likeRef, { postOwner: post.owner, createdAt: F.serverTimestamp() }); }
    catch (e) { toast(errMsg(e), { err: true }); }
  };
  const u2 = F.onSnapshot(F.query(F.collection(fs, 'posts', id, 'comments'), F.orderBy('createdAt'), F.limit(200)), async s => {
    const list = s.docs.map(d => ({ id: d.id, ...d.data() }));
    const ps = await Promise.all(list.map(c => publicProfile(c.from).catch(() => ({ uid: c.from, handle: '?', name: '' }))));
    $('#p-cn').textContent = list.length ? `${list.length} commentaire${list.length > 1 ? 's' : ''}` : '';
    $('#p-list').outerHTML = `<div id="p-list">${list.length ? list.map((c, i) => `<div class="cmt">${avatarHtml(ps[i], 32)}<div class="cmt-body">
        <a class="so-link" href="${c.from === me.uid ? '#/profil' : '#/u/' + c.from}"><b>@${esc(ps[i].handle)}</b></a> <span class="small muted">${ago(c.createdAt)}</span>
        <p>${esc(c.text)}</p></div>${c.from === me.uid || mine ? `<button class="icon-btn ghost small" data-cdel="${c.id}" aria-label="Supprimer le commentaire">✕</button>` : ''}</div>`).join('')
      : '<p class="muted small">Aucun commentaire. Soyez le premier !</p>'}</div>`;
    view.querySelectorAll('[data-cdel]').forEach(b => b.onclick = async () => {
      if (await confirmDialog('Supprimer ce commentaire ?', 'Supprimer', true)) F.deleteDoc(F.doc(fs, 'posts', id, 'comments', b.dataset.cdel)).catch(e => toast(errMsg(e), { err: true }));
    });
  }, e => { const l = $('#p-list'); if (l) l.textContent = errMsg(e); });
  $('#p-form').onsubmit = async e => {
    e.preventDefault();
    const text = $('#p-text').value.trim(); if (!text) return;
    $('#p-text').value = '';
    try { await F.addDoc(F.collection(fs, 'posts', id, 'comments'), { from: me.uid, postOwner: post.owner, text, createdAt: F.serverTimestamp() }); }
    catch (err) { toast(errMsg(err), { err: true }); $('#p-text').value = text; }
  };
  if (mine) $('#p-more').onclick = async () => {
    if (!(await confirmDialog('Retirer cette création de votre profil ? Elle reste dans Mes créations sur ce téléphone (marquée privée).', 'Retirer', true))) return;
    const card = await db.get('cards', id);
    if (card) { card.private = true; await db.put('cards', card); } else await unpublishCard(id);
    toast('Création retirée de votre profil'); history.back();
  };
  return () => { u1(); u2(); };
}

// --- Alertes : j'aime et commentaires reçus ---------------------------------------

export function watchPostActivity(me, notify) {
  const stops = [];
  return fb().then(({ F, fs }) => {
    for (const kind of ['likes', 'comments']) {
      let first = true;
      stops.push(F.onSnapshot(F.query(F.collectionGroup(fs, kind), F.where('postOwner', '==', me.uid)), async s => {
        if (!first) for (const ch of s.docChanges()) {
          if (ch.type !== 'added') continue;
          const d = ch.doc.data(), from = kind === 'likes' ? ch.doc.id : d.from;
          if (from === me.uid) continue;
          const p = await publicProfile(from).catch(() => null); if (!p) continue;
          const postId = ch.doc.ref.parent.parent.id;
          notify(kind === 'likes' ? `@${p.handle} aime votre création` : `@${p.handle} a commenté : ${d.text}`, '#/post/' + postId);
        }
        first = false;
      }, () => {}));
    }
    return () => stops.forEach(f => f());
  });
}
