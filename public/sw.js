// Service worker mínimo: guarda a "casca" do site (fontes, estilos, script) para abrir rápido e instalar como app.
const CACHE = "be-story-v1";
const SHELL = ["/story/story.css", "/story/fonts.css", "/story/story.js", "/fonts/gentlemens-script.woff2", "/fonts/poppins-latin-400-normal.woff2", "/brand/be-logo-cream.png"];
self.addEventListener("install", (e) => e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())));
self.addEventListener("activate", (e) => e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener("fetch", (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== "GET" || u.origin !== location.origin) return;
  if (/^\/(story|fonts|brand)\//.test(u.pathname)) {
    e.respondWith(caches.match(e.request, { ignoreSearch: true }).then((r) => r || fetch(e.request).then((res) => { const c = res.clone(); caches.open(CACHE).then((x) => x.put(e.request, c)); return res; })));
  }
});
