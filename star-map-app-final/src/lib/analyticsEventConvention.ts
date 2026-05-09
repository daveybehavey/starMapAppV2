/**
 * PostHog / GA naming hygiene — keep funnels grep-friendly and stable.
 *
 * - Use **snake_case** for PostHog event names where we control the string (e.g. `checkout_started`).
 * - Prefix funnel steps with a clear domain: `paywall_*`, `checkout_*`, `editor_*`, `referral_*`.
 * - When adding ecommerce payloads, align `item_list_id` / `item_id` with `src/lib/pricing.ts` plan and print variant ids.
 * - Do not rename shipped events without a migration note; dashboards break on renames.
 *
 * Implementations should import helpers from `analytics.ts` and pass explicit names — avoid stringly-typed
 * `capture("event_" + x)` at call sites without centralizing the prefix here or in a small enum.
 */

export const ANALYTICS_EVENT_PREFIXES = {
  paywall: "paywall",
  checkout: "checkout",
  editor: "editor",
  referral: "referral",
  funnel: "funnel",
} as const;
