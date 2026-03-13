export type ReferralSharePlatform = "copy" | "native" | "x" | "facebook" | "pinterest";
export type ReferralShareSurface = "download" | "success";

const DEFAULT_REFERRAL_FRIEND_OFFER = "a special referral offer on their first HD map";
const SHARE_MESSAGE_BASE = "I made a custom star map with StarMapCo. Preview yours free in seconds.";

export function getReferralFriendOfferLabel() {
  const configured = process.env.NEXT_PUBLIC_REFERRAL_FRIEND_OFFER_LABEL?.trim();
  return configured && configured.length > 0 ? configured : DEFAULT_REFERRAL_FRIEND_OFFER;
}

export function getReferralShareMessage() {
  return `${SHARE_MESSAGE_BASE} Use my link for ${getReferralFriendOfferLabel()}.`;
}

export function buildReferralShareUrl(input: {
  referralUrl: string;
  platform: ReferralSharePlatform;
  surface: ReferralShareSurface;
}) {
  try {
    const next = new URL(input.referralUrl);
    const source =
      input.platform === "copy" || input.platform === "native" ? "social" : input.platform;
    next.searchParams.set("ref_src", `${input.surface}_${input.platform}`);
    next.searchParams.set("utm_source", source);
    next.searchParams.set("utm_medium", "referral_social");
    next.searchParams.set("utm_campaign", "free_hd_referral");
    next.searchParams.set("utm_content", `${input.surface}_${input.platform}`);
    return next.toString();
  } catch {
    return input.referralUrl;
  }
}
