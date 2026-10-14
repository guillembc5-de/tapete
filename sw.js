// TAPETE — service worker: guarda todo el juego en el móvil para jugar sin conexión.
// Cuando cambies cualquier archivo del juego, sube el número de VERSION.
const VERSION = 'tapete-v5';
const ASSETS = [
  './', './index.html', './manifest.webmanifest',
  './css/style.css',
  './js/ui.js', './js/game.js', './js/cards.js',
  './icons/icon-192.png', './icons/icon-512.png', './icons/icon-maskable-512.png', './icons/apple-touch-icon.png',
  './img/wood.jpg', './img/faces/A.png', './img/faces/K.png', './img/faces/Q.png', './img/faces/J.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(VERSION).then((cache) =>
      // add uno a uno: si falta alguna cara (aún no subida) no se rompe la instalación
      Promise.all(ASSETS.map((url) => cache.add(url).catch(() => null)))
    ).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  event.respondWith(
    caches.match(req, { ignoreSearch: true }).then((hit) => {
      if (hit) return hit;
      return fetch(req).then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); }
        return res;
      }).catch(() => (req.mode === 'navigate' ? caches.match('./index.html') : Response.error()));
    })
  );
});
