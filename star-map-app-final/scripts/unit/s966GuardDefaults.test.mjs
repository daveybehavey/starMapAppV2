/**
 * Slate 96 S96-6 — fail-safe configuration defaults.
 *
 * The print-margin guard and the referral reward caps used to default to
 * OFF / unlimited when their env vars were missing, so an env-less deploy
 * silently lost both protections. Production runs the guard enabled with
 * a $10.00 floor and caps of 3 rewards per 24h / 10 per 30d (wrangler.toml
 * and the deployed Worker settings); the code defaults now match, and
 * explicit env values still win — including an explicit opt-out.
 *
 * The guard config is read per call, so it is pinned behaviourally. The
 * referral caps are module-load constants inside the Stripe webhook
 * route, so they are pinned at source here and behaviourally in
 * moneyPathS94Followup.test.mjs (which now sets the 30d cap to an
 * explicit 0 — the deliberate opt-out — instead of deleting the var).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { register } from "node:module";

const GUARD_KEYS = [
  "PRINT_MARGIN_GUARD_ENABLED",
  "PRINT_MIN_MARGIN_CENTS",
  "NEXT_PUBLIC_PRINT_MARGIN_GUARD_ENABLED",
  "NEXT_PUBLIC_PRINT_MIN_MARGIN_CENTS",
];
const clearGuardEnv = () => {
  for (const key of GUARD_KEYS) delete process.env[key];
};
clearGuardEnv();

register("./tsAliasLoader.mjs", import.meta.url);

const { getPrintMarginGuardConfig } = await import("../../src/lib/printMargin.ts");

const read = (rel) => readFileSync(new URL(rel, import.meta.url), "utf8");

test("S96-6: margin guard defaults to production (enabled, 1000 floor) when env is unset", () => {
  clearGuardEnv();
  const config = getPrintMarginGuardConfig();
  assert.equal(config.enabled, true);
  assert.equal(config.minMarginCents, 1000);
});

test("S96-6: explicit env still overrides the margin guard defaults, including opt-out", () => {
  clearGuardEnv();
  process.env.PRINT_MARGIN_GUARD_ENABLED = "false";
  process.env.PRINT_MIN_MARGIN_CENTS = "250";
  try {
    const config = getPrintMarginGuardConfig();
    assert.equal(config.enabled, false);
    assert.equal(config.minMarginCents, 250);
  } finally {
    clearGuardEnv();
  }
});

test("S96-6: invalid margin guard env values fall back to the production defaults", () => {
  clearGuardEnv();
  process.env.PRINT_MARGIN_GUARD_ENABLED = "not-a-bool";
  process.env.PRINT_MIN_MARGIN_CENTS = "abc";
  try {
    const config = getPrintMarginGuardConfig();
    assert.equal(config.enabled, true);
    assert.equal(config.minMarginCents, 1000);
  } finally {
    clearGuardEnv();
  }
});

test("S96-6: NEXT_PUBLIC mirrors still supply the guard config when server vars are absent", () => {
  clearGuardEnv();
  process.env.NEXT_PUBLIC_PRINT_MARGIN_GUARD_ENABLED = "false";
  process.env.NEXT_PUBLIC_PRINT_MIN_MARGIN_CENTS = "250";
  try {
    const config = getPrintMarginGuardConfig();
    assert.equal(config.enabled, false);
    assert.equal(config.minMarginCents, 250);
  } finally {
    clearGuardEnv();
  }
});

test("S96-6: referral reward caps default to the production values when env is missing or invalid", () => {
  const route = read("../../src/app/api/stripe/webhook/route.ts");
  assert.match(
    route,
    /referralMaxRewardsPerReferrer30d = \(\(\) => \{[\s\S]{0,280}?return 10;/,
  );
  assert.match(
    route,
    /referralMaxRewardsPerReferrer24h = \(\(\) => \{[\s\S]{0,280}?return 3;/,
  );
});
