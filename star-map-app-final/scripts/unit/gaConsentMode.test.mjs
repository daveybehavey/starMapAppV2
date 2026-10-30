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
