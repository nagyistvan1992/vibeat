// Offline gyorsítótár (Service Worker) – kizárólag az azonos originű statikus eszközöket kezeli; külső (Clerk, Stripe) és /api/* kéréseket soha nem fog el.
const CACHE = 'vebeat-sw-v6';
const ASSETS = ['./', './index.html', './assets/marhahusos-tal.png'];

self.addEventListener('install', e => {
  e.waitUntil(
    caches
      .open(CACHE)
      .then(c => c.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches
      .keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  // Never intercept cross-origin requests (Clerk FAPI, Stripe, CDNs) or API / Vite dev module requests
  if (url.origin !== self.location.origin) return;
  if (
    url.pathname.startsWith('/api/') ||
    url.pathname.startsWith('/@') ||
    url.pathname.startsWith('/src/') ||
    url.pathname.startsWith('/node_modules/')
  ) {
    return;
  }
  e.respondWith(
    fetch(e.request)
      .then(res => {
        if (res && res.status === 200 && res.type === 'basic') {
          const copy = res.clone();
          caches
            .open(CACHE)
            .then(c => c.put(e.request, copy))
            .catch(() => {});
        }
        return res;
      })
      .catch(() =>
        caches
          .match(e.request)
          .then(r => r || (e.request.mode === 'navigate' ? caches.match('./index.html') : Response.error()))
      )
  );
});
