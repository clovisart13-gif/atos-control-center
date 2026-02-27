// Atos Control Center — Service Worker
// Cache básico para funcionamento offline e PWA

const CACHE_NAME = "atos-v1";
const PRECACHE_URLS = ["/", "/manifest.json"];

// Instalação: pré-cacheia recursos essenciais
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS))
  );
  self.skipWaiting();
});

// Ativação: limpa caches antigos
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

// Fetch: network-first com fallback para cache
self.addEventListener("fetch", (event) => {
  // Ignora requisições POST (webhook)
  if (event.request.method !== "GET") return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Cacheia respostas bem-sucedidas
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, clone);
          });
        }
        return response;
      })
      .catch(() => {
        // Fallback para cache quando offline
        return caches.match(event.request);
      })
  );
});
