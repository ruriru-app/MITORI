const CACHE_NAME = 'mitori-app-v10';
const APP_SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './mitori-footer.svg',
  './backup.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png',
  './checklist/palette.js',
  './checklist/workspace.js',
  './checklist/model.js',
  './checklist/domain.js?v=0389',
  './checklist/interactions.js',
  './checklist/bridge.js?v=0389',
  './checklist/storage.js',
  './checklist/palette-settings.js',
  './checklist/settings.js',
  './checklist/backup.js',
  './checklist/export-model.js',
  './checklist/csv-export.js',
  './checklist/xlsx-export.js',
  './checklist/print-export.js',
  './checklist/pwa.js?v=0388',
  './checklist/app.js?v=0389',
  './checklist/styles.css'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL)));
});

self.addEventListener('activate', event => {
  event.waitUntil(Promise.all([
    caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key)))),
    self.clients.claim()
  ]));
});

self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(() => caches.match('./index.html')));
    return;
  }
  event.respondWith(caches.match(request).then(cached => cached || fetch(request).then(response => {
    if (response.ok) caches.open(CACHE_NAME).then(cache => cache.put(request, response.clone()));
    return response;
  })));
});
