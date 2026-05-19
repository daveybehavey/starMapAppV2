import assert from "node:assert/strict";
import test from "node:test";
import {
  isRevenueCatWebhookAuthConfigured,
  verifyRevenueCatWebhookAuthorization,
} from "../../src/lib/revenueCatWebhookAuth.mjs";

test("isRevenueCatWebhookAuthConfigured", () => {
  assert.equal(isRevenueCatWebhookAuthConfigured({}), false);
  assert.equal(isRevenueCatWebhookAuthConfigured({ REVENUECAT_WEBHOOK_AUTH: "  " }), false);
  assert.equal(
    isRevenueCatWebhookAuthConfigured({ REVENUECAT_WEBHOOK_AUTH: "secret" }),
    true,
  );
});

test("verifyRevenueCatWebhookAuthorization", () => {
  const env = { REVENUECAT_WEBHOOK_AUTH: "my-secret" };

  assert.equal(verifyRevenueCatWebhookAuthorization(null, env), false);
  assert.equal(verifyRevenueCatWebhookAuthorization("", env), false);
  assert.equal(verifyRevenueCatWebhookAuthorization("wrong", env), false);
  assert.equal(verifyRevenueCatWebhookAuthorization("my-secret", env), true);
  assert.equal(verifyRevenueCatWebhookAuthorization("Bearer my-secret", env), true);
  assert.equal(verifyRevenueCatWebhookAuthorization("Bearer wrong", env), false);

  const bearerEnv = { REVENUECAT_WEBHOOK_AUTH: "Bearer token-abc" };
  assert.equal(verifyRevenueCatWebhookAuthorization("Bearer token-abc", bearerEnv), true);
  assert.equal(verifyRevenueCatWebhookAuthorization("token-abc", bearerEnv), false);
});
