// Versão do cache: SUBIR esse número sempre que app.js/index.html/style.css mudarem
// de um jeito que remova elementos do HTML ou funções do JS — isso força o
// navegador de todo mundo a descartar a cópia antiga e buscar a nova.
const CACHE_NAME = 'pulso-shell-v2';
const SHELL_FILES = ['/', '/index.html', '/style.css', '/app.js', '/manifest.json', '/icon-192.png', '/icon-512.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_FILES)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n)))
    )
  );
  self.clients.claim();
});

// NETWORK-FIRST pro esqueleto do app (HTML/CSS/JS): busca sempre a versão mais
// nova na rede primeiro; só cai pro cache se estiver offline ou a rede falhar.
// Antes era cache-first, o que deixava o navegador preso numa versão antiga do
// app.js mesmo depois de eu corrigir bugs e publicar no GitHub — corrigido em
// 26/07/2026 depois de travar o "Painel do dia" e o "Radar de notícias".
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        if (networkResponse && networkResponse.ok) {
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, networkResponse.clone()));
        }
        return networkResponse;
      })
      .catch(() => caches.match(event.request))
  );
});

/* ---------------- PUSH: eventos de alto impacto chegando ---------------- */
self.addEventListener('push', (event) => {
  let data = { title: 'Pulso', body: 'Evento econômico chegando.', url: '/' };
  try { data = event.data.json(); } catch { /* usa o padrão acima */ }

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      data: { url: data.url || '/' },
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || '/';
  event.waitUntil(
    clients.matchAll({ type: 'window' }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow(targetUrl);
    })
  );
});
