/*
 * StarMapCo service worker — intentionally minimal.
 *
 * Purpose: PWA/TWA readiness (a registered, active service worker with a
 * fetch handler) plus faster repeat loads of immutable build assets.
 * This is NOT an offline app shell: pages are network-first and anything
 * commerce-related is never touched.
 *
 * Rules:
 * - Only same-origin GET requests are handled; everything else passes
 *   straight through to the network.
 * - /api/*, the checkout flow, and the download delivery routes are never
 *   intercepted (checkout and download responses are entitlement-scoped
 *   and must never be cached, replayed, or served stale).
 * - /_next/static/* (content-hashed, immutable) and same-origin images
 *   are cache-first. Everything else, including all page navigations,
 *   is network-first with a cache fallback for pages already seen.
 * - The worker script, the web manifest, and .well-known files are never
 *   cached, so updates and verification files are always fresh.
 */
"use strict";

var STATIC_CACHE = "starmapco-static-v1";
var PAGE_CACHE = "starmapco-pages-v1";
var KNOWN_CACHES = [STATIC_CACHE, PAGE_CACHE];

var IMAGE_EXTENSIONS = [".png", ".jpg", ".jpeg", ".webp", ".avif", ".gif", ".svg", ".ico"];

function isNeverIntercepted(url) {
  return (
    url.pathname === "/api" ||
    url.pathname.indexOf("/api/") === 0 ||
    url.pathname.indexOf("/checkout") === 0 ||
    url.pathname.indexOf("/download") === 0 ||
    url.pathname.indexOf("/.well-known/") === 0 ||
    url.pathname === "/sw.js" ||
    url.pathname === "/site.webmanifest"
  );
}

function isImmutableAsset(url, request) {
  if (url.pathname.indexOf("/_next/static/") === 0) return true;
  if (request.destination === "image") return true;
  var lower = url.pathname.toLowerCase();
  return IMAGE_EXTENSIONS.some(function (ext) {
    return lower.slice(-ext.length) === ext;
  });
}

self.addEventListener("install", function () {
  self.skipWaiting();
});

self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches
      .keys()
      .then(function (keys) {
        return Promise.all(
          keys
            .filter(function (key) {
              return KNOWN_CACHES.indexOf(key) === -1;
            })
            .map(function (key) {
              return caches.delete(key);
            })
        );
      })
      .then(function () {
        return self.clients.claim();
      })
  );
});

self.addEventListener("fetch", function (event) {
  var request = event.request;
  if (request.method !== "GET") return;

  var url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (isNeverIntercepted(url)) return;

  if (isImmutableAsset(url, request)) {
    event.respondWith(
      caches.open(STATIC_CACHE).then(function (cache) {
        return cache.match(request).then(function (cached) {
          if (cached) return cached;
          return fetch(request).then(function (response) {
            if (response.ok) cache.put(request, response.clone());
            return response;
          });
        });
      })
    );
    return;
  }

  // Network-first for pages and everything else: always prefer fresh
  // content; fall back to the last cached copy of a page only when the
  // network is unreachable.
  event.respondWith(
    fetch(request)
      .then(function (response) {
        if (response.ok && request.mode === "navigate") {
          var copy = response.clone();
          caches.open(PAGE_CACHE).then(function (cache) {
            cache.put(request, copy);
          });
        }
        return response;
      })
      .catch(function (error) {
        return caches.match(request).then(function (cached) {
          if (cached) return cached;
          throw error;
        });
      })
  );
});
