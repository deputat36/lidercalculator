const CACHE_NAME = 'leader-crm-v3-2026-05-20-01';
const ASSETS = [
  './',
  './index.html',
  './assets/leader-crm.css',
  './assets/order-card.css',
  './assets/quick-tools.css',
  './assets/supabase-bridge.js',
  './assets/leader-crm.js',
  './assets/order-card.js',
  './assets/order-card-cloud.js',
  './assets/pwa.js',
  './assets/auth-status.js',
  './assets/auth-repair.js',
  './assets/quick-tools.js',
  './assets/health-check.js',
  './assets/leads-fix.css',
  './assets/leads-fix.js',
  './assets/leads-table-fix.js',
  './assets/export-tools.js',
  './assets/update-tools.js',
  './manifest.webmanifest'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.hostname.includes('supabase.co')) return;
  if (url.hostname.includes('cdn.jsdelivr.net')) return;

  event.respondWith(
    fetch(req, { cache: 'no-store' }).then(res => {
      const copy = res.clone();
      caches.open(CACHE_NAME).then(cache => cache.put(req, copy));
      return res;
    }).catch(() => caches.match(req).then(cached => cached || caches.match('./index.html')))
  );
});
