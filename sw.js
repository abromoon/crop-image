"use strict";

// Service worker кэширует только файлы самого приложения. Изображения
// пользователя открываются через blob: URL и сюда не попадают; файл из
// «Поделиться» держится в памяти до передачи странице и нигде не сохраняется.

// Бампать при смене состава/структуры кэша. Обычные правки файлов
// подхватываются сами (stale-while-revalidate).
const CACHE_NAME = "crop-image-v1";

// При добавлении новых файлов приложения — внеси их сюда.
const APP_SHELL = [
  "index.html",
  "style.css",
  "app.js",
  "manifest.webmanifest",
  "icons/icon.svg",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/icon-maskable-512.png",
  "icons/apple-touch-icon.png",
];

const SHARE_TARGET_PATH = new URL("share-target", self.registration.scope).pathname;

let pendingSharedFile = null;

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.method === "POST" && url.pathname === SHARE_TARGET_PATH) {
    event.respondWith(receiveSharedFile(request));
    return;
  }

  if (request.method !== "GET") return;

  if (request.mode === "navigate") {
    // Любая навигация внутри scope (в том числе с query) — это index.html.
    event.respondWith(staleWhileRevalidate(event, new Request("index.html"), request));
    return;
  }

  event.respondWith(staleWhileRevalidate(event, request, request));
});

// cacheKey — под каким ключом лежит ответ в кэше; request — что запросить
// из сети, если в кэше пусто.
async function staleWhileRevalidate(event, cacheKey, request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(cacheKey);

  // Не из APP_SHELL — просто сеть, в кэш ничего нового не добавляем.
  if (!cached) return fetch(request);

  // cache: "no-cache" — чтобы обойти HTTP-кэш GitHub Pages (max-age=600).
  const refresh = fetch(cacheKey, { cache: "no-cache" })
    .then((response) => {
      if (response.ok) return cache.put(cacheKey, response);
    })
    .catch(() => {});
  event.waitUntil(refresh);
  return cached;
}

async function receiveSharedFile(request) {
  try {
    const formData = await request.formData();
    const file = formData.get("image");
    pendingSharedFile = file instanceof File ? file : null;
  } catch {
    pendingSharedFile = null;
  }
  return Response.redirect("./?share-target", 303);
}

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "get-shared-file" && event.ports[0]) {
    event.ports[0].postMessage(pendingSharedFile);
    pendingSharedFile = null;
  }
});
