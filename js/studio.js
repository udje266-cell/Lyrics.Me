import { db, uid } from './db.js';
import { FORMATS, FONTS, TEMPLATES, TEXTURES, fontById, templatePreset, renderCard, ensureFonts, blobToBitmap, extractPalette, compressImage, splitExcerpt } from './render.js';
import { esc, toast, safe, go, openDialog, confirmDialog, download } from './app.js';

const clone = o => JSON.parse(JSON.stringify(o));

export async function newCard(song, excerpt, extra = {}) {
  const signature = await db.setting('signature', '');
  const template = extra.template || 'minimal';
  const style = extra.style ? clone(extra.style) : templatePreset(template);
  if (signature) style.meta.signature = style.meta.signature || signature;
  const now = Date.now();
  const card = {
    id: uid(), songId: song ? song.id : null, draft: true,
    title: song ? song.title : '', artist: song ? song.artist + (song.featuring ? ' feat. ' + song.featuring : '') : '',
    excerpt: excerpt || '', format: extra.format || 'square', template, style,
    images: { cover: song ? song.cover || null : null, photo: extra.photo || null },
    fileName: '', createdAt: now, updatedAt: now,
  };
  await safe(() => db.put('cards', card));
  return card;
}

const slug = s => s.replace(/œ/g, 'oe').replace(/Œ/g, 'Oe').replace(/æ/g, 'ae').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, ' ').slice(0, 80) || 'carte';
const defaultName = c => slug(`${c.artist || 'Verso'} - ${c.title || 'carte'}`);

async function loadImages(card) {
  return { cover: await blobToBitmap(card.images.cover), photo: await blobToBitmap(card.images.photo) };
}

export async function cardToBlob(card, imgs, type = 'image/png', quality = 0.92) {
  await ensureFonts(card.style);
  const c = document.createElement('canvas');
  const info = renderCard(c, card, imgs || await loadImages(card), { scale: 1 });
  const blob = await new Promise(res => c.toBlob(res, type, quality));
  if (!blob) throw new Error("La création de l'image a échoué (mémoire insuffisante ?).");
  return { blob, info };
}

async function makeThumb(card, imgs) {
  const c = document.createElement('canvas');
  renderCard(c, card, imgs, { scale: 0.3 });
  return new Promise(res => c.toBlob(res, 'image/jpeg', 0.8));
}

async function shareOrDownload(files) {
  if (navigator.canShare && navigator.canShare({ files })) {
    try { await navigator.share({ files, title: 'Verso' }); return 'shared'; }
    catch (e) { if (e.name === 'AbortError') return 'cancelled'; }
  }
  for (const f of files) { download(f, f.name); await new Promise(r => setTimeout(r, 300)); }
  toast(files.length > 1 ? `${files.length} images téléchargées` : 'Image téléchargée' + (navigator.share ? '' : ' (partage direct indisponible sur ce navigateur)'));
  return 'downloaded';
}

// ---------------------------------------------------------------------------

export async function mountStudio(view, id) {
  let card = await db.get('cards', id);
  if (!card) { view.innerHTML = '<div class="empty">Cette carte n\'existe plus.<br><br><a href="#/creations">Mes créations</a></div>'; return; }
  document.body.classList.add('studio-mode');
  let imgs = await loadImages(card);
  const templates = await db.all('templates');
  let tab = 'texte', exportType = 'image/png', palette = [], paletteTarget = 'bg', editPalette = false;
  const history = [], future = [];
  const snap = () => ({ json: JSON.stringify({ excerpt: card.excerpt, title: card.title, artist: card.artist, format: card.format, template: card.template, style: card.style }), photo: card.images.photo });
  let last = snap();

  view.innerHTML = `
    <div class="studio-top">
      <button class="icon-btn ghost" id="back" aria-label="Retour">←</button>
      <div class="title">Studio</div>
      <button class="icon-btn" id="undo" aria-label="Annuler">↶</button>
      <button class="icon-btn" id="redo" aria-label="Rétablir">↷</button>
      <button class="primary" id="save">Enregistrer</button>
    </div>
    <div class="studio">
      <div class="stage" id="stage"><canvas id="cv" aria-label="Aperçu de la carte"></canvas><div class="warn" id="warn" hidden></div></div>
      <div>
        <div class="tabs">${[['texte', 'Texte'], ['fond', 'Fond'], ['style', 'Style'], ['format', 'Format']].map(([k, l]) => `<button data-tab="${k}">${l}</button>`).join('')}</div>
        <div class="panel" id="panel"></div>
      </div>
    </div>`;
  const $ = s => view.querySelector(s);
  const cv = $('#cv'), stage = $('#stage');
  let lastInfo = null;

  // --- Rendu -------------------------------------------------------------
  let raf = 0;
  const draw = () => {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(async () => {
      await ensureFonts(card.style);
      const fmt = FORMATS[card.format];
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const wide = matchMedia('(min-width: 900px)').matches;
      const maxW = stage.clientWidth - 24, maxH = window.innerHeight * (wide ? 0.78 : 0.52);
      const cssScale = Math.min(maxW / fmt.w, maxH / fmt.h);
      lastInfo = renderCard(cv, card, imgs, { scale: cssScale * dpr });
      cv.style.width = fmt.w * cssScale + 'px';
      cv.style.height = fmt.h * cssScale + 'px';
      const w = $('#warn');
      if (lastInfo.overflow) {
        w.hidden = false;
        w.innerHTML = `<span>Le texte dépasse de la carte : il serait coupé.</span><span class="row"><button id="fit">Réduire à ${lastInfo.fitSize}</button><button id="split">Répartir sur plusieurs cartes</button></span>`;
        w.querySelector('#fit').onclick = () => { card.style.size = lastInfo.fitSize; change(); refreshPanel(); };
        w.querySelector('#split').onclick = splitCards;
      } else w.hidden = true;
    });
  };

  // --- Historique et sauvegarde automatique ------------------------------
  let saveTimer = 0, histTimer = 0;
  let deleted = false;
  const persist = async () => {
    saveTimer = 0;
    if (deleted) return;
    card.updatedAt = Date.now();
    try { card.thumb = await makeThumb(card, imgs); } catch { /* aperçu facultatif */ }
    await safe(() => db.put('cards', card));
  };
  const change = () => {
    draw();
    clearTimeout(histTimer);
    histTimer = setTimeout(() => {
      const s = snap();
      if (s.json !== last.json || s.photo !== last.photo) { history.push(last); if (history.length > 100) history.shift(); future.length = 0; last = s; updateUndo(); }
    }, 350);
    clearTimeout(saveTimer);
    saveTimer = setTimeout(persist, 800);
  };
  const restore = async s => {
    const d = JSON.parse(s.json);
    Object.assign(card, d);
    if (card.images.photo !== s.photo) { card.images.photo = s.photo; imgs.photo = await blobToBitmap(s.photo); }
    last = s; draw(); refreshPanel(); updateUndo();
    clearTimeout(saveTimer); saveTimer = setTimeout(persist, 800);
  };
  const updateUndo = () => { $('#undo').disabled = !history.length; $('#redo').disabled = !future.length; };
  $('#undo').onclick = () => { clearTimeout(histTimer); const cur = snap(); if (cur.json !== last.json) { history.push(last); last = cur; } if (!history.length) return; future.push(snap()); restore(history.pop()); };
  $('#redo').onclick = () => { if (!future.length) return; history.push(snap()); restore(future.pop()); };
  updateUndo();
  $('#back').onclick = () => history.length || !card.songId ? go('#/creations') : window.history.back();
  $('#save').onclick = async () => {
    card.draft = false; await persist();
    toast('Carte enregistrée dans Mes créations');
  };

  // --- Manipulation directe sur l'aperçu ---------------------------------
  const pts = new Map();
  let startState = null;
  cv.addEventListener('pointerdown', e => {
    cv.setPointerCapture(e.pointerId);
    pts.set(e.pointerId, [e.clientX, e.clientY]);
    const bg = card.style.bg;
    startState = { pts: new Map(pts), imgX: bg.imgX, imgY: bg.imgY, zoom: bg.imgZoom, posY: card.style.posY };
  });
  cv.addEventListener('pointermove', e => {
    if (!pts.has(e.pointerId) || !startState) return;
    pts.set(e.pointerId, [e.clientX, e.clientY]);
    const rect = cv.getBoundingClientRect();
    const bg = card.style.bg;
    const hasImg = (bg.kind === 'cover' && imgs.cover) || (bg.kind === 'photo' && imgs.photo);
    const ids = [...pts.keys()];
    if (ids.length === 2 && hasImg && startState.pts.size === 2) {
      const d = m => Math.hypot(m.get(ids[0])[0] - m.get(ids[1])[0], m.get(ids[0])[1] - m.get(ids[1])[1]);
      bg.imgZoom = Math.min(4, Math.max(1, startState.zoom * d(pts) / d(startState.pts)));
    } else if (ids.length === 1) {
      const s = startState.pts.get(e.pointerId); if (!s) return;
      const dx = (e.clientX - s[0]) / rect.width, dy = (e.clientY - s[1]) / rect.height;
      if (hasImg && tab === 'fond') { bg.imgX = clamp(startState.imgX + dx * 2, -2, 2); bg.imgY = clamp(startState.imgY + dy * 2, -2, 2); }
      else card.style.posY = clamp(startState.posY + dy * 1.5, 0, 1);
    }
    draw();
  });
  const end = e => { pts.delete(e.pointerId); startState = pts.size ? { ...startState, pts: new Map(pts) } : null; change(); if (!pts.size) refreshPanel(); };
  cv.addEventListener('pointerup', end);
  cv.addEventListener('pointercancel', end);
  cv.addEventListener('wheel', e => { const bg = card.style.bg; if (bg.kind !== 'cover' && bg.kind !== 'photo') return; e.preventDefault(); bg.imgZoom = clamp(bg.imgZoom * (e.deltaY < 0 ? 1.06 : 0.94), 1, 4); change(); }, { passive: false });
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

  // --- Panneaux ----------------------------------------------------------
  const slider = (key, label, min, max, step, get, set, fmt = v => v) => `<div class="field"><label>${label} <span class="muted" data-out="${key}">${fmt(get())}</span></label>
    <input type="range" data-range="${key}" min="${min}" max="${max}" step="${step}" value="${get()}"></div>`;
  const sliders = {};
  const reg = (key, label, min, max, step, get, set, fmt) => { sliders[key] = { set, fmt: fmt || (v => v) }; return slider(key, label, min, max, step, get, set, fmt); };
  const seg = (key, options, current) => `<div class="seg" data-seg="${key}">${options.map(([v, l]) => `<button data-v="${v}" class="${String(current) === String(v) ? 'on' : ''}">${l}</button>`).join('')}</div>`;
  const pct = v => Math.round(v * 100) + ' %';

  function panelTexte() {
    const st = card.style, f = fontById(st.font);
    return `
      <div class="field"><label for="t-ex">Extrait (vous pouvez ajuster les retours à la ligne — les paroles d'origine ne changent pas)</label>
        <textarea id="t-ex" style="min-height:140px">${esc(card.excerpt)}</textarea></div>
      <div class="grid2"><div class="field"><label for="t-title">Titre affiché</label><input id="t-title" value="${esc(card.title)}"></div>
        <div class="field"><label for="t-artist">Artiste affiché</label><input id="t-artist" value="${esc(card.artist)}"></div></div>
      <div class="field"><label for="t-font">Police</label><select id="t-font">${FONTS.map(x => `<option value="${x.id}" ${x.id === st.font ? 'selected' : ''}>${x.label}</option>`).join('')}</select></div>
      <div class="row field">${f.weights.length > 1 ? seg('weight', f.weights.map(w => [w, w >= 700 ? 'Gras' : 'Normal']), st.weight) : ''}
        <button class="chip ${st.italic ? 'on' : ''}" id="t-it">Italique</button><button class="chip ${st.uppercase ? 'on' : ''}" id="t-up">MAJUSCULES</button></div>
      ${reg('size', 'Taille', 20, 180, 1, () => st.size, v => st.size = v, v => v + ' px')}
      <div class="field"><label>Alignement</label>${seg('align', [['left', 'Gauche'], ['center', 'Centre'], ['right', 'Droite']], st.align)}</div>
      <div class="field row"><label style="margin:0">Couleur</label><input type="color" id="t-color" value="${st.color}">${swatches('color')}</div>
      ${reg('lineHeight', 'Interligne', 0.8, 2, 0.02, () => st.lineHeight, v => st.lineHeight = v, v => (+v).toFixed(2))}
      ${reg('margin', 'Marges', 0.03, 0.2, 0.005, () => st.margin, v => st.margin = v, pct)}
      ${reg('posY', 'Position verticale du bloc (ou glissez sur l\'aperçu)', 0, 1, 0.01, () => st.posY, v => st.posY = v, v => v < 0.2 ? 'haut' : v > 0.8 ? 'bas' : 'milieu')}
      <div class="card-box"><h3>Mots mis en évidence</h3>
        <div class="field"><input id="t-hl" value="${esc((st.highlights || []).join(', '))}" placeholder="Mots séparés par des virgules"></div>
        <div class="small muted" style="margin:-6px 0 10px">Ou touchez un mot : <span id="t-words"></span></div>
        <div class="row">${seg('hlMode', [['color', 'Couleur'], ['bold', 'Gras'], ['mark', 'Surligné']], st.hlMode)}<input type="color" id="t-accent" value="${st.accent}" aria-label="Couleur de mise en évidence">
          <button class="chip ${st.dimOthers ? 'on' : ''}" id="t-dim">Atténuer le reste</button></div></div>`;
  }
  function swatches(target) {
    if (!palette.length) return '';
    return `<span class="swatches">${palette.map(c => `<button class="swatch" style="background:${c}" data-sw="${target}" data-c="${c}" aria-label="${c}"></button>`).join('')}</span>`;
  }
  function panelFond() {
    const bg = card.style.bg;
    const hasImg = bg.kind === 'cover' || bg.kind === 'photo';
    return `
      <div class="field">${seg('bgkind', [['solid', 'Uni'], ['gradient', 'Dégradé'], ['cover', 'Pochette'], ['photo', 'Photo']], bg.kind)}</div>
      ${bg.kind === 'cover' && !card.images.cover ? '<div class="notice err field">Ce morceau n\'a pas de pochette. Ajoutez-en une dans la fiche du morceau, ou importez une photo.</div>' : ''}
      ${bg.kind === 'photo' || !card.images.photo ? `<div class="field row"><label class="btn ${bg.kind === 'photo' && !card.images.photo ? 'primary' : ''}" style="margin:0;color:inherit">${card.images.photo ? 'Changer de photo' : 'Importer une photo'}<input type="file" id="b-photo" accept="image/*" hidden></label>
        ${card.images.photo ? '<button class="ghost danger" id="b-nophoto">Retirer la photo</button>' : ''}</div>` : ''}
      <div class="field row"><label style="margin:0">${bg.kind === 'gradient' ? 'Couleurs' : 'Couleur de fond'}</label><input type="color" id="b-c1" value="${bg.color}">${bg.kind === 'gradient' ? `<input type="color" id="b-c2" value="${bg.color2}">` : ''}</div>
      ${bg.kind === 'gradient' ? reg('angle', 'Angle', 0, 360, 5, () => bg.angle, v => bg.angle = v, v => v + '°') : ''}
      ${hasImg ? `<p class="small muted">Glissez sur l'aperçu pour déplacer l'image, pincez ou utilisez la molette pour zoomer.</p>
        ${reg('imgZoom', 'Zoom', 1, 4, 0.01, () => bg.imgZoom, v => bg.imgZoom = v, v => (+v).toFixed(2) + '×')}
        ${reg('imgX', 'Horizontal', -2, 2, 0.01, () => bg.imgX, v => bg.imgX = v, v => (+v).toFixed(2))}
        ${reg('imgY', 'Vertical', -2, 2, 0.01, () => bg.imgY, v => bg.imgY = v, v => (+v).toFixed(2))}
        ${reg('blur', 'Flou', 0, 60, 1, () => bg.blur, v => bg.blur = v, v => v + ' px')}` : ''}
      ${reg('veil', 'Voile (gauche : clair · droite : sombre)', -0.85, 0.85, 0.01, () => bg.veil, v => bg.veil = v, v => v == 0 ? 'aucun' : v > 0 ? 'sombre ' + pct(v) : 'clair ' + pct(-v))}
      <div class="field"><label for="b-tex">Texture</label><select id="b-tex">${Object.entries(TEXTURES).map(([k, l]) => `<option value="${k}" ${bg.texture === k ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
      ${bg.texture !== 'none' ? reg('textureAlpha', 'Intensité de la texture', 0.05, 0.8, 0.01, () => bg.textureAlpha, v => bg.textureAlpha = v, pct) : ''}
      <div class="card-box"><div class="row spread"><h3 style="margin:0">Palette de l'image</h3>${palette.length ? `<button class="chip ${editPalette ? 'on' : ''}" id="p-edit">Modifier</button>` : ''}</div>
        ${palette.length ? `<div class="field" style="margin-top:10px">${editPalette ? `<span class="swatches">${palette.map((c, i) => `<input type="color" data-pi="${i}" value="${c}">`).join('')}</span>` : swatches(paletteTarget)}</div>
          <div class="row"><span class="small muted">Toucher une couleur l'applique à :</span>${seg('ptarget', [['bg', 'Fond'], ['color', 'Texte'], ['accent', 'Accent']], paletteTarget)}</div>
          <button style="margin-top:10px" id="p-auto">Harmonie automatique</button>`
        : `<p class="small muted">Disponible avec une pochette ou une photo.</p>`}</div>`;
  }
  function panelStyle() {
    const m = card.style.meta;
    return `
      <div class="tpls field">${Object.entries(TEMPLATES).map(([k, t]) => `<button data-tpl="${k}" class="${card.template === k ? 'on' : ''}"><canvas data-mini="${k}"></canvas>${t.label}</button>`).join('')}</div>
      <p class="small muted">Changer de modèle conserve l'extrait, le titre, l'artiste et les images.</p>
      <div class="card-box field"><h3>Informations affichées</h3>
        <div class="row field"><button class="chip ${m.showTitle ? 'on' : ''}" data-mt="showTitle">Titre</button><button class="chip ${m.showArtist ? 'on' : ''}" data-mt="showArtist">Artiste</button>
          <button class="chip ${m.showCover ? 'on' : ''}" data-mt="showCover">Pochette</button><button class="chip ${m.showSignature ? 'on' : ''}" data-mt="showSignature">Signature</button></div>
        <div class="row field">${seg('mpos', [['top', 'En haut'], ['bottom', 'En bas']], m.pos)}${seg('malign', [['left', 'Gauche'], ['center', 'Centre'], ['right', 'Droite']], m.align)}</div>
        ${reg('msize', 'Taille des informations', 18, 56, 1, () => m.size, v => m.size = v, v => v + ' px')}
        ${m.showSignature ? `<div class="grid2"><div class="field"><label for="m-sig">Signature</label><input id="m-sig" value="${esc(m.signature)}" placeholder="Votre pseudonyme"></div>
          <div class="field"><label for="m-sigpos">Position</label><select id="m-sigpos">${[['bottom-right', 'En bas à droite'], ['bottom-left', 'En bas à gauche'], ['bottom-center', 'En bas au centre'], ['top-right', 'En haut à droite'], ['top-left', 'En haut à gauche']].map(([v, l]) => `<option value="${v}" ${m.sigPos === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div></div>` : ''}
      </div>
      <div class="card-box"><h3>Mes modèles</h3>
        ${templates.length ? templates.map(t => `<div class="row spread" style="margin-bottom:6px"><span>${esc(t.name)}</span><span class="row"><button data-ut="${t.id}">Appliquer</button><button class="icon-btn ghost danger" data-utdel="${t.id}" aria-label="Supprimer">✕</button></span></div>`).join('') : '<p class="small muted">Enregistrez le style de cette carte pour le réutiliser avec un autre extrait.</p>'}
        <div class="row"><button id="s-save">Enregistrer ce style</button><button id="s-copy">Copier le style d'une création</button><button class="ghost" id="s-reset">Réinitialiser le style</button></div></div>`;
  }
  function panelFormat() {
    return `
      <div class="field">${seg('format', Object.entries(FORMATS).map(([k, f]) => [k, `${f.label}<br><span class="small">${f.w}×${f.h}</span>`]), card.format)}</div>
      <p class="small muted">La composition s'adapte au format ; tous vos réglages sont conservés. Vérifiez l'aperçu avant d'exporter.</p>
      <div class="field"><label for="x-name">Nom du fichier</label><input id="x-name" value="${esc(card.fileName || defaultName(card))}"></div>
      <div class="field row">${seg('xtype', [['image/png', 'PNG (qualité max.)'], ['image/jpeg', 'JPEG (plus léger)']], exportType)}</div>
      <div class="row field"><button class="primary" id="x-share">Partager</button><button id="x-dl">Télécharger</button><button id="x-all">Les 3 formats</button></div>
      <div class="card-box"><h3>Carte</h3><div class="row"><button id="c-dup">Dupliquer</button><button id="c-split">Répartir sur plusieurs cartes</button><button class="ghost danger" id="c-del">Supprimer la carte</button></div>
      <p class="small muted">Créée le ${new Date(card.createdAt).toLocaleString('fr-FR')} · modifiée le ${new Date(card.updatedAt).toLocaleString('fr-FR')}</p></div>`;
  }

  function refreshPanel() {
    view.querySelectorAll('[data-tab]').forEach(b => b.classList.toggle('on', b.dataset.tab === tab));
    const p = $('#panel');
    for (const k in sliders) delete sliders[k];
    p.innerHTML = { texte: panelTexte, fond: panelFond, style: panelStyle, format: panelFormat }[tab]();
    bindPanel(p);
  }
  view.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => { tab = b.dataset.tab; refreshPanel(); });

  const setPalette = async () => {
    const img = card.style.bg.kind === 'photo' ? imgs.photo : card.style.bg.kind === 'cover' ? imgs.cover : (imgs.photo || imgs.cover);
    palette = img ? extractPalette(img) : [];
  };
  await setPalette();

  function bindPanel(p) {
    const st = card.style, bg = st.bg, m = st.meta;
    const on = (sel, ev, fn) => { const el = p.querySelector(sel); if (el) el[ev] = fn; };
    p.querySelectorAll('[data-range]').forEach(r => r.oninput = () => {
      const s = sliders[r.dataset.range]; s.set(+r.value);
      p.querySelector(`[data-out="${r.dataset.range}"]`).textContent = s.fmt(+r.value);
      change();
    });
    p.querySelectorAll('[data-seg]').forEach(sg => sg.querySelectorAll('button').forEach(b => b.onclick = async () => {
      const v = b.dataset.v;
      switch (sg.dataset.seg) {
        case 'weight': st.weight = +v; break;
        case 'align': st.align = v; break;
        case 'hlMode': st.hlMode = v; break;
        case 'bgkind': bg.kind = v; await setPalette(); break;
        case 'ptarget': paletteTarget = v; break;
        case 'mpos': m.pos = v; break;
        case 'malign': m.align = v; break;
        case 'format': card.format = v; break;
        case 'xtype': exportType = v; break;
      }
      change(); refreshPanel();
    }));
    // Texte
    on('#t-ex', 'oninput', e => { card.excerpt = e.target.value; change(); drawWords(); });
    on('#t-title', 'oninput', e => { card.title = e.target.value; change(); });
    on('#t-artist', 'oninput', e => { card.artist = e.target.value; change(); });
    on('#t-font', 'onchange', e => { st.font = e.target.value; const f = fontById(st.font); if (!f.weights.includes(st.weight)) st.weight = f.weights[f.weights.length - 1]; change(); refreshPanel(); });
    on('#t-it', 'onclick', () => { st.italic = !st.italic; change(); refreshPanel(); });
    on('#t-up', 'onclick', () => { st.uppercase = !st.uppercase; change(); refreshPanel(); });
    on('#t-dim', 'onclick', () => { st.dimOthers = !st.dimOthers; change(); refreshPanel(); });
    on('#t-color', 'oninput', e => { st.color = e.target.value; change(); });
    on('#t-accent', 'oninput', e => { st.accent = e.target.value; change(); });
    on('#t-hl', 'oninput', e => { st.highlights = e.target.value.split(',').map(s => s.trim()).filter(Boolean); change(); drawWords(); });
    const drawWords = () => {
      const box = p.querySelector('#t-words'); if (!box) return;
      const words = [...new Set(card.excerpt.split(/\s+/).map(w => w.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '')).filter(w => w.length > 1))].slice(0, 60);
      const hl = new Set((st.highlights || []).map(w => w.toLocaleLowerCase('fr')));
      box.innerHTML = words.map(w => `<button class="chip ${hl.has(w.toLocaleLowerCase('fr')) ? 'on' : ''}" data-word="${esc(w)}" style="margin:2px">${esc(w)}</button>`).join('');
      box.querySelectorAll('[data-word]').forEach(b => b.onclick = () => {
        const w = b.dataset.word, lw = w.toLocaleLowerCase('fr');
        const list = st.highlights || [];
        st.highlights = list.some(x => x.toLocaleLowerCase('fr') === lw) ? list.filter(x => x.toLocaleLowerCase('fr') !== lw) : [...list, w];
        p.querySelector('#t-hl').value = st.highlights.join(', ');
        change(); drawWords();
      });
    };
    drawWords();
    p.querySelectorAll('[data-sw]').forEach(b => b.onclick = () => {
      const c = b.dataset.c, t = b.dataset.sw;
      if (t === 'bg') { bg.color = c; if (bg.kind === 'cover' || bg.kind === 'photo') { /* la couleur sert sous l'image */ } }
      else if (t === 'color') st.color = c; else st.accent = c;
      change(); refreshPanel();
    });
    // Fond
    on('#b-c1', 'oninput', e => { bg.color = e.target.value; change(); });
    on('#b-c2', 'oninput', e => { bg.color2 = e.target.value; change(); });
    on('#b-tex', 'onchange', e => { bg.texture = e.target.value; change(); refreshPanel(); });
    on('#b-photo', 'onchange', async e => {
      const f = e.target.files[0]; if (!f) return;
      try {
        card.images.photo = await compressImage(f);
        imgs.photo = await blobToBitmap(card.images.photo);
        Object.assign(bg, { kind: 'photo', imgZoom: 1, imgX: 0, imgY: 0 });
        if (!bg.veil) bg.veil = 0.35;
        await setPalette(); change(); refreshPanel();
      } catch (err) { toast(err.message, { err: true }); }
    });
    on('#b-nophoto', 'onclick', async () => { card.images.photo = null; imgs.photo = null; if (bg.kind === 'photo') bg.kind = 'solid'; await setPalette(); change(); refreshPanel(); });
    on('#p-edit', 'onclick', () => { editPalette = !editPalette; refreshPanel(); });
    p.querySelectorAll('[data-pi]').forEach(inp => inp.onchange = () => { palette[+inp.dataset.pi] = inp.value; });
    on('#p-auto', 'onclick', () => {
      const lum = h => { const n = parseInt(h.slice(1), 16); return 0.299 * (n >> 16) + 0.587 * (n >> 8 & 255) + 0.114 * (n & 255); };
      const sat = h => { const n = parseInt(h.slice(1), 16), r = n >> 16, g = n >> 8 & 255, b = n & 255; return Math.max(r, g, b) - Math.min(r, g, b); };
      const byL = [...palette].sort((a, b) => lum(a) - lum(b));
      bg.color = byL[0]; bg.color2 = byL[1] || byL[0];
      st.color = lum(byL[byL.length - 1]) > 150 ? byL[byL.length - 1] : '#ffffff';
      st.accent = [...palette].sort((a, b) => sat(b) - sat(a))[0];
      change(); refreshPanel();
    });
    // Style
    p.querySelectorAll('[data-mini]').forEach(async c => {
      const k = c.dataset.mini;
      const preview = { ...card, template: k, format: 'square', style: templatePreset(k), excerpt: 'Toutes les lignes\nque je garde', title: 'Titre', artist: 'Artiste' };
      if (k === 'photo' && !imgs.photo) preview.style.bg.kind = imgs.cover ? 'cover' : 'gradient';
      await ensureFonts(preview.style);
      renderCard(c, preview, imgs, { scale: 0.1 });
    });
    p.querySelectorAll('[data-tpl]').forEach(b => b.onclick = () => {
      const keep = { signature: m.signature, showSignature: m.showSignature };
      card.template = b.dataset.tpl;
      card.style = templatePreset(card.template);
      Object.assign(card.style.meta, keep);
      if (card.style.bg.kind === 'photo' && !card.images.photo) card.style.bg.kind = card.images.cover ? 'cover' : 'gradient';
      if (card.style.bg.kind === 'cover' && !card.images.cover) card.style.bg.kind = card.images.photo ? 'photo' : 'gradient';
      change(); refreshPanel();
    });
    p.querySelectorAll('[data-mt]').forEach(b => b.onclick = () => { m[b.dataset.mt] = !m[b.dataset.mt]; change(); refreshPanel(); });
    on('#m-sig', 'oninput', e => { m.signature = e.target.value; change(); });
    on('#m-sigpos', 'onchange', e => { m.sigPos = e.target.value; change(); });
    on('#s-save', 'onclick', async () => {
      const v = await openDialog(`<form method="dialog"><h3>Nom du modèle</h3><input id="tn" value="Mon style ${templates.length + 1}"><div class="row" style="justify-content:flex-end;margin-top:12px"><button value="no">Annuler</button><button value="ok" class="primary">Enregistrer</button></div></form>`);
      if (v !== 'ok') return;
      const t = { id: uid(), name: document.getElementById('tn').value.trim() || 'Mon style', template: card.template, style: clone(card.style), createdAt: Date.now(), updatedAt: Date.now() };
      await safe(() => db.put('templates', t)); templates.push(t); refreshPanel(); toast('Modèle enregistré');
    });
    p.querySelectorAll('[data-ut]').forEach(b => b.onclick = () => {
      const t = templates.find(x => x.id === b.dataset.ut);
      card.template = t.template; card.style = clone(t.style); change(); refreshPanel();
    });
    p.querySelectorAll('[data-utdel]').forEach(b => b.onclick = async () => {
      if (!await confirmDialog('Supprimer ce modèle ?', 'Supprimer', true)) return;
      await safe(() => db.del('templates', b.dataset.utdel)); templates.splice(templates.findIndex(x => x.id === b.dataset.utdel), 1); refreshPanel();
    });
    on('#s-copy', 'onclick', async () => {
      const others = (await db.all('cards')).filter(c => c.id !== card.id).sort((a, b) => b.updatedAt - a.updatedAt);
      if (!others.length) return toast('Aucune autre création.');
      await openDialog(`<form method="dialog"><h3>Copier le style de…</h3><div class="gallery">${others.map(c => `<button class="tile" value="${c.id}" style="padding:0;border-radius:12px">${c.thumb ? `<img src="${URL.createObjectURL(c.thumb)}" alt="">` : ''}<div>${esc(c.title)}</div></button>`).join('')}</div>
        <div class="row" style="justify-content:flex-end;margin-top:12px"><button value="">Annuler</button></div></form>`).then(v => {
        const src = others.find(c => c.id === v); if (!src) return;
        card.template = src.template; card.style = clone(src.style); change(); refreshPanel(); toast('Style appliqué');
      });
    });
    on('#s-reset', 'onclick', () => {
      const keep = { signature: m.signature };
      card.style = templatePreset(card.template); Object.assign(card.style.meta, keep);
      if (card.style.bg.kind === 'photo' && !card.images.photo) card.style.bg.kind = 'gradient';
      change(); refreshPanel(); toast('Style réinitialisé (↶ pour annuler)');
    });
    // Format et export
    on('#x-name', 'onchange', e => { card.fileName = slug(e.target.value); e.target.value = card.fileName; change(); });
    on('#x-dl', 'onclick', () => exportCards([card], false));
    on('#x-share', 'onclick', () => exportCards([card], true));
    on('#x-all', 'onclick', () => exportCards(Object.keys(FORMATS).map(f => ({ ...card, format: f })), true, true));
    on('#c-dup', 'onclick', async () => {
      const copy = { ...clone({ ...card, images: null, thumb: null }), images: { ...card.images }, thumb: card.thumb, id: uid(), draft: true, createdAt: Date.now(), updatedAt: Date.now() };
      await safe(() => db.put('cards', copy)); toast('Carte dupliquée'); go('#/studio/' + copy.id);
    });
    on('#c-split', 'onclick', splitCards);
    on('#c-del', 'onclick', async () => {
      if (!await confirmDialog('Supprimer cette carte ? Cette action est définitive.', 'Supprimer', true)) return;
      clearTimeout(saveTimer); deleted = true; await safe(() => db.del('cards', card.id)); go('#/creations'); toast('Carte supprimée');
    });
  }

  async function exportCards(list, share, suffixFormat = false) {
    const ext = exportType === 'image/png' ? 'png' : 'jpg';
    const base = card.fileName || defaultName(card);
    const files = [];
    for (const [i, c] of list.entries()) {
      const { blob, info } = await cardToBlob(c, imgs, exportType);
      if (info.overflow) {
        const ok = await confirmDialog(`Au format ${FORMATS[c.format].label}, le texte dépasse de la carte et serait coupé. Réduire la taille du texte à ${info.fitSize} px pour cette carte ?`, 'Réduire et exporter');
        if (!ok) return toast('Export annulé : aucun texte coupé n\'a été exporté.');
        const fixed = { ...c, style: { ...c.style, size: info.fitSize } };
        files.push(new File([(await cardToBlob(fixed, imgs, exportType)).blob], `${base}${suffixFormat ? ' - ' + FORMATS[c.format].label : list.length > 1 ? ' - ' + (i + 1) : ''}.${ext}`, { type: exportType }));
        continue;
      }
      files.push(new File([blob], `${base}${suffixFormat ? ' - ' + FORMATS[c.format].label : list.length > 1 ? ' - ' + (i + 1) : ''}.${ext}`, { type: exportType }));
    }
    if (card.draft) { card.draft = false; await persist(); }
    if (share) await shareOrDownload(files);
    else { for (const f of files) download(f, f.name); toast('Image téléchargée'); }
  }

  async function splitCards() {
    const probe = document.createElement('canvas');
    let parts = null;
    for (let n = 2; n <= 12; n++) {
      const pieces = splitExcerpt(card.excerpt, n);
      if (pieces.every(t => !renderCard(probe, { ...card, excerpt: t }, imgs, { scale: 0.05 }).overflow)) { parts = pieces; break; }
      if (pieces.length < n) break;
    }
    if (!parts) return toast('Impossible de répartir : une seule ligne est trop longue. Réduisez la taille du texte.', { err: true });
    if (!await confirmDialog(`Répartir l'extrait sur ${parts.length} cartes assorties (même style) ? La carte actuelle devient la première.`, 'Répartir')) return;
    const series = [];
    card.excerpt = parts[0]; await persist(); series.push(card);
    for (const t of parts.slice(1)) {
      const c = { ...clone({ ...card, images: null, thumb: null }), images: { ...card.images }, id: uid(), excerpt: t, draft: false, createdAt: Date.now(), updatedAt: Date.now() };
      c.thumb = await makeThumb(c, imgs);
      await safe(() => db.put('cards', c)); series.push(c);
    }
    card.draft = false; await persist();
    draw(); refreshPanel();
    const v = await openDialog(`<form method="dialog"><h3>${series.length} cartes créées</h3><p class="small muted">Elles sont dans Mes créations.</p><div class="row" style="justify-content:flex-end"><button value="no">Fermer</button><button value="ok" class="primary">Exporter la série</button></div></form>`);
    if (v === 'ok') exportCards(series, true);
  }

  const onResize = () => draw();
  window.addEventListener('resize', onResize);
  refreshPanel();
  draw();
  return () => {
    window.removeEventListener('resize', onResize);
    if (saveTimer) { clearTimeout(saveTimer); persist(); }
  };
}
