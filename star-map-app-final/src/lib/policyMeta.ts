/**
 * Human-reviewed policy revision dates. Update the ISO date when counsel or
 * the business approves a material change to that page; "Last updated" on
 * site and `npm run qa:policy-smoke` depend on this staying accurate.
 */
export const POLICY_LAST_UPDATED_ISO = {
  privacy: "2026-08-08",
  // Terms content changed 2026-06-20 (delivery-timing clarification) without
  // the date moving; the 2026-10-18 digital-refund exception harmonisation
  // is the latest material change.
  terms: "2026-10-18",
  // Shipping copy changed 2026-08-13 (#236 transit wording) after the
  // 2026-08-07 claim-window update; later edits were presentational only.
  shipping: "2026-08-13",
  // Returns content harmonised with the Love-It Guarantee line 2026-10-18
  // (PR #325) after the 2026-08-07 claim-window update.
  returns: "2026-10-18",
} as const;

export type PolicyPageKey = keyof typeof POLICY_LAST_UPDATED_ISO;

export function formatPolicyLastUpdatedDisplay(isoDate: string): string {
  const d = new Date(`${isoDate}T12:00:00.000Z`);
  return new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric" }).format(d);
}

/** Line shown under the policy title (sentence case). */
export function buildPolicyLastUpdatedLine(page: PolicyPageKey): string {
  return `Last updated: ${formatPolicyLastUpdatedDisplay(POLICY_LAST_UPDATED_ISO[page])}`;
}
