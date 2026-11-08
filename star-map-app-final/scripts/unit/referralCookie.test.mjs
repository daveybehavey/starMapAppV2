/**
 * referralCookie.ts — signed referral cookie round-trip + expiry.
 *
 * Regression targets:
 * - create/parse round-trip with a synthetic signing secret
 * - tampered signature / wrong secret / expired cookie / malformed payload
 *   all return null (fail closed)
 * - source cookie encodes attribution and rejects garbage
 *
 * Uses a fixed synthetic secret (`unit-test-signing-secret-xx`) — never a
 * real credential. Time is injected; no wall-clock dependence.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { register } from "node:module";

register("./tsAliasLoader.mjs", import.meta.url);

const {
  REFERRAL_COOKIE_MAX_AGE_SECONDS,
  createReferralCookieValue,
  createReferralSourceCookieValue,
  parseReferralCookieValue,
  parseReferralSourceCookieValue,
} = await import("../../src/lib/referralCookie.ts");

const TOUCHED = ["REFERRAL_SIGNING_SECRET", "STRIPE_WEBHOOK_SECRET", "STRIPE_SECRET_KEY"];
const SECRET = "unit-test-signing-secret-xx";
const NOW = Date.UTC(2026, 10, 8, 12, 0, 0);

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

test("round-trip: a signed cookie parses back to the normalized code + issuedAt", () => {
  withEnv({ REFERRAL_SIGNING_SECRET: SECRET }, () => {
    const raw = createReferralCookieValue("  AbC123xy  ", NOW);
    assert.ok(raw);
    assert.deepEqual(parseReferralCookieValue(raw, NOW), {
      code: "ABC123XY", // normalizeReferralCode uppercases
      issuedAt: NOW,
    });
  });
});

test("fail-closed: missing secret, tampered signature, wrong secret, expiry, malformed", () => {
  withEnv({}, () => {
    assert.equal(createReferralCookieValue("ABC123XY", NOW), null);
  });

  withEnv({ REFERRAL_SIGNING_SECRET: SECRET }, () => {
    const raw = createReferralCookieValue("ABC123XY", NOW);
    assert.ok(raw);
    const parts = raw.split(".");
    const tampered = `${parts[0]}.${parts[1]}.${parts[2].slice(0, -1)}x`;
    assert.equal(parseReferralCookieValue(tampered, NOW), null);
    assert.equal(parseReferralCookieValue("not.enough", NOW), null);
    assert.equal(parseReferralCookieValue(null, NOW), null);
    assert.equal(parseReferralCookieValue("", NOW), null);

    const expiredAt = NOW + REFERRAL_COOKIE_MAX_AGE_SECONDS * 1000 + 1;
    assert.equal(parseReferralCookieValue(raw, expiredAt), null);
    // Exactly at the max age boundary still accepts (ageMs > max is the reject).
    assert.ok(parseReferralCookieValue(raw, NOW + REFERRAL_COOKIE_MAX_AGE_SECONDS * 1000));
  });

  withEnv({ REFERRAL_SIGNING_SECRET: SECRET }, () => {
    const raw = createReferralCookieValue("ABC123XY", NOW);
    assert.ok(raw);
  });
  withEnv({ REFERRAL_SIGNING_SECRET: "different-signing-secret" }, () => {
    // Recreate under SECRET then parse under a different secret:
  });
  const rawUnderSecret = withEnv({ REFERRAL_SIGNING_SECRET: SECRET }, () =>
    createReferralCookieValue("ABC123XY", NOW),
  );
  withEnv({ REFERRAL_SIGNING_SECRET: "different-signing-secret" }, () => {
    assert.equal(parseReferralCookieValue(rawUnderSecret, NOW), null);
  });
});

test("source cookie: encodes attribution JSON; garbage / empty decode to null", () => {
  const encoded = createReferralSourceCookieValue({
    source: "newsletter",
    medium: "email",
    campaign: "spring",
    content: "hero",
  });
  assert.ok(encoded);
  assert.deepEqual(parseReferralSourceCookieValue(encoded), {
    source: "newsletter",
    medium: "email",
    campaign: "spring",
    content: "hero",
  });
  assert.equal(parseReferralSourceCookieValue("%%%"), null);
  assert.equal(parseReferralSourceCookieValue(""), null);
  assert.equal(parseReferralSourceCookieValue(null), null);
  assert.equal(createReferralSourceCookieValue(null), null);
});
