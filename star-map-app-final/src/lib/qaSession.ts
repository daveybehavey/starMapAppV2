import { hasValidAdminToken, readAdminTokenFromHeaders } from "@/lib/adminAuth";

export type QaTaggedSessionLike = {
  client_reference_id?: string | null;
  metadata?: Record<string, string | null | undefined> | null;
};

export type QaRequestContext = {
  enabled: boolean;
  source: string | null;
};

function normalizeValue(value: string | null | undefined) {
  if (typeof value !== "string") return "";
  return value.trim();
}

function normalizeLower(value: string | null | undefined) {
  return normalizeValue(value).toLowerCase();
}

export function normalizeQaSource(value: string | null | undefined) {
  return normalizeLower(value)
    .replace(/[^a-z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 48);
}

export function isQaTaggedSessionLike(session: QaTaggedSessionLike) {
  const metadata = session.metadata || {};
  const qaRun = normalizeLower(metadata.qa_run);
  const qaSource = normalizeQaSource(metadata.qa_source);
  const clientReferenceId = normalizeLower(session.client_reference_id);
  return qaRun === "true" || Boolean(qaSource) || clientReferenceId.includes("qa");
}

export function resolveQaRequestContext(headers: Headers, configuredAdminToken: string | null | undefined): QaRequestContext {
  const requestedQaRun = normalizeLower(headers.get("x-qa-run")) === "true";
  const qaSource = normalizeQaSource(headers.get("x-qa-source"));
  if (!requestedQaRun && !qaSource) {
    return { enabled: false, source: null };
  }

  const candidate = readAdminTokenFromHeaders(headers);
  if (!hasValidAdminToken(candidate, configuredAdminToken)) {
    return { enabled: false, source: null };
  }

  return {
    enabled: true,
    source: qaSource || "qa_script",
  };
}
