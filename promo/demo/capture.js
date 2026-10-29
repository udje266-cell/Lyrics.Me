// Capture des vrais écrans de Verso avec un contenu de démonstration (artiste fictive,
// paroles originales, pochettes générées), pour la pub. Usage : node capture.js <dossier-sortie>
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const OUT = process.argv[2];
const DEMO = __dirname;
const APP = 'http://localhost:8765/';
const img = n => `https://demo.verso/${n}`;

const LYRICS = `[Couplet 1]
On marchait sous les lumières de la lagune
Tes mots tenaient chaud comme une écharpe de lune
Et la ville chantait nos rêves à voix basse

[Refrain]
Cette phrase que je me repasse en boucle
Garde la tête haute, même quand ça brûle
On danse encore, on danse encore
Jusqu'à ce que la nuit se lève sur Abidjan

[Couplet 2]
J'ai gardé ton rire au fond de ma poche
Comme un ticket de bus qu'on ne jette jamais`;

const albums = [
  { id: 1, title: "Lumière d'Abidjan", record_type: 'album', release_date: '2026-03-14', c: 'cover1.jpg' },
  { id: 2, title: 'Lagune', record_type: 'album', release_date: '2024-06-01', c: 'cover2.jpg' },
  { id: 3, title: 'Anis', record_type: 'ep', release_date: '2023-02-10', c: 'cover3.jpg' },
  { id: 4, title: "Nuits d'Abidjan", record_type: 'single', release_date: '2026-01-20', c: 'cover1.jpg' },
  { id: 5, title: 'Océan', record_type: 'single', release_date: '2025-09-05', c: 'cover4.jpg' },
  { id: 6, title: 'Braise', record_type: 'single', release_date: '2025-04-18', c: 'cover5.jpg' },
];
const artist = { id: 999, name: 'Nina Lumen', picture_medium: img('artist.jpg'), picture_xl: img('artist.jpg'), nb_fan: 182400, nb_album: 6, link: '' };
const al = a => ({ id: a.id, title: a.title, record_type: a.record_type, release_date: a.release_date, cover_medium: img(a.c), cover_xl: img(a.c), artist });
const chartTracks = [
  ['Tête haute', 'Nina Lumen', 'cover1.jpg'], ['Kalaba', 'Sami Doré', 'cover5.jpg'], ['Lagune bleue', 'Nina Lumen', 'cover2.jpg'],
  ['Midi pile', 'Les Jumeaux K', 'cover4.jpg'], ['Anoumabo Love', 'Ayo Grâce', 'cover3.jpg'], ['Brise', 'Keziah', 'cover2.jpg'],
  ['Zéro stress', 'DJ Mawa', 'cover5.jpg'], ['Doux', 'Ayo Grâce', 'cover4.jpg'], ['Rien à prouver', 'Sami Doré', 'cover1.jpg'], ['Océan', 'Nina Lumen', 'cover4.jpg'],
].map(([t, a, c], i) => ({ title: t, position: i + 1, artist: { id: 999, name: a }, album: { cover_medium: img(c) } }));

function deezer(u) {
  const p = u.pathname;
  if (p === '/search/artist') return { data: [artist, { ...artist, id: 998, name: 'Nina Lumen & Kofi Sol', nb_fan: 2400 }] };
  if (p === '/search') return { data: [{ title: "Nuits d'Abidjan", artist, album: { title: "Lumière d'Abidjan", cover_xl: img('cover1.jpg'), cover_medium: img('cover1.jpg') } }] };
  if (p === '/artist/999') return artist;
  if (p === '/artist/999/albums') return { data: albums.map(al) };
  if (/^\/album\/\d+$/.test(p)) return { title: albums[0].title, artist, release_date: '2026-03-14', cover_xl: img('cover1.jpg'), tracks: { data: [{ title: "Nuits d'Abidjan", artist, duration: 201, track_position: 1 }, { title: 'Tête haute (feat. Kofi Sol)', artist, duration: 188, track_position: 2 }] } };
  if (p === '/chart/0') return { tracks: { data: chartTracks }, albums: { data: albums.slice(0, 4).map(al) } };
  if (p === '/editorial/2/charts') return { tracks: { data: chartTracks.slice().reverse() } };
  return { data: [] };
}

const RSS = `<?xml version="1.0"?><rss><channel>
<item><title>Nina Lumen annonce une tournée dans six villes d'Afrique de l'Ouest</title><link>https://demo.verso/a1</link><pubDate>${new Date(Date.now() - 25 * 60e3).toUTCString()}</pubDate><enclosure url="${img('photo.jpg')}" type="image/jpeg"/></item>
<item><title>Les albums francophones les plus attendus de l'automne</title><link>https://demo.verso/a2</link><pubDate>${new Date(Date.now() - 3 * 3600e3).toUTCString()}</pubDate><enclosure url="${img('cover2.jpg')}" type="image/jpeg"/></item>
<item><title>Zouglou, coupé-décalé, afro : la nouvelle scène en dix titres</title><link>https://demo.verso/a3</link><pubDate>${new Date(Date.now() - 9 * 3600e3).toUTCString()}</pubDate><enclosure url="${img('cover5.jpg')}" type="image/jpeg"/></item>
</channel></rss>`;

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 360, height: 596 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, colorScheme: 'dark' });
  await ctx.route('https://demo.verso/**', r => {
    const f = path.join(DEMO, path.basename(new URL(r.request().url()).pathname));
    if (fs.existsSync(f)) r.fulfill({ status: 200, contentType: 'image/jpeg', headers: { 'access-control-allow-origin': '*' }, body: fs.readFileSync(f) });
    else r.fulfill({ status: 404 });
  });
  await ctx.route('https://api.deezer.com/**', r => {
    const u = new URL(r.request().url());
    r.fulfill({ status: 200, contentType: 'text/javascript', body: `${u.searchParams.get('callback')}(${JSON.stringify(deezer(u))})` });
  });
  await ctx.route('https://*.wikipedia.org/**', r => {
    const u = new URL(r.request().url());
    const body = u.searchParams.get('list') === 'search'
      ? { query: { search: [{ title: 'Nina Lumen', snippet: 'chanteuse ivoirienne' }] } }
      : { query: { pages: [{ title: 'Nina Lumen', fullurl: 'https://demo.verso/wiki', extract: "Nina Lumen est une chanteuse et autrice-compositrice ivoirienne, née à Abidjan. Elle mêle zouglou, afro-pop et chanson française.\n\nRévélée en 2023 avec l'EP Anis, elle publie l'album Lumière d'Abidjan en 2026, porté par le single Nuits d'Abidjan." }] } };
    r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) });
  });
  await ctx.route('https://lrclib.net/**', r => r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: '[]' }));
  await ctx.addInitScript(rss => {
    window.VersoAndroid = {
      saveFile: () => 'ok', shareFile: () => 'ok', setThemeColor: () => {},
      nowPlayingAllowed: () => true, openNowPlayingSettings: () => {},
      nowPlaying: () => JSON.stringify({ title: "Nuits d'Abidjan", artist: 'Nina Lumen', album: "Lumière d'Abidjan", playing: true, app: 'Spotify' }),
      fetchText: (id, url) => setTimeout(() => window.__versoFetched(id, url.includes('rfi') ? rss : '', url.includes('rfi') ? '' : 'x'), 30),
    };
    try { localStorage.setItem('verso-theme', 'dark'); } catch {}
  }, RSS);
  const p = await ctx.newPage();
  p.on('pageerror', e => console.log('ERR', e.message));
  const nav = async (h, w = 900) => { await p.evaluate(h => { location.hash = h; }, h); await p.waitForTimeout(w); };
  const RECTS = {};
  const rects = async (name, sels) => {
    RECTS[name] = await p.evaluate(sels => {
      const out = {};
      for (const [k, sel] of Object.entries(sels)) {
        let r = null;
        if (sel.startsWith('word:')) {
          const [, line, a, z] = sel.split(':');
          const n = document.querySelector(`.ln[data-i="${line}"]`).firstChild; const rg = document.createRange(); rg.setStart(n, +a); rg.setEnd(n, +z); r = rg.getBoundingClientRect();
        } else { const el = document.querySelector(sel); if (el) r = el.getBoundingClientRect(); }
        if (r) out[k] = { x: r.x * 3, y: (r.y + scrollY) * 3, w: r.width * 3, h: r.height * 3, vy: r.y * 3 };
      }
      return out;
    }, sels);
  };
  const shot = async (name, full = false) => { await p.evaluate(full => { document.querySelectorAll('.toast').forEach(t => t.remove()); let st = document.getElementById('cap-full'); if (!st) { st = document.createElement('style'); st.id = 'cap-full'; document.head.append(st); } st.textContent = full ? '.nav,.search-fab{display:none!important}' : ''; }, full); await p.screenshot({ path: path.join(OUT, name + '.png'), fullPage: full }); console.log('capturé', name); };

  await p.goto(APP); await p.waitForTimeout(1200);
  // Profil et morceaux de démonstration.
  await p.evaluate(async ({ LYRICS }) => {
    const { db, uid } = await import('/js/db.js');
    const fetchB = async n => (await fetch('https://demo.verso/' + n)).blob();
    await db.setSetting('profile', { name: 'Udje', handle: 'udje.verso', bio: 'Les paroles qui me portent.', avatar: await fetchB('artist.jpg'), updatedAt: Date.now() });
    await db.setSetting('signature', '@udje.verso');
    await db.setSetting('selHintSeen', true);
    const now = Date.now();
    const album = { id: 'alb1', title: "Lumière d'Abidjan", artist: 'Nina Lumen', year: '2026', cover: await fetchB('cover1.jpg'), tags: [], createdAt: now, updatedAt: now };
    await db.put('albums', album);
    const songs = [
      { id: 'nuits', title: "Nuits d'Abidjan", lyrics: LYRICS, cover: album.cover, albumId: 'alb1', album: album.title, trackNo: 1, collection: 'Nostalgie', tags: ['lagune'] },
      { id: 'tete', title: 'Tête haute', featuring: 'Kofi Sol', lyrics: "Garde la tête haute, même quand ça brûle\nOn avance, on avance", cover: album.cover, albumId: 'alb1', album: album.title, trackNo: 2, collection: 'Motivation' },
      { id: 'ocean', title: 'Océan', lyrics: "Tu es l'océan que je n'ose pas traverser\nMais je reste au bord, à t'écouter respirer", cover: await fetchB('cover4.jpg'), collection: 'Amour' },
    ];
    for (const [i, s] of songs.entries()) await db.put('songs', { artist: 'Nina Lumen', featuring: '', lang: 'Français', tags: [], note: '', favorite: i !== 2, sourceUrl: '', ...s, createdAt: now - i * 1000, updatedAt: now - i * 1000 });
  }, { LYRICS });

  // Accueil : musique en cours, vers, actualités, tendances.
  await nav('#/profil', 300); await nav('#/', 3500);
  await shot('01-accueil');
  await rects('01-accueil', { paroles: '#np-ly', loupe: '.search-fab', profil: '.nav a[data-nav=profile]', accueil: '.nav a[data-nav=home]' });
  await shot('01-accueil-full', true);
  await rects('01-accueil-full', { news: '#news', trends: '#trends' });
  // Page du morceau.
  await nav('#/morceau/nuits', 1500);
  await shot('02-paroles');
  await p.evaluate(() => document.getElementById('lyrics').scrollIntoView({ block: 'start' }));
  await p.evaluate(() => window.scrollBy(0, -40));
  await p.waitForTimeout(300);
  await shot('02b-refrain');
  await rects('02b-refrain', { mot: 'word:6:0:5' });
  // Sélection mot par mot dans le refrain.
  await p.evaluate(() => {
    const a = document.querySelector('.ln[data-i="6"]').firstChild, z = document.querySelector('.ln[data-i="7"]').firstChild;
    const r = document.createRange(); r.setStart(a, 0); r.setEnd(z, 28);
    getSelection().removeAllRanges(); getSelection().addRange(r);
  });
  await p.waitForTimeout(600);
  await p.evaluate(() => document.getElementById('lyrics').scrollIntoView({ block: 'start' }));
  await p.evaluate(() => window.scrollBy(0, -40));
  await p.waitForTimeout(300);
  await shot('03-selection');
  await rects('03-selection', { creer: '#mkcard', mot: 'word:6:0:5', fin: 'word:7:20:28' });
  // Recherche à la loupe.
  await nav('#/recherche', 700);
  await p.fill('#sq', 'Nina'); await p.waitForSelector('.s-artists a'); await p.waitForTimeout(800);
  await p.evaluate(() => document.activeElement.blur());
  await shot('04-recherche');
  await rects('04-recherche', { artiste: '.s-artists a' });
  // Page artiste.
  await nav('#/artiste/999', 3500);
  await shot('05-artiste');
  await rects('05-artiste', { importer: '#imp-all' });
  await shot('05-artiste-full', true);
  // Studio : carte Bandeau sur une photo personnelle, mot mis en évidence.
  const cards = await p.evaluate(async () => {
    const { db } = await import('/js/db.js');
    const { newCard } = await import('/js/studio.js');
    const r = await import('/js/render.js');
    const song = await db.get('songs', 'nuits');
    const photo = await (await fetch('https://demo.verso/photo.jpg')).blob();
    const excerpt = 'Cette phrase que je me repasse en boucle\nGarde la tête haute, même quand ça brûle';
    const specs = [
      { template: 'bandeau', photo, kind: 'photo', hl: ['boucle'] },
      { template: 'vinyle', hl: ['haute'] },
      { template: 'editorial', hl: ['boucle'] },
      { template: 'typo', hl: ['haute', 'brûle'] },
      { template: 'minimal', hl: [] },
      { template: 'pochette', hl: ['boucle'] },
    ];
    const ids = [];
    for (const [i, s] of specs.entries()) {
      const c = await newCard(song, excerpt, { template: s.template, photo: s.photo || null });
      if (s.kind) c.style.bg.kind = s.kind;
      if (s.template === 'bandeau' && !s.kind) c.style.bg.kind = 'ambiance';
      c.style.highlights = s.hl;
      if (s.template === 'vinyle') { c.images.label = song.cover; }
      c.draft = false;
      const imgs = { cover: await r.blobToBitmap(c.images.cover), photo: await r.blobToBitmap(c.images.photo), label: await r.blobToBitmap(c.images.label) };
      await r.ensureFonts(c.style);
      const cv = document.createElement('canvas'); r.renderCard(cv, c, imgs, { scale: 0.3 });
      c.thumb = await new Promise(res => cv.toBlob(res, 'image/jpeg', 0.85));
      c.updatedAt = Date.now() - i * 1000;
      await db.put('cards', c);
      ids.push(c.id);
    }
    return ids;
  });
  await nav('#/studio/' + cards[0], 2500);
  await shot('06-studio');
  await rects('06-studio', { stage: '#stage', cv: '#cv', style: '[data-tab=style]', format: '[data-tab=format]', couleur: '#t-color', police: '#t-font', hl: '#t-hl' });
  await shot('06-studio-full', true);
  await rects('06-studio-full', { couleur: '#t-color', police: '#t-font', hl: '#t-hl', mots: '.card-box' });
  await p.click('[data-tab=style]'); await p.waitForTimeout(800);
  await shot('07-studio-style');
  await shot('07-studio-style-full', true);
  await rects('07-studio-style', { stage: '#stage', cv: '#cv', bandeau: '[data-tpl=bandeau]', minimal: '[data-tpl=minimal]', editorial: '[data-tpl=editorial]', pochette: '[data-tpl=pochette]', photo: '[data-tpl=photo]', vinyle: '[data-tpl=vinyle]', typo: '[data-tpl=typo]' });
  await p.click('[data-tab=format]'); await p.waitForTimeout(500);
  await shot('08-studio-format');
  await shot('08-studio-format-full', true);
  await rects('08-studio-format', { stage: '#stage', share: '#x-share', cv: '#cv', square: '[data-seg=format] [data-v=square]', portrait: '[data-seg=format] [data-v=portrait]', story: '[data-seg=format] [data-v=story]' });
  await p.evaluate(() => document.getElementById('x-share').scrollIntoView({ block: 'center' })); await p.waitForTimeout(300);
  await shot('08b-partager');
  await rects('08b-partager', { partager: '#x-share' });
  // Profil.
  await nav('#/profil', 1500);
  await shot('09-profil');
  await rects('09-profil', { grille: '.pf-grid', accueil: '.nav a[data-nav=home]' });
  fs.writeFileSync(path.join(OUT, 'rects.json'), JSON.stringify(RECTS, null, 1));

  // Cartes exportées en haute définition (vrai moteur de rendu de Verso).
  const exports = await p.evaluate(async ids => {
    const { db } = await import('/js/db.js');
    const r = await import('/js/render.js');
    const out = {};
    for (const id of ids) {
      const c = await db.get('cards', id);
      const imgs = { cover: await r.blobToBitmap(c.images.cover), photo: await r.blobToBitmap(c.images.photo), label: await r.blobToBitmap(c.images.label) };
      await r.ensureFonts(c.style);
      for (const f of (c.template === 'bandeau' ? ['square', 'portrait', 'story'] : ['square'])) {
        const cv = document.createElement('canvas');
        r.renderCard(cv, { ...c, format: f }, imgs, { scale: 1 });
        out[c.template + '-' + f] = cv.toDataURL('image/png');
      }
    }
    return out;
  }, cards);
  for (const [k, d] of Object.entries(exports)) { fs.writeFileSync(path.join(OUT, 'carte-' + k + '.png'), Buffer.from(d.split(',')[1], 'base64')); console.log('carte', k); }
  await b.close();
})();
