/**
 * T-FLEET-103 fix round — Codex P1 + P2 on PR #384.
 *
 * P1: the paid-order margin guard (evaluatePrintMarginForPaidOrder)
 * receives Stripe's amount_total in the SESSION's currency. For CAD
 * sessions it must normalize revenue to USD at the 1.40 reference rate
 * at the guard boundary before comparing against USD costs — reading
 * CAD cents as USD cents invents margin (Codex's worked example: a CA
 * framed order discounted on the hosted page to CA$84.48 total passed
 * a US$10 floor with a phantom +US$19.03; normalized revenue is
 * US$60.34 and the true margin is negative). USD sessions and legacy
 * records with no recorded currency are byte-identical to before.
 *
 * P2: on the configured-rate shipping path (PRINT_DYNAMIC_SHIPPING off,
 * STRIPE_SHIPPING_RATE_ID_PRINT_STANDARD set to a USD rate), a CAD
 * session must not reference the USD rate ID (Stripe rejects the
 * mixed-currency session); it presents the configured flat amount as a
 * converted fixed-amount CAD option. And when free shipping waives a
 * CAD session's shipping, the zero-amount option must be stamped CAD.
 * getPrintShippingOptionsForCountry is route-internal, so its wiring
 * is pinned by source text (the house pattern); the guard and the
 * free-shipping waive are exercised against the REAL lib modules via
 * tsAliasLoader.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { register } from "node:module";

register("./tsAliasLoader.mjs", import.meta.url);

const { evaluatePrintMarginForPaidOrder } = await import("../../src/lib/printMargin.ts");
const { applyPrintFreeShippingToCheckout } = await import("../../src/lib/printFreeShipping.ts");
const { convertCadCentsToUsdCents, convertUsdCentsToCadCents } = await import(
  "../../src/lib/checkoutCurrency.ts"
);

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");

const TOUCHED_ENV = [
  "PRINT_MARGIN_GUARD_ENABLED",
  "PRINT_MIN_MARGIN_CENTS",
  "PRINT_COGS_POSTER_FRAMED_CENTS",
  "PRINT_FREE_SHIPPING_THRESHOLD_CENTS",
  "NEXT_PUBLIC_PRINT_FREE_SHIPPING_THRESHOLD_CENTS",
  "CURRENCY",
  "NEXT_PUBLIC_CURRENCY",
];

function withEnv(overrides, fn) {
  const saved = new Map(TOUCHED_ENV.map((key) => [key, process.env[key]]));
  for (const key of TOUCHED_ENV) delete process.env[key];
  for (const [key, value] of Object.entries(overrides)) {
    if (value !== undefined) process.env[key] = value;
  }
  try {
    return fn();
  } finally {
    for (const key of TOUCHED_ENV) {
      const value = saved.get(key);
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

// Guard fixture: framed poster to Canada. Fulfillment in USD =
// product cost 5200 (pinned via the COGS env so the test does not ride
// on the catalog default) + CA shipping estimate 1070 (rate table
// poster_framed CA $10.70) = 6270.
const GUARD_ENV = {
  PRINT_MARGIN_GUARD_ENABLED: "true",
  PRINT_MIN_MARGIN_CENTS: "1000", // the configured US$10 floor
  PRINT_COGS_POSTER_FRAMED_CENTS: "5200",
};

test("converter: CAD cents normalize to USD at the 1.40 reference rate", () => {
  assert.equal(convertCadCentsToUsdCents(8448), 6034); // Codex's CA$84.48 -> US$60.34
  assert.equal(convertCadCentsToUsdCents(15398), 10999);
  assert.equal(convertCadCentsToUsdCents(0), 0);
  // Round trip at the framed CA shipping figure is exact.
  assert.equal(convertCadCentsToUsdCents(convertUsdCentsToCadCents(1070)), 1070);
});

test("P1 (a): Codex worked example — CAD framed + hosted 50% discount is NOT permitted on the phantom margin", () => {
  const result = withEnv(GUARD_ENV, () =>
    evaluatePrintMarginForPaidOrder({
      variant: "poster_framed",
      shippingCountry: "CA",
      amountTotalCents: 8448, // CA$84.48 incl. shipping, in CAD cents
      currency: "cad",
    })
  );
  assert.equal(result.allowed, false);
  assert.equal(result.code, "margin_below_threshold");
  // Normalized outcome: revenue 6034 USD cents, fee 205, margin -441.
  assert.equal(result.estimate?.revenueCents, 6034);
  assert.equal(result.estimate?.marginCents, -441);
});

test("P1 (b): ordinary CAD framed order at full price permits with the converted margin", () => {
  // CAD book: framed 13900 + presented CAD shipping 1498 = CA$153.98.
  const result = withEnv(GUARD_ENV, () =>
    evaluatePrintMarginForPaidOrder({
      variant: "poster_framed",
      shippingCountry: "CA",
      amountTotalCents: 15398,
      currency: "cad",
    })
  );
  assert.equal(result.allowed, true);
  // Revenue normalized to 10999 USD cents; fee 349; margin 4380.
  assert.equal(result.estimate?.revenueCents, 10999);
  assert.equal(result.estimate?.marginCents, 4380);
});

test("P1 (c): USD sessions are unchanged — the same 8448 total is genuine USD revenue", () => {
  const result = withEnv(GUARD_ENV, () =>
    evaluatePrintMarginForPaidOrder({
      variant: "poster_framed",
      shippingCountry: "CA",
      amountTotalCents: 8448,
      currency: "usd",
    })
  );
  assert.equal(result.allowed, true);
  assert.equal(result.estimate?.revenueCents, 8448);
  assert.equal(result.estimate?.marginCents, 1903);
});

test("P1 (c2): legacy records with no recorded currency behave exactly as USD", () => {
  for (const currency of [null, undefined]) {
    const result = withEnv(GUARD_ENV, () =>
      evaluatePrintMarginForPaidOrder({
        variant: "poster_framed",
        shippingCountry: "CA",
        amountTotalCents: 8448,
        currency,
      })
    );
    assert.equal(result.allowed, true);
    assert.equal(result.estimate?.revenueCents, 8448);
    assert.equal(result.estimate?.marginCents, 1903);
  }
});

test("P1: currency token is case/whitespace tolerant (Stripe reports lowercase; records may vary)", () => {
  const result = withEnv(GUARD_ENV, () =>
    evaluatePrintMarginForPaidOrder({
      variant: "poster_framed",
      shippingCountry: "CA",
      amountTotalCents: 8448,
      currency: " CAD ",
    })
  );
  assert.equal(result.allowed, false);
  assert.equal(result.estimate?.revenueCents, 6034);
});

test("P1 wiring: all three paid-order guard callers pass the recorded session currency", () => {
  const webhook = read("src/app/api/stripe/webhook/route.ts");
  assert.match(webhook, /amountTotalCents: payload\.amountTotal \?\? null,\s*currency: payload\.currency \?\? null,/);
  const retry = read("src/app/api/print/orders/retry/route.ts");
  assert.match(retry, /amountTotalCents: hydrated\.amountTotal \?\? null,\s*currency: hydrated\.currency \?\? null,/);
  const status = read("src/app/api/print/orders/status/route.ts");
  assert.match(status, /amountTotalCents: order\.amountTotal \?\? null,\s*currency: order\.currency \?\? null,/);
});

// ---------------------------------------------------------------------------
// P2 — free-shipping waive (real lib) + configured-rate branch (route pins)
// ---------------------------------------------------------------------------

const FREE_ENV = { PRINT_FREE_SHIPPING_THRESHOLD_CENTS: "10000" };

test("P2: free-shipping waive on a CAD session stamps the zero option CAD (rate-ID input)", () => {
  const result = withEnv(FREE_ENV, () =>
    applyPrintFreeShippingToCheckout(
      { shippingOptions: [{ shipping_rate: "shr_usd_rate" }], shippingChargeCents: 1070 },
      10_600,
      "cad"
    )
  );
  assert.equal(result.freeShippingApplied, true);
  assert.equal(result.shippingChargeCents, 0);
  const option = result.shippingOptions?.[0];
  assert.ok(option && "shipping_rate_data" in option, "rate ID must be replaced by rate data");
  assert.equal(option.shipping_rate_data?.fixed_amount?.amount, 0);
  assert.equal(option.shipping_rate_data?.fixed_amount?.currency, "cad");
});

test("P2: free-shipping waive on a USD session is unchanged (zero option stays USD)", () => {
  const result = withEnv(FREE_ENV, () =>
    applyPrintFreeShippingToCheckout(
      { shippingOptions: [{ shipping_rate: "shr_usd_rate" }], shippingChargeCents: 1070 },
      10_600,
      "usd"
    )
  );
  assert.equal(result.freeShippingApplied, true);
  const option = result.shippingOptions?.[0];
  assert.ok(option && "shipping_rate_data" in option);
  assert.equal(option.shipping_rate_data?.fixed_amount?.amount, 0);
  assert.equal(option.shipping_rate_data?.fixed_amount?.currency, "usd");
});

test("P2: free-shipping waive preserves a CAD fixed-amount option's currency", () => {
  const result = withEnv(FREE_ENV, () =>
    applyPrintFreeShippingToCheckout(
      {
        shippingOptions: [
          {
            shipping_rate_data: {
              type: "fixed_amount",
              fixed_amount: { amount: 1498, currency: "cad" },
              display_name: "Standard shipping",
            },
          },
        ],
        shippingChargeCents: 1070,
      },
      10_600,
      "cad"
    )
  );
  assert.equal(result.freeShippingApplied, true);
  const option = result.shippingOptions?.[0];
  assert.ok(option && "shipping_rate_data" in option);
  assert.equal(option.shipping_rate_data?.fixed_amount?.amount, 0);
  assert.equal(option.shipping_rate_data?.fixed_amount?.currency, "cad");
});

test("P2: below the threshold nothing is waived, in either currency", () => {
  for (const currency of ["cad", "usd"]) {
    const selection = {
      shippingOptions: [{ shipping_rate: "shr_usd_rate" }],
      shippingChargeCents: 1070,
    };
    const result = withEnv(FREE_ENV, () =>
      applyPrintFreeShippingToCheckout(selection, 4_900, currency)
    );
    assert.equal(result.freeShippingApplied, false);
    assert.equal(result.shippingChargeCents, 1070);
    assert.deepEqual(result.shippingOptions, selection.shippingOptions);
  }
});

test("P2 wiring: configured-rate branch converts for CAD and keeps the rate ID for USD only", () => {
  const route = read("src/app/api/checkout/route.ts");
  const fnStart = route.indexOf("function getPrintShippingOptionsForCountry");
  assert.notEqual(fnStart, -1);
  const fn = route.slice(fnStart, route.indexOf("function parseOrderType", fnStart));
  // The USD rate ID is returned only behind the non-CAD guard.
  assert.match(
    fn,
    /if \(currency !== "cad"\) \{\s*return \{\s*shippingOptions: \[\{ shipping_rate: configuredShippingRate \}\],/
  );
  // The CAD path converts the configured flat amount at the reference
  // rate and stamps the option CAD, with no rate ID in the option.
  assert.match(fn, /amount: convertUsdCentsToCadCents\(configuredFlatShippingCents\),\s*currency: "cad",/);
  const cadBranch = fn.slice(fn.indexOf("if (configuredFlatShippingCents)"), fn.indexOf("if (shippingCountry)"));
  assert.equal(cadBranch.includes("shipping_rate:"), false, "CAD branch must not emit a rate ID");
  assert.equal(
    cadBranch.includes("shippingChargeCents: configuredFlatShippingCents"),
    true,
    "shippingChargeCents stays the canonical USD figure"
  );
});

test("P2 wiring: checkout passes the session currency into the free-shipping waive", () => {
  const route = read("src/app/api/checkout/route.ts");
  assert.match(
    route,
    /applyPrintFreeShippingToCheckout\(\s*\{ shippingOptions: printShippingOptions, shippingChargeCents: printShippingChargeCents \},\s*merchandiseSubtotalCents,\s*checkoutCurrency\s*\)/
  );
});
