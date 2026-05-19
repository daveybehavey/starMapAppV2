/**
 * Registry of KV key prefixes used across the app.
 * Update when adding new persisted keys — aids ops grep and migration planning.
 *
 * Rate-limit keys use `ratelimit:` (see rateLimit.ts) and are omitted here.
 */

export const KV_KEY_PREFIXES = {
  /** Account lite email index → session list */
  accountEmail: "account:email:",
  /** Mobile / lite bearer session */
  accountSession: "account:session:",
  /** Magic-link claim token (web + mobile) */
  accountMagic: "account:magic:",
  /** Stripe checkout session record */
  stripeSession: "stripe:session:",
  /** Download claim token → session id */
  claim: "claim:",
  /** Saved map payloads */
  map: "map:",
  /** Print asset metadata */
  printAsset: "print:asset:",
  /** Print order by checkout session */
  printOrder: "print:order:",
  /** Referral code records */
  referral: "referral:",
  /** Referral event ledger keys */
  referralEvents: "referral:events:",
  /** Funnel step counters */
  funnel: "funnel:",
  /** Checkout diagnostics aggregates */
  checkoutDiagnostics: "checkout:diagnostics:",
  /** Promotion subscriber state */
  promotions: "promotions:",
  /** RevenueCat webhook dedupe */
  revenuecatWebhookEvent: "revenuecat:webhook:event:",
} as const;

export type KvKeyPrefix = (typeof KV_KEY_PREFIXES)[keyof typeof KV_KEY_PREFIXES];
