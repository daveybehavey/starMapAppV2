import test from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";

register("./tsAliasLoader.mjs", import.meta.url);
const { filterMetaCoupon, getMetaCheckoutTarget, resolveMetaCheckout, META_SEASONAL_CODES } =
  await import("../../src/lib/metaCheckout.ts");
const { isManualPromotionCompatibleWithOrder } = await import("../../src/lib/checkoutPromotions.ts");
const { createMetaCheckoutCarry, readMetaCheckoutCarry } = await import("../../src/lib/metaCheckoutCookie.ts");

// These pin the chair's adapter contract, NOT website date parity: the website
// reference has no seasonal time predicate. See PARITY-REPORT.md before rollout.
const transitions = [
  ["XMAS15", "start PDT", "2026-11-01T07:00:00Z", [false, true, true]],
  ["BLACKFRIDAY25", "start PST", "2026-11-27T08:00:00Z", [false, true, true]],
  ["BLACKFRIDAY25", "last eligible minute PST", "2026-12-02T07:59:00Z", [true, true, false]],
  ["BLACKFRIDAY25", "exclusive end PST", "2026-12-02T08:00:00Z", [true, false, false]],
  ["XMAS15", "last eligible minute PST", "2026-12-27T07:59:00Z", [true, true, false]],
  ["XMAS15", "exclusive end PST", "2026-12-27T08:00:00Z", [true, false, false]],
];
for (const [code, label, instant, expected] of transitions) {
  for (const [index, offset] of [-1, 0, 1].entries()) {
    test(`Meta boundary ${code} ${label} ${offset} minute`, () => {
      const now = Date.parse(instant) + offset * 60_000;
      const value = expected[index] ? code : null;
      const target = getMetaCheckoutTarget("print_poster_framed");
      assert.equal(filterMetaCoupon(code, target, now), value);
      const result = resolveMetaCheckout(new URLSearchParams({
        product_id: "print_poster_framed", coupon_code: code,
      }), now);
      assert.equal(result.promoCode, value);
      assert.equal(result.couponDropped, !expected[index]);
    });
  }
}

const products = [
  "print_poster_unframed", "print_poster_unframed_16x16", "print_poster_framed",
  "print_canvas_wrap", "print_mug_11oz", "print_card_4x6",
  "digital_single_hd", "digital_pack3_hd",
];
for (const code of ["XMAS15", "BLACKFRIDAY25"]) {
  for (const product of products) {
    test(`Meta product parity ${code} ${product} ordinary seasonal coupon`, () => {
      const target = getMetaCheckoutTarget(product);
      assert.ok(target);
      const eligible = isManualPromotionCompatibleWithOrder({
        orderType: target.kind === "digital" ? "digital" : "print",
        plan: target.kind === "digital" ? target.plan : "single",
        coupon: { metadata: {} },
      });
      assert.equal(eligible, target.kind === "print");
      assert.equal(filterMetaCoupon(code, target, Date.parse("2026-11-28T20:00:00Z")), eligible ? code : null);
    });
  }
  test(`Meta ${code} normalizes case and whitespace`, () => {
    assert.equal(filterMetaCoupon(` ${code.toLowerCase()} `, getMetaCheckoutTarget("poster_framed"), Date.parse("2026-11-28T20:00:00Z")), code);
  });
  test(`Meta ${code} does not renew in 2027`, () => {
    assert.equal(filterMetaCoupon(code, getMetaCheckoutTarget("poster_framed"), Date.parse("2027-11-28T20:00:00Z")), null);
  });
}

for (const [code, end] of [["BLACKFRIDAY25", "2026-12-02T08:00:00Z"], ["XMAS15", "2026-12-27T08:00:00Z"]]) {
  test(`Meta signed carry rechecks ${code} at expiry boundary`, (t) => {
    const previous = process.env.REFERRAL_SIGNING_SECRET;
    process.env.REFERRAL_SIGNING_SECRET = "unit-test-meta-parity-secret";
    t.after(() => {
      if (previous === undefined) delete process.env.REFERRAL_SIGNING_SECRET;
      else process.env.REFERRAL_SIGNING_SECRET = previous;
    });
    const now = Date.parse(end);
    const carry = createMetaCheckoutCarry("print_poster_framed", code, now - 60_000);
    assert.ok(carry);
    assert.equal(readMetaCheckoutCarry(carry, now - 1).promoCode, code);
    assert.equal(readMetaCheckoutCarry(carry, now).promoCode, undefined);
    assert.equal(readMetaCheckoutCarry(carry, now + 60_000).promoCode, undefined);
  });
}

test("Meta recognizes only the two seasonal codes", () => {
  assert.deepEqual(META_SEASONAL_CODES.map(({ code }) => code).sort(), ["BLACKFRIDAY25", "XMAS15"]);
  for (const code of ["BLACKFRIDAY20", "XMAS20", "UNKNOWN", "DIGITAL_COMP"]) {
    assert.equal(filterMetaCoupon(code, getMetaCheckoutTarget("poster_framed"), Date.parse("2026-11-28T20:00:00Z")), null);
  }
});
