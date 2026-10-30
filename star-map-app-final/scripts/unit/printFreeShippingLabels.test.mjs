/**
 * S55-7 merchandising spec — threshold-label correction pins against
 * the REAL lib module (house tsAliasLoader pattern).
 *
 * The free-shipping threshold is a USD merchandise-subtotal figure in
 * both markets (checkout judges the USD mirror subtotal), so every
 * presentation string must name it in USD — never relabel the USD
 * figure with the display currency, the trap this fix removes.
 * Behaviour pins only: threshold parsing/defaults and the waive logic
 * are pinned by printFreeShipping.test.mjs and stay untouched.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { register } from "node:module";

register("./tsAliasLoader.mjs", import.meta.url);

const freeShipping = await import("../../src/lib/printFreeShipping.ts");

const ENV_KEYS = ["PRINT_FREE_SHIPPING_THRESHOLD_CENTS", "NEXT_PUBLIC_PRINT_FREE_SHIPPING_THRESHOLD_CENTS"];

function withEnv(vars, fn) {
  const saved = ENV_KEYS.map((key) => [key, process.env[key]]);
  for (const key of ENV_KEYS) delete process.env[key];
  for (const [key, value] of Object.entries(vars)) process.env[key] = value;
  try {
    return fn();
  } finally {
    for (const [key, value] of saved) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

const B2_DEFAULT =
  "Free standard shipping when your print order's USD merchandise subtotal is $89.00 USD or more. Eligibility uses USD item values in both markets and excludes shipping.";
const B3_DEFAULT = "Free standard shipping · $89.00 USD+ USD subtotal";

test("B1 default: $89.00 USD in both markets — CAD calls never relabel as CAD", () => {
  withEnv({}, () => {
    assert.equal(freeShipping.formatPrintFreeShippingThresholdLabel("usd"), "$89.00 USD");
    assert.equal(freeShipping.formatPrintFreeShippingThresholdLabel("cad"), "$89.00 USD");
    assert.equal(freeShipping.formatPrintFreeShippingThresholdLabel(), "$89.00 USD");
  });
});

test("B2/B3 default copy deck, identical for USD and CAD calls", () => {
  withEnv({}, () => {
    assert.equal(freeShipping.getPrintFreeShippingOfferLine("usd"), B2_DEFAULT);
    assert.equal(freeShipping.getPrintFreeShippingOfferLine("cad"), B2_DEFAULT);
    assert.equal(freeShipping.getPrintFreeShippingShortTag("usd"), B3_DEFAULT);
    assert.equal(freeShipping.getPrintFreeShippingShortTag("cad"), B3_DEFAULT);
  });
});

test("configured threshold 12345 renders $123.45 USD in B1-B3, both markets", () => {
  withEnv({ PRINT_FREE_SHIPPING_THRESHOLD_CENTS: "12345" }, () => {
    assert.equal(freeShipping.formatPrintFreeShippingThresholdLabel("usd"), "$123.45 USD");
    assert.equal(freeShipping.formatPrintFreeShippingThresholdLabel("cad"), "$123.45 USD");
    assert.equal(
      freeShipping.getPrintFreeShippingOfferLine("cad"),
      "Free standard shipping when your print order's USD merchandise subtotal is $123.45 USD or more. Eligibility uses USD item values in both markets and excludes shipping.",
    );
    assert.equal(
      freeShipping.getPrintFreeShippingShortTag("usd"),
      "Free standard shipping · $123.45 USD+ USD subtotal",
    );
  });
});

test("existing server/public precedence and invalid-value fallback are unchanged", () => {
  withEnv(
    { PRINT_FREE_SHIPPING_THRESHOLD_CENTS: "12345", NEXT_PUBLIC_PRINT_FREE_SHIPPING_THRESHOLD_CENTS: "77700" },
    () => {
      assert.equal(freeShipping.formatPrintFreeShippingThresholdLabel(), "$123.45 USD");
    },
  );
  withEnv({ NEXT_PUBLIC_PRINT_FREE_SHIPPING_THRESHOLD_CENTS: "77700" }, () => {
    assert.equal(freeShipping.formatPrintFreeShippingThresholdLabel(), "$777.00 USD");
  });
  for (const bad of ["abc", "0", "-500", "  "]) {
    withEnv({ PRINT_FREE_SHIPPING_THRESHOLD_CENTS: bad }, () => {
      assert.equal(freeShipping.formatPrintFreeShippingThresholdLabel(), "$89.00 USD");
    });
  }
});

test("qualifying hint is retired: null in both markets, configured or not", () => {
  withEnv({}, () => {
    assert.equal(freeShipping.getPrintFreeShippingQualifyingHint("usd"), null);
    assert.equal(freeShipping.getPrintFreeShippingQualifyingHint("cad"), null);
  });
  withEnv({ PRINT_FREE_SHIPPING_THRESHOLD_CENTS: "12345" }, () => {
    assert.equal(freeShipping.getPrintFreeShippingQualifyingHint(), null);
  });
});
