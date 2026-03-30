export function formatReferralOfferVariantLabel(value: string) {
  const normalized = value.trim().toLowerCase();
  if (!normalized) return "Unspecified";
  if (normalized === "referral_auto_primary") return "Auto referral offer (primary)";
  if (normalized === "referral_auto_alt") return "Auto referral offer (alternate)";
  if (normalized === "referral_auto_print_framed") return "Auto referral offer (framed print)";
  if (normalized === "referral_auto_promo") return "Auto referral discount";
  if (normalized === "manual_promo_override") return "Manual promo override";
  if (normalized === "referral_no_discount") return "No friend discount";
  if (normalized === "unspecified") return "Unspecified";
  return normalized.replace(/_/g, " ");
}

export function formatReferralSkipReasonLabel(value: string) {
  const normalized = value.trim().toLowerCase();
  if (!normalized) return "Unknown";
  if (normalized === "self_referral") return "Self-referral blocked";
  if (normalized === "reward_cap_24h_reached") return "24h reward cap reached";
  if (normalized === "reward_cap_30d_reached") return "30d reward cap reached";
  if (normalized === "repeat_customer_30d") return "Repeat-customer reward blocked (30d)";
  if (normalized === "ineligible_order") return "Ineligible order";
  if (normalized === "subscription_referrer") return "Referrer on subscription plan";
  if (normalized === "referrer_inactive") return "Referrer inactive";
  if (normalized === "code_mismatch_or_missing") return "Code mismatch or missing";
  if (normalized === "not_eligible") return "Not eligible";
  if (normalized === "unknown") return "Unknown";
  return normalized.replace(/_/g, " ");
}

export const REFERRAL_POLICY_NOTE =
  "Anti-abuse protections apply: self-referrals are blocked, reward caps can pause grants, and refunded or disputed orders reverse related rewards.";

export const REFERRAL_OFFER_MIX_EMPTY_NOTE = "No qualified referral sales in this window yet.";
export const REFERRAL_SKIP_REASONS_EMPTY_NOTE = "No reward skips in this window.";
