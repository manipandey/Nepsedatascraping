const CACHE_NAME = 'nepse-terminal-v4';
const ASSETS_TO_CACHE = [
    '/',
    '/mobile.html',
    '/mobile.css',
    '/mobile.js',
    '/style.css',
    '/app.js',
    '/src/api.js',
    '/src/state.js',
    '/src/utils.js',
    '/manifest.json'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(ASSETS_TO_CACHE);
        }).then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cache) => {
                    if (cache !== CACHE_NAME) {
                        return caches.delete(cache);
                    }
                })
            );
        }).then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (event) => {
    if (event.request.method !== 'GET') return;

    const url = new URL(event.request.url);
    // Bypass service worker cache for dynamic market data, APIs, and Supabase requests
    const isDynamic = url.pathname.includes('/data/') ||
                      url.pathname.includes('/api/') ||
                      url.hostname.includes('supabase.co');

    if (isDynamic) {
        event.respondWith(fetch(event.request));
        return;
    }

    event.respondWith(
        fetch(event.request)
            .then((networkResponse) => {
                if (networkResponse && networkResponse.status === 200) {
                    const responseClone = networkResponse.clone();
                    caches.open(CACHE_NAME).then((cache) => {
                        cache.put(event.request, responseClone);
                    });
                }
                return networkResponse;
            })
            .catch(() => {
                return caches.match(event.request);
            })
    );
});
