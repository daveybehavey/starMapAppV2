import assert from "node:assert/strict";
import test from "node:test";
import { buildProfileInstants, assertProfileInstants } from "../editor-render-profile/profileInstants.mjs";

test("profile generates eight distinct canonical instants from the runtime clock", () => {
  const before = Date.now();
  const instants = buildProfileInstants();
  const after = Date.now();
  assert.equal(instants.length, 8);
  assert.equal(new Set(instants).size, 8);
  assert.ok(Date.parse(instants[0]) >= before && Date.parse(instants[0]) <= after);
  for (const iso of instants) {
    assert.ok(Number.isFinite(Date.parse(iso)));
    assert.equal(new Date(iso).toISOString(), iso);
  }
});

test("profile rejects malformed instants, including the original three-digit minutes", () => {
  const instants = buildProfileInstants();
  instants[0] = "2024-12-14T02:000:00.000Z";
  assert.throws(() => assertProfileInstants(instants), /Invalid profile instant/);
});

test("profile rejects duplicate, missing, and non-canonical instants", () => {
  const instants = buildProfileInstants();
  assert.throws(() => assertProfileInstants(Array(8).fill(instants[0])), /8 unique/);
  assert.throws(() => assertProfileInstants(instants.slice(1)), /exactly 8/);
  instants[0] = instants[0].replace("Z", "+00:00");
  assert.throws(() => assertProfileInstants(instants), /Non-canonical/);
});
