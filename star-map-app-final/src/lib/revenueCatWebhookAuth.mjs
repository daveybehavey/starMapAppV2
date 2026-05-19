/**
 * RevenueCat webhook Authorization header verification.
 * @see https://www.revenuecat.com/docs/integrations/webhooks
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {boolean}
 */
export function isRevenueCatWebhookAuthConfigured(env = process.env) {
  return Boolean(env.REVENUECAT_WEBHOOK_AUTH?.trim());
}

/**
 * Returns true when the request Authorization matches REVENUECAT_WEBHOOK_AUTH.
 * Accepts either the raw secret or `Bearer <secret>` when the env value is not already prefixed.
 * @param {string | null | undefined} authorizationHeader
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {boolean}
 */
export function verifyRevenueCatWebhookAuthorization(authorizationHeader, env = process.env) {
  const expected = env.REVENUECAT_WEBHOOK_AUTH?.trim();
  if (!expected) return false;

  const auth = authorizationHeader?.trim() ?? "";
  if (!auth) return false;
  if (auth === expected) return true;

  if (expected.toLowerCase().startsWith("bearer ")) {
    return auth === expected;
  }

  return auth === `Bearer ${expected}`;
}
