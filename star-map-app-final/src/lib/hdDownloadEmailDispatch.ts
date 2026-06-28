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
import { ENTITLEMENT_KV } from "@/lib/entitlementsStore";
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

  const sessionKey = ENTITLEMENT_KV.stripeSession(input.sessionId);
  const current = await kv.get<AccountAccessSessionRecord>(sessionKey);
  if (current) {
    await kv.set(sessionKey, {
      ...current,
      accessEmailSentAt: result.delivered ? Date.now() : current.accessEmailSentAt,
      accessEmailHadArchive: result.delivered ? Boolean(result.includedArchiveLink) : current.accessEmailHadArchive,
      accessEmailProvider: result.provider,
      accessEmailError: result.delivered ? undefined : result.error,
    });
  }

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

  const email = typeof record.customerEmail === "string" ? record.customerEmail.trim() : "";
  if (!email) {
    return { delivered: false, provider: "none", skipped: true, reason: "missing_customer_email" };
  }

  if (record.accessEmailHadArchive) {
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

  if (result.delivered) {
    await kv.set(sessionKey, {
      ...record,
      hdArchiveEmailSentAt: Date.now(),
      accessEmailHadArchive: true,
      accessEmailProvider: result.provider,
      accessEmailError: undefined,
    });
  } else {
    await kv.set(sessionKey, {
      ...record,
      accessEmailError: result.error,
      accessEmailProvider: result.provider,
    });
  }

  return result;
}
