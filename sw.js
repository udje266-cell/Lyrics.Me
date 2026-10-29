// Service worker : met l'application en cache pour un usage hors connexion.
// Incrémentez VERSION à chaque modification des fichiers de l'application.
const VERSION = 'verso-v11';
const ASSETS = [
  './', './index.html', './manifest.webmanifest', './css/styles.css', './css/fonts.css',
  './js/app.js', './js/db.js', './js/render.js', './js/sources.js', './js/studio.js', './js/albums.js',
  './icons/icon.png', './icons/logo.png',
  "./fonts/BebasNeue-400-normal-latin-ext.woff2",
  "./fonts/BebasNeue-400-normal-latin.woff2",
  "./fonts/Caveat-500-normal-latin-ext.woff2",
  "./fonts/Caveat-500-normal-latin.woff2",
  "./fonts/DMSerifDisplay-400-normal-latin-ext.woff2",
  "./fonts/DMSerifDisplay-400-normal-latin.woff2",
  "./fonts/Inter-400-normal-latin-ext.woff2",
  "./fonts/Inter-400-normal-latin.woff2",
  "./fonts/Inter-700-normal-latin-ext.woff2",
  "./fonts/Inter-700-normal-latin.woff2",
  "./fonts/Lora-400-normal-latin-ext.woff2",
  "./fonts/Lora-400-normal-latin.woff2",
  "./fonts/Lora-700-normal-latin-ext.woff2",
  "./fonts/Lora-700-normal-latin.woff2",
  "./fonts/PlayfairDisplay-400-italic-latin-ext.woff2",
  "./fonts/PlayfairDisplay-400-italic-latin.woff2",
  "./fonts/PlayfairDisplay-400-normal-latin-ext.woff2",
  "./fonts/PlayfairDisplay-400-normal-latin.woff2",
  "./fonts/PlayfairDisplay-700-normal-latin-ext.woff2",
  "./fonts/PlayfairDisplay-700-normal-latin.woff2",
  "./fonts/SpaceGrotesk-400-normal-latin-ext.woff2",
  "./fonts/SpaceGrotesk-400-normal-latin.woff2",
  "./fonts/SpaceGrotesk-700-normal-latin-ext.woff2",
  "./fonts/SpaceGrotesk-700-normal-latin.woff2",
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return; // les sources externes ne sont jamais mises en cache
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then(r => r || fetch(e.request)));
});
