// Service Worker مشترك لنسخة الويب العامة ولوحة التحكم (/admin/).
// غيّر VERSION عند كل نشر حتى يحصل المستخدمون على النسخة الجديدة.
const VERSION = "rmtv-v10";
const SHELL = [
  "./",
  "index.html",
  "boot.js",
  "engines.js",
  "base.css",
  "app.css",
  "app.js",
  "common.js",
  "config.js",
  "manifest.webmanifest",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "admin/",
  "admin/index.html",
  "admin/admin.css",
  "admin/admin.js",
  "admin/manifest.webmanifest",
];

// مكتبات خارجية ثابتة الإصدار يمكن تخزينها مؤقتاً بأمان
const CDN_HOSTS = ["www.gstatic.com", "cdn.jsdelivr.net", "fonts.googleapis.com", "fonts.gstatic.com"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // ملفات التطبيق: الشبكة أولاً (للحصول على آخر تعديل) ثم النسخة المخزنة عند انقطاع الإنترنت
  // البث عبر الوسيط لا يُخزَّن أبداً
  if (url.origin === self.location.origin && url.pathname.startsWith("/api/")) return;

  if (url.origin === self.location.origin) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(VERSION).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => caches.match(req, { ignoreSearch: true }).then((r) => r || caches.match("./")))
    );
    return;
  }

  // مكتبات CDN (Firebase SDK، hls.js، الخطوط): من الذاكرة أولاً
  if (CDN_HOSTS.includes(url.hostname)) {
    event.respondWith(
      caches.match(req).then((cached) =>
        cached ||
        fetch(req).then((res) => {
          if (res.ok || res.type === "opaque") {
            const copy = res.clone();
            caches.open(VERSION).then((c) => c.put(req, copy));
          }
          return res;
        })
      )
    );
  }
  // أي شيء آخر (Firestore، روابط البث، الشعارات) يمر مباشرة بدون تدخل
});
