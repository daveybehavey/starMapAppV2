/**
 * androidAppMode.ts — behavioural policy + request detection (not source pins).
 *
 * Regression targets:
 * - only print checkouts are allowed in app mode; digital add-on always stripped
 * - request detection: header wins, then cookie, then ?source=android-app
 * - SSR client check is false without a document
 */
import assert from "node:assert/strict";
import test from "node:test";
import { register } from "node:module";

register("./tsAliasLoader.mjs", import.meta.url);

const {
  ANDROID_APP_COOKIE,
  ANDROID_APP_COOKIE_VALUE,
  ANDROID_APP_HEADER,
  ANDROID_APP_SOURCE,
  androidAppCheckoutDecision,
  isAndroidAppModeClient,
  isAndroidAppModeRequest,
} = await import("../../src/lib/androidAppMode.ts");

test("androidAppCheckoutDecision: print allowed; digital rejected; add-on always false", () => {
  assert.deepEqual(
    androidAppCheckoutDecision({
      orderType: "print",
      hasMerch: false,
      includeDigitalAddOn: true,
    }),
    { allowed: true, includeDigitalAddOn: false },
  );
  assert.deepEqual(
    androidAppCheckoutDecision({
      orderType: "print",
      hasMerch: true,
      includeDigitalAddOn: false,
    }),
    { allowed: true, includeDigitalAddOn: false },
  );
  assert.deepEqual(
    androidAppCheckoutDecision({
      orderType: "digital",
      hasMerch: true,
      includeDigitalAddOn: true,
    }),
    { allowed: false, includeDigitalAddOn: false },
  );
  assert.deepEqual(
    androidAppCheckoutDecision({
      orderType: "digital",
      hasMerch: false,
      includeDigitalAddOn: false,
    }),
    { allowed: false, includeDigitalAddOn: false },
  );
});

test("isAndroidAppModeRequest: header, cookie, URL flag, and negatives", () => {
  assert.equal(
    isAndroidAppModeRequest({
      cookies: { get: () => undefined },
      headers: { get: (n) => (n === ANDROID_APP_HEADER ? ANDROID_APP_COOKIE_VALUE : null) },
    }),
    true,
  );
  assert.equal(
    isAndroidAppModeRequest({
      cookies: {
        get: (n) => (n === ANDROID_APP_COOKIE ? { value: ANDROID_APP_COOKIE_VALUE } : undefined),
      },
      headers: { get: () => null },
    }),
    true,
  );
  assert.equal(
    isAndroidAppModeRequest({
      cookies: { get: () => undefined },
      headers: { get: () => null },
      nextUrl: new URL(`https://starmapco.com/editor?source=${ANDROID_APP_SOURCE}`),
    }),
    true,
  );
  assert.equal(
    isAndroidAppModeRequest({
      cookies: { get: () => undefined },
      headers: { get: () => null },
      nextUrl: new URL("https://starmapco.com/editor?source=web"),
    }),
    false,
  );
});

test("isAndroidAppModeClient is false under Node (no document)", () => {
  assert.equal(isAndroidAppModeClient(), false);
});
