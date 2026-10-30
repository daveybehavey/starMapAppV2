/**
 * S55-7 merchandising spec — Lever A presentation flag matrix,
 * checkout-paused half: with both second-copy flags ON but physical
 * checkout NOT enabled, the offer must not be advertised anywhere
 * (spec acceptance check 3). Separate process from
 * secondCopyOfferVisibility.test.mjs because mapCommerceLinks resolves
 * its checkout const at module load.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { register } from "node:module";

process.env.PRINT_SECOND_COPY_ENABLED = "true";
process.env.NEXT_PUBLIC_PRINT_SECOND_COPY_ENABLED = "true";
delete process.env.NEXT_PUBLIC_PRINT_CHECKOUT_ENABLED;

register("./tsAliasLoader.mjs", import.meta.url);

const { resolveSecondCopyOfferVisibility } = await import("../../src/lib/secondCopyOffer.ts");

test("physical checkout paused suppresses the offer even with both flags on", () => {
  assert.equal(resolveSecondCopyOfferVisibility(), false);
});
