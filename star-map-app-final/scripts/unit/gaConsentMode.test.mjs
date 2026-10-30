/**
 * Google Consent Mode v2 (David's decision, 2026-10-30; fix brief in
 * ~/workspace/seo-backlinks/sm-ga4-tag-audit-2026-10-30.md).
 *
 * Runtime pins against the REAL helpers in src/lib/analytics.ts:
 * - the consent default denies all ad/analytics storage (with
 *   functionality/security granted) so denied-state visits still send
 *   cookieless pings;
 * - Allow fires the all-granted consent update; Deny restates denied.
 *
 * Source pins against src/components/AnalyticsConsentManager.tsx:
 * - (a) the default-denied consent call is queued BEFORE gtag config;
 * - (b) no `ga-disable` assignment exists in any state (it killed
 *   denied-state pings under the old posture);
 * - (c) Allow persists "true" under the analytics-consent key;
 * - (d) a stored "true" applies the granted update inside the bootstrap,
 *   before config;
 * - (e) Deny persists "false" and the settled-state sync sends the
 *   update for the recorded choice, never a grant on deny;
 * - GTM and Pinterest stay granted-only (the fix brief's direction).
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { register } from "node:module";

register("./tsAliasLoader.mjs", import.meta.url);
register("./gaConsentMode.hooks.mjs", import.meta.url);

const APP_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const readSrc = (rel) => fs.readFileSync(path.join(APP_ROOT, rel), "utf8");

const calls = [];
globalThis.window = {
  dataLayer: [],
  navigator: {},
  location: { pathname: "/", origin: "https://starmapco.com", search: "" },
  gtag: (...args) => calls.push(args),
};

const analytics = await import("../../src/lib/analytics.ts");
const {
  GA_CONSENT_DEFAULT_PARAMS,
  GA_CONSENT_DENIED_PARAMS,
  GA_CONSENT_GRANTED_PARAMS,
  applyGaConsentDefault,
  applyGaConsentUpdate,
  sendGaPageView,
  trackPageView,
  trackProviderPageView,
} = analytics;

test("consent default denies ad/analytics storage, grants functionality/security", () => {
  calls.length = 0;
  applyGaConsentDefault();
  assert.equal(calls.length, 1);
  const [command, mode, params] = calls[0];
  assert.equal(command, "consent");
  assert.equal(mode, "default");
  assert.deepEqual(params, {
    ad_storage: "denied",
    analytics_storage: "denied",
    ad_user_data: "denied",
    ad_personalization: "denied",
    functionality_storage: "granted",
    security_storage: "granted",
  });
  assert.deepEqual(GA_CONSENT_DEFAULT_PARAMS, params);
});

test("Allow update grants all four ad/analytics storage types", () => {
  calls.length = 0;
  applyGaConsentUpdate(true);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0], [
    "consent",
    "update",
    {
      ad_storage: "granted",
      analytics_storage: "granted",
      ad_user_data: "granted",
      ad_personalization: "granted",
    },
  ]);
  assert.deepEqual(GA_CONSENT_GRANTED_PARAMS, calls[0][2]);
});

test("Deny update restates denied and grants nothing", () => {
  calls.length = 0;
  applyGaConsentUpdate(false);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0], [
    "consent",
    "update",
    {
      ad_storage: "denied",
      analytics_storage: "denied",
      ad_user_data: "denied",
      ad_personalization: "denied",
    },
  ]);
  assert.deepEqual(GA_CONSENT_DENIED_PARAMS, calls[0][2]);
  assert.ok(!Object.values(calls[0][2]).includes("granted"));
});

test("consent helpers are no-ops without a gtag on window", () => {
  const saved = globalThis.window.gtag;
  delete globalThis.window.gtag;
  try {
    applyGaConsentDefault();
    applyGaConsentUpdate(true);
    applyGaConsentUpdate(false);
  } finally {
    globalThis.window.gtag = saved;
  }
});

// --- Component wiring (source pins) ---

const component = readSrc("src/components/AnalyticsConsentManager.tsx");
const bootstrapStart = component.indexOf("function ensureGaBootstrap");
const bootstrapEnd = component.indexOf("export default function AnalyticsConsentManager");
assert.ok(bootstrapStart >= 0 && bootstrapEnd > bootstrapStart, "bootstrap block located");
const bootstrap = component.slice(bootstrapStart, bootstrapEnd);

test("(a) bootstrap queues the consent default before gtag config", () => {
  const defaultIdx = bootstrap.indexOf("applyGaConsentDefault()");
  const configIdx = bootstrap.indexOf('gtag("config"');
  assert.ok(defaultIdx >= 0, "applyGaConsentDefault called in bootstrap");
  assert.ok(configIdx >= 0, "gtag config called in bootstrap");
  assert.ok(defaultIdx < configIdx, "consent default precedes config");
});

test("(a) bootstrap no longer returns early on non-granted consent", () => {
  assert.ok(!/consent !== "granted"/.test(bootstrap));
  assert.ok(!/disableGa/.test(component), "disableGa is gone entirely");
});

test("(b) no ga-disable assignment anywhere in the consent path", () => {
  assert.ok(!component.includes("ga-disable"), "component has no ga-disable key");
  const lib = readSrc("src/lib/analytics.ts");
  assert.ok(!lib.includes("ga-disable"), "analytics lib has no ga-disable key");
});

test("(c) Allow persists 'true' under the storage key and syncs the update", () => {
  assert.match(component, /onClick=\{\(\) => updateConsent\("granted"\)\}/);
  assert.match(
    component,
    /localStorage\.setItem\(ANALYTICS_STORAGE_KEY, next === "granted" \? "true" : "false"\)/,
  );
  // The GA effect runs for every consent state and syncs the settled choice.
  assert.match(component, /ensureGaBootstrap\(gaId\);\s*\n\s*syncGaConsentUpdate\(consent\);/);
  assert.match(component, /applyGaConsentUpdate\(state === "granted"\)/);
});

test("(d) stored granted applies the granted update inside bootstrap, before config", () => {
  const guardIdx = bootstrap.indexOf('readConsentState() === "granted"');
  const updateIdx = bootstrap.indexOf("applyGaConsentUpdate(true)");
  const configIdx = bootstrap.indexOf('gtag("config"');
  assert.ok(guardIdx >= 0, "bootstrap reads stored consent");
  assert.ok(updateIdx > guardIdx, "granted update follows the stored-granted check");
  assert.ok(updateIdx < configIdx, "granted update is queued before config");
});

test("(e) Deny persists 'false' and never routes to a grant", () => {
  assert.match(component, /onClick=\{\(\) => updateConsent\("denied"\)\}/);
  // syncGaConsentUpdate only grants when the settled state is "granted".
  const syncStart = component.indexOf("function syncGaConsentUpdate");
  const sync = component.slice(syncStart, bootstrapEnd);
  assert.match(sync, /if \(state === "unset"\) return;/);
  assert.match(sync, /applyGaConsentUpdate\(state === "granted"\)/);
});

test("GTM and Pinterest remain granted-only (fix brief direction)", () => {
  const gtmEffect =
    /useEffect\(\(\) => \{\s*\n\s*if \(consent !== "granted"\) return;\s*\n\s*if \(gtmId\) ensureGoogleTagManagerLoaded\(gtmId\);\s*\n\s*if \(pinterestTagId\) ensurePinterestTagLoaded\(pinterestTagId\);/;
  assert.match(component, gtmEffect);
});

test("banner UI and storage key are unchanged", () => {
  assert.match(component, /Optional analytics help improve StarMapCo\. Accept or decline\./);
  assert.equal(analytics.ANALYTICS_STORAGE_KEY, "analytics-consent");
});

// --- Fix round (Codex P1): page views must fire in EVERY consent state ---
//
// At the original head the bootstrap set send_page_view: false, the only
// page-view effect returned unless consent was granted, and sendGaEvent
// rejected events without stored consent — so gtag loaded under Consent
// Mode v2 but stayed silent for denied/unset visitors, defeating the
// cookieless-ping purpose. The fix adds a GA-only sender that never
// consults stored consent and a single component dispatcher effect.

// In-memory localStorage so each test controls the stored consent state
// exactly as the browser would present it (hasAnalyticsConsent reads the
// bare global).
const storageBacking = new Map();
globalThis.localStorage = {
  getItem: (key) => (storageBacking.has(key) ? storageBacking.get(key) : null),
  setItem: (key, value) => storageBacking.set(key, String(value)),
  removeItem: (key) => storageBacking.delete(key),
};
globalThis.document = { title: "StarMapCo test" };

function pageViewCalls() {
  return calls.filter((args) => args[0] === "event" && args[1] === "page_view");
}

test("page_view fires with no stored consent (unset state)", () => {
  storageBacking.clear();
  calls.length = 0;
  sendGaPageView("/editor");
  assert.deepEqual(pageViewCalls(), [["event", "page_view", { page_path: "/editor" }]]);
  assert.equal(calls.length, 1);
});

test("page_view fires with stored denied consent; the consent-gated path stays silent", () => {
  storageBacking.clear();
  storageBacking.set(analytics.ANALYTICS_STORAGE_KEY, "false");
  calls.length = 0;
  // The pre-existing custom-event path (trackPageView -> sendGaEvent) is
  // consent-gated and must remain so: it emits no GA page_view on deny.
  trackPageView({ path: "/pricing" });
  assert.deepEqual(pageViewCalls(), []);
  // The GA-only sender does not consult consent: the denied visit still
  // produces its cookieless page_view ping.
  sendGaPageView("/pricing");
  assert.deepEqual(pageViewCalls(), [["event", "page_view", { page_path: "/pricing" }]]);
  assert.equal(calls.length, 1);
});

test("granted state: exactly one page_view per navigation from the GA sender", () => {
  storageBacking.clear();
  storageBacking.set(analytics.ANALYTICS_STORAGE_KEY, "true");
  calls.length = 0;
  // Two navigations -> two dispatches -> exactly two page_view events,
  // one each, with no other gtag traffic from the sender.
  sendGaPageView("/");
  sendGaPageView("/shop");
  assert.deepEqual(pageViewCalls(), [
    ["event", "page_view", { page_path: "/" }],
    ["event", "page_view", { page_path: "/shop" }],
  ]);
  assert.equal(calls.length, 2);
});

test("sendGaPageView is a no-op without a gtag on window", () => {
  const saved = globalThis.window.gtag;
  delete globalThis.window.gtag;
  try {
    sendGaPageView("/");
  } finally {
    globalThis.window.gtag = saved;
  }
});

test("the GA page-view sender never consults stored consent (source pin)", () => {
  const lib = readSrc("src/lib/analytics.ts");
  const senderStart = lib.indexOf("export function sendGaPageView");
  assert.ok(senderStart >= 0, "sendGaPageView exists in analytics lib");
  const senderBody = lib.slice(senderStart, lib.indexOf("\n}", senderStart));
  assert.ok(!senderBody.includes("hasAnalyticsConsent"), "sender ignores hasAnalyticsConsent");
  assert.ok(!senderBody.includes("canTrackAnalytics"), "sender ignores canTrackAnalytics");
  assert.ok(!senderBody.includes("localStorage"), "sender reads no stored consent");
  assert.match(senderBody, /window\.gtag\("event", "page_view", \{ page_path: path \}\)/);
});

test("component has a single all-states page-view dispatcher (source pins)", () => {
  // Exactly one dispatch call site, and the old granted-only trackPageView
  // wiring is gone from the component entirely.
  assert.equal(component.match(/sendGaPageView\(/g)?.length, 1);
  assert.ok(!component.includes("trackPageView"), "component no longer calls trackPageView");
  // The dispatcher effect is not consent-gated and does not depend on the
  // consent state, so a banner decision cannot re-fire a page view.
  const dispatcher =
    /useEffect\(\(\) => \{\s*\n\s*if \(!gaId\) return;\s*\n\s*sendGaPageView\(pathname \|\| "\/"\);\s*\n\s*\}, \[gaId, pathname\]\);/;
  assert.match(component, dispatcher);
  // Ordering: the bootstrap effect (consent default/update, then config)
  // is declared before the dispatcher, so those calls precede the first
  // page_view in the mount commit, as before.
  const bootstrapIdx = component.indexOf("ensureGaBootstrap(gaId);");
  const dispatchIdx = component.indexOf("sendGaPageView(pathname");
  assert.ok(bootstrapIdx >= 0 && dispatchIdx > bootstrapIdx, "bootstrap precedes first page view");
});

// --- Fix round 2 (Codex P2s) ---
//
// P2-A: the round-1 restructure dropped the provider page views entirely —
// granted visitors lost the GTM dataLayer page_view push and the Pinterest
// page view that the old page-view helper emitted on navigation. They are
// restored via a lib sender with NO GA event (trackProviderPageView),
// called from a granted-only component effect, so the GA page_view still
// comes solely from sendGaPageView and can never double-fire.
//
// P2-B: sendGaPageView bypassed Do Not Track. Pre-#448 (ba7c0d6a) the GA
// page_view went through sendGaEvent, whose canTrackAnalytics gate
// suppressed it under DNT — while tag loading carried no DNT check at
// all. The restored scope is exactly that: DNT suppresses the GA page
// view (and, via the untouched canTrackAnalytics, the Pinterest call),
// and nothing else new.

const pintrCalls = [];
globalThis.window.pintr = (...args) => pintrCalls.push(args);

function dataLayerPageViews() {
  return globalThis.window.dataLayer.filter((entry) => entry && entry.event === "page_view");
}

function resetTracking() {
  calls.length = 0;
  pintrCalls.length = 0;
  globalThis.window.dataLayer.length = 0;
}

test("P2-A granted navigation: GTM + Pinterest page views exactly once, GA page_view exactly once", () => {
  storageBacking.clear();
  storageBacking.set(analytics.ANALYTICS_STORAGE_KEY, "true");
  resetTracking();
  // The component's per-navigation sequence for a granted visitor: the
  // all-states GA dispatcher plus the granted-only provider effect.
  sendGaPageView("/");
  trackProviderPageView({ path: "/" });
  assert.deepEqual(pageViewCalls(), [["event", "page_view", { page_path: "/" }]]);
  assert.equal(calls.length, 1, "the provider sender adds no GA traffic");
  assert.deepEqual(dataLayerPageViews(), [
    {
      event: "page_view",
      page_path: "/",
      page_title: "StarMapCo test",
      page_location: "https://starmapco.com/",
    },
  ]);
  assert.deepEqual(pintrCalls, [["page"]]);
  // A second navigation: exactly one more of each, never two.
  sendGaPageView("/shop");
  trackProviderPageView({ path: "/shop" });
  assert.equal(pageViewCalls().length, 2);
  assert.equal(dataLayerPageViews().length, 2);
  assert.equal(pintrCalls.length, 2);
});

test("P2-A denied/unset navigation: dispatcher only — no GTM page view, no Pinterest", () => {
  for (const stored of ["false", null]) {
    storageBacking.clear();
    if (stored !== null) storageBacking.set(analytics.ANALYTICS_STORAGE_KEY, stored);
    resetTracking();
    // For non-granted states the component runs ONLY the GA dispatcher;
    // the provider effect returns before its sender call.
    sendGaPageView("/pricing");
    assert.deepEqual(pageViewCalls(), [["event", "page_view", { page_path: "/pricing" }]]);
    assert.deepEqual(dataLayerPageViews(), []);
    assert.deepEqual(pintrCalls, []);
    // And the lib sender itself cannot emit Pinterest without consent:
    // its Pinterest call stays behind canTrackAnalytics, as before.
    trackProviderPageView({ path: "/pricing" });
    assert.deepEqual(pintrCalls, []);
  }
});

test("P2-A provider sender emits no GA event (source pin)", () => {
  const lib = readSrc("src/lib/analytics.ts");
  const start = lib.indexOf("export function trackProviderPageView");
  assert.ok(start >= 0, "trackProviderPageView exists in analytics lib");
  const body = lib.slice(start, lib.indexOf("\n}", start));
  assert.ok(!body.includes("gtag"), "provider sender never touches gtag");
  assert.ok(!body.includes("sendGaEvent"), "provider sender never routes through sendGaEvent");
  assert.match(body, /pushDataLayer\(\{\s*\n\s*event: "page_view",/);
  assert.match(body, /if \(canTrackAnalytics\(\)\) \{\s*\n\s*trackPinterestPageView\(\);/);
});

test("P2-A component wires the provider sender granted-only, once per navigation (source pins)", () => {
  assert.equal(component.match(/trackProviderPageView\(/g)?.length, 1);
  const providerEffect =
    /useEffect\(\(\) => \{\s*\n\s*if \(consent !== "granted"\) return;\s*\n\s*if \(!gtmId && !pinterestTagId\) return;\s*\n\s*trackProviderPageView\(\{\s*\n\s*path: pathname \|\| "\/",\s*\n\s*\}\);\s*\n\s*\}, \[consent, gtmId, pinterestTagId, pathname\]\);/;
  assert.match(component, providerEffect);
  // Declared before the GA dispatcher, mirroring the pre-Consent-Mode
  // effect order (provider page view followed the bootstrap effects).
  const providerIdx = component.indexOf("trackProviderPageView(");
  const dispatchIdx = component.indexOf("sendGaPageView(pathname");
  assert.ok(providerIdx >= 0 && dispatchIdx > providerIdx, "provider effect precedes GA dispatcher");
});

test("P2-B Do Not Track suppresses the GA page view from the GA-only sender", () => {
  storageBacking.clear();
  resetTracking();
  globalThis.window.navigator.doNotTrack = "1";
  try {
    sendGaPageView("/");
    assert.deepEqual(pageViewCalls(), []);
    assert.equal(calls.length, 0);
  } finally {
    delete globalThis.window.navigator.doNotTrack;
  }
  // DNT off again: the cookieless ping resumes.
  sendGaPageView("/");
  assert.deepEqual(pageViewCalls(), [["event", "page_view", { page_path: "/" }]]);
});

test("P2-B restored DNT scope matches the pre-change scope exactly", () => {
  // Granted + DNT: Pinterest is suppressed (canTrackAnalytics, untouched
  // by #448), while the GTM dataLayer push still fires — pre-change it
  // was ungated inside the page-view helper too.
  storageBacking.clear();
  storageBacking.set(analytics.ANALYTICS_STORAGE_KEY, "true");
  resetTracking();
  globalThis.window.navigator.doNotTrack = "1";
  try {
    trackProviderPageView({ path: "/" });
    assert.deepEqual(pintrCalls, []);
    assert.equal(dataLayerPageViews().length, 1);
  } finally {
    delete globalThis.window.navigator.doNotTrack;
  }
  // Tag loading was never DNT-gated pre-change and is not now: the
  // component (bootstrap + loaders) carries no DNT reference at all.
  assert.ok(!component.includes("DoNotTrack"), "component has no DNT gate on tag loading");
  // The one new DNT check lives in the GA-only sender.
  const lib = readSrc("src/lib/analytics.ts");
  const senderStart = lib.indexOf("export function sendGaPageView");
  const senderBody = lib.slice(senderStart, lib.indexOf("\n}", senderStart));
  assert.match(senderBody, /if \(isDoNotTrackEnabled\(\)\) return;/);
});

test("GTM and Pinterest loaders are still only called from the granted-only effect", () => {
  // One call site each (the import lines carry no parenthesis), both in
  // the effect the earlier pin shows is gated on consent === "granted";
  // the page-view dispatcher contains no loader or Pinterest tracking.
  assert.equal(component.match(/ensureGoogleTagManagerLoaded\(/g)?.length, 1);
  assert.equal(component.match(/ensurePinterestTagLoaded\(/g)?.length, 1);
  const dispatchIdx = component.indexOf("sendGaPageView(pathname");
  const afterDispatcher = component.slice(dispatchIdx);
  assert.ok(!afterDispatcher.includes("ensureGoogleTagManagerLoaded("));
  assert.ok(!afterDispatcher.includes("ensurePinterestTagLoaded("));
});
