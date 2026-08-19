const CACHE_NAME = 'meeting-assistant-v1';
const ASSETS = [
  '/',
  '/index.html',
  '/css/styles.css',
  '/js/app.js',
  '/js/storage-engine.js',
  '/js/audio-engine.js',
  '/js/ai-engine.js',
  '/js/export-engine.js',
  '/manifest.json'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (e) => {
  e.respondWith(caches.match(e.request).then(response => {
    return response || fetch(e.request);
  }));
});
