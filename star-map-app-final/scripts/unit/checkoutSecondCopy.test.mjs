/**
 * Lever A — "second copy of the same design at 10% off" (checkout add-on).
 *
 * Behavioural pins against the REAL lib modules (house tsAliasLoader
 * pattern), plus source-construction pins for the route / webhook /
 * retry / UI wiring that cannot be imported here.
 *
 * Design: ~/workspace/seo-backlinks/lever-a-second-copy-design-2026-10-25.md
 * - copy price = round(variant price x 0.9) per currency, one helper
 *   consumed by the line item, the promo mirror, the identity and the
 *   margin guard;
 * - fulfilment = quantity 2 on the main Printful item (the card stays
 *   quantity 1);
 * - the paid-order margin guard counts the second copy's COGS at BOTH
 *   call sites;
 * - kill switches ship dark (both "false" in wrangler.toml);
 * - NO extra digital entitlement (pinned by the webhook source pins:
 *   the flag reaches only the order record, the guard and the
 *   Printful quantity — never markSessionPaid / plan / credits).
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { register } from "node:module";

register("./tsAliasLoader.mjs", import.meta.url);

const pricing = await import("../../src/lib/pricing.ts");
const { PRINT_SECOND_COPY_VARIANTS, isSecondCopyEligibleVariant } = await import(
  "../../src/lib/printCatalog.ts"
);
const { getPrintMerchandiseSubtotalCents, qualifiesForPrintFreeShipping } = await import(
  "../../src/lib/printFreeShipping.ts"
);
const {
  evaluatePrintMarginForCheckout,
  evaluatePrintMarginForPaidOrder,
  getSecondCopyShippingIncrementCents,
} = await import("../../src/lib/printMargin.ts");
const { getPrintShippingEstimate } = await import("../../src/lib/printfulShipping.ts");
const { submitPrintfulOrder } = await import("../../src/lib/printful.ts");
const { sanitizePrintOrderForOperatorResponse } = await import("../../src/lib/printOrders.ts");
const { renderPrintOrderConfirmationEmail } = await import(
  "../../src/lib/printOrderConfirmationEmail.ts"
);

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");

const TOUCHED_ENV = [
  "PRINT_SECOND_COPY_ENABLED",
  "NEXT_PUBLIC_PRINT_SECOND_COPY_ENABLED",
  "PRINT_MARGIN_GUARD_ENABLED",
  "PRINT_MIN_MARGIN_CENTS",
  "PRINT_FRAMED_PRICE_CENTS",
  "NEXT_PUBLIC_PRINT_FRAMED_PRICE_CENTS",
  "PRINTFUL_API_TOKEN",
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

const GUARD_ENV = { PRINT_MARGIN_GUARD_ENABLED: "true", PRINT_MIN_MARGIN_CENTS: "1000" };

test("pricing: USD copy price is round(tier x 0.9) for every variant", () => {
  withEnv({}, () => {
    assert.equal(pricing.getPrintSecondCopyPriceCents("poster_unframed"), 4410);
    assert.equal(pricing.getPrintSecondCopyPriceCents("poster_unframed_16x16"), 3510);
    assert.equal(pricing.getPrintSecondCopyPriceCents("poster_framed"), 8910);
    assert.equal(pricing.getPrintSecondCopyPriceCents("canvas_wrap"), 7110);
  });
});

test("pricing: an env reprice reprices the copy (rounding is round-half-up on cents)", () => {
  withEnv({ PRINT_FRAMED_PRICE_CENTS: "4999" }, () => {
    assert.equal(pricing.getPrintPricingTiers().poster_framed.amountCents, 4999);
    assert.equal(pricing.getPrintSecondCopyPriceCents("poster_framed"), 4499);
  });
});

test("eligibility: exactly the four print formats; mug and card can never carry a copy", () => {
  assert.deepEqual([...PRINT_SECOND_COPY_VARIANTS].sort(), [
    "canvas_wrap",
    "poster_framed",
    "poster_unframed",
    "poster_unframed_16x16",
  ]);
  for (const variant of PRINT_SECOND_COPY_VARIANTS) {
    assert.equal(isSecondCopyEligibleVariant(variant), true, variant);
  }
  assert.equal(isSecondCopyEligibleVariant("mug_11oz"), false);
  assert.equal(isSecondCopyEligibleVariant("card_4x6"), false);
  assert.equal(isSecondCopyEligibleVariant("not_a_variant"), false);
  assert.equal(isSecondCopyEligibleVariant(undefined), false);
});

test("kill switches: default off; only explicit truthy values open them", () => {
  withEnv({}, () => {
    assert.equal(pricing.isPrintSecondCopyEnabled(), false);
    assert.equal(pricing.isPrintSecondCopyPublicEnabled(), false);
  });
  withEnv({ PRINT_SECOND_COPY_ENABLED: "true" }, () => {
    assert.equal(pricing.isPrintSecondCopyEnabled(), true);
    assert.equal(pricing.isPrintSecondCopyPublicEnabled(), false);
  });
  withEnv({ NEXT_PUBLIC_PRINT_SECOND_COPY_ENABLED: "1" }, () => {
    assert.equal(pricing.isPrintSecondCopyPublicEnabled(), true);
    assert.equal(pricing.isPrintSecondCopyEnabled(), false);
  });
  withEnv({ PRINT_SECOND_COPY_ENABLED: "sometimes" }, () => {
    assert.equal(pricing.isPrintSecondCopyEnabled(), false);
  });
});

test("free shipping: the copy counts toward the threshold at its 90% price", () => {
  withEnv({}, () => {
    assert.equal(getPrintMerchandiseSubtotalCents({ variant: "poster_unframed" }), 4900);
    assert.equal(
      getPrintMerchandiseSubtotalCents({ variant: "poster_unframed", includeSecondCopy: true }),
      9310
    );
    // Poster pair 9310 >= the 8900 threshold (Lever B): ships free.
    assert.equal(qualifiesForPrintFreeShipping(9310), true);
    // 16x16 pair 7410 < 8900: shipping is still charged.
    assert.equal(
      getPrintMerchandiseSubtotalCents({
        variant: "poster_unframed_16x16",
        includeSecondCopy: true,
      }),
      7410
    );
    assert.equal(qualifiesForPrintFreeShipping(7410), false);
    // Flag off is byte-identical to the pre-Lever-A subtotal.
    assert.equal(
      getPrintMerchandiseSubtotalCents({ variant: "poster_framed", includeSecondCopy: false }),
      9900
    );
  });
});

test("shipping increment: measured quantity-2 parcels; unmeasured countries use the full matrix rate", () => {
  assert.equal(getSecondCopyShippingIncrementCents("poster_unframed", "US"), 39);
  assert.equal(getSecondCopyShippingIncrementCents("poster_unframed", "CA"), 25);
  assert.equal(getSecondCopyShippingIncrementCents("poster_framed", "US"), 407);
  assert.equal(getSecondCopyShippingIncrementCents("poster_framed", "CA"), 568);
  assert.equal(getSecondCopyShippingIncrementCents("canvas_wrap", "US"), 971);
  // Canvas to Canada barely consolidates at Printful (measured
  // 2026-10-26): the increment is close to a full second parcel.
  assert.equal(getSecondCopyShippingIncrementCents("canvas_wrap", "CA"), 1649);
  // Fallback = the full single-parcel matrix rate (the design's
  // documented upper bound), never an invented discount.
  assert.equal(
    getSecondCopyShippingIncrementCents("poster_framed", "GB"),
    getPrintShippingEstimate("poster_framed", "GB").amountCents
  );
});

test("checkout guard: copy revenue and second COGS both land; a 25% promo still clears the floor", () => {
  withEnv(GUARD_ENV, () => {
    const base = {
      variant: "poster_framed",
      shippingCountry: "US",
      shippingChargeCents: 0,
      includeDigitalAddOn: false,
    };
    const plain = evaluatePrintMarginForCheckout(base);
    assert.equal(plain.estimate.marginCents, 5218);

    const withCopy = evaluatePrintMarginForCheckout({ ...base, includeSecondCopy: true });
    assert.equal(withCopy.allowed, true);
    assert.equal(withCopy.estimate.revenueCents, 18810); // 9900 + 8910
    assert.equal(withCopy.estimate.productCostCents, 6762); // 2 x 3381
    assert.equal(withCopy.estimate.shippingCostCents, 1391); // 984 + 407 increment
    assert.equal(withCopy.estimate.marginCents, 10082);

    const promo = evaluatePrintMarginForCheckout({
      ...base,
      includeSecondCopy: true,
      discountAmountCents: 4703, // 25% of 18810, as the promo estimate computes it
    });
    assert.equal(promo.allowed, true);
    assert.equal(promo.estimate.marginCents, 5515);
  });
});

test("paid-order guard: the flag counts the second COGS — a thin order the plain guard passes is held", () => {
  withEnv(GUARD_ENV, () => {
    const base = { variant: "poster_framed", shippingCountry: "US", amountTotalCents: 9000 };
    const plain = evaluatePrintMarginForPaidOrder(base);
    assert.equal(plain.allowed, true);
    assert.equal(plain.estimate.marginCents, 4344);

    const withCopy = evaluatePrintMarginForPaidOrder({ ...base, includesSecondCopy: true });
    assert.equal(withCopy.allowed, false);
    assert.equal(withCopy.code, "margin_below_threshold");
    assert.equal(withCopy.estimate.productCostCents, 6762);
    assert.equal(withCopy.estimate.marginCents, 556); // 4344 - 3381 COGS - 407 increment
  });
});

test("printful submit: mainItemQuantity 2 ships the main item twice; the card stays quantity 1", async () => {
  const savedToken = process.env.PRINTFUL_API_TOKEN;
  process.env.PRINTFUL_API_TOKEN = "test-token";
  const bodies = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    bodies.push(JSON.parse(init.body));
    return { ok: true, status: 200, text: async () => JSON.stringify({ result: { id: 4242 } }) };
  };
  try {
      const recipient = {
        name: "Test",
        address1: "1 Main St",
        city: "Los Angeles",
        country_code: "US",
        zip: "90001",
      };
      const withCopy = await submitPrintfulOrder({
        externalId: "cs_test_copy",
        variant: "poster_framed",
        fileUrl: "https://example.com/art.png",
        recipient,
        additionalVariants: ["card_4x6"],
        mainItemQuantity: 2,
      });
      assert.equal(withCopy.ok, true);
      assert.deepEqual(
        bodies[0].items.map((item) => [item.variant_id, item.quantity]),
        [
          [4654, 2],
          [14457, 1],
        ]
      );

      const plain = await submitPrintfulOrder({
        externalId: "cs_test_plain",
        variant: "poster_framed",
        fileUrl: "https://example.com/art.png",
        recipient,
      });
      assert.equal(plain.ok, true);
      assert.deepEqual(
        bodies[1].items.map((item) => [item.variant_id, item.quantity]),
        [[4654, 1]]
      );

      // Clamp: fractional quantities floor; the main variant can never
      // sneak a second unit in through additionalVariants.
      const clamped = await submitPrintfulOrder({
        externalId: "cs_test_clamp",
        variant: "poster_framed",
        fileUrl: "https://example.com/art.png",
        recipient,
        additionalVariants: ["poster_framed"],
        mainItemQuantity: 2.9,
      });
      assert.equal(clamped.ok, true);
      assert.deepEqual(
        bodies[2].items.map((item) => [item.variant_id, item.quantity]),
        [[4654, 2]]
      );
  } finally {
    globalThis.fetch = originalFetch;
    if (savedToken === undefined) delete process.env.PRINTFUL_API_TOKEN;
    else process.env.PRINTFUL_API_TOKEN = savedToken;
  }
});

test("order record: includesSecondCopy round-trips the operator sanitize; legacy records stay absent", () => {
  const withCopy = sanitizePrintOrderForOperatorResponse({
    sessionId: "cs_test_record",
    includesSecondCopy: true,
  });
  assert.equal(withCopy.includesSecondCopy, true);
  const legacy = sanitizePrintOrderForOperatorResponse({ sessionId: "cs_test_legacy" });
  assert.equal(legacy.includesSecondCopy, undefined);
});

test("confirmation email: the second-copy line renders only for copy orders", () => {
  const base = {
    customerName: "Test Buyer",
    productLabel: "Framed star map poster",
    amountLabel: "$188.10",
    successUrl: "https://starmapco.com/success?session_id=cs_test",
  };
  const withCopy = renderPrintOrderConfirmationEmail({ ...base, includesSecondCopy: true });
  assert.match(withCopy.text, /Second copy: included/);
  assert.match(withCopy.html, /Second copy/);
  const plain = renderPrintOrderConfirmationEmail(base);
  assert.equal(/Second copy/.test(plain.text), false);
  assert.equal(/Second copy/.test(plain.html), false);
});

test("route wiring: normalisation, metadata, identity + idempotency, GET/POST param (source pins)", () => {
  const route = read("src/app/api/checkout/route.ts");
  assert.match(route, /function normalizeIncludeSecondCopy\(/);
  assert.match(route, /isPrintSecondCopyEnabled\(\)/);
  assert.match(route, /isSecondCopyEligibleVariant\(input\.printVariant\)/);
  assert.match(
    route,
    /metadata\.print_include_second_copy = normalizedIncludeSecondCopy \? "true" : "false";/
  );
  // The ONLY second-copy metadata key: no plan/credits keys are touched.
  assert.equal(route.includes("print_include_second_copy"), true);
  // Identity: the copy price is a component in BOTH currency branches.
  assert.match(route, /priceDataComponent\("cad", getPrintSecondCopyCadPriceCents\(normalizedPrintVariant\)\)/);
  assert.match(route, /priceDataComponent\(printTier\.currency, getPrintSecondCopyPriceCents\(normalizedPrintVariant\)\)/);
  // Idempotency: ":c2" appended only when the flag is on, after the gift segment.
  assert.match(route, /const copySegment = input\.includeSecondCopy \? ":c2" : "";/);
  // The copy line is price_data (promos stack) and its mirror entry has no Price ID.
  assert.match(route, /\(second copy, 10% off\)/);
  // GET handoff reads the query param; the shared recovery-URL builders
  // carry it back so a cancelled copy order restores the toggle.
  assert.match(route, /searchParams\.get\("include_second_copy"\)/);
  for (const rel of ["src/lib/checkoutEditorRecovery.ts", "src/lib/printCheckoutConfig.ts"]) {
    assert.match(read(rel), /params\.set\("include_second_copy", "1"\)/, rel);
  }
  // The checkout guard receives the flag.
  assert.match(route, /includeSecondCopy: normalizedIncludeSecondCopy/);
});

test("webhook + retry wiring: record field, BOTH guard call sites, quantity 2 (source pins)", () => {
  const webhook = read("src/app/api/stripe/webhook/route.ts");
  assert.match(webhook, /session\.metadata\?\.print_include_second_copy === "true"/);
  assert.match(webhook, /includesSecondCopy: payload\.includesSecondCopy/);
  assert.match(webhook, /mainItemQuantity: payload\.includesSecondCopy \? 2 : 1/);

  const retry = read("src/app/api/print/orders/retry/route.ts");
  assert.match(retry, /mainItemQuantity: hydrated\.includesSecondCopy \? 2 : 1/);
  assert.match(retry, /includesSecondCopy/);
});

test("entitlement fence: the entitlement grant keeps its pre-Lever-A shape", () => {
  const webhook = read("src/app/api/stripe/webhook/route.ts");
  // markSessionPaid takes ONLY the session — the copy flag is not a
  // parameter, and metadata.plan is never derived from it: a copy
  // order grants exactly the entitlement its single print purchase
  // already grants, nothing more (design §4, STOP 3).
  assert.match(webhook, /async function markSessionPaid\(session: Stripe\.Checkout\.Session\)/);
});

test("UI wiring: all three surfaces render the toggle and thread the flag (source pins)", () => {
  for (const rel of [
    "src/components/EditorExperience.tsx",
    "src/components/PaywallModal.tsx",
    "src/app/MobileCreate.tsx",
  ]) {
    const src = read(rel);
    assert.match(src, /Add a second copy — 10% off/, rel);
    assert.match(src, /isPrintSecondCopyPublicEnabled/, rel);
    assert.match(src, /includeSecondCopy/, rel);
  }
  const editor = read("src/components/EditorExperience.tsx");
  assert.match(editor, /searchParams\.get\("include_second_copy"\)/);
  assert.match(editor, /checkoutPayload\.includeSecondCopy = includeSecondCopy;/);
});

test("config: both kill switches are declared and ACTIVATED (Lever A activation; flip both back to \"false\" to roll back)", () => {
  const toml = read("wrangler.toml");
  assert.match(toml, /PRINT_SECOND_COPY_ENABLED = "true"/);
  assert.match(toml, /NEXT_PUBLIC_PRINT_SECOND_COPY_ENABLED = "true"/);
});
