/**
 * Human-reviewed policy revision dates. Update the ISO date when counsel or
 * the business approves a material change to that page; "Last updated" on
 * site and `npm run qa:policy-smoke` depend on this staying accurate.
 */
export const POLICY_LAST_UPDATED_ISO = {
  privacy: "2026-02-12",
  terms: "2026-03-16",
  shipping: "2026-08-07",
  returns: "2026-08-07",
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
