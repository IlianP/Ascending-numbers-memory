/**
 * Service Worker: hält die App offline lauffähig.
 *
 * Strategie bewusst simpel, weil es keinen Build und keine gehashten Dateinamen gibt:
 * Beim Installieren wandert der komplette App-Shell in *einen* versionierten Cache.
 * Ausgeliefert wird danach nur aus diesem Cache – so kann nie eine neue `main.js`
 * auf eine alte `game.js` treffen. Ein Update gibt es, sobald sich `VERSION` ändert.
 */

const VERSION = 'v3';
/* Cache Storage gilt pro Origin, nicht pro Scope: Auf *.github.io teilen sich alle
   Projekte einen Origin. Deshalb fassen wir nur Caches mit unserem Praefix an. */
const PREFIX = 'ascending-numbers-';
const CACHE = `${PREFIX}${VERSION}`;

const ASSETS = [
  '.',
  'index.html',
  'manifest.webmanifest',
  'css/style.css',
  'js/main.js',
  'js/game.js',
  'js/level.js',
  'js/config.js',
  'js/board-view.js',
  'js/feedback.js',
  'js/storage.js',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(ASSETS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => keys.filter((key) => key.startsWith(PREFIX) && key !== CACHE))
      .then((stale) => Promise.all(stale.map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  /* Navigation: immer die gecachte Startseite – Query-Parameter wie ?runde=15 inklusive. */
  if (request.mode === 'navigate') {
    event.respondWith(
      caches.match('index.html', { cacheName: CACHE })
        .then((hit) => hit ?? fetch(request)),
    );
    return;
  }

  event.respondWith(
    caches.match(request, { cacheName: CACHE, ignoreSearch: true })
      .then((hit) => hit ?? fetch(request)),
  );
});
