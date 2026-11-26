/**
 * Security-audit invariant pins (2026-11-10 heavy audit).
 *
 * These assert behaviours that already hold on untouched main. They change
 * no production code and would fail if the pinned invariant regressed.
 */
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { register } from "node:module";

register(new URL("./moneyPathS931.hooks.mjs", import.meta.url));
register(new URL("./entitlementAuthority.hooks.mjs", import.meta.url));
register(new URL("./gaConsentMode.hooks.mjs", import.meta.url));
register(new URL("./dl1S4NextServer.hooks.mjs", import.meta.url));
register("./tsAliasLoader.mjs", import.meta.url);

import { hasValidAdminToken, readAdminTokenFromHeaders } from "../../src/lib/adminAuth.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(here, "../..");
const stripeWebhookSource = readFileSync(
  path.join(appRoot, "src/app/api/stripe/webhook/route.ts"),
  "utf8",
);
const printfulWebhookSource = readFileSync(
  path.join(appRoot, "src/app/api/printful/webhook/route.ts"),
  "utf8",
);
const logoutSource = readFileSync(
  path.join(appRoot, "src/app/api/account/magic/logout/route.ts"),
  "utf8",
);
const claimSource = readFileSync(
  path.join(appRoot, "src/app/api/entitlements/claim/route.ts"),
  "utf8",
);

const WEBHOOK_SECRET = "whsec_unit_security_audit_pin";
const PRINTFUL_SECRET = "unit-printful-webhook-secret";
process.env.STRIPE_SECRET_KEY ??= "sk_test_unit_security_audit_pin";
process.env.STRIPE_WEBHOOK_SECRET = WEBHOOK_SECRET;
process.env.PRINTFUL_WEBHOOK_SECRET = PRINTFUL_SECRET;
process.env.STARMAP_KV_ALLOW_LOCAL = "1";
delete process.env.PRINT_FULFILLMENT_WEBHOOK_URL;
delete process.env.RESEND_API_KEY;
delete process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;
delete process.env.GA4_API_SECRET;
delete process.env.NEXT_PUBLIC_POSTHOG_KEY;
delete process.env.POSTHOG_API_KEY;

globalThis.fetch = async (input) => {
  const url = typeof input === "string" ? input : input.url;
  throw new Error(`securityAuditInvariantPins: unexpected fetch ${url}`);
};

const { NextRequest } = await import("next/server");
const stripeWebhookRoute = await import("../../src/app/api/stripe/webhook/route.ts");
const printfulWebhookRoute = await import("../../src/app/api/printful/webhook/route.ts");

test("pin: adminAuth fail-closed when candidate or configured token is empty", () => {
  assert.equal(hasValidAdminToken("", "configured-token"), false);
  assert.equal(hasValidAdminToken("candidate", ""), false);
  assert.equal(hasValidAdminToken(null, "configured-token"), false);
  assert.equal(hasValidAdminToken("configured-token", null), false);
  assert.equal(hasValidAdminToken("a", "b"), false);
  assert.equal(hasValidAdminToken("same-token", "same-token"), true);
});

test("pin: adminAuth reads x-print-admin-token before Bearer", () => {
  const headers = new Headers({
    "x-print-admin-token": "from-print-header",
    authorization: "Bearer from-bearer",
  });
  assert.equal(readAdminTokenFromHeaders(headers), "from-print-header");
});

test("pin: Stripe webhook verifies HMAC on raw body before any event handling", () => {
  const postIdx = stripeWebhookSource.indexOf("export async function POST(req: Request)");
  assert.ok(postIdx > 0);
  const postBody = stripeWebhookSource.slice(postIdx, postIdx + 1200);
  assert.match(postBody, /const payload = await req\.text\(\);/);
  assert.match(postBody, /constructEvent\(payload, signature, webhookSecret\)/);
  assert.match(postBody, /Invalid signature/);
  const textIdx = postBody.indexOf("await req.text()");
  const constructIdx = postBody.indexOf("constructEvent");
  const dedupeIdx = postBody.indexOf("stripeWebhookEvent");
  assert.ok(textIdx >= 0 && constructIdx > textIdx);
  assert.ok(dedupeIdx < 0 || dedupeIdx > constructIdx);
  assert.doesNotMatch(postBody.slice(0, constructIdx), /await req\.json\(\)/);
});

test("pin: Printful webhook auth runs before JSON parse / handlers", () => {
  const postIdx = printfulWebhookSource.indexOf("export async function POST(req: NextRequest)");
  assert.ok(postIdx > 0);
  const postBody = printfulWebhookSource.slice(postIdx, postIdx + 900);
  const verifyIdx = postBody.indexOf("verifyWebhookToken(req)");
  const jsonIdx = postBody.indexOf("await req.json()");
  const handleIdx = postBody.indexOf("handlePackageShipped");
  assert.ok(verifyIdx >= 0);
  assert.ok(jsonIdx > verifyIdx);
  assert.ok(handleIdx > jsonIdx);
  assert.match(postBody, /Unauthorized/);
  assert.match(printfulWebhookSource, /timingSafeEqual/);
  assert.match(printfulWebhookSource, /if \(!configured\) return false;/);
});

test("pin: premium/account Set-Cookie paths keep HttpOnly + SameSite=Lax", () => {
  assert.match(claimSource, /httpOnly:\s*true/);
  assert.match(claimSource, /sameSite:\s*"lax"/);
  assert.match(logoutSource, /httpOnly:\s*true/);
  assert.match(logoutSource, /sameSite:\s*"lax"/);
  assert.match(logoutSource, /maxAge:\s*0/);
});

test("pin: Printful webhook GET rejects missing/wrong token with 401", async () => {
  const missing = await printfulWebhookRoute.GET(
    new NextRequest("https://starmapco.test/api/printful/webhook", { method: "GET" }),
  );
  assert.equal(missing.status, 401);

  const wrong = await printfulWebhookRoute.GET(
    new NextRequest("https://starmapco.test/api/printful/webhook?token=wrong-token", {
      method: "GET",
    }),
  );
  assert.equal(wrong.status, 401);

  const ok = await printfulWebhookRoute.GET(
    new NextRequest(
      `https://starmapco.test/api/printful/webhook?token=${PRINTFUL_SECRET}`,
      { method: "GET" },
    ),
  );
  assert.equal(ok.status, 200);
  const body = await ok.json();
  assert.equal(body.ok, true);
});

test("pin: Stripe webhook rejects missing and invalid signatures before side effects", async () => {
  const missingSig = await stripeWebhookRoute.POST(
    new Request("https://starmapco.test/api/stripe/webhook", {
      method: "POST",
      body: JSON.stringify({ id: "evt_missing_sig" }),
      headers: { "content-type": "application/json" },
    }),
  );
  assert.equal(missingSig.status, 400);
  assert.match(await missingSig.text(), /Missing signature|Invalid signature/i);

  const t = Math.floor(Date.now() / 1000);
  const payload = JSON.stringify({ id: "evt_bad_sig", object: "event", type: "ping" });
  const badSig = createHmac("sha256", "wrong_secret").update(`${t}.${payload}`).digest("hex");
  const invalid = await stripeWebhookRoute.POST(
    new Request("https://starmapco.test/api/stripe/webhook", {
      method: "POST",
      body: payload,
      headers: {
        "content-type": "application/json",
        "stripe-signature": `t=${t},v1=${badSig}`,
      },
    }),
  );
  assert.equal(invalid.status, 400);
  assert.match(await invalid.text(), /Invalid signature/);
});
