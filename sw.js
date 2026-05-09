// SW v4: precache Supabase + jspdf, scoped Supabase early-return, no claim()
var CACHE_NAME = 'cbd-scheduler-v4';
var CORE_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png'
];
// Static CDN assets we want available offline. Use { cache: 'reload' } to bypass HTTP cache during install.
var CDN_ASSETS = [
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js'
];

// Hostnames that the SW must NEVER cache (live data / auth / realtime)
function isApiRequest(url) {
  if (url.hostname.endsWith('.supabase.co')) return true;
  if (url.pathname.startsWith('/functions/')) return true;
  if (url.pathname.startsWith('/auth/')) return true;
  if (url.pathname.startsWith('/rest/')) return true;
  if (url.pathname.startsWith('/realtime/')) return true;
  return false;
}

self.addEventListener('install', function(e) {
  e.waitUntil((async function() {
    var cache = await caches.open(CACHE_NAME);
    // Core (same-origin) — fail install if any miss
    await cache.addAll(CORE_ASSETS);
    // CDN — best-effort, do not fail install if any single asset 404s
    await Promise.all(CDN_ASSETS.map(function(u) {
      return fetch(new Request(u, { cache: 'reload', mode: 'no-cors' }))
        .then(function(resp) { return cache.put(u, resp); })
        .catch(function() {});
    }));
    self.skipWaiting();
  })());
});

self.addEventListener('activate', function(e) {
  e.waitUntil(
    caches.keys().then(function(names) {
      return Promise.all(
        names.filter(function(n) { return n !== CACHE_NAME; })
          .map(function(n) { return caches.delete(n); })
      );
    })
  );
  // Note: NOT calling clients.claim() — let pages keep using the SW that loaded them
  // until they navigate. Combined with skipWaiting() this gives clean upgrade-on-next-load.
});

// Web Push handler (requires VAPID keys + subscription endpoint to fire)
self.addEventListener('push', function(e) {
    var data = {};
    try { data = e.data ? e.data.json() : {}; } catch (err) { data = { title: 'Notification', body: e.data ? e.data.text() : '' }; }
    var title = data.title || 'CBD Scheduler';
    var options = {
        body: data.body || data.message || '',
        icon: 'icons/icon-192.png',
        badge: 'icons/icon-192.png',
        tag: data.tag || 'cbd-notif',
        data: data.data || {}
    };
    e.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', function(e) {
    e.notification.close();
    e.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(clientList) {
            for (var i = 0; i < clientList.length; i++) {
                var c = clientList[i];
                if ('focus' in c) return c.focus();
            }
            if (clients.openWindow) return clients.openWindow('/');
        })
    );
});

self.addEventListener('fetch', function(e) {
  if (e.request.method !== 'GET') return;
  var url;
  try { url = new URL(e.request.url); } catch (err) { return; }

  // Never intercept live API/auth/realtime traffic
  if (isApiRequest(url)) return;

  // Network-first for HTML (always get latest version, fall back to cache offline)
  if (e.request.mode === 'navigate' || e.request.destination === 'document') {
    e.respondWith(
      fetch(e.request).then(function(resp) {
        var clone = resp.clone();
        caches.open(CACHE_NAME).then(function(cache) { cache.put(e.request, clone); }).catch(function(){});
        return resp;
      }).catch(function() { return caches.match(e.request); })
    );
    return;
  }

  // Cache-first for everything else (CDN assets, icons, manifest, future static files).
  // Cache opaque cross-origin responses too so Supabase JS / jspdf are served from cache.
  e.respondWith(
    caches.match(e.request).then(function(cached) {
      if (cached) return cached;
      return fetch(e.request).then(function(resp) {
        if (resp && (resp.status === 200 || resp.type === 'opaque')) {
          var clone = resp.clone();
          caches.open(CACHE_NAME).then(function(cache) { cache.put(e.request, clone); }).catch(function(){});
        }
        return resp;
      }).catch(function() { return caches.match(e.request); });
    })
  );
});
