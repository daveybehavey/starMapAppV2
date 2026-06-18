import type { ReferralAttribution } from "@/lib/referralAttribution";
import { readClientMarketingAttribution } from "@/lib/previewSourceHints";
import { buildGa4MarketingParamsFromStripeMetadata as buildFromMetadata } from "@/lib/commerceAnalyticsQa.mjs";

export type Ga4MarketingParams = {
  campaign?: string;
  source?: string;
  medium?: string;
  content?: string;
};

function compactMarketingParams(input: Ga4MarketingParams): Ga4MarketingParams {
  const out: Ga4MarketingParams = {};
  if (input.campaign?.trim()) out.campaign = input.campaign.trim();
  if (input.source?.trim()) out.source = input.source.trim();
  if (input.medium?.trim()) out.medium = input.medium.trim();
  if (input.content?.trim()) out.content = input.content.trim();
  return out;
}

/** Client-side GA4 event params from stored wedding/ad UTMs. */
export function buildGa4MarketingParams(attribution?: ReferralAttribution | null): Ga4MarketingParams {
  const resolved =
    attribution ?? (typeof document !== "undefined" ? readClientMarketingAttribution() : null);
  if (!resolved) return {};
  return compactMarketingParams({
    campaign: resolved.campaign ?? undefined,
    source: resolved.source ?? undefined,
    medium: resolved.medium ?? undefined,
    content: resolved.content ?? undefined,
  });
}

/** Server-side GA4 params from Stripe checkout metadata. */
export function buildGa4MarketingParamsFromStripeMetadata(
  metadata: Record<string, string | undefined> | null | undefined,
): Ga4MarketingParams {
  return buildFromMetadata(metadata) as Ga4MarketingParams;
}
