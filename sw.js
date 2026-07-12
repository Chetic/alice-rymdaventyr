// Service worker: cache-först så att hela äventyret fungerar offline
// (t.ex. installerad som app på plattan). Bumpa CACHE vid varje release.

var CACHE = 'alice-v3';
var FILES = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/style.css',
  './vendor/matter.min.js',
  './js/audio.js',
  './js/chars.js',
  './js/config.js',
  './js/hud.js',
  './js/input.js',
  './js/main.js',
  './js/props.js',
  './js/render.js',
  './js/save.js',
  './js/world.js',
  './js/scenes/asteroid.js',
  './js/scenes/base.js',
  './js/scenes/europa.js',
  './js/scenes/flight.js',
  './js/scenes/home.js',
  './js/scenes/homecoming.js',
  './js/scenes/moon.js',
  './js/scenes/neptune.js',
  './js/scenes/party.js',
  './js/scenes/saturn.js',
  './js/scenes/spaceport.js',
  './js/scenes/title.js',
  './js/scenes/travel.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/maskable-512.png',
  './icons/apple-180.png',
  './icons/favicon-32.png'
];

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(CACHE).then(function (cache) {
      return cache.addAll(FILES);
    }).then(function () {
      return self.skipWaiting();
    })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) {
        if (k !== CACHE) return caches.delete(k);
        return Promise.resolve();
      }));
    }).then(function () {
      return self.clients.claim();
    })
  );
});

self.addEventListener('fetch', function (e) {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request, { ignoreSearch: true }).then(function (hit) {
      if (hit) return hit;
      return fetch(e.request).then(function (resp) {
        // cachea nya GET-svar från samma origin
        if (resp.ok && e.request.url.indexOf(self.location.origin) === 0) {
          var copy = resp.clone();
          caches.open(CACHE).then(function (cache) { cache.put(e.request, copy); });
        }
        return resp;
      });
    })
  );
});
