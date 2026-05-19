/**
 * RevenueCat webhook Authorization header verification.
 * @see https://www.revenuecat.com/docs/integrations/webhooks
 */
export function isRevenueCatWebhookAuthConfigured(env?: NodeJS.ProcessEnv): boolean;

/**
 * Returns true when the request Authorization matches REVENUECAT_WEBHOOK_AUTH.
 */
export function verifyRevenueCatWebhookAuthorization(
  authorizationHeader: string | null | undefined,
  env?: NodeJS.ProcessEnv,
): boolean;
