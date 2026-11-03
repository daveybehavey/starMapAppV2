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

/**
 * A failure sidecar in its resumable-release state: once a claim
 * release has consumed the failure evidence, `releaseConsumedAt` is
 * stamped INTO the sidecar so a partially completed release (evidence
 * consumed, claim delete failed) can be resumed by a later pass
 * instead of stranding the claim forever.
 */
type HdEmailResultRecordWithReleaseState = HdEmailResultRecord & {
  releaseConsumedAt?: number;
  releaseId?: string;
};

let releaseSequence = 0;

function newReleaseId(): string {
  releaseSequence += 1;
  return `rel_${Date.now().toString(36)}_${releaseSequence.toString(36)}_${Math.random()
    .toString(36)
    .slice(2, 10)}`;
}

/**
 * Consume a recorded failure sidecar and release its dedupe claim —
 * the S96-1 F5 fix, made resumable (Codex P2 on PR #502). Protocol:
 *
 *   1. Stamp `releaseConsumedAt` into the sidecar (unless already
 *      stamped). From this moment the failure is consumed: no later
 *      pass may treat the record as fresh evidence, and the stamped
 *      sidecar authorises resuming the release.
 *   2. Delete the claim.
 *   3. Delete the sidecar. Only an ABSENT sidecar means "release
 *      complete", which is what the post-dispatch outcome-loss path
 *      relies on (S93-1): a delivered retry whose outcome write failed
 *      has no sidecar at the next claim, so it is never released.
 *
 * Any step throwing aborts the pass with the failure surfaced (the
 * claim increment has not happened yet, so the caller sees an error,
 * not a send). The next pass re-reads the stamped sidecar and resumes
 * at the first incomplete step — a transient delete failure delays
 * the retry by one pass instead of sealing the session's email.
 *
 * Ownership (gate round 5, local Codex seat P2-A): the protocol above
 * made an interrupted release resumable but gave concurrent releasers
 * no exclusion — two passes holding the same failure read could both
 * release, and the slower one stamped over the faster one's DELIVERED
 * sidecar, deleted its fresh claim, re-incremented to 1 and sent a
 * duplicate. The release therefore re-reads the sidecar before
 * mutating anything: the caller's `prior` is only the trigger, never
 * the authority. An absent sidecar (a concurrent release completed)
 * or a delivered one (a concurrent retry already delivered) ends the
 * release untouched, and the stamp carries a `releaseId`: the pass
 * that stamps owns the release, a pass that finds a stamp adopts that
 * release, and ownership is re-verified immediately before each
 * delete, so a pass whose view went stale mid-release backs out
 * before it can destroy a fresh claim or delivered evidence. Two
 * passes adopting the SAME stamped release may both run the deletes
 * (they are idempotent); the caller's atomic claim increment remains
 * the final arbiter of who dispatches.
 */
async function consumeFailureEvidenceAndReleaseClaim(input: {
  sidecarKey: string;
  claimKey: string;
  prior: HdEmailResultRecordWithReleaseState;
}): Promise<void> {
  const readStanding = () =>
    kv.getErrorPreserving<HdEmailResultRecordWithReleaseState>(input.sidecarKey);

  const fresh = await readStanding();
  if (fresh == null) return;
  if (fresh.deliveredAt != null) return;

  let releaseId = fresh.releaseId;
  if (fresh.releaseConsumedAt == null) {
    releaseId = newReleaseId();
    await kv.setDurable(input.sidecarKey, {
      ...fresh,
      releaseConsumedAt: Date.now(),
      releaseId,
    });
  }

  const stillOwned = async (): Promise<boolean> => {
    const standing = await readStanding();
    return (
      standing != null &&
      standing.deliveredAt == null &&
      standing.releaseConsumedAt != null &&
      standing.releaseId === releaseId
    );
  };
  if (!(await stillOwned())) return;
  await kv.deleteDurable(input.claimKey);
  if (!(await stillOwned())) return;
  await kv.deleteDurable(input.sidecarKey);
}

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

  // S96-1 F5: the dedupe claim below is taken BEFORE dispatch, so a
  // failed first send used to stand forever — every replay read the
  // counter as "already_sent" even though nothing was delivered and a
  // later pass could have succeeded. Release the claim ONLY on recorded
  // evidence: the initial-result sidecar holds a failure outcome
  // (present, no deliveredAt) from a previous attempt. A delivered
  // record keeps the claim; an absent or unreadable sidecar changes
  // nothing, so an outcome lost after dispatch keeps the S93-1
  // exactly-once residual rather than risking a duplicate email. (The
  // release is ownership-checked — see the helper: a pass acting on a
  // stale read of this sidecar can neither stamp over a delivered
  // record nor delete a concurrent pass's fresh claim.)
  let priorInitialResult: HdEmailResultRecord | null = null;
  try {
    priorInitialResult = await kv.getErrorPreserving<HdEmailResultRecord>(
      ENTITLEMENT_KV.hdInitialEmailResult(input.sessionId),
    );
  } catch {
    priorInitialResult = null;
  }
  if (priorInitialResult != null && priorInitialResult.deliveredAt == null) {
    await consumeFailureEvidenceAndReleaseClaim({
      sidecarKey: ENTITLEMENT_KV.hdInitialEmailResult(input.sessionId),
      claimKey: ENTITLEMENT_KV.accessEmailDedupe(input.sessionId),
      prior: priorInitialResult,
    });
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

  // S96-1 F5: same claim release as the initial path. A recorded
  // archive-ready failure (sidecar present, no deliveredAt) releases
  // the claim so this pass retries the send; a delivered outcome was
  // already handled by the archive_already_emailed check above when it
  // carried the archive, and without the archive link a delivered
  // record still keeps its claim below (no duplicate follow-up).
  if (archiveEmailResult != null && archiveEmailResult.deliveredAt == null) {
    await consumeFailureEvidenceAndReleaseClaim({
      sidecarKey: ENTITLEMENT_KV.hdArchiveEmailResult(input.sessionId),
      claimKey: ENTITLEMENT_KV.hdArchiveEmailDedupe(input.sessionId),
      prior: archiveEmailResult,
    });
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
