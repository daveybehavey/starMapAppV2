export type ReferralAttribution = {
  source?: string;
  medium?: string;
  campaign?: string;
  content?: string;
};

type SearchParamReader = {
  get: (name: string) => string | null;
};

const MAX_ATTRIBUTION_LENGTH = 64;

function normalizeAttributionValue(raw: unknown): string | undefined {
  if (typeof raw !== "string") return undefined;
  const trimmed = raw.trim().toLowerCase();
  if (!trimmed) return undefined;
  const collapsed = trimmed
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9._-]/g, "")
    .slice(0, MAX_ATTRIBUTION_LENGTH);
  return collapsed || undefined;
}

export function normalizeReferralAttribution(input: {
  source?: unknown;
  medium?: unknown;
  campaign?: unknown;
  content?: unknown;
}): ReferralAttribution | null {
  const source = normalizeAttributionValue(input.source);
  const medium = normalizeAttributionValue(input.medium);
  const campaign = normalizeAttributionValue(input.campaign);
  const content = normalizeAttributionValue(input.content);
  if (!source && !medium && !campaign && !content) return null;
  return { source, medium, campaign, content };
}

export function getReferralAttributionFromSearchParams(
  searchParams: SearchParamReader,
): ReferralAttribution | null {
  return normalizeReferralAttribution({
    source: searchParams.get("ref_src") ?? searchParams.get("utm_source"),
    medium: searchParams.get("utm_medium"),
    campaign: searchParams.get("utm_campaign"),
    content: searchParams.get("utm_content"),
  });
}
