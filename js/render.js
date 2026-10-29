// Moteur de rendu des cartes. Le même code dessine l'aperçu et le fichier exporté :
// l'aperçu est simplement rendu à une échelle réduite.

export const FORMATS = {
  square: { label: 'Carré', w: 1080, h: 1080 },
  portrait: { label: 'Portrait', w: 1080, h: 1350 },
  story: { label: 'Story', w: 1080, h: 1920 },
};

export const FONTS = [
  { id: 'inter', label: 'Inter', family: 'Inter', weights: [400, 700] },
  { id: 'playfair', label: 'Playfair Display', family: 'Playfair Display', weights: [400, 700], italic: true },
  { id: 'dmserif', label: 'DM Serif Display', family: 'DM Serif Display', weights: [400] },
  { id: 'lora', label: 'Lora', family: 'Lora', weights: [400, 700] },
  { id: 'grotesk', label: 'Space Grotesk', family: 'Space Grotesk', weights: [400, 700] },
  { id: 'bebas', label: 'Bebas Neue', family: 'Bebas Neue', weights: [400] },
  { id: 'caveat', label: 'Caveat (manuscrite)', family: 'Caveat', weights: [500] },
  { id: 'georgia', label: 'Georgia (système)', family: 'Georgia', weights: [400, 700], system: true },
  { id: 'system', label: 'Système', family: 'system-ui', weights: [400, 700], system: true },
];

export const fontById = id => FONTS.find(f => f.id === id) || FONTS[0];

export const TEMPLATES = {
  bandeau: { label: 'Bandeau' },
  minimal: { label: 'Minimaliste' },
  editorial: { label: 'Éditorial' },
  pochette: { label: 'Pochette' },
  photo: { label: 'Photo' },
  vinyle: { label: 'Vinyle' },
  typo: { label: 'Typographique' },
};

const baseMeta = { showTitle: true, showArtist: true, showCover: true, showSignature: false, signature: '', pos: 'bottom', align: 'left', size: 30, sigPos: 'bottom-right', color: '' };
const baseBg = { ambiance: 'anis', seed: 1, kind: 'solid', color: '#141218', color2: '#3b2d4f', angle: 135, texture: 'none', textureAlpha: 0.25, imgZoom: 1, imgX: 0, imgY: 0, blur: 0, veil: 0, veilMode: 'flat' };

// Réglages par défaut de chaque modèle. Appliquer un modèle ne touche ni à l'extrait,
// ni au titre, ni à l'artiste, ni aux images de la carte.
export function templatePreset(name) {
  const p = {
    font: 'grotesk', weight: 700, italic: false, size: 76, color: '#f4f1ea', align: 'left', lineHeight: 1.22,
    margin: 0.085, posY: 0.5, uppercase: false, accent: '#cce988', autoFit: false,
    highlights: [], hlMode: 'color', dimOthers: false, lineBg: '', shadow: false,
    bg: { ...baseBg, color: '#161f14' }, meta: { ...baseMeta },
  };
  switch (name) {
    case 'bandeau':
      // Image plein cadre, lignes sur bandes blanches, bandeau d'informations en bas.
      Object.assign(p, { font: 'inter', weight: 400, size: 54, color: '#0b0b0b', lineBg: '#ffffff', lineHeight: 1.6, posY: 1, margin: 0.055, accent: '#0b0b0b', hlMode: 'bold' });
      p.bg = { ...baseBg, kind: 'ambiance', ambiance: 'anis', seed: 3, color: '#141c12', texture: 'grain', textureAlpha: 0.16 };
      p.meta = { ...baseMeta, showCover: false, band: '#0b0f0a', color: '#ffffff', size: 30, showSignature: false, showLogo: true, bandStyle: 'duo', font: 'grotesk' };
      break;
    case 'minimal':
      // Bandeaux derrière chaque ligne : la carte de paroles classique, sobre.
      Object.assign(p, { font: 'inter', weight: 700, size: 60, color: '#111111', lineBg: '#ffffff', lineHeight: 1.5, posY: 0.5, accent: '#111111', hlMode: 'mark' });
      p.bg = { ...baseBg, kind: 'gradient', color: '#2b3a24', color2: '#121a10', angle: 160, texture: 'grain', textureAlpha: 0.12 };
      p.meta = { ...baseMeta, color: '#ffffff' };
      break;
    case 'editorial':
      Object.assign(p, { font: 'playfair', weight: 400, italic: false, size: 64, color: '#1c1a16', lineHeight: 1.18, accent: '#b3401f', posY: 0.55, margin: 0.1 });
      p.bg = { ...baseBg, color: '#efe9dc', texture: 'grain', textureAlpha: 0.1 };
      p.meta = { ...baseMeta, showCover: false, size: 26 };
      break;
    case 'pochette':
      Object.assign(p, { font: 'inter', weight: 700, size: 50, align: 'center', color: '#0e0e0e', lineBg: '#ffffff', lineHeight: 1.48, posY: 0.5, accent: '#0e0e0e', hlMode: 'mark' });
      p.bg = { ...baseBg, kind: 'cover', blur: 46, veil: 0.45, imgZoom: 1.15 };
      p.meta = { ...baseMeta, showCover: false, align: 'center', color: '#ffffff' };
      break;
    case 'photo':
      Object.assign(p, { font: 'lora', weight: 700, size: 58, color: '#ffffff', posY: 1, lineHeight: 1.2, shadow: true, accent: '#cce988' });
      p.bg = { ...baseBg, kind: 'photo', veil: 0.75, veilMode: 'gradient' };
      p.meta = { ...baseMeta, pos: 'top' };
      break;
    case 'vinyle':
      Object.assign(p, { font: 'dmserif', weight: 400, size: 56, align: 'left', color: '#f6e9d7', accent: '#ff8a4c', posY: 1, lineHeight: 1.15 });
      p.bg = { ...baseBg, kind: 'gradient', color: '#3a1d12', color2: '#0f0b09', angle: 200, texture: 'grain', textureAlpha: 0.16 };
      p.meta = { ...baseMeta, showCover: false };
      break;
    case 'typo':
      Object.assign(p, { font: 'bebas', weight: 400, size: 150, uppercase: true, lineHeight: 0.92, color: '#f1f1ee', accent: '#cce988', dimOthers: true, posY: 0.5, autoFit: true, margin: 0.07 });
      p.bg = { ...baseBg, color: '#0f130e', texture: 'grain', textureAlpha: 0.14 };
      p.meta = { ...baseMeta, showCover: false, size: 28 };
      break;
  }
  return p;
}

// ---------------------------------------------------------------------------

const norm = s => s.toLocaleLowerCase('fr').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\p{L}\p{N}]+/gu, '');

function fontString(style, size, bold) {
  const f = fontById(style.font);
  let w = style.weight;
  if (bold) w = Math.max(...f.weights) > w ? Math.max(...f.weights) : w;
  const fam = f.system ? f.family : `"${f.family}"`;
  return `${style.italic && (f.italic || f.system) ? 'italic ' : ''}${w} ${size}px ${fam}, system-ui, sans-serif`;
}

// Logo de l'application (fichier d'origine, non modifié), affiché dans le bandeau.
let brandImg = null, brandLoading = null;
export function loadBrand() {
  if (brandImg || brandLoading) return brandLoading || Promise.resolve(brandImg);
  brandLoading = new Promise(res => { const i = new Image(); i.onload = () => { brandImg = i; res(i); }; i.onerror = () => res(null); i.src = new URL('../icons/logo.png', import.meta.url).href; });
  return brandLoading;
}

export async function ensureFonts(style) {
  await loadBrand();
  if (!document.fonts) return;
  const f = fontById(style.font);
  const loads = [];
  const mf = style.meta && style.meta.font ? fontById(style.meta.font) : null;
  if (mf) for (const w of mf.weights) loads.push(document.fonts.load(`${w} 40px "${mf.family}"`, 'Aé'));
  for (const w of f.weights) loads.push(document.fonts.load(`${style.italic ? 'italic ' : ''}${w} 40px "${f.family}"`, 'Aéçœ'));
  loads.push(document.fonts.load('700 40px "Inter"', 'Aé'), document.fonts.load('400 40px "Inter"', 'Aé'), document.fonts.load('500 40px "Caveat"', 'Aé'));
  try { await Promise.all(loads); } catch { /* police système utilisée en repli */ }
}

// Découpe l'extrait en lignes affichables. Chaque ligne = liste de mots {t, hl}.
function layoutText(ctx, card, size, maxW) {
  const st = card.style;
  const hlSet = new Set((st.highlights || []).map(norm).filter(Boolean));
  const text = st.uppercase ? card.excerpt.toLocaleUpperCase('fr') : card.excerpt;
  const lines = [];
  let tooWide = false;
  const space = (() => { ctx.font = fontString(st, size, false); return ctx.measureText(' ').width; })();
  for (const para of text.split('\n')) {
    const words = para.split(/\s+/).filter(Boolean).map(t => ({ t, hl: hlSet.has(norm(t)) }));
    if (!words.length) { lines.push({ words: [], width: 0 }); continue; }
    let cur = [], curW = 0;
    for (const w of words) {
      ctx.font = fontString(st, size, w.hl && st.hlMode === 'bold');
      w.w = ctx.measureText(w.t).width;
      if (w.w > maxW) tooWide = true;
      const add = (cur.length ? space : 0) + w.w;
      if (cur.length && curW + add > maxW) {
        lines.push({ words: cur, width: curW });
        cur = [w]; curW = w.w;
      } else { cur.push(w); curW += add; }
    }
    lines.push({ words: cur, width: curW });
  }
  return { lines, space, tooWide };
}

function loadTexture(kind) {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const x = c.getContext('2d');
  let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  if (kind === 'grain' || kind === 'papier') {
    const img = x.createImageData(256, 256);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = kind === 'grain' ? rnd() * 255 : 180 + rnd() * 75;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = kind === 'grain' ? 90 : 60;
    }
    x.putImageData(img, 0, 0);
    if (kind === 'papier') {
      x.strokeStyle = 'rgba(120,100,80,0.25)';
      for (let i = 0; i < 40; i++) { x.beginPath(); const y = rnd() * 256; x.moveTo(0, y); x.bezierCurveTo(80, y + rnd() * 10 - 5, 170, y + rnd() * 10 - 5, 256, y); x.stroke(); }
    }
  } else if (kind === 'lignes') {
    x.strokeStyle = 'rgba(255,255,255,0.5)';
    for (let i = -256; i < 256; i += 16) { x.beginPath(); x.moveTo(i, 256); x.lineTo(i + 256, 0); x.stroke(); }
  } else if (kind === 'points') {
    x.fillStyle = 'rgba(255,255,255,0.55)';
    for (let i = 8; i < 256; i += 32) for (let j = 8; j < 256; j += 32) { x.beginPath(); x.arc(i, j, 2.2, 0, Math.PI * 2); x.fill(); }
  }
  return c;
}
const textureCache = {};
// Fonds « Ambiance » : taches de couleur floues générées, sans aucune image extérieure.
export const AMBIANCES = {
  anis: { label: 'Anis', base: '#141c12', blobs: ['#cce988', '#4f7a2a', '#1f3a1c', '#9fcf5a'] },
  lagune: { label: 'Lagune', base: '#0b1d24', blobs: ['#2fb5a8', '#0f5c6e', '#f2c36b', '#1a3b5c'] },
  crepuscule: { label: 'Crépuscule', base: '#1d1024', blobs: ['#ff7a59', '#b23a7a', '#ffc46b', '#4a1f6b'] },
  braise: { label: 'Braise', base: '#1a0c08', blobs: ['#ff5a2a', '#8a1f12', '#ffb347', '#3d120c'] },
  ocean: { label: 'Océan', base: '#08111f', blobs: ['#3a7bff', '#123a7a', '#7fe0ff', '#1b2350'] },
  rose: { label: 'Poudre', base: '#f3e6e4', blobs: ['#f7b2b7', '#e8d3a8', '#c9a7e3', '#ffffff'] },
  nuit: { label: 'Nuit', base: '#07070a', blobs: ['#2a2a3a', '#4b3b6b', '#14141c', '#3a2f2a'] },
};

function drawAmbiance(ctx, bg, W, H) {
  const a = AMBIANCES[bg.ambiance] || AMBIANCES.anis;
  ctx.fillStyle = a.base; ctx.fillRect(0, 0, W, H);
  let seed = (bg.seed || 1) * 9301 + 49297;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter' === bg.blend ? 'lighter' : 'source-over';
  for (let i = 0; i < 7; i++) {
    const col = a.blobs[i % a.blobs.length];
    const x = rnd() * W, y = rnd() * H, r = (0.35 + rnd() * 0.45) * Math.max(W, H);
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, col + 'cc'); g.addColorStop(0.5, col + '44'); g.addColorStop(1, col + '00');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  }
  ctx.restore();
}

export const TEXTURES = { none: 'Aucune', grain: 'Grain', papier: 'Papier', lignes: 'Lignes', points: 'Points' };

function drawImageCover(ctx, img, W, H, bg) {
  const scale = Math.max(W / img.width, H / img.height) * (bg.imgZoom || 1);
  const dw = img.width * scale, dh = img.height * scale;
  const dx = (W - dw) / 2 + (bg.imgX || 0) * W / 2;
  const dy = (H - dh) / 2 + (bg.imgY || 0) * H / 2;
  ctx.drawImage(img, dx, dy, dw, dh);
}

function drawBackground(ctx, card, imgs, W, H, k) {
  const bg = card.style.bg;
  const img = bg.kind === 'cover' ? imgs.cover : bg.kind === 'photo' ? imgs.photo : null;
  ctx.fillStyle = bg.color;
  ctx.fillRect(0, 0, W, H);
  if (bg.kind === 'ambiance') drawAmbiance(ctx, bg, W, H);
  if (bg.kind === 'gradient') {
    const a = (bg.angle || 0) * Math.PI / 180;
    const r = Math.hypot(W, H) / 2;
    const g = ctx.createLinearGradient(W / 2 - Math.sin(a) * r, H / 2 + Math.cos(a) * r, W / 2 + Math.sin(a) * r, H / 2 - Math.cos(a) * r);
    g.addColorStop(0, bg.color); g.addColorStop(1, bg.color2);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  }
  if (img) {
    ctx.save();
    if (bg.blur > 0) {
      ctx.filter = `blur(${bg.blur * k}px)`;
      // Agrandit légèrement pour éviter les bords transparents du flou.
      const pad = bg.blur * 2;
      ctx.translate(-pad, -pad);
      drawImageCover(ctx, img, W + pad * 2, H + pad * 2, bg);
    } else drawImageCover(ctx, img, W, H, bg);
    ctx.restore();
  }
  if (bg.veil) {
    const c = bg.veil > 0 ? '0,0,0' : '255,255,255', a = Math.abs(bg.veil);
    if (bg.veilMode === 'gradient') {
      // Voile progressif : l'image reste visible en haut, le texte reste lisible en bas.
      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, `rgba(${c},${a * 0.35})`); g.addColorStop(0.4, `rgba(${c},${a * 0.1})`); g.addColorStop(1, `rgba(${c},${Math.min(1, a * 1.15)})`);
      ctx.fillStyle = g;
    } else ctx.fillStyle = `rgba(${c},${a})`;
    ctx.fillRect(0, 0, W, H);
  }
  if (bg.texture && bg.texture !== 'none') {
    const t = textureCache[bg.texture] || (textureCache[bg.texture] = loadTexture(bg.texture));
    ctx.save();
    ctx.globalAlpha = bg.textureAlpha ?? 0.25;
    ctx.globalCompositeOperation = bg.texture === 'papier' ? 'multiply' : 'overlay';
    const pat = ctx.createPattern(t, 'repeat');
    pat.setTransform(new DOMMatrix().scale(1.5));
    ctx.fillStyle = pat;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }
}

function setSpacing(ctx, px) { if ('letterSpacing' in ctx) ctx.letterSpacing = px + 'px'; }

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}

function drawCoverSquare(ctx, img, x, y, s, r, fallback) {
  ctx.save();
  roundRect(ctx, x, y, s, s, r);
  ctx.clip();
  if (img) {
    const sc = Math.max(s / img.width, s / img.height);
    ctx.drawImage(img, x + (s - img.width * sc) / 2, y + (s - img.height * sc) / 2, img.width * sc, img.height * sc);
  } else { ctx.fillStyle = fallback; ctx.fillRect(x, y, s, s); }
  ctx.restore();
}

function drawVinyl(ctx, cx, cy, R, img, accent) {
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.5)'; ctx.shadowBlur = R * 0.12 * (ctx.getTransform().a); ctx.shadowOffsetY = R * 0.04 * ctx.getTransform().a;
  ctx.fillStyle = '#0b0b0c';
  ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  ctx.strokeStyle = 'rgba(255,255,255,0.06)';
  ctx.lineWidth = Math.max(1, R * 0.004);
  for (let r = R * 0.38; r < R * 0.97; r += R * 0.022) { ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke(); }
  const sheen = ctx.createConicGradient ? ctx.createConicGradient(0.6, cx, cy) : null;
  if (sheen) {
    sheen.addColorStop(0, 'rgba(255,255,255,0)'); sheen.addColorStop(0.08, 'rgba(255,255,255,0.12)'); sheen.addColorStop(0.16, 'rgba(255,255,255,0)');
    sheen.addColorStop(0.5, 'rgba(255,255,255,0)'); sheen.addColorStop(0.58, 'rgba(255,255,255,0.1)'); sheen.addColorStop(0.66, 'rgba(255,255,255,0)'); sheen.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = sheen; ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.fill();
  }
  const lr = R * 0.34;
  ctx.save();
  ctx.beginPath(); ctx.arc(cx, cy, lr, 0, Math.PI * 2); ctx.clip();
  if (img) { const sc = Math.max(2 * lr / img.width, 2 * lr / img.height); ctx.drawImage(img, cx - img.width * sc / 2, cy - img.height * sc / 2, img.width * sc, img.height * sc); }
  else { ctx.fillStyle = accent; ctx.fillRect(cx - lr, cy - lr, lr * 2, lr * 2); }
  ctx.restore();
  ctx.fillStyle = '#0b0b0c';
  ctx.beginPath(); ctx.arc(cx, cy, R * 0.035, 0, Math.PI * 2); ctx.fill();
}

// Dessine la carte sur le canvas. Renvoie des informations de mise en page
// (dépassement éventuel, taille maximale qui tient).
export function renderCard(canvas, card, imgs = {}, opts = {}) {
  const fmt = FORMATS[card.format] || FORMATS.square;
  // Toute la mise en page est calculée en unités de l'export (1080 px de large) puis mise
  // à l'échelle : l'aperçu coupe les lignes exactement comme le fichier exporté.
  const kr = opts.scale || 1;
  canvas.width = Math.round(fmt.w * kr); canvas.height = Math.round(fmt.h * kr);
  const ctx = canvas.getContext('2d');
  ctx.setTransform(kr, 0, 0, kr, 0, 0);
  const k = 1, W = fmt.w, H = fmt.h;
  const st = card.style, meta = st.meta;
  ctx.textBaseline = 'alphabetic';
  drawBackground(ctx, card, imgs, W, H, kr);

  const m = st.margin * W;
  let top = m, bottom = H - m;
  const tpl = card.template;
  const metaColor = meta.color || st.color;

  // Éléments propres au modèle (pochette, disque).
  if (tpl === 'pochette') {
    const s = Math.min(W * 0.56, H * 0.4);
    const x = (W - s) / 2;
    ctx.save(); ctx.shadowColor = 'rgba(0,0,0,0.55)'; ctx.shadowBlur = 60 * kr; ctx.shadowOffsetY = 24 * kr;
    ctx.fillStyle = '#000'; roundRect(ctx, x, top, s, s, 10); ctx.fill();
    ctx.restore();
    drawCoverSquare(ctx, imgs.cover, x, top, s, 10, st.accent);
    top += s + 56;
  } else if (tpl === 'vinyle') {
    // Disque à moitié hors cadre, en haut à droite.
    const R = Math.min(W * 0.4, H * 0.24);
    drawVinyl(ctx, W - R * 0.62, m + R * 0.78, R, imgs.cover, st.accent);
    top = m + R * 1.78 + 40;
  }

  // Bloc d'informations (titre, artiste, pochette miniature).
  const ms = meta.size;
  const metaLines = [];
  if (meta.showTitle && card.title) metaLines.push({ t: card.title, kind: 'title' });
  if (meta.showArtist && card.artist) metaLines.push({ t: card.artist, kind: 'artist' });
  const metaFont = l => l.kind === 'title' ? `700 ${ms * 1.12}px Inter, system-ui` : `500 ${ms * 0.82}px Inter, system-ui`;
  const lineGap = ms * 1.45;
  const thumb = meta.showCover && imgs.cover ? ms * 2.9 : 0;
  const metaH = Math.max(metaLines.length * lineGap, thumb);
  const metaGap = 56;
  let metaY = null;
  const sigH = meta.showSignature && meta.signature ? ms * 1.6 : 0;
  if (sigH && !meta.band) { if (meta.sigPos.startsWith('top')) top += sigH + 24; else bottom -= sigH + 24; }
  const showLogo = meta.band && meta.showLogo !== false && brandImg;
  const band = meta.band && (meta.showTitle || meta.showArtist || (meta.showSignature && meta.signature) || showLogo);
  const bandH = band ? Math.max(150, ms * 5) : 0;
  if (band) bottom = H - bandH - 30;
  else if (metaH > 0) {
    if (meta.pos === 'top') { metaY = top; top += metaH + metaGap; }
    else { metaY = bottom - metaH; bottom -= metaH + metaGap; }
  }

  // Guillemet éditorial.
  if (tpl === 'editorial') {
    ctx.fillStyle = st.accent;
    ctx.font = `400 ${340}px "Playfair Display", Georgia, serif`;
    ctx.textAlign = st.align === 'center' ? 'center' : st.align === 'right' ? 'right' : 'left';
    const qx = st.align === 'center' ? W / 2 : st.align === 'right' ? W - m : m - 14;
    ctx.fillText('“', qx, top + 250);
    top += 170;
  }

  // Texte principal.
  const padX = st.lineBg ? st.size * 0.32 : 0;
  const maxW = W - 2 * m - 2 * padX;
  const regionH = Math.max(0, bottom - top);
  const fits = sz => {
    const L = layoutText(ctx, card, sz, maxW);
    const h = L.lines.length * sz * st.lineHeight;
    return { L, h, ok: !L.tooWide && h <= regionH };
  };
  let size = st.size;
  if (st.autoFit) {
    // Le texte remplit la carte : plus grande taille qui tient (dans la limite choisie).
    while (size > 24 && !fits(size).ok) size -= 2;
  }
  const cur = fits(size);
  let fitSize = size;
  if (!cur.ok) { fitSize = Math.floor(size); while (fitSize > 12 && !fits(fitSize).ok) fitSize -= 2; }
  const lh = size * st.lineHeight;
  const { L, h } = cur;
  let y = top + Math.max(0, regionH - h) * st.posY;
  const hlColor = st.accent;
  const hasHl = (st.highlights || []).length > 0;
  for (const line of L.lines) {
    y += lh;
    const baseY = y - (lh - size) / 2 - size * 0.2;
    let x = st.align === 'center' ? (W - line.width) / 2 : st.align === 'right' ? W - m - padX - line.width : m + padX;
    if (st.lineBg && line.words.length) {
      ctx.fillStyle = st.lineBg;
      ctx.fillRect(x - padX, baseY - size * 0.86, line.width + padX * 2, size * 1.2);
    }
    for (const w of line.words) {
      const bold = w.hl && st.hlMode === 'bold';
      ctx.font = fontString(st, size, bold);
      if (w.hl && st.hlMode === 'mark') {
        ctx.fillStyle = st.lineBg ? st.color : hlColor;
        ctx.fillRect(x - size * 0.1, baseY - size * 0.86, w.w + size * 0.2, size * 1.2);
      }
      ctx.textAlign = 'left';
      ctx.globalAlpha = st.dimOthers && !w.hl && hasHl ? 0.5 : 1;
      let col = st.color;
      if (w.hl && st.hlMode === 'color') col = hlColor;
      if (w.hl && st.hlMode === 'mark') col = st.lineBg || st.bg.color;
      ctx.fillStyle = col;
      if (st.shadow) { ctx.shadowColor = 'rgba(0,0,0,0.45)'; ctx.shadowBlur = size * 0.25 * kr; ctx.shadowOffsetY = size * 0.04 * kr; }
      ctx.fillText(w.t, x, baseY);
      ctx.shadowColor = 'transparent';
      ctx.globalAlpha = 1;
      x += w.w + L.space;
    }
  }

  // Informations.
  if (metaY !== null) {
    if (tpl === 'editorial') {
      ctx.fillStyle = st.accent;
      const rx = meta.align === 'center' ? W / 2 - 30 : meta.align === 'right' ? W - m - 60 : m;
      ctx.fillRect(rx, metaY - 22, 60, 3);
    }
    const widths = metaLines.map(l => { ctx.font = metaFont(l); setSpacing(ctx, l.kind === 'artist' ? ms * 0.12 : 0); const w = ctx.measureText(l.kind === 'artist' ? l.t.toLocaleUpperCase('fr') : l.t).width; setSpacing(ctx, 0); return w; });
    const textW = widths.length ? Math.max(...widths) : 0;
    const gap = thumb && textW ? ms * 0.65 : 0;
    const blockW = Math.min(W - 2 * m, thumb + gap + textW);
    let bx = meta.align === 'center' ? (W - blockW) / 2 : meta.align === 'right' ? W - m - blockW : m;
    if (thumb) { drawCoverSquare(ctx, imgs.cover, bx, metaY + (metaH - thumb) / 2, thumb, 6, st.accent); bx += thumb + gap; }
    let ty = metaY + (metaH - metaLines.length * lineGap) / 2;
    ctx.textAlign = 'left';
    metaLines.forEach((l, i) => {
      ty += lineGap;
      ctx.font = metaFont(l);
      ctx.fillStyle = metaColor;
      ctx.globalAlpha = l.kind === 'title' ? 1 : 0.72;
      if (l.kind === 'artist') setSpacing(ctx, ms * 0.12);
      const lx = thumb ? bx : meta.align === 'center' ? (W - widths[i]) / 2 : meta.align === 'right' ? W - m - widths[i] : bx;
      ctx.fillText(l.kind === 'artist' ? l.t.toLocaleUpperCase('fr') : l.t, lx, ty - ms * 0.4, Math.max(10, W - m - lx));
      setSpacing(ctx, 0);
      ctx.globalAlpha = 1;
    });
  }
  if (band) {
    const by = H - bandH;
    const layout = meta.bandStyle || 'duo';
    const mf = fontById(meta.font || 'grotesk');
    const fam = mf.system ? mf.family : `"${mf.family}"`;
    const mw = meta.weight || Math.max(...mf.weights);
    const light = mf.weights.length > 1 ? Math.min(...mf.weights) : mw;
    const acc = meta.bandAccent || '#cce988';
    const bandColor = layout === 'etiquette' ? acc : meta.band;
    const ink = layout === 'etiquette' ? '#0b0f0a' : metaColor;
    ctx.fillStyle = bandColor; ctx.fillRect(0, by, W, bandH);
    const title = meta.showTitle ? card.title || '' : '', artist = meta.showArtist ? card.artist || '' : '';
    const right = showLogo || sigH;
    const maxLW = (right ? W * 0.6 : W - 2 * m);
    const cy = by + bandH / 2;
    ctx.fillStyle = ink; ctx.textAlign = 'left';
    if (layout === 'duo') {
      // Titre en grand, artiste en dessous, petit trait d'accent à gauche.
      ctx.fillStyle = acc; ctx.fillRect(m, cy - ms * 1.15, 6, ms * 2.3);
      ctx.fillStyle = ink;
      const x = m + 28;
      const both = title && artist;
      ctx.font = `${mw} ${ms * 1.25}px ${fam}, Inter, sans-serif`;
      if (title) ctx.fillText(title, x, both ? cy - ms * 0.12 : cy + ms * 0.42, maxLW - 28);
      ctx.font = `${light} ${ms * 0.9}px ${fam}, Inter, sans-serif`; ctx.globalAlpha = 0.75;
      if (artist) ctx.fillText(artist, x, both ? cy + ms * 1.05 : cy + ms * 0.32, maxLW - 28);
      ctx.globalAlpha = 1;
    } else if (layout === 'ligne') {
      // Une seule ligne centrée : Titre — Artiste.
      const t = [title, artist].filter(Boolean).join('  —  ');
      ctx.font = `${mw} ${ms * 1.05}px ${fam}, Inter, sans-serif`;
      ctx.textAlign = right ? 'left' : 'center';
      ctx.fillText(t, right ? m : W / 2, cy + ms * 0.36, maxLW);
    } else if (layout === 'etiquette') {
      // Bandeau de couleur d'accent, titre en capitales espacées.
      setSpacing(ctx, ms * 0.18);
      ctx.font = `${mw} ${ms * 1.2}px ${fam}, Inter, sans-serif`;
      const t = title.toLocaleUpperCase('fr');
      ctx.fillText(t, m, artist ? cy - ms * 0.15 : cy + ms * 0.4, maxLW);
      setSpacing(ctx, ms * 0.05);
      ctx.font = `${light} ${ms * 0.9}px ${fam}, Inter, sans-serif`;
      if (artist) ctx.fillText(artist, m, cy + ms * 1.05, maxLW);
      setSpacing(ctx, 0);
    } else {
      // Capitales : ARTISTE, « TITRE » sur deux lignes au plus.
      ctx.globalAlpha = 0.9; ctx.fillRect(0, by, W, 3); ctx.globalAlpha = 1;
      const label = [artist, title && `« ${title} »`].filter(Boolean).join(', ').toLocaleUpperCase('fr');
      const fs = ms * 1.05;
      ctx.font = `${mw} ${fs}px ${fam}, Inter, sans-serif`;
      const rows = []; let cur = '';
      for (const w of label.split(' ')) { const t = cur ? cur + ' ' + w : w; if (cur && ctx.measureText(t).width > maxLW) { rows.push(cur); cur = w; } else cur = t; }
      if (cur) rows.push(cur);
      const shown = rows.slice(0, 2); if (rows.length > 2) shown[1] = rows.slice(1).join(' ');
      let ly = cy - (shown.length - 1) * fs * 0.6 + fs * 0.36;
      for (const r of shown) { ctx.fillText(r, m, ly, maxLW); ly += fs * 1.2; }
    }
    if (showLogo) {
      const lh = Math.min(bandH * 0.42, 72), lw = lh * brandImg.width / brandImg.height;
      const lx = W - m - lw, ly = cy - lh / 2;
      const n = parseInt((bandColor || '#000').slice(1, 7), 16);
      const dark = 0.299 * (n >> 16) + 0.587 * (n >> 8 & 255) + 0.114 * (n & 255) < 150;
      // Sur un bandeau sombre, le logo (texte foncé) est posé sur une pastille claire, sans être modifié.
      if (dark) { ctx.fillStyle = '#ffffff'; roundRect(ctx, lx - lh * 0.12, ly - lh * 0.08, lw + lh * 0.24, lh * 1.16, lh * 0.3); ctx.fill(); }
      ctx.drawImage(brandImg, lx, ly, lw, lh);
    } else if (sigH) {
      ctx.fillStyle = ink;
      ctx.font = `500 ${ms * 1.35}px Caveat, cursive`;
      ctx.textAlign = 'right'; ctx.fillText(meta.signature, W - m, cy + ms * 0.42, W * 0.3);
    }
  } else if (sigH) {
    ctx.font = `500 ${ms * 1.3}px Caveat, cursive`;
    ctx.fillStyle = metaColor; ctx.globalAlpha = 0.85;
    const [v, hpos] = meta.sigPos.split('-');
    ctx.textAlign = hpos === 'center' ? 'center' : hpos;
    const sx = hpos === 'center' ? W / 2 : hpos === 'right' ? W - m : m;
    ctx.fillText(meta.signature, sx, v === 'top' ? m + ms * 1.2 : H - m);
    ctx.globalAlpha = 1;
  }

  return { overflow: !cur.ok, fitSize, size, lines: L.lines.length };
}

// Capacité de lignes environ disponible : utilisé pour répartir un long extrait.
export function splitExcerpt(text, parts) {
  const lines = text.split('\n');
  const per = Math.ceil(lines.length / parts);
  const out = [];
  for (let i = 0; i < lines.length; i += per) out.push(lines.slice(i, i + per).join('\n').trim());
  return out.filter(Boolean);
}

export async function blobToBitmap(blob) {
  if (!blob) return null;
  try { return await createImageBitmap(blob); }
  catch {
    return new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = URL.createObjectURL(blob); });
  }
}

// Palette : quantification simple des couleurs d'une image réduite.
export function extractPalette(img, count = 6) {
  const c = document.createElement('canvas');
  c.width = c.height = 48;
  const x = c.getContext('2d');
  x.drawImage(img, 0, 0, 48, 48);
  const d = x.getImageData(0, 0, 48, 48).data;
  const buckets = new Map();
  for (let i = 0; i < d.length; i += 4) {
    const key = (d[i] >> 5) << 10 | (d[i + 1] >> 5) << 5 | (d[i + 2] >> 5);
    const b = buckets.get(key) || { n: 0, r: 0, g: 0, b: 0 };
    b.n++; b.r += d[i]; b.g += d[i + 1]; b.b += d[i + 2];
    buckets.set(key, b);
  }
  const hex = v => Math.round(v).toString(16).padStart(2, '0');
  const sorted = [...buckets.values()].sort((a, b) => b.n - a.n).map(b => ({ r: b.r / b.n, g: b.g / b.n, b: b.b / b.n }));
  const picked = [];
  for (const col of sorted) {
    if (picked.every(p => Math.abs(p.r - col.r) + Math.abs(p.g - col.g) + Math.abs(p.b - col.b) > 90)) picked.push(col);
    if (picked.length >= count) break;
  }
  return picked.map(p => '#' + hex(p.r) + hex(p.g) + hex(p.b));
}

// Réduit une image importée pour ne pas saturer le stockage (côté max 2160 px).
export async function compressImage(file, max = 2160) {
  const bmp = await blobToBitmap(file);
  if (!bmp) throw new Error("Impossible de lire cette image.");
  const s = Math.min(1, max / Math.max(bmp.width, bmp.height));
  if (s === 1 && file.size < 1.5e6) return file;
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * s); c.height = Math.round(bmp.height * s);
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  return new Promise(res => c.toBlob(b => res(b || file), 'image/jpeg', 0.9));
}
