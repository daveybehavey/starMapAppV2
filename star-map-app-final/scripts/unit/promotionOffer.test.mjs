/**
 * promotionOffer.ts — target scope / label / offer-name resolution.
 *
 * Regression targets:
 * - defaults when env is unset (single_digital / starter wording)
 * - accepted scopes normalize; unknown scopes fall through to the default
 * - explicit offer-name env wins; otherwise the name follows the scope
 * - blank labels fall back to the default copy (never an empty string)
 */
import assert from "node:assert/strict";
import test from "node:test";
import { register } from "node:module";

register("./tsAliasLoader.mjs", import.meta.url);

const {
  getPromotionOfferName,
  getPromotionTargetLabel,
  getPromotionTargetScope,
} = await import("../../src/lib/promotionOffer.ts");

const TOUCHED = [
  "NEXT_PUBLIC_PROMOTION_TARGET_SCOPE",
  "PROMOTION_TARGET_SCOPE",
  "NEXT_PUBLIC_PROMOTION_TARGET_LABEL",
  "PROMOTION_TARGET_LABEL",
  "NEXT_PUBLIC_PROMOTION_OFFER_NAME",
  "PROMOTION_OFFER_NAME",
];

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

test("defaults: scope is single_digital; label and offer name use the HD starter copy", () => {
  withEnv({}, () => {
    assert.equal(getPromotionTargetScope(), "single_digital");
    assert.equal(getPromotionTargetLabel(), "your first single HD digital checkout");
    assert.equal(getPromotionOfferName(), "HD starter code");
  });
});

test("accepted scopes normalize case; unknown scopes fall back to single_digital", () => {
  withEnv({ PROMOTION_TARGET_SCOPE: "PRINT_FRAMED" }, () => {
    assert.equal(getPromotionTargetScope(), "print_framed");
    assert.equal(getPromotionOfferName(), "framed print code");
  });
  withEnv({ NEXT_PUBLIC_PROMOTION_TARGET_SCOPE: "any_print" }, () => {
    assert.equal(getPromotionTargetScope(), "any_print");
    assert.equal(getPromotionOfferName(), "print offer code");
  });
  withEnv({ PROMOTION_TARGET_SCOPE: "not-a-scope" }, () => {
    assert.equal(getPromotionTargetScope(), "single_digital");
    assert.equal(getPromotionOfferName(), "HD starter code");
  });
  withEnv({ PROMOTION_TARGET_SCOPE: "any" }, () => {
    assert.equal(getPromotionOfferName(), "offer code");
  });
  withEnv({ PROMOTION_TARGET_SCOPE: "print_unframed" }, () => {
    assert.equal(getPromotionOfferName(), "unframed print code");
  });
});

test("NEXT_PUBLIC scope wins over the server-only PROMOTION_TARGET_SCOPE twin", () => {
  withEnv(
    {
      NEXT_PUBLIC_PROMOTION_TARGET_SCOPE: "any",
      PROMOTION_TARGET_SCOPE: "print_framed",
    },
    () => {
      assert.equal(getPromotionTargetScope(), "any");
    },
  );
});

test("explicit offer name / label env win; blank strings fall through", () => {
  withEnv(
    {
      PROMOTION_TARGET_SCOPE: "print_framed",
      NEXT_PUBLIC_PROMOTION_OFFER_NAME: "  Winter framed code  ",
      NEXT_PUBLIC_PROMOTION_TARGET_LABEL: "  your framed checkout  ",
    },
    () => {
      assert.equal(getPromotionOfferName(), "Winter framed code");
      assert.equal(getPromotionTargetLabel(), "your framed checkout");
    },
  );
  withEnv(
    {
      PROMOTION_TARGET_SCOPE: "print_framed",
      NEXT_PUBLIC_PROMOTION_OFFER_NAME: "   ",
      PROMOTION_TARGET_LABEL: "",
    },
    () => {
      assert.equal(getPromotionOfferName(), "framed print code");
      assert.equal(getPromotionTargetLabel(), "your first single HD digital checkout");
    },
  );
});
