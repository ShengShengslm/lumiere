const CACHE = "lumiere-v44";
const ASSETS = ["/", "/index.html", "/app.js", "/api.js", "/voice-call.js", "/push-notifications.js", "/real-ui.js", "/pet.js", "/styles.css", "/voice-call.css", "/call-caption-fix.css?v=44", "/api-integration.css", "/real-ui.css", "/pet.css", "/multi-bubble.css", "/moments.css", "/moments-page.css", "/manifest.webmanifest", "/app-icon-512.png", "/pet-assets/idle.gif", "/pet-assets/thinking.gif", "/pet-assets/working.gif", "/pet-assets/happy.gif", "/pet-assets/error.gif", "/pet-assets/sleeping.gif", "/pet-assets/poke.gif"];
self.addEventListener("install", (event) => event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting())));
self.addEventListener("activate", (event) => event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))).then(() => self.clients.claim())));
self.addEventListener("fetch", (event) => { if (event.request.method !== "GET" || new URL(event.request.url).pathname.startsWith("/api/")) return; event.respondWith(fetch(event.request).then((response) => { const copy = response.clone(); caches.open(CACHE).then((cache) => cache.put(event.request, copy)); return response; }).catch(() => caches.match(event.request))); });
self.addEventListener("push", (event) => {
  let data = {};
  try { data = event.data?.json() || {}; } catch { data = { body: event.data?.text() || "" }; }
  event.waitUntil(self.registration.showNotification(data.title || "Lumière", {
    body: data.body || "想听听你的声音。",
    icon: "/app-icon-512.png",
    badge: "/app-icon-512.png",
    tag: data.tag || "lumiere",
    renotify: true,
    requireInteraction: data.type === "incoming-call",
    data: { url: data.url || "/", type: data.type || "message" }
  }));
});
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || "/", self.location.origin).href;
  event.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(async (clients) => {
    const client = clients.find((item) => new URL(item.url).origin === self.location.origin);
    if (client) {
      await client.navigate(target);
      return client.focus();
    }
    return self.clients.openWindow(target);
  }));
});
