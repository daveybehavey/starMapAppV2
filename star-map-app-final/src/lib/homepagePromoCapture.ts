/**
 * Shared attribution for the homepage inline promo capture card (PromotionSignup).
 * UTMs stay consistent across the inline form and the post-submit editor redirect.
 */
export const HOMEPAGE_PROMO_SOURCE = "homepage_promo_inline";

export const HOMEPAGE_PROMO_UTM = {
  utm_source: "starmapco",
  utm_medium: "website",
  utm_campaign: "homepage_promo_capture",
} as const;

export type HomepagePromoEditorRedirectReason = "success" | "error" | "honeypot_success";

const UTM_CONTENT: Record<HomepagePromoEditorRedirectReason, string> = {
  success: "signup_success_editor",
  error: "signup_error_editor",
  honeypot_success: "signup_honeypot_editor",
};

/** Editor landing `source` param (distinct from KV `lastSource` on subscribe). */
const EDITOR_ATTRIBUTION_SOURCE = "homepage_promo_signup";

export function applyHomepagePromoEditorAttribution(
  url: URL,
  reason: HomepagePromoEditorRedirectReason,
): void {
  url.searchParams.set("source", EDITOR_ATTRIBUTION_SOURCE);
  url.searchParams.set("utm_source", HOMEPAGE_PROMO_UTM.utm_source);
  url.searchParams.set("utm_medium", HOMEPAGE_PROMO_UTM.utm_medium);
  url.searchParams.set("utm_campaign", HOMEPAGE_PROMO_UTM.utm_campaign);
  url.searchParams.set("utm_content", UTM_CONTENT[reason]);
}

export function isHomepagePromoInlineSource(source: string): boolean {
  return (
    source === HOMEPAGE_PROMO_SOURCE ||
    source === "promotion_signup_static" ||
    source === "homepage_static_signup"
  );
}
