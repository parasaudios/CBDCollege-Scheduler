var CACHE_NAME = 'cbd-scheduler-v3';
var ASSETS = [
  '/',
  '/index.html'
];

self.addEventListener('install', function(e) {
  e.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      return cache.addAll(ASSETS);
    })
  );
  self.skipWaiting();
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
  self.clients.claim();
});

// Web Push handler (Phase 2: requires VAPID keys + subscription endpoint)
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
  var url = new URL(e.request.url);

  // Always go to network for API calls and auth
  if (url.hostname.includes('supabase') || url.pathname.startsWith('/functions/')) {
    return;
  }

  // Network-first for HTML (always get latest version)
  if (e.request.mode === 'navigate' || e.request.destination === 'document') {
    e.respondWith(
      fetch(e.request).then(function(resp) {
        var clone = resp.clone();
        caches.open(CACHE_NAME).then(function(cache) { cache.put(e.request, clone); });
        return resp;
      }).catch(function() {
        return caches.match(e.request);
      })
    );
    return;
  }

  // Cache-first for CDN assets and other static resources
  e.respondWith(
    caches.match(e.request).then(function(cached) {
      if (cached) return cached;
      return fetch(e.request).then(function(resp) {
        if (resp && resp.status === 200 && resp.type === 'basic') {
          var clone = resp.clone();
          caches.open(CACHE_NAME).then(function(cache) { cache.put(e.request, clone); });
        }
        return resp;
      });
    })
  );
});
