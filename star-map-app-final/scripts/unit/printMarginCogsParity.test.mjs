/**
 * S96-6 residual fix (2026-11-02) — client/server COGS parity pins
 * against the REAL margin lib.
 *
 * The defect (settled in s96-6-printmargin-reachability-2026-11-02.md):
 * getVariantProductCostCents read `process.env[row.cogsEnv]` — a
 * computed access Next.js cannot inline — so in the browser the
 * paywall preflight always priced COGS at each catalog row's code
 * default, while the checkout route read the configured PRINT_COGS_*
 * values. The two sides disagree in either direction the moment a
 * COGS knob is tuned away from its default.
 *
 * The fix gives the COGS reads the PR #479 public-mirror pattern
 * (readCogsEnv in src/lib/printMargin.ts): the server reads the
 * server var first and falls back to the NEXT_PUBLIC_ mirror; the
 * browser can only see the mirror. These tests pin, for EVERY row in
 * the print catalog:
 *  - unset on both sides → both sides use the row's code default
 *    (the fallback semantics are identical);
 *  - the pair tuned together → both sides use the tuned value;
 *  - mirror set, server var unset → the server falls back to the
 *    mirror, so both sides still agree;
 *  - server var AND mirror set differently → the server prefers its
 *    own var and the browser reads the mirror (the documented pair
 *    semantics, identical to readGuardEnv; ops must move the pair
 *    together);
 *  - malformed values → both sides fall back to the code default.
 * Plus the two extra-cost call sites (card add-on, second copy) and a
 * source pin that every catalog cogsEnv keeps a LITERAL server +
 * mirror read — a future row without one fails here instead of
 * silently desyncing.
 *
 * The client side is simulated by defining globalThis.window for the
 * duration of a call: readCogsEnv branches on `typeof window`, the
 * same seam the browser bundle takes. Env is read per call, so the
 * matrix toggles it in place.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { register } from "node:module";

register("./tsAliasLoader.mjs", import.meta.url);

const { evaluatePrintMarginForCheckout } = await import("../../src/lib/printMargin.ts");
const { PRINT_CATALOG } = await import("../../src/lib/printCatalog.ts");

const read = (rel) => readFileSync(new URL(rel, import.meta.url), "utf8");

const COGS_KEYS = PRINT_CATALOG.flatMap((row) => [row.cogsEnv, `NEXT_PUBLIC_${row.cogsEnv}`]);

function clearCogsEnv() {
  for (const key of COGS_KEYS) delete process.env[key];
}

function productCostCents(variant, extra = {}) {
  const result = evaluatePrintMarginForCheckout({
    variant,
    shippingCountry: "US",
    shippingChargeCents: 0,
    includeDigitalAddOn: false,
    ...extra,
  });
  assert.ok(result.estimate, `${variant}: US estimate exists`);
  return result.estimate.productCostCents;
}

function asClient(fn) {
  globalThis.window = {};
  try {
    return fn();
  } finally {
    delete globalThis.window;
  }
}

for (const row of PRINT_CATALOG) {
  test(`COGS parity: ${row.id} unset on both sides falls back to the code default`, () => {
    clearCogsEnv();
    try {
      assert.equal(productCostCents(row.id), row.defaultCogsCents, "server");
      assert.equal(asClient(() => productCostCents(row.id)), row.defaultCogsCents, "client");
    } finally {
      clearCogsEnv();
    }
  });

  test(`COGS parity: ${row.id} pair tuned together agrees on both sides`, () => {
    clearCogsEnv();
    const tuned = row.defaultCogsCents + 111;
    process.env[row.cogsEnv] = String(tuned);
    process.env[`NEXT_PUBLIC_${row.cogsEnv}`] = String(tuned);
    try {
      assert.equal(productCostCents(row.id), tuned, "server");
      assert.equal(asClient(() => productCostCents(row.id)), tuned, "client");
    } finally {
      clearCogsEnv();
    }
  });

  test(`COGS parity: ${row.id} server falls back to the mirror when its own var is unset`, () => {
    clearCogsEnv();
    const tuned = row.defaultCogsCents + 222;
    process.env[`NEXT_PUBLIC_${row.cogsEnv}`] = String(tuned);
    try {
      assert.equal(productCostCents(row.id), tuned, "server reads the mirror fallback");
      assert.equal(asClient(() => productCostCents(row.id)), tuned, "client");
    } finally {
      clearCogsEnv();
    }
  });

  test(`COGS parity: ${row.id} server var wins server-side, mirror governs the client`, () => {
    clearCogsEnv();
    const serverValue = row.defaultCogsCents + 333;
    const mirrorValue = row.defaultCogsCents + 444;
    process.env[row.cogsEnv] = String(serverValue);
    process.env[`NEXT_PUBLIC_${row.cogsEnv}`] = String(mirrorValue);
    try {
      assert.equal(productCostCents(row.id), serverValue, "server prefers the server var");
      assert.equal(asClient(() => productCostCents(row.id)), mirrorValue, "client reads the mirror");
    } finally {
      clearCogsEnv();
    }
  });
}

test("COGS parity: malformed values fall back to the code default on both sides", () => {
  clearCogsEnv();
  const framed = PRINT_CATALOG.find((row) => row.id === "poster_framed");
  process.env[framed.cogsEnv] = "not-a-number";
  process.env[`NEXT_PUBLIC_${framed.cogsEnv}`] = "";
  try {
    assert.equal(productCostCents("poster_framed"), framed.defaultCogsCents, "server");
    assert.equal(
      asClient(() => productCostCents("poster_framed")),
      framed.defaultCogsCents,
      "client",
    );
  } finally {
    clearCogsEnv();
  }
});

test("COGS parity: card add-on and second copy price COGS from the same mirrored read", () => {
  clearCogsEnv();
  const poster = PRINT_CATALOG.find((row) => row.id === "poster_unframed");
  const card = PRINT_CATALOG.find((row) => row.id === "card_4x6");
  for (const [row, value] of [
    [poster, 2000],
    [card, 300],
  ]) {
    process.env[row.cogsEnv] = String(value);
    process.env[`NEXT_PUBLIC_${row.cogsEnv}`] = String(value);
  }
  try {
    // Base poster COGS (2000) + card add-on COGS (300).
    assert.equal(productCostCents("poster_unframed", { includeCardAddOn: true }), 2300, "server");
    assert.equal(
      asClient(() => productCostCents("poster_unframed", { includeCardAddOn: true })),
      2300,
      "client",
    );
    // Base poster COGS + a full second unit of the same COGS.
    assert.equal(productCostCents("poster_unframed", { includeSecondCopy: true }), 4000, "server");
    assert.equal(
      asClient(() => productCostCents("poster_unframed", { includeSecondCopy: true })),
      4000,
      "client",
    );
  } finally {
    clearCogsEnv();
  }
});

test("COGS wiring: every catalog cogsEnv has literal server + mirror reads in printMargin.ts", () => {
  const margin = read("../../src/lib/printMargin.ts");
  for (const row of PRINT_CATALOG) {
    assert.ok(
      margin.includes(`process.env.${row.cogsEnv}`),
      `literal server read for ${row.cogsEnv}`,
    );
    assert.ok(
      margin.includes(`process.env.NEXT_PUBLIC_${row.cogsEnv}`),
      `literal mirror read for ${row.cogsEnv}`,
    );
  }
  // The computed read is gone: a dynamically indexed process.env[...]
  // is invisible to the bundler and silently yields undefined in the
  // browser (the defect class this file's readGuardEnv comment and
  // printMarginCogsParity's header describe).
  assert.equal(margin.includes("process.env[row.cogsEnv]"), false);
});
