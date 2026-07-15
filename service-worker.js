const CACHE_NAME = 'farmledger-v1';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './manifest.json',
  './css/main.css',
  './css/dashboard.css',
  './css/components.css',
  './js/app.js',
  './js/db.js',
  './js/components.js',
  './js/utils.js',
  './js/dashboard.js',
  'https://cdn.jsdelivr.net/npm/chart.js' // Chart.js CDN
];

// Install Event - Cache Core Assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('Caching App Shell');
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
  self.skipWaiting();
});

// Activate Event - Cleanup Old Caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('Clearing Old Cache', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Fetch Event - Network First for HTML/JS/CSS, Cache First for external CDN
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  
  // For Chart.js from CDN, use Cache First
  if (event.request.url.includes('cdn.jsdelivr.net')) {
    event.respondWith(
      caches.match(event.request).then((cachedResponse) => {
        return cachedResponse || fetch(event.request).then(response => {
           return caches.open(CACHE_NAME).then(cache => {
             cache.put(event.request, response.clone());
             return response;
           });
        });
      })
    );
    return;
  }

  // Network First, falling back to cache for local assets
  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        return caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, networkResponse.clone());
          return networkResponse;
        });
      })
      .catch(() => {
        return caches.match(event.request);
      })
  );
});
