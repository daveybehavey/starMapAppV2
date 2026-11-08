/**
 * merchMargin.ts — paid-order margin gate for merch families.
 *
 * Regression targets:
 * - missing / non-finite total or shipping fails closed as estimate_unavailable
 * - margin exactly at the minimum is allowed; one cent under is refused
 * - env overrides for min margin and per-family COGS win over catalog defaults
 * - never mutates prices — only evaluates (total - shipping - cogs)
 */
import assert from "node:assert/strict";
import test from "node:test";
import { register } from "node:module";

register("./tsAliasLoader.mjs", import.meta.url);

const {
  evaluateMerchMarginForPaidOrder,
  getMerchCogsCents,
  getMerchMinMarginCents,
} = await import("../../src/lib/merchMargin.ts");
const { MERCH_FAMILIES } = await import("../../src/lib/merchCatalog.ts");

const familyId = MERCH_FAMILIES[0]?.id;
assert.ok(familyId, "merch catalog must expose at least one family");
const family = MERCH_FAMILIES.find((row) => row.id === familyId);

const TOUCHED = ["MERCH_MIN_MARGIN_CENTS", family.cogsEnv];

function withEnv(overrides, fn) {
  const saved = new Map(TOUCHED.map((k) => [k, process.env[k]]));
  for (const k of TOUCHED) delete process.env[k];
  for (const [k, v] of Object.entries(overrides)) {
    if (v !== undefined) process.env[k] = v;
  }
  try {
    return fn();
  } finally {
    for (const k of TOUCHED) {
      const v = saved.get(k);
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

test("defaults: min margin is $6.00; COGS falls back to the catalog default", () => {
  withEnv({}, () => {
    assert.equal(getMerchMinMarginCents(), 600);
    assert.equal(getMerchCogsCents(familyId), family.defaultCogsCents);
  });
});

test("boundary: margin exactly at the minimum is allowed; one cent under is refused", () => {
  withEnv({ MERCH_MIN_MARGIN_CENTS: "600" }, () => {
    const cogs = getMerchCogsCents(familyId);
    const ship = 800;
    const exactTotal = cogs + ship + 600;
    assert.deepEqual(
      evaluateMerchMarginForPaidOrder({
        familyId,
        amountTotalCents: exactTotal,
        shippingChargeCents: ship,
      }),
      { allowed: true },
    );
    assert.deepEqual(
      evaluateMerchMarginForPaidOrder({
        familyId,
        amountTotalCents: exactTotal - 1,
        shippingChargeCents: ship,
      }),
      { allowed: false, code: "merch_margin_below_minimum", minMarginCents: 600 },
    );
  });
});

test("fail-closed: missing total or shipping is estimate_unavailable (never allowed)", () => {
  withEnv({}, () => {
    assert.deepEqual(
      evaluateMerchMarginForPaidOrder({
        familyId,
        amountTotalCents: null,
        shippingChargeCents: 500,
      }),
      { allowed: false, code: "merch_margin_estimate_unavailable", minMarginCents: 600 },
    );
    assert.deepEqual(
      evaluateMerchMarginForPaidOrder({
        familyId,
        amountTotalCents: 5000,
        shippingChargeCents: undefined,
      }),
      { allowed: false, code: "merch_margin_estimate_unavailable", minMarginCents: 600 },
    );
    assert.deepEqual(
      evaluateMerchMarginForPaidOrder({
        familyId,
        amountTotalCents: Number.NaN,
        shippingChargeCents: 500,
      }),
      { allowed: false, code: "merch_margin_estimate_unavailable", minMarginCents: 600 },
    );
  });
});

test("env overrides: custom min margin and COGS change the gate without touching prices", () => {
  withEnv(
    {
      MERCH_MIN_MARGIN_CENTS: "1000",
      [family.cogsEnv]: "2500",
    },
    () => {
      assert.equal(getMerchMinMarginCents(), 1000);
      assert.equal(getMerchCogsCents(familyId), 2500);
      // total 4000 - ship 500 - cogs 2500 = 1000 → allowed
      assert.deepEqual(
        evaluateMerchMarginForPaidOrder({
          familyId,
          amountTotalCents: 4000,
          shippingChargeCents: 500,
        }),
        { allowed: true },
      );
      // 3999 → below
      assert.equal(
        evaluateMerchMarginForPaidOrder({
          familyId,
          amountTotalCents: 3999,
          shippingChargeCents: 500,
        }).code,
        "merch_margin_below_minimum",
      );
    },
  );
});

test("non-positive env values are ignored (keep catalog / $6 defaults)", () => {
  withEnv(
    {
      MERCH_MIN_MARGIN_CENTS: "0",
      [family.cogsEnv]: "-10",
    },
    () => {
      assert.equal(getMerchMinMarginCents(), 600);
      assert.equal(getMerchCogsCents(familyId), family.defaultCogsCents);
    },
  );
});
