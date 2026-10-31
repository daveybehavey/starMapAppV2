import {
  getOrCreateClaimToken,
  hasRecoverableAccess,
  type AccountAccessSessionRecord,
} from "@/lib/accountAccessLinks";
import { buildDownloadClaimUrl } from "@/lib/accountMagicLinkIssue";
import {
  isAccountAccessEmailConfigured,
  sendAccountAccessAlert,
  type AccountAccessAlertResult,
} from "@/lib/accountAccessAlerts";
import {
  buildHdArchiveDownloadUrl,
  hdArchiveObjectExists,
} from "@/lib/downloadArchiveStorage";
import {
  ENTITLEMENT_KV,
  SETTLEMENT_SCHEMA_VERSION,
  withSettlementMetadata,
  type HdEmailResultRecord,
} from "@/lib/entitlementsStore";
import { kv } from "@/lib/kv";

const ACCESS_EMAIL_TTL_SECONDS = 45 * 24 * 60 * 60;
const HD_ARCHIVE_EMAIL_TTL_SECONDS = 45 * 24 * 60 * 60;

export type HdDownloadEmailDispatchResult = AccountAccessAlertResult & {
  skipped?: boolean;
  reason?: string;
  primaryLink?: string;
  includedArchiveLink?: boolean;
};

function getSupportEmail() {
  return process.env.NEXT_PUBLIC_SUPPORT_EMAIL?.trim() || "support@starmapco.com";
}

async function resolveHdDownloadLinks(input: {
  siteOrigin: string;
  sessionId: string;
  record: AccountAccessSessionRecord;
  directDownloadLinkOverride?: string;
}) {
  const claimToken = await getOrCreateClaimToken(input.sessionId, input.record);
  const downloadPageLink = buildDownloadClaimUrl(input.siteOrigin, claimToken);
  let archiveLink = input.directDownloadLinkOverride?.trim() || "";
  if (!archiveLink) {
    const archiveReady = await hdArchiveObjectExists(input.sessionId);
    if (archiveReady) {
      archiveLink = buildHdArchiveDownloadUrl(input.siteOrigin, claimToken);
    }
  }
  const primaryLink = archiveLink || downloadPageLink;
  const backupPageLink =
    archiveLink && archiveLink !== downloadPageLink ? downloadPageLink : undefined;
  return {
    primaryLink,
    backupPageLink,
    includedArchiveLink: Boolean(archiveLink),
  };
}

/** Transactional HD email — direct file URL when archived, otherwise secure download page. No magic links. */
export async function dispatchHdPurchaseDownloadEmail(input: {
  siteOrigin: string;
  email: string;
  sessionId: string;
  record: AccountAccessSessionRecord;
  directDownloadLinkOverride?: string;
  /** Follow-up when PNG was archived after the first email. */
  variant?: "initial" | "archive_ready";
}): Promise<HdDownloadEmailDispatchResult> {
  if (!isAccountAccessEmailConfigured()) {
    return { delivered: false, provider: "none", error: "account_access_email_not_configured" };
  }

  const { primaryLink, backupPageLink, includedArchiveLink } = await resolveHdDownloadLinks(input);
  const mode = input.variant === "archive_ready" ? "hd_archive_ready" : "hd";

  const result = await sendAccountAccessAlert({
    email: input.email,
    link: primaryLink,
    directDownloadLink: backupPageLink,
    mode,
    supportEmail: getSupportEmail(),
  });

  return {
    ...result,
    primaryLink,
    includedArchiveLink,
  };
}

export async function trySendInitialHdPurchaseEmail(input: {
  siteOrigin: string;
  email: string;
  sessionId: string;
  record: AccountAccessSessionRecord;
}): Promise<HdDownloadEmailDispatchResult> {
  if (!hasRecoverableAccess(input.record)) {
    return { delivered: false, provider: "none", skipped: true, reason: "not_eligible" };
  }

  const shouldSend = await kv.incr(ENTITLEMENT_KV.accessEmailDedupe(input.sessionId), 1, {
    ex: ACCESS_EMAIL_TTL_SECONDS,
  });
  if (shouldSend !== 1) {
    return { delivered: false, provider: "none", skipped: true, reason: "already_sent" };
  }

  const result = await dispatchHdPurchaseDownloadEmail({
    ...input,
    variant: "initial",
  });

  // S93-1 item 2 (W2): the outcome is recorded in the per-variant
  // sidecar record — NEVER by replacing the session record. The old
  // bookkeeping re-read the session and put a whole-record spread back;
  // any settlement, consume, debit, or revocation landing between that
  // read and the put was silently overwritten. There is no
  // bookkeeping-only session re-read any more. A persistence failure
  // propagates: the send happened, and an unrecorded outcome must
  // surface rather than masquerade as recorded. (The dispatch dedupe
  // counter above still bounds sends; an outcome lost after dispatch
  // can suppress a later retry — the retained exactly-once residual in
  // the S93-1 design.)
  const resultRecord: HdEmailResultRecord = {
    schemaVersion: SETTLEMENT_SCHEMA_VERSION,
    sessionId: input.sessionId,
    variant: "initial",
    provider: result.provider,
    error: result.delivered ? undefined : result.error,
    deliveredAt: result.delivered ? Date.now() : undefined,
    includedArchive: result.delivered ? Boolean(result.includedArchiveLink) : undefined,
    recordedAt: Date.now(),
  };
  await kv.setDurable(ENTITLEMENT_KV.hdInitialEmailResult(input.sessionId), resultRecord);

  return result;
}

/** After client uploads PNG to R2, email direct file link if the first email did not include it. */
export async function trySendHdArchiveReadyEmail(input: {
  siteOrigin: string;
  sessionId: string;
}): Promise<HdDownloadEmailDispatchResult> {
  const sessionKey = ENTITLEMENT_KV.stripeSession(input.sessionId);
  const record = await kv.get<AccountAccessSessionRecord>(sessionKey);
  if (!record || !hasRecoverableAccess(record)) {
    return { delivered: false, provider: "none", skipped: true, reason: "not_eligible" };
  }

  // The customer email may have been completed into the settlement-
  // metadata sidecar (fix round 4, PR #447); this read uses the merged
  // view. Outcome bookkeeping in this module is sidecar-only (S93-1
  // item 2): nothing here writes the session record.
  const mergedRecord = await withSettlementMetadata(input.sessionId, record);
  const email = typeof mergedRecord.customerEmail === "string" ? mergedRecord.customerEmail.trim() : "";
  if (!email) {
    return { delivered: false, provider: "none", skipped: true, reason: "missing_customer_email" };
  }

  // "Archive already emailed" is decided by the legacy inline flag OR a
  // successful archive-bearing outcome in either HD result sidecar
  // (initial or archive-ready). The sidecar reads are error-preserving:
  // an unreadable result must not be treated as absence, so a read
  // failure propagates and no dispatch happens.
  const [initialEmailResult, archiveEmailResult] = await Promise.all([
    kv.getErrorPreserving<HdEmailResultRecord>(ENTITLEMENT_KV.hdInitialEmailResult(input.sessionId)),
    kv.getErrorPreserving<HdEmailResultRecord>(ENTITLEMENT_KV.hdArchiveEmailResult(input.sessionId)),
  ]);
  const sidecarShowsArchiveEmailed = [initialEmailResult, archiveEmailResult].some(
    (emailResult) =>
      emailResult != null && emailResult.deliveredAt != null && emailResult.includedArchive === true,
  );
  if (record.accessEmailHadArchive || sidecarShowsArchiveEmailed) {
    return { delivered: false, provider: "none", skipped: true, reason: "archive_already_emailed" };
  }

  const archiveReady = await hdArchiveObjectExists(input.sessionId);
  if (!archiveReady) {
    return { delivered: false, provider: "none", skipped: true, reason: "archive_not_ready" };
  }

  const shouldSend = await kv.incr(ENTITLEMENT_KV.hdArchiveEmailDedupe(input.sessionId), 1, {
    ex: HD_ARCHIVE_EMAIL_TTL_SECONDS,
  });
  if (shouldSend !== 1) {
    return { delivered: false, provider: "none", skipped: true, reason: "archive_email_already_sent" };
  }

  const result = await dispatchHdPurchaseDownloadEmail({
    siteOrigin: input.siteOrigin,
    email,
    sessionId: input.sessionId,
    record,
    variant: "archive_ready",
  });

  // S93-1 item 2 (W3/W4): delivered and failed outcomes alike are
  // recorded in the archive-ready sidecar record. The old branches put
  // whole-record spreads of the (by now long-held) `record` snapshot
  // back onto the session key — a failed email could overwrite
  // accounting or revocation state just as a delivered one could. A
  // persistence failure propagates, as in the initial path.
  const resultRecord: HdEmailResultRecord = {
    schemaVersion: SETTLEMENT_SCHEMA_VERSION,
    sessionId: input.sessionId,
    variant: "archive_ready",
    provider: result.provider,
    error: result.delivered ? undefined : result.error,
    deliveredAt: result.delivered ? Date.now() : undefined,
    includedArchive: result.delivered ? Boolean(result.includedArchiveLink) : undefined,
    recordedAt: Date.now(),
  };
  await kv.setDurable(ENTITLEMENT_KV.hdArchiveEmailResult(input.sessionId), resultRecord);

  return result;
}
