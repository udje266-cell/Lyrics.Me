// Comptes en ligne (Firebase Authentication + Firestore) : profil public, amis et messages.
// Le reste de Verso (bibliothèque, cartes…) reste sur l'appareil. Le SDK n'est chargé
// qu'à l'ouverture des écrans de compte.
import { db } from './db.js';
import { esc, toast, go, openDialog, confirmDialog, blobUrl, openNowPlaying } from './app.js';

const CONFIG = {
  apiKey: 'AIzaSyBAwAt4yDkWGv8M9kBrtmZvjqEBewV3GoE',
  authDomain: 'verso-a040a.firebaseapp.com',
  projectId: 'verso-a040a',
  storageBucket: 'verso-a040a.firebasestorage.app',
  messagingSenderId: '1066461822958',
  appId: '1:1066461822958:web:9caa35f30a327a3f3b98ff',
};

let fbPromise = null;
export function fb() {
  if (!fbPromise) fbPromise = (async () => {
    const [A, U, F] = await Promise.all([
      import('./vendor/firebase/firebase-app.js'),
      import('./vendor/firebase/firebase-auth.js'),
      import('./vendor/firebase/firebase-firestore.js'),
    ]);
    const app = A.initializeApp(CONFIG);
    const auth = U.getAuth(app);
    const fs = F.getFirestore(app);
    await auth.authStateReady();
    return { U, F, auth, fs };
  })().catch(e => { fbPromise = null; throw e; });
  return fbPromise;
}

// Utilisateur connecté (ou null), sans charger le SDK si aucun compte n'a jamais été ouvert.
export async function currentUser() {
  if (!(await db.setting('account', null))) return null;
  try { return (await fb()).auth.currentUser; } catch { return null; }
}

const ERRORS = {
  'auth/email-already-in-use': 'Cette adresse e-mail a déjà un compte : connectez-vous.',
  'auth/invalid-email': 'Adresse e-mail invalide.',
  'auth/weak-password': 'Mot de passe trop court (6 caractères minimum).',
  'auth/invalid-credential': 'E-mail ou mot de passe incorrect.',
  'auth/wrong-password': 'E-mail ou mot de passe incorrect.',
  'auth/user-not-found': 'Aucun compte avec cette adresse e-mail.',
  'auth/too-many-requests': 'Trop de tentatives : réessayez dans quelques minutes.',
  'auth/network-request-failed': 'Pas de connexion internet.',
  'permission-denied': 'Action refusée.',
  'unavailable': 'Pas de connexion internet.',
};
export const errMsg = e => ERRORS[e && e.code] || (e && e.message) || 'Erreur inconnue';

export const cleanHandle = h => String(h || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/^@+/, '').replace(/[^a-z0-9._]/g, '').slice(0, 30);

const pairOf = (a, b) => (a < b ? [a, b] : [b, a]);

async function blobToJpegDataURL(blob, max) {
  const bmp = await createImageBitmap(blob);
  const s = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * s); c.height = Math.round(bmp.height * s);
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.82);
}
const dataURLToBlob = async u => (await fetch(u)).blob();

// --- Profil public ---------------------------------------------------------

const profileCache = new Map();
export async function publicProfile(uid) {
  if (!profileCache.has(uid)) {
    profileCache.set(uid, (async () => {
      const { F, fs } = await fb();
      const s = await F.getDoc(F.doc(fs, 'profiles', uid));
      return s.exists() ? { uid, ...s.data() } : { uid, handle: '', name: 'Compte supprimé', bio: '', avatar: '' };
    })().catch(e => { profileCache.delete(uid); throw e; }));
  }
  return profileCache.get(uid);
}

// Publie le profil local (nom, pseudo, bio, photo) ; réserve le pseudo s'il a changé.
export async function syncProfile(local) {
  const { F, fs, auth } = await fb();
  const u = auth.currentUser; if (!u) return;
  const handle = cleanHandle(local.handle);
  if (handle.length < 3) throw new Error('Le pseudo doit faire au moins 3 caractères (lettres, chiffres, . ou _).');
  const ref = F.doc(fs, 'profiles', u.uid);
  const cur = await F.getDoc(ref);
  const old = cur.exists() ? cur.data().handle : '';
  const avatar = local.avatar ? await blobToJpegDataURL(local.avatar, 256) : '';
  const b = F.writeBatch(fs);
  if (handle !== old) {
    const taken = await F.getDoc(F.doc(fs, 'handles', handle));
    if (taken.exists() && taken.data().uid !== u.uid) throw new Error(`Le pseudo @${handle} est déjà pris.`);
    if (!taken.exists()) b.set(F.doc(fs, 'handles', handle), { uid: u.uid });
    if (old) b.delete(F.doc(fs, 'handles', old));
  }
  b.set(ref, { handle, name: String(local.name || '').slice(0, 50), bio: String(local.bio || '').slice(0, 160), avatar,
    createdAt: cur.exists() ? cur.data().createdAt : F.serverTimestamp(), updatedAt: F.serverTimestamp() });
  await b.commit();
  profileCache.delete(u.uid);
  return handle;
}

// --- Écran compte : inscription / connexion ---------------------------------

export async function renderAccount() {
  const view = document.getElementById('view');
  const local = (await db.setting('profile', null)) || { name: '', handle: '', bio: '', avatar: null };
  let mode = 'signup';
  const draw = () => {
    view.innerHTML = `<div class="acc">
      <a class="icon-btn ghost" href="#/profil" aria-label="Retour">←</a>
      <h1>${mode === 'signup' ? 'Créer un compte Verso' : 'Se connecter'}</h1>
      <p class="muted small">Un compte permet d'ajouter des amis et de leur envoyer des messages, des morceaux et vos cartes. Votre bibliothèque reste sur ce téléphone.</p>
      <form id="acc-f" class="stack" novalidate>
        ${mode === 'signup' ? `<div><label for="a-h">Pseudo</label><input id="a-h" value="${esc(cleanHandle(local.handle))}" placeholder="monpseudo" autocomplete="username" spellcheck="false" autocapitalize="none" required minlength="3" maxlength="30"></div>
        <div><label for="a-n">Nom affiché</label><input id="a-n" value="${esc(local.name)}" autocomplete="name" maxlength="50"></div>` : ''}
        <div><label for="a-e">E-mail</label><input id="a-e" type="email" autocomplete="email" inputmode="email" autocapitalize="none" spellcheck="false" required></div>
        <div><label for="a-p">Mot de passe</label><input id="a-p" type="password" autocomplete="${mode === 'signup' ? 'new-password' : 'current-password'}" minlength="6" required></div>
        <p class="notice err" id="a-err" hidden></p>
        <button class="primary" id="a-go">${mode === 'signup' ? 'Créer mon compte' : 'Se connecter'}</button>
      </form>
      <p class="acc-switch">${mode === 'signup' ? 'Déjà un compte ? <button type="button" class="link" id="a-sw">Se connecter</button>'
        : 'Pas encore de compte ? <button type="button" class="link" id="a-sw">Créer un compte</button><br><button type="button" class="link" id="a-reset">Mot de passe oublié</button>'}</p>
    </div>`;
    const $ = s => view.querySelector(s);
    const fail = m => { $('#a-err').textContent = m; $('#a-err').hidden = false; $('#a-go').disabled = false; };
    $('#a-sw').onclick = () => { mode = mode === 'signup' ? 'login' : 'signup'; draw(); };
    if ($('#a-reset')) $('#a-reset').onclick = async () => {
      const email = $('#a-e').value.trim(); if (!email) return fail('Saisissez votre e-mail, puis touchez « Mot de passe oublié ».');
      try { const { U, auth } = await fb(); await U.sendPasswordResetEmail(auth, email); toast('E-mail de réinitialisation envoyé.'); }
      catch (e) { fail(errMsg(e)); }
    };
    $('#acc-f').onsubmit = async e => {
      e.preventDefault();
      $('#a-err').hidden = true; $('#a-go').disabled = true;
      const email = $('#a-e').value.trim(), pass = $('#a-p').value;
      if (!navigator.onLine) return fail('Pas de connexion internet.');
      try {
        const { U, auth } = await fb();
        if (mode === 'signup') {
          const handle = cleanHandle($('#a-h').value);
          if (handle.length < 3) return fail('Le pseudo doit faire au moins 3 caractères (lettres, chiffres, . ou _).');
          await U.createUserWithEmailAndPassword(auth, email, pass);
          await db.setSetting('account', true);
          const p = { ...local, handle, name: $('#a-n').value.trim(), updatedAt: Date.now() };
          try { await syncProfile(p); }
          catch (err) { await db.setSetting('profile', { ...p, handle: '' }); toast(err.message, { err: true }); return go('#/profil'); }
          await db.setSetting('profile', p);
          if (!(await db.setting('signature', ''))) await db.setSetting('signature', '@' + handle);
          toast('Compte créé. Bienvenue @' + handle + ' !');
        } else {
          await U.signInWithEmailAndPassword(auth, email, pass);
          await db.setSetting('account', true);
          const pub = await publicProfile(auth.currentUser.uid);
          if (pub.handle) await db.setSetting('profile', { ...local, handle: pub.handle, name: pub.name, bio: pub.bio,
            avatar: pub.avatar ? await dataURLToBlob(pub.avatar) : local.avatar, updatedAt: Date.now() });
          toast('Connecté');
        }
        go('#/profil');
      } catch (err) { fail(errMsg(err)); }
    };
  };
  draw();
}

export async function signOut() {
  const { U, auth } = await fb();
  await U.signOut(auth);
  await db.setSetting('account', null);
  profileCache.clear();
}

// --- Avatars ----------------------------------------------------------------

export const avatarHtml = (p, size = 44) => p.avatar
  ? `<img class="so-av" src="${esc(p.avatar)}" alt="" width="${size}" height="${size}" style="width:${size}px;height:${size}px">`
  : `<span class="so-av ph" style="width:${size}px;height:${size}px" aria-hidden="true">${esc((p.name || p.handle || '?')[0].toUpperCase())}</span>`;

// --- Amis -------------------------------------------------------------------

async function requireUser() {
  const u = await currentUser();
  if (!u) { go('#/compte'); return null; }
  return u;
}

export async function renderFriends() {
  const view = document.getElementById('view');
  const me = await requireUser(); if (!me) return;
  const { F, fs } = await fb();
  view.innerHTML = `<div class="page-head"><a class="icon-btn ghost" href="#/profil" aria-label="Retour">←</a><h1 style="flex:1">Amis</h1><a class="btn" href="#/messages">Messages</a></div>
    <form id="fr-f" role="search" class="field"><input id="fr-q" type="search" placeholder="Chercher un pseudo…" autocomplete="off" autocapitalize="none" spellcheck="false" aria-label="Chercher un pseudo"></form>
    <div id="fr-res"></div>
    <section id="fr-in"></section>
    <section><h2>Mes amis</h2><div id="fr-list" class="muted small">Chargement…</div></section>
    <section id="fr-out"></section>`;
  const $ = s => view.querySelector(s);
  let friends = [], incoming = [], outgoing = [];
  const rel = uid => friends.find(f => f.other === uid) ? 'friend' : incoming.find(r => r.from === uid) ? 'in' : outgoing.find(r => r.to === uid) ? 'out' : 'none';
  const row = (p, actions) => `<li class="so-row">${avatarHtml(p)}<div class="so-who"><b>${esc(p.name || '@' + p.handle)}</b><span class="small muted">@${esc(p.handle)}</span></div><div class="so-act">${actions}</div></li>`;

  const accept = async from => {
    const [a, b] = pairOf(from, me.uid);
    const batch = F.writeBatch(fs);
    batch.set(F.doc(fs, 'friendships', a + '_' + b), { members: [a, b], createdAt: F.serverTimestamp() });
    try { await batch.commit(); } catch (e) { return toast(errMsg(e), { err: true }); }
    await F.deleteDoc(F.doc(fs, 'friendRequests', from + '_' + me.uid)).catch(() => {});
    await F.deleteDoc(F.doc(fs, 'friendRequests', me.uid + '_' + from)).catch(() => {});
    toast('Vous êtes maintenant amis');
  };
  const add = async uid => {
    if (rel(uid) === 'in') return accept(uid);
    try { await F.setDoc(F.doc(fs, 'friendRequests', me.uid + '_' + uid), { from: me.uid, to: uid, createdAt: F.serverTimestamp() }); toast('Demande envoyée'); }
    catch (e) { toast(errMsg(e), { err: true }); }
  };
  const bindActs = root => root.querySelectorAll('[data-act]').forEach(b => b.onclick = async () => {
    const { act, uid } = b.dataset; b.disabled = true;
    if (act === 'add') await add(uid);
    if (act === 'accept') await accept(uid);
    if (act === 'decline') await F.deleteDoc(F.doc(fs, 'friendRequests', uid + '_' + me.uid)).catch(e => toast(errMsg(e), { err: true }));
    if (act === 'cancel') await F.deleteDoc(F.doc(fs, 'friendRequests', me.uid + '_' + uid)).catch(e => toast(errMsg(e), { err: true }));
    if (act === 'chat') go('#/discussion/' + pairOf(me.uid, uid).join('_'));
    if (act === 'remove') {
      const p = await publicProfile(uid);
      if (await confirmDialog(`Retirer @${p.handle} de vos amis ? Vous ne pourrez plus vous écrire.`, 'Retirer', true))
        await F.deleteDoc(F.doc(fs, 'friendships', pairOf(me.uid, uid).join('_'))).catch(e => toast(errMsg(e), { err: true }));
    }
    b.disabled = false;
    search();
  });

  let token = 0;
  const search = async () => {
    const q = cleanHandle($('#fr-q').value);
    const out = $('#fr-res');
    if (!q) { out.innerHTML = ''; return; }
    const my = ++token;
    try {
      const snap = await F.getDocs(F.query(F.collection(fs, 'profiles'), F.orderBy('handle'), F.startAt(q), F.endAt(q + ''), F.limit(10)));
      if (my !== token) return;
      const list = snap.docs.map(d => ({ uid: d.id, ...d.data() })).filter(p => p.uid !== me.uid);
      out.innerHTML = list.length ? `<ul class="so-list">${list.map(p => {
        const r = rel(p.uid);
        const act = r === 'friend' ? `<button class="ghost" data-act="chat" data-uid="${p.uid}">Message</button>`
          : r === 'in' ? `<button class="primary" data-act="accept" data-uid="${p.uid}">Accepter</button>`
          : r === 'out' ? `<button class="ghost" data-act="cancel" data-uid="${p.uid}">Demandé</button>`
          : `<button class="primary" data-act="add" data-uid="${p.uid}">Ajouter</button>`;
        return row(p, act);
      }).join('')}</ul>` : '<p class="muted small">Aucun compte avec ce pseudo.</p>';
      bindActs(out);
    } catch (e) { out.innerHTML = `<p class="notice err">${esc(errMsg(e))}</p>`; }
  };
  let t = 0;
  $('#fr-q').oninput = () => { clearTimeout(t); t = setTimeout(search, 300); };
  $('#fr-f').onsubmit = e => { e.preventDefault(); search(); };

  const drawIn = async () => {
    const ps = await Promise.all(incoming.map(r => publicProfile(r.from)));
    $('#fr-in').innerHTML = ps.length ? `<h2>Demandes reçues <span class="so-badge">${ps.length}</span></h2><ul class="so-list">${ps.map(p => row(p,
      `<button class="primary" data-act="accept" data-uid="${p.uid}">Accepter</button><button class="ghost" data-act="decline" data-uid="${p.uid}" aria-label="Refuser">✕</button>`)).join('')}</ul>` : '';
    bindActs($('#fr-in'));
  };
  const drawOut = async () => {
    const ps = await Promise.all(outgoing.map(r => publicProfile(r.to)));
    $('#fr-out').innerHTML = ps.length ? `<h2>Demandes envoyées</h2><ul class="so-list">${ps.map(p => row(p, `<button class="ghost" data-act="cancel" data-uid="${p.uid}">Annuler</button>`)).join('')}</ul>` : '';
    bindActs($('#fr-out'));
  };
  const drawFriends = async () => {
    const ps = await Promise.all(friends.map(f => publicProfile(f.other)));
    $('#fr-list').outerHTML = `<div id="fr-list">${ps.length ? `<ul class="so-list">${ps.map(p => row(p,
      `<button class="primary" data-act="chat" data-uid="${p.uid}">Message</button><button class="ghost" data-act="remove" data-uid="${p.uid}" aria-label="Retirer">⋯</button>`)).join('')}</ul>`
      : '<p class="muted small">Cherchez le pseudo d\'un ami ci-dessus pour l\'ajouter.</p>'}</div>`;
    bindActs($('#fr-list'));
  };
  const onErr = e => toast(errMsg(e), { err: true });
  const unsubs = [
    F.onSnapshot(F.query(F.collection(fs, 'friendRequests'), F.where('to', '==', me.uid)), s => { incoming = s.docs.map(d => d.data()); drawIn(); }, onErr),
    F.onSnapshot(F.query(F.collection(fs, 'friendRequests'), F.where('from', '==', me.uid)), s => { outgoing = s.docs.map(d => d.data()); drawOut(); }, onErr),
    F.onSnapshot(F.query(F.collection(fs, 'friendships'), F.where('members', 'array-contains', me.uid)), s => {
      friends = s.docs.map(d => ({ id: d.id, ...d.data(), other: d.data().members.find(m => m !== me.uid) })); drawFriends();
    }, onErr),
  ];
  return () => unsubs.forEach(u => u());
}

// --- Messages ---------------------------------------------------------------

const readKey = 'verso-read';
const readMap = () => { try { return JSON.parse(localStorage.getItem(readKey) || '{}'); } catch { return {}; } };
const markRead = (pid, ms) => { try { const m = readMap(); m[pid] = ms; localStorage.setItem(readKey, JSON.stringify(m)); } catch {} };
const isUnread = (f, me) => f.lastAt && f.lastFrom !== me && f.lastAt.toMillis() > (readMap()[f.id] || 0);

// Nombre de discussions non lues (pastille du profil) ; null si pas de compte.
export async function unreadCount() {
  const me = await currentUser(); if (!me) return null;
  const { F, fs } = await fb();
  const s = await F.getDocs(F.query(F.collection(fs, 'friendships'), F.where('members', 'array-contains', me.uid)));
  return s.docs.filter(d => isUnread({ id: d.id, ...d.data() }, me.uid)).length;
}

const hhmm = ts => {
  if (!ts) return '';
  const d = ts.toDate(), now = new Date();
  return d.toDateString() === now.toDateString() ? d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
};

export async function renderInbox() {
  const view = document.getElementById('view');
  const me = await requireUser(); if (!me) return;
  const { F, fs } = await fb();
  view.innerHTML = `<div class="page-head"><a class="icon-btn ghost" href="#/profil" aria-label="Retour">←</a><h1 style="flex:1">Messages</h1><a class="btn" href="#/amis">Amis</a></div>
    <div id="ib" class="muted small">Chargement…</div>`;
  return F.onSnapshot(F.query(F.collection(fs, 'friendships'), F.where('members', 'array-contains', me.uid)), async s => {
    const list = s.docs.map(d => ({ id: d.id, ...d.data(), other: d.data().members.find(m => m !== me.uid) }))
      .sort((a, b) => (b.lastAt ? b.lastAt.toMillis() : 0) - (a.lastAt ? a.lastAt.toMillis() : 0));
    const ps = await Promise.all(list.map(f => publicProfile(f.other)));
    const el = view.querySelector('#ib'); if (!el) return;
    el.outerHTML = `<div id="ib">${list.length ? `<ul class="so-list">${list.map((f, i) => `<li><a class="so-row so-link${isUnread(f, me.uid) ? ' unread' : ''}" href="#/discussion/${f.id}">
      ${avatarHtml(ps[i], 52)}<div class="so-who"><b>${esc(ps[i].name || '@' + ps[i].handle)}</b>
      <span class="small muted so-last">${f.lastText ? (f.lastFrom === me.uid ? 'Vous : ' : '') + esc(f.lastText) : 'Dites bonjour 👋'}</span></div>
      <span class="small muted">${hhmm(f.lastAt)}</span></a></li>`).join('')}</ul>`
      : '<div class="empty">Ajoutez des amis pour discuter avec eux.<br><br><a class="btn primary" href="#/amis">Trouver des amis</a></div>'}</div>`;
  }, e => toast(errMsg(e), { err: true }));
}

export async function renderChat(pairId) {
  const view = document.getElementById('view');
  const me = await requireUser(); if (!me) return;
  const { F, fs } = await fb();
  const other = pairId.split('_').find(x => x !== me.uid);
  if (!pairId.split('_').includes(me.uid)) { go('#/messages'); return; }
  const p = await publicProfile(other).catch(() => ({ uid: other, handle: '', name: 'Ami', avatar: '' }));
  document.body.classList.add('chat-mode');
  view.innerHTML = `<div class="chat">
    <header class="chat-head"><a class="icon-btn ghost" href="#/messages" aria-label="Retour">←</a>${avatarHtml(p, 38)}
      <div class="so-who"><b>${esc(p.name || '@' + p.handle)}</b><span class="small muted">@${esc(p.handle)}</span></div></header>
    <div class="chat-msgs" id="cm" aria-live="polite"><p class="muted small" style="text-align:center">Chargement…</p></div>
    <form class="chat-bar" id="cf">
      <button type="button" class="icon-btn ghost" id="c-att" aria-label="Partager une carte ou un morceau">+</button>
      <input id="c-t" placeholder="Message…" autocomplete="off" maxlength="2000" aria-label="Message" enterkeyhint="send">
      <button class="primary" id="c-send" aria-label="Envoyer">➤</button>
    </form></div>`;
  const $ = s => view.querySelector(s);
  const msgsRef = F.collection(fs, 'friendships', pairId, 'messages');
  const send = async (fields, preview) => {
    const b = F.writeBatch(fs);
    b.set(F.doc(msgsRef), { from: me.uid, text: '', ...fields, createdAt: F.serverTimestamp() });
    b.update(F.doc(fs, 'friendships', pairId), { lastText: preview.slice(0, 200), lastFrom: me.uid, lastAt: F.serverTimestamp() });
    try { await b.commit(); } catch (e) { toast(errMsg(e), { err: true }); }
  };
  $('#cf').onsubmit = e => {
    e.preventDefault();
    const t = $('#c-t').value.trim(); if (!t) return;
    $('#c-t').value = '';
    send({ text: t }, t);
  };
  $('#c-att').onclick = async () => {
    const cards = (await db.all('cards')).filter(c => !c.draft && c.thumb).sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 30);
    const songs = (await db.all('songs')).filter(s => !s.deletedAt).sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 40);
    const v = await openDialog(`<form method="dialog" class="stack"><h3>Partager</h3>
      ${cards.length ? `<h4 class="small muted">Mes créations</h4><div class="so-pick">${cards.map(c => `<button value="c:${c.id}" aria-label="${esc(c.title || 'Carte')}"><img src="${blobUrl('thumb-' + c.id + c.updatedAt, c.thumb)}" alt=""></button>`).join('')}</div>` : ''}
      ${songs.length ? `<h4 class="small muted">Mes morceaux</h4><div class="so-songs">${songs.map(s => `<button value="s:${s.id}"><b>${esc(s.title)}</b> <span class="muted">${esc(s.artist)}</span></button>`).join('')}</div>` : ''}
      ${!cards.length && !songs.length ? '<p class="muted">Rien à partager pour l\'instant.</p>' : ''}
      <div class="row" style="justify-content:flex-end"><button value="no">Fermer</button></div></form>`);
    if (!v || v === 'no') return;
    const [kind, id] = [v.slice(0, 1), v.slice(2)];
    if (kind === 'c') {
      const c = cards.find(x => x.id === id);
      send({ text: c.title || '', image: await blobToJpegDataURL(c.thumb, 720) }, '📷 Carte' + (c.title ? ' : ' + c.title : ''));
    } else {
      const s = songs.find(x => x.id === id);
      send({ text: '', song: { title: s.title.slice(0, 200), artist: (s.artist || '').slice(0, 200) } }, `🎵 ${s.title} · ${s.artist}`);
    }
  };
  let first = true;
  const unsub = F.onSnapshot(F.query(msgsRef, F.orderBy('createdAt'), F.limitToLast(200)), s => {
    const box = $('#cm'); if (!box) return;
    const atBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 80;
    const msgs = s.docs.map(d => ({ id: d.id, ...d.data() }));
    box.innerHTML = msgs.length ? msgs.map(m => `<div class="msg${m.from === me.uid ? ' me' : ''}" data-mid="${m.id}">
        ${m.image ? `<img src="${esc(m.image)}" alt="Carte partagée">` : ''}
        ${m.song ? `<button type="button" class="msg-song" data-t="${esc(m.song.title)}" data-a="${esc(m.song.artist)}"><span aria-hidden="true">🎵</span><span><b>${esc(m.song.title)}</b><br><span class="small">${esc(m.song.artist)} · voir les paroles</span></span></button>` : ''}
        ${m.text ? `<p>${esc(m.text)}</p>` : ''}<time class="small">${hhmm(m.createdAt)}</time></div>`).join('')
      : `<p class="muted small" style="text-align:center">Début de votre discussion avec @${esc(p.handle)}.</p>`;
    box.querySelectorAll('.msg-song').forEach(b => b.onclick = () => openNowPlaying({ title: b.dataset.t, artist: b.dataset.a }));
    box.querySelectorAll('.msg.me').forEach(el => {
      let t = 0;
      el.onpointerdown = () => { t = setTimeout(async () => {
        if (await confirmDialog('Supprimer ce message ?', 'Supprimer', true)) F.deleteDoc(F.doc(msgsRef, el.dataset.mid)).catch(e => toast(errMsg(e), { err: true }));
      }, 600); };
      el.onpointerup = el.onpointerleave = () => clearTimeout(t);
    });
    if (first || atBottom) box.scrollTop = box.scrollHeight;
    first = false;
    markRead(pairId, Date.now());
  }, e => { const box = $('#cm'); if (box) box.innerHTML = `<p class="notice err">${esc(errMsg(e))}</p>`; });
  return () => { unsub(); document.body.classList.remove('chat-mode'); };
}
