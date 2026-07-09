// @ts-nocheck
const CACHE_NAME = 'bringdat-smart-register-v3';
const APP_SHELL = [
    './',
    './index.html',
    './styles.css',
    './dist/lilpos-runtime-data.js',
    './dist/app.js',
    './manifest.webmanifest',
    './icons/icon-192.png',
    './icons/icon-512.png',
    './icons/icon-192.svg',
    './icons/icon-512.svg'
];
self.addEventListener('install', (event) => {
    event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
    self.skipWaiting();
});
self.addEventListener('activate', (event) => {
    event.waitUntil(caches.keys().then((keys) => Promise.all(keys
        .filter((key) => key !== CACHE_NAME)
        .map((key) => caches.delete(key)))));
    self.clients.claim();
});
self.addEventListener('fetch', (event) => {
    if (event.request.method !== 'GET') {
        return;
    }
    event.respondWith(fetch(event.request)
        .then((response) => {
        if (!response || response.status !== 200) {
            return response;
        }
        const responseClone = response.clone();
        caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseClone);
        });
        return response;
    })
        .catch(() => caches.match(event.request).then((cached) => {
        if (cached) {
            return cached;
        }
        if (event.request.mode === 'navigate') {
            return caches.match('./index.html');
        }
        return new Response('', { status: 504, statusText: 'Gateway Timeout' });
    })));
});
//# sourceMappingURL=sw.js.map