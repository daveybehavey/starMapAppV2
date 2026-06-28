/**
 * Client marketing attribution storage for Node unit tests.
 * Keep in sync with marketingAttributionStorage.ts.
 */

/** @type {Map<string, string>} */
const memoryStorage = new Map();

export const MARKETING_ATTRIBUTION_STORAGE_KEY = "starmap_mkt_attr";

export function resetMarketingAttributionStorageForTests() {
  memoryStorage.clear();
}

/** @param {{ source?: string; medium?: string; campaign?: string; content?: string }} attribution */
export function storeClientMarketingAttribution(attribution) {
  if (!attribution) return;
  const normalized = {
    source: attribution.source?.trim().toLowerCase(),
    medium: attribution.medium?.trim().toLowerCase(),
    campaign: attribution.campaign?.trim().toLowerCase(),
    content: attribution.content?.trim().toLowerCase(),
  };
  if (!normalized.source && !normalized.medium && !normalized.campaign && !normalized.content) return;
  memoryStorage.set(MARKETING_ATTRIBUTION_STORAGE_KEY, JSON.stringify(normalized));
}

export function readStoredClientMarketingAttribution() {
  const raw = memoryStorage.get(MARKETING_ATTRIBUTION_STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
