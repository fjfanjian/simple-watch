/* global self, caches */
const CACHE = "simplewatch-shell-v1";
const SHELL = ["/", "/manifest.webmanifest"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)));
  self.skipWaiting();
});
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)),
        ),
      ),
  );
  self.clients.claim();
});
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  const forbidden = [
    "/api/",
    "/media-files/",
    "/subtitles/",
    "/files/",
    "/program/",
    "/rtc",
  ];
  if (
    event.request.method !== "GET" ||
    url.origin !== self.location.origin ||
    forbidden.some((prefix) => url.pathname.startsWith(prefix))
  ) {
    return;
  }
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response.ok && response.type === "basic") {
          const copy = response.clone();
          void caches
            .open(CACHE)
            .then((cache) => cache.put(event.request, copy));
        }
        return response;
      })
      .catch(() =>
        caches
          .match(event.request)
          .then((response) => response ?? caches.match("/")),
      ),
  );
});
