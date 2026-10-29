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
  minimal: { label: 'Minimaliste' },
  editorial: { label: 'Éditorial' },
  pochette: { label: 'Pochette' },
  photo: { label: 'Photo' },
  vinyle: { label: 'Vinyle' },
  typo: { label: 'Typographique' },
};

const baseMeta = { showTitle: true, showArtist: true, showCover: false, showSignature: false, signature: '', pos: 'bottom', align: 'left', size: 30, sigPos: 'bottom-right' };
const baseBg = { kind: 'solid', color: '#141218', color2: '#3b2d4f', angle: 135, texture: 'none', textureAlpha: 0.25, imgZoom: 1, imgX: 0, imgY: 0, blur: 0, veil: 0 };

// Réglages par défaut de chaque modèle. Appliquer un modèle ne touche ni à l'extrait,
// ni au titre, ni à l'artiste, ni aux images de la carte.
export function templatePreset(name) {
  const p = {
    font: 'inter', weight: 700, italic: false, size: 58, color: '#f4efe6', align: 'left', lineHeight: 1.3,
    margin: 0.09, posY: 0.5, uppercase: false, accent: '#f2b84b',
    highlights: [], hlMode: 'color', dimOthers: false,
    bg: { ...baseBg }, meta: { ...baseMeta },
  };
  switch (name) {
    case 'editorial':
      Object.assign(p, { font: 'playfair', weight: 400, italic: true, size: 64, color: '#1d1a17', lineHeight: 1.25, accent: '#b3401f', posY: 0.42 });
      p.bg = { ...baseBg, color: '#f3ede2', texture: 'papier', textureAlpha: 0.35 };
      p.meta = { ...baseMeta, align: 'left' };
      break;
    case 'pochette':
      Object.assign(p, { font: 'grotesk', weight: 700, size: 52, align: 'center', color: '#ffffff', posY: 0.35 });
      p.bg = { ...baseBg, kind: 'cover', blur: 40, veil: 0.55 };
      p.meta = { ...baseMeta, align: 'center' };
      break;
    case 'photo':
      Object.assign(p, { font: 'lora', weight: 700, size: 56, color: '#ffffff', posY: 1 });
      p.bg = { ...baseBg, kind: 'photo', veil: 0.4 };
      p.meta = { ...baseMeta, pos: 'top' };
      break;
    case 'vinyle':
      Object.assign(p, { font: 'dmserif', weight: 400, size: 56, align: 'center', color: '#f6e9d7', accent: '#e86a3f', posY: 0.4 });
      p.bg = { ...baseBg, kind: 'gradient', color: '#2a1610', color2: '#0d0b0a', angle: 180, texture: 'grain', textureAlpha: 0.2 };
      p.meta = { ...baseMeta, align: 'center' };
      break;
    case 'typo':
      Object.assign(p, { font: 'bebas', weight: 400, size: 112, uppercase: true, lineHeight: 0.98, color: '#f1f1ee', accent: '#ff5a36', dimOthers: true, posY: 0.45 });
      p.bg = { ...baseBg, color: '#101010', texture: 'grain', textureAlpha: 0.18 };
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

export async function ensureFonts(style) {
  if (!document.fonts) return;
  const f = fontById(style.font);
  const loads = [];
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
    ctx.fillStyle = bg.veil > 0 ? `rgba(0,0,0,${bg.veil})` : `rgba(255,255,255,${-bg.veil})`;
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

  // Éléments propres au modèle (pochette, disque).
  if (tpl === 'pochette') {
    const s = Math.min(W * 0.5, H * 0.36);
    ctx.save(); ctx.shadowColor = 'rgba(0,0,0,0.45)'; ctx.shadowBlur = 40 * kr; ctx.shadowOffsetY = 16 * kr;
    drawCoverSquare(ctx, imgs.cover, (W - s) / 2, top, s, 18 * k, st.accent);
    ctx.restore();
    drawCoverSquare(ctx, imgs.cover, (W - s) / 2, top, s, 18 * k, st.accent);
    top += s + 50 * k;
  } else if (tpl === 'vinyle') {
    const R = Math.min(W * 0.34, H * 0.2);
    drawVinyl(ctx, W / 2, top + R, R, imgs.cover, st.accent);
    top += R * 2 + 50 * k;
  }

  // Bloc d'informations (titre, artiste, pochette miniature).
  const ms = meta.size * k;
  const metaLines = [];
  if (meta.showTitle && card.title) metaLines.push({ t: card.title, bold: true });
  if (meta.showArtist && card.artist) metaLines.push({ t: card.artist, bold: false });
  const sigH = meta.showSignature && meta.signature ? ms * 1.6 : 0;
  if (sigH) { if (meta.sigPos.startsWith('top')) top += sigH + 24 * k; else bottom -= sigH + 24 * k; }
  const thumb = meta.showCover ? ms * 2.6 : 0;
  const metaH = Math.max(metaLines.length * ms * 1.35, thumb);
  const metaGap = 46 * k;
  let metaY = null;
  if (metaH > 0) {
    if (meta.pos === 'top') { metaY = top; top += metaH + metaGap; }
    else { metaY = bottom - metaH; bottom -= metaH + metaGap; }
  }
  // Guillemet éditorial.
  if (tpl === 'editorial') {
    ctx.fillStyle = st.accent;
    ctx.font = `400 ${200 * k}px "DM Serif Display", Georgia, serif`;
    ctx.textAlign = st.align === 'center' ? 'center' : st.align === 'right' ? 'right' : 'left';
    const qx = st.align === 'center' ? W / 2 : st.align === 'right' ? W - m : m - 8 * k;
    ctx.fillText('“', qx, top + 150 * k);
    top += 120 * k;
  }

  // Texte principal.
  const maxW = W - 2 * m;
  const regionH = Math.max(0, bottom - top);
  const fits = sz => {
    const L = layoutText(ctx, card, sz * k, maxW);
    return { L, h: L.lines.length * sz * k * st.lineHeight, ok: !L.tooWide && L.lines.length * sz * k * st.lineHeight <= regionH };
  };
  const cur = fits(st.size);
  let fitSize = st.size;
  if (!cur.ok) { fitSize = Math.floor(st.size); while (fitSize > 12 && !fits(fitSize).ok) fitSize -= 2; }
  const size = st.size * k, lh = size * st.lineHeight;
  const { L, h } = cur;
  let y = top + Math.max(0, regionH - h) * st.posY;
  const hlColor = st.accent;
  for (const line of L.lines) {
    y += lh;
    const baseY = y - (lh - size) / 2 - size * 0.18;
    let x = st.align === 'center' ? (W - line.width) / 2 : st.align === 'right' ? W - m - line.width : m;
    for (const w of line.words) {
      const bold = w.hl && st.hlMode === 'bold';
      ctx.font = fontString(st, size, bold);
      if (w.hl && st.hlMode === 'mark') {
        ctx.fillStyle = hlColor;
        ctx.fillRect(x - size * 0.08, baseY - size * 0.82, w.w + size * 0.16, size * 1.02);
      }
      ctx.textAlign = 'left';
      ctx.globalAlpha = st.dimOthers && !w.hl && (st.highlights || []).length ? 0.42 : 1;
      ctx.fillStyle = w.hl && st.hlMode === 'color' ? hlColor : st.color;
      ctx.fillText(w.t, x, baseY);
      ctx.globalAlpha = 1;
      x += w.w + L.space;
    }
  }

  // Informations.
  if (metaY !== null) {
    if (tpl === 'editorial') {
      ctx.fillStyle = st.accent;
      const rx = meta.align === 'center' ? W / 2 - 40 * k : meta.align === 'right' ? W - m - 80 * k : m;
      ctx.fillRect(rx, metaY - 24 * k, 80 * k, 4 * k);
    }
    const textW = metaLines.length ? Math.max(...metaLines.map(l => { ctx.font = `${l.bold ? 700 : 400} ${ms}px Inter, system-ui`; return ctx.measureText(l.t).width; })) : 0;
    const blockW = thumb + (thumb && textW ? ms * 0.7 : 0) + textW;
    let bx = meta.align === 'center' ? (W - blockW) / 2 : meta.align === 'right' ? W - m - blockW : m;
    if (thumb) { drawCoverSquare(ctx, imgs.cover, bx, metaY + (metaH - thumb) / 2, thumb, 8 * k, st.accent); bx += thumb + ms * 0.7; }
    let ty = metaY + (metaH - metaLines.length * ms * 1.35) / 2;
    ctx.textAlign = 'left';
    for (const l of metaLines) {
      ty += ms * 1.35;
      ctx.font = `${l.bold ? 700 : 400} ${ms}px Inter, system-ui`;
      ctx.fillStyle = st.color;
      ctx.globalAlpha = l.bold ? 1 : 0.75;
      ctx.fillText(l.t, bx, ty - ms * 0.3, Math.max(10, W - m - bx));
      ctx.globalAlpha = 1;
    }
  }
  if (sigH) {
    ctx.font = `500 ${ms * 1.2}px Caveat, cursive`;
    ctx.fillStyle = st.color; ctx.globalAlpha = 0.85;
    const [v, hpos] = meta.sigPos.split('-');
    ctx.textAlign = hpos === 'center' ? 'center' : hpos;
    const sx = hpos === 'center' ? W / 2 : hpos === 'right' ? W - m : m;
    ctx.fillText(meta.signature, sx, v === 'top' ? m + ms * 1.2 : H - m);
    ctx.globalAlpha = 1;
  }

  return { overflow: !cur.ok, fitSize, lines: L.lines.length };
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
