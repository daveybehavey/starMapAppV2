/**
 * Checkout sky guard: refuse placeholder DEFAULT_RECIPE lat/lng=0; allow configured skies.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  CHECKOUT_SKY_LOCATION_REQUIRED_CODE,
  CHECKOUT_SKY_LOCATION_REQUIRED_MESSAGE,
  evaluateCheckoutSkyGuard,
  isPlaceholderSkyLocation,
} from "../../src/lib/checkoutSkyGuard.ts";
import { shouldRetryCheckoutFailure } from "../../src/lib/checkoutClientFailure.ts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const CHECKOUT_ROUTE = path.join(ROOT, "src/app/api/checkout/route.ts");
const RENDER_SKY = path.join(ROOT, "src/lib/renderSky.ts");

test("DEFAULT_RECIPE placeholder is lat=0 and lon=0", () => {
  const source = fs.readFileSync(RENDER_SKY, "utf8");
  assert.match(
    source,
    /export const DEFAULT_RECIPE[\s\S]*location:\s*\{\s*name:\s*""\s*,\s*latitude:\s*0\s*,\s*longitude:\s*0/
  );
  assert.equal(isPlaceholderSkyLocation({ latitude: 0, longitude: 0 }), true);
});

test("isPlaceholderSkyLocation requires both coordinates exactly 0", () => {
  assert.equal(isPlaceholderSkyLocation({ latitude: 0, longitude: 0 }), true);
  assert.equal(isPlaceholderSkyLocation({ latitude: 0, longitude: 1 }), false);
  assert.equal(isPlaceholderSkyLocation({ latitude: 1, longitude: 0 }), false);
  assert.equal(isPlaceholderSkyLocation({ latitude: 40.7, longitude: -74 }), false);
  assert.equal(isPlaceholderSkyLocation(null), false);
  assert.equal(isPlaceholderSkyLocation(undefined), false);
});

test("route guard blocks placeholder sky with customer-readable 400 message", () => {
  const blocked = evaluateCheckoutSkyGuard({
    location: { latitude: 0, longitude: 0 },
  });
  assert.equal(blocked.ok, false);
  if (blocked.ok) throw new Error("expected blocked");
  assert.equal(blocked.code, CHECKOUT_SKY_LOCATION_REQUIRED_CODE);
  assert.equal(blocked.message, CHECKOUT_SKY_LOCATION_REQUIRED_MESSAGE);
  assert.match(blocked.message, /choose the location/i);
});

test("route guard allows a normal configured design", () => {
  const allowed = evaluateCheckoutSkyGuard({
    location: {
      name: "Santorini, Greece",
      latitude: 36.3932,
      longitude: 25.4615,
    },
  });
  assert.deepEqual(allowed, { ok: true });
});

test("route guard skips when map record is missing (existence handled separately)", () => {
  assert.deepEqual(evaluateCheckoutSkyGuard(null), { ok: true });
  assert.deepEqual(evaluateCheckoutSkyGuard(undefined), { ok: true });
});

test("checkout route wires sky guard into digital and print paths", () => {
  const route = fs.readFileSync(CHECKOUT_ROUTE, "utf8");
  assert.match(route, /from "@\/lib\/checkoutSkyGuard"/);
  assert.match(route, /evaluateCheckoutSkyGuard/);
  assert.match(route, /assertConfiguredSkyForCheckout/);
  // Digital assertDigitalCheckoutMap and print POST/GET both call the guard.
  assert.equal([...route.matchAll(/assertConfiguredSkyForCheckout\(/g)].length >= 2, true);
  assert.equal([...route.matchAll(/evaluateCheckoutSkyGuard\(/g)].length >= 2, true);
  assert.match(
    fs.readFileSync(path.join(ROOT, "src/lib/checkoutSkyGuard.ts"), "utf8"),
    /Please choose the location for your star map before checking out/
  );
  assert.match(
    fs.readFileSync(path.join(ROOT, "src/lib/checkoutSkyGuard.ts"), "utf8"),
    /sky_location_required/
  );
});

test("sky_location_required is not auto-retried", () => {
  assert.equal(shouldRetryCheckoutFailure("sky_location_required", 400), false);
});
