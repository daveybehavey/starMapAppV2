/**
 * S55-7 merchandising spec — Lever A presentation flag matrix.
 *
 * The offer note may render only when physical checkout is enabled AND
 * both second-copy flags resolve true (spec acceptance check 3). The
 * public + checkout env vars are set before import because
 * mapCommerceLinks resolves its checkout const at module load; the
 * second-copy flags are read per call, so the matrix toggles them here.
 * The checkout-paused half of the matrix lives in
 * secondCopyOfferVisibilityOff.test.mjs (separate process).
 */
import assert from "node:assert/strict";
import test from "node:test";
import { register } from "node:module";

process.env.NEXT_PUBLIC_PRINT_CHECKOUT_ENABLED = "1";

register("./tsAliasLoader.mjs", import.meta.url);

const { resolveSecondCopyOfferVisibility } = await import("../../src/lib/secondCopyOffer.ts");

const SERVER = "PRINT_SECOND_COPY_ENABLED";
const PUBLIC = "NEXT_PUBLIC_PRINT_SECOND_COPY_ENABLED";

function setFlags(server, pub) {
  if (server === undefined) delete process.env[SERVER];
  else process.env[SERVER] = server;
  if (pub === undefined) delete process.env[PUBLIC];
  else process.env[PUBLIC] = pub;
}

test("flag matrix: notes only in the on/on state", () => {
  setFlags(undefined, undefined);
  assert.equal(resolveSecondCopyOfferVisibility(), false);
  setFlags(undefined, "true");
  assert.equal(resolveSecondCopyOfferVisibility(), false);
  setFlags("true", undefined);
  assert.equal(resolveSecondCopyOfferVisibility(), false);
  setFlags("false", "true");
  assert.equal(resolveSecondCopyOfferVisibility(), false);
  setFlags("true", "false");
  assert.equal(resolveSecondCopyOfferVisibility(), false);
  setFlags("true", "true");
  assert.equal(resolveSecondCopyOfferVisibility(), true);
  setFlags(undefined, undefined);
});
