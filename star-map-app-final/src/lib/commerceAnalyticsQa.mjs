/**
 * QA / marketing helpers (plain JS for node --test and TS imports).
 */

const QA_METADATA_FLAG = /^(1|true|yes)$/i;

/** @param {{ metadata?: Record<string, string | undefined> | null; client_reference_id?: string | null }} session */
export function isQaStripeSession(session) {
  if (!session) return false;
  const meta = session.metadata ?? {};
  if (QA_METADATA_FLAG.test(String(meta.qa_run ?? "").trim())) return true;
  if (QA_METADATA_FLAG.test(String(meta.qa_ops_checkout ?? "").trim())) return true;
  const qaSource = String(meta.qa_source ?? "")
    .trim()
    .toLowerCase();
  if (qaSource.startsWith("live_conversion") || qaSource.startsWith("live_print_conversion")) return true;
  const ref = typeof session.client_reference_id === "string" ? session.client_reference_id.trim() : "";
  if (ref === "qa-live-conversion") return true;
  return false;
}

/** @param {Record<string, string>} metadata @param {{ source?: string; medium?: string; campaign?: string; content?: string } | null} attribution */
export function applyMarketingAttributionMetadata(metadata, attribution) {
  if (!attribution) return;
  if (attribution.source) metadata.marketing_source = attribution.source;
  if (attribution.medium) metadata.marketing_medium = attribution.medium;
  if (attribution.campaign) metadata.marketing_campaign = attribution.campaign;
  if (attribution.content) metadata.marketing_content = attribution.content;
}

/** @param {Record<string, string | undefined> | null | undefined} metadata */
export function buildGa4MarketingParamsFromStripeMetadata(metadata) {
  if (!metadata) return {};
  const out = {};
  if (metadata.marketing_campaign) out.campaign = metadata.marketing_campaign;
  if (metadata.marketing_source) out.source = metadata.marketing_source;
  if (metadata.marketing_medium) out.medium = metadata.marketing_medium;
  if (metadata.marketing_content) out.content = metadata.marketing_content;
  return out;
}
