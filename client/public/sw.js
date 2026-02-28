// Atos Control Center — Service Worker
// Cache básico para funcionamento offline e PWA
// v3 — força limpeza de cache para atualização do Whisper

const CACHE_NAME = "atos-v3";
const PRECACHE_URLS = ["/", "/manifest.json"];

// Instalação: pré-cacheia recursos essenciais
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS))
  );
  // Força ativação imediata sem esperar abas fecharem
  self.skipWaiting();
});

// Ativação: limpa TODOS os caches antigos
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => {
            console.log("[SW] Removendo cache antigo:", key);
            return caches.delete(key);
          })
      )
    ).then(() => {
      // Toma controle de todas as abas imediatamente
      return self.clients.claim();
    })
  );
});

// Fetch: network-first com fallback para cache
// NUNCA cacheia requisições de API (/api/*)
self.addEventListener("fetch", (event) => {
  // Ignora requisições POST (webhook, tRPC mutations)
  if (event.request.method !== "GET") return;

  // Nunca cacheia chamadas de API — sempre vai para a rede
  const url = new URL(event.request.url);
  if (url.pathname.startsWith("/api/")) return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Cacheia apenas respostas bem-sucedidas de assets estáticos
        if (response.ok && !url.pathname.startsWith("/api/")) {
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
