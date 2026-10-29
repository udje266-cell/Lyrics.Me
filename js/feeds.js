// Actualités musicales (flux RSS) et tendances, avec cache local pour l'usage hors connexion.
// Les flux RSS ne sont lisibles que dans l'application Android : un navigateur les bloque (CORS).
import { db } from './db.js';
import { charts } from './sources.js';

export const NEWS_FEEDS = [
  { name: 'RFI Musique', url: 'https://www.rfi.fr/fr/musique/rss' },
  { name: 'Pan African Music', url: 'https://pan-african-music.com/feed/' },
  { name: 'Booska-P', url: 'https://www.booska-p.com/feed/' },
  { name: 'Google Actualités', url: 'https://news.google.com/rss/search?q=musique+africaine+OR+rap+fran%C3%A7ais+OR+zouglou+OR+coup%C3%A9-d%C3%A9cal%C3%A9&hl=fr&gl=FR&ceid=FR:fr' },
];

const pending = new Map();
window.__versoFetched = (id, body, err) => { const p = pending.get(id); if (p) { pending.delete(id); err ? p.reject(new Error(err)) : p.resolve(body); } };
function nativeFetch(url) {
  return new Promise((resolve, reject) => {
    const id = Math.random().toString(36).slice(2);
    pending.set(id, { resolve, reject });
    window.VersoAndroid.fetchText(id, url);
    setTimeout(() => { if (pending.has(id)) { pending.delete(id); reject(new Error('Délai dépassé')); } }, 20000);
  });
}

function parseRss(xml, source) {
  const doc = new DOMParser().parseFromString(xml, 'text/xml');
  return [...doc.querySelectorAll('item')].slice(0, 15).map(it => {
    const get = sel => { const n = it.getElementsByTagName(sel)[0]; return n ? n.textContent.trim() : ''; };
    let img = '';
    const media = it.getElementsByTagName('media:content')[0] || it.getElementsByTagName('media:thumbnail')[0] || it.getElementsByTagName('enclosure')[0];
    if (media && /image|jpg|jpeg|png|webp/i.test((media.getAttribute('type') || '') + media.getAttribute('url'))) img = media.getAttribute('url');
    if (!img) { const m = (get('description') + get('content:encoded')).match(/<img[^>]+src=["']([^"']+)/i); if (m) img = m[1]; }
    let title = get('title');
    let src = source;
    const gsrc = it.getElementsByTagName('source')[0];
    if (gsrc) { src = gsrc.textContent.trim(); title = title.replace(new RegExp('\\s+-\\s+' + src.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$'), ''); }
    return { title, link: get('link'), date: Date.parse(get('pubDate')) || 0, img, source: src };
  }).filter(i => i.title && i.link);
}

export const newsAvailable = () => !!(window.VersoAndroid && window.VersoAndroid.fetchText);

export async function loadNews(force = false) {
  const cache = await db.setting('newsCache', null);
  if (!force && cache && Date.now() - cache.at < 30 * 60e3) return cache;
  if (!newsAvailable() || !navigator.onLine) return cache;
  const results = await Promise.allSettled(NEWS_FEEDS.map(f => nativeFetch(f.url).then(x => parseRss(x, f.name))));
  const seen = new Set();
  const items = results.flatMap(r => r.status === 'fulfilled' ? r.value : [])
    .sort((a, b) => b.date - a.date)
    .filter(i => { const k = i.title.toLowerCase().slice(0, 60); if (seen.has(k)) return false; seen.add(k); return true; })
    .slice(0, 20);
  if (!items.length) return cache;
  const fresh = { at: Date.now(), items };
  await db.setSetting('newsCache', fresh).catch(() => {});
  return fresh;
}

export async function loadCharts(force = false) {
  const cache = await db.setting('chartsCache', null);
  if (!force && cache && Date.now() - cache.at < 60 * 60e3) return cache;
  if (!navigator.onLine) return cache;
  try {
    const c = await charts();
    const fresh = { at: Date.now(), ...c };
    await db.setSetting('chartsCache', fresh).catch(() => {});
    return fresh;
  } catch { return cache; }
}
