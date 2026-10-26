/* aurore : fonctionne hors ligne. La page est d'abord demandée au réseau (pour recevoir les mises à jour),
   puis au cache si le réseau ne répond pas. Les polices sont gardées après la première visite. */
const VERSION = "9d2d601852";
const SHELL = ["./", "./manifest.webmanifest", "./icons/icon-192.png", "./icons/icon-512.png", "./icons/apple-touch-icon.png", "./icons/favicon.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open("aurore-" + VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith("aurore-") && k !== "aurore-" + VERSION && k !== "aurore-fonts").map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (req.mode === "navigate") {
    e.respondWith((async () => {
      try {
        const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 4000);
        const res = await fetch(req, { signal: ctl.signal }); clearTimeout(t);
        if (res.ok) { const c = await caches.open("aurore-" + VERSION); c.put("./", res.clone()); }
        return res;
      } catch {
        return (await caches.match("./")) || (await caches.match(req)) || Response.error();
      }
    })());
    return;
  }
  if (url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com") {
    e.respondWith((async () => {
      const c = await caches.open("aurore-fonts"); const hit = await c.match(req);
      const net = fetch(req).then((res) => { if (res.ok || res.type === "opaque") c.put(req, res.clone()); return res; }).catch(() => hit || Response.error());
      return hit || net;
    })());
    return;
  }
  if (url.origin === location.origin) {
    e.respondWith(caches.match(req).then((hit) => hit || fetch(req)));
  }
});
