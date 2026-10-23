import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "../..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");

test("service worker exists at the root scope path the TWA expects", () => {
  assert.ok(fs.existsSync(path.join(root, "public/sw.js")));
});

test("service worker never intercepts api, checkout, or download routes", () => {
  const src = read("public/sw.js");
  assert.match(src, /url\.pathname === "\/api"/);
  assert.match(src, /url\.pathname\.indexOf\("\/api\/"\) === 0/);
  assert.match(src, /url\.pathname\.indexOf\("\/checkout"\) === 0/);
  assert.match(src, /url\.pathname\.indexOf\("\/download"\) === 0/);
  // the exclusion check must run before any respondWith in the fetch handler
  const fetchHandler = src.slice(src.indexOf('"fetch"'));
  assert.ok(fetchHandler.indexOf("isNeverIntercepted(url)") < fetchHandler.indexOf("respondWith"));
});

test("service worker only handles same-origin GET requests", () => {
  const src = read("public/sw.js");
  assert.match(src, /request\.method !== "GET"/);
  assert.match(src, /url\.origin !== self\.location\.origin/);
});

test("cache-first is limited to /_next/static and image assets", () => {
  const src = read("public/sw.js");
  const assetFn = src.slice(src.indexOf("function isImmutableAsset"), src.indexOf('addEventListener("install"'));
  assert.match(assetFn, /"\/_next\/static\/"/);
  assert.match(assetFn, /request\.destination === "image"/);
  assert.match(assetFn, /IMAGE_EXTENSIONS/);
  // no cache-first treatment of page navigations or arbitrary paths
  assert.doesNotMatch(assetFn, /navigate|document/);
});

test("pages are network-first with a cache fallback", () => {
  const src = read("public/sw.js");
  const networkFirst = src.slice(src.indexOf("Network-first for pages"));
  assert.match(networkFirst, /fetch\(request\)/);
  assert.match(networkFirst, /caches\.match\(request\)/);
  assert.match(networkFirst, /request\.mode === "navigate"/);
});

test("the worker never caches itself, the manifest, or .well-known", () => {
  const src = read("public/sw.js");
  const guard = src.slice(src.indexOf("function isNeverIntercepted"), src.indexOf("function isImmutableAsset"));
  assert.match(guard, /"\/sw\.js"/);
  assert.match(guard, /"\/site\.webmanifest"/);
  assert.match(guard, /"\/\.well-known\/"/);
});

test("root layout registers the service worker in production only", () => {
  const layout = read("src/app/layout.tsx");
  assert.match(layout, /ServiceWorkerRegistration/);
  const component = read("src/components/ServiceWorkerRegistration.tsx");
  assert.match(component, /navigator\.serviceWorker\.register\("\/sw\.js"\)/);
  assert.match(component, /process\.env\.NODE_ENV !== "production"/);
});
