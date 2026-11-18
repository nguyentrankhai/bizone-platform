/*
 * BizOne service worker.
 * - P4.7: Web Push (push / notificationclick).
 * - P6.4: PWA offline cache — only when registered as /sw.js?cache=1 (production builds, see
 *   lib/pwa/register.ts). In `next dev` chunks change on every edit, so nothing is cached there.
 *
 * Caches:
 *   precache — offline page, icons, manifest
 *   static   — /_next/static/* (hashed, immutable): cache-first
 *   pages    — HTML of the mobile shell (/mobile/*): network-first, cached copy when offline
 * /api/* is never cached (live data + auth headers): the mobile UI keeps its own last snapshot
 * (lib/pwa/snapshot.ts) so the dashboard still shows the last numbers offline.
 */
const VERSION = "v1";
const PRECACHE = `bizone-precache-${VERSION}`;
const STATIC = `bizone-static-${VERSION}`;
const PAGES = `bizone-pages-${VERSION}`;
const KNOWN = [PRECACHE, STATIC, PAGES];

const OFFLINE_URL = "/offline.html";
const PRECACHE_URLS = [
  OFFLINE_URL,
  "/manifest.webmanifest",
  "/icons/icon-192.png",
  "/icons/badge-96.png",
];
/** Mobile pages fetched at install so the app opens offline even before each tab was visited */
const APP_SHELL = [
  "/mobile/dashboard",
  "/mobile/orders",
  "/mobile/reports",
  "/mobile/notifications",
];
const MAX_STATIC = 300;
const MAX_PAGES = 30;

const CACHING = new URL(self.location.href).searchParams.get("cache") === "1";

self.addEventListener("install", (event) => {
  self.skipWaiting();
  if (!CACHING) return;
  event.waitUntil(
    (async () => {
      const cache = await caches.open(PRECACHE);
      await cache.addAll(PRECACHE_URLS);
      // Best effort: a page that fails (server down, 401…) must not abort the install
      await Promise.all(APP_SHELL.map((path) => warmPage(path).catch(() => undefined)));
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names
          // without caching (dev) drop everything a production worker may have left behind
          .filter((n) => n.startsWith("bizone-") && (!CACHING || !KNOWN.includes(n)))
          .map((n) => caches.delete(n)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  if (!CACHING) return;
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return;

  if (req.mode === "navigate") {
    event.respondWith(page(req, url));
  } else if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(cacheFirst(req));
  } else if (PRECACHE_URLS.includes(url.pathname) || url.pathname.startsWith("/icons/")) {
    event.respondWith(staleWhileRevalidate(req));
  }
  // anything else (RSC payloads, images…) goes straight to the network. An RSC fetch that fails
  // offline makes Next fall back to a full navigation, which the "navigate" branch serves.
});

/** Cache key of a mobile page: path only (?source=pwa and friends must not split the cache) */
function pageKey(url) {
  // /mobile only redirects to the dashboard
  const path = url.pathname.replace(/\/$/, "") === "/mobile" ? "/mobile/dashboard" : url.pathname;
  return new Request(url.origin + path);
}

function cacheablePage(url) {
  return url.pathname === "/mobile" || url.pathname.startsWith("/mobile/");
}

async function page(req, url) {
  const cache = await caches.open(PAGES);
  try {
    const res = await fetch(req);
    if (cacheablePage(url) && res.ok && res.type === "basic" && !res.redirected) {
      await cache.put(pageKey(url), res.clone());
      trim(PAGES, MAX_PAGES);
    }
    return res;
  } catch {
    // a page never visited (e.g. another order) → the offline page, never a different screen
    const hit = await cache.match(pageKey(url));
    return hit ?? (await caches.match(OFFLINE_URL)) ?? Response.error();
  }
}

async function cacheFirst(req) {
  const cache = await caches.open(STATIC);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok) {
    await cache.put(req, res.clone());
    trim(STATIC, MAX_STATIC);
  }
  return res;
}

async function staleWhileRevalidate(req) {
  const cache = await caches.open(PRECACHE);
  const hit = await cache.match(req, { ignoreSearch: true });
  const network = fetch(req)
    .then((res) => {
      if (res.ok) cache.put(req, res.clone());
      return res;
    })
    .catch(() => undefined);
  return hit ?? (await network) ?? Response.error();
}

/** Fetch a mobile page and the JS / CSS chunks it references, so it renders offline */
async function warmPage(path) {
  const url = new URL(path, self.location.origin);
  const res = await fetch(url, { credentials: "same-origin" });
  if (!res.ok || res.redirected) return;
  const html = await res.clone().text();
  await (await caches.open(PAGES)).put(pageKey(url), res);
  const assets = new Set(html.match(/\/_next\/static\/[^"'\s)\\]+/g) ?? []);
  const statics = await caches.open(STATIC);
  await Promise.all(
    [...assets].map(async (a) => {
      if (await statics.match(a)) return;
      const r = await fetch(a).catch(() => null);
      if (r?.ok) await statics.put(a, r);
    }),
  );
}

/** Drop the oldest entries beyond `max` (cache keys keep insertion order) */
async function trim(name, max) {
  const cache = await caches.open(name);
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - max; i++) await cache.delete(keys[i]);
}

// ---------------------------------------------------------------- Web Push (P4.7)

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "BizOne", body: event.data ? event.data.text() : "" };
  }
  event.waitUntil(
    self.registration.showNotification(data.title || "BizOne", {
      body: data.body || "",
      tag: data.tag || undefined,
      icon: "/icons/icon-192.png",
      badge: "/icons/badge-96.png",
      lang: "vi",
      data: { link: data.link || "/notifications" },
    }),
  );
});

/**
 * Desktop link of a notification → screen of the mobile app (same rules as lib/pwa/links.ts —
 * keep both in sync; this file cannot import modules).
 */
function mobileLink(link) {
  const [path, query = ""] = link.split("?");
  const q = query ? `?${query}` : "";
  let m;
  if ((m = path.match(/^\/orders\/(\d+)\/?$/))) return `/mobile/orders/${m[1]}`;
  if (/^\/orders\/?$/.test(path)) return `/mobile/orders${q}`;
  if (/^\/dashboard\/?$/.test(path)) return "/mobile/dashboard";
  if (/^\/reports(\/|$)/.test(path)) return "/mobile/reports";
  if (/^\/notifications\/?$/.test(path)) return "/mobile/notifications";
  return link;
}

const MOBILE_UA = /Android|iPhone|iPad|iPod|Mobile/i;

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const link = event.notification.data?.link || "/notifications";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((wins) => {
      const own = wins.filter((w) => w.url.startsWith(self.location.origin));
      const inMobileApp = own.some((w) => new URL(w.url).pathname.startsWith("/mobile"));
      const target =
        inMobileApp || (own.length === 0 && MOBILE_UA.test(self.navigator.userAgent))
          ? mobileLink(link)
          : link;
      const url = new URL(target, self.location.origin).href;
      const win =
        own.find((w) => new URL(w.url).pathname.startsWith("/mobile") === inMobileApp) ?? own[0];
      if (win && "focus" in win) {
        // navigate() rejects for a window this worker does not control yet → open a new one
        return win
          .navigate(url)
          .then((w) => (w ?? win).focus())
          .catch(() => self.clients.openWindow(url));
      }
      return self.clients.openWindow(url);
    }),
  );
});
