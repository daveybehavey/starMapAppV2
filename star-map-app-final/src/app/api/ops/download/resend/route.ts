import { NextRequest, NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { kv } from "@/lib/kv";
import { hasValidAdminToken, readAdminTokenFromHeaders } from "@/lib/adminAuth";
import { normalizeAccountLiteEmail, getAccountLiteEmailSessions } from "@/lib/accountLite";
import { getOrCreateClaimToken, hasRecoverableAccess, type AccountAccessSessionRecord } from "@/lib/accountAccessLinks";
import { isAccountAccessEmailConfigured, sendAccountAccessAlert } from "@/lib/accountAccessAlerts";

export const runtime = "nodejs";

type RequestPayload = {
  email?: unknown;
  sessionId?: unknown;
  forceNewToken?: unknown;
};

const sessionKey = (id: string) => `stripe:session:${id}`;
const R2_BUCKET_BINDING = "NEXT_INC_CACHE_R2_BUCKET";
const ARCHIVE_PREFIX = "download-archive/hd/";

function requireAdmin(req: NextRequest) {
  const configured = process.env.PRINT_ADMIN_TOKEN?.trim() || "";
  const candidate = readAdminTokenFromHeaders(req.headers);
  return hasValidAdminToken(candidate, configured);
}

function getSiteUrl(req: NextRequest) {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (configured) return configured.replace(/\/+$/, "");
  return new URL(req.url).origin;
}

async function getR2Bucket(): Promise<R2Bucket | null> {
  const timeoutMs = 120;
  try {
    const ctx = await Promise.race([
      getCloudflareContext({ async: true }),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs)),
    ]);
    const env = (ctx as { env?: unknown } | null)?.env as Record<string, unknown> | undefined;
    const bucket = env?.[R2_BUCKET_BINDING] as R2Bucket | undefined;
    return bucket ?? null;
  } catch {
    return null;
  }
}

function archiveKey(sessionId: string) {
  return `${ARCHIVE_PREFIX}${sessionId}.png`;
}

export async function POST(req: NextRequest) {
  if (!requireAdmin(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  if (!isAccountAccessEmailConfigured()) {
    return NextResponse.json({ ok: false, error: "account_access_email_not_configured" }, { status: 503 });
  }

  let payload: RequestPayload | null = null;
  try {
    payload = (await req.json()) as RequestPayload;
  } catch {
    payload = null;
  }

  const email = normalizeAccountLiteEmail(payload?.email);
  const forcedSessionId = typeof payload?.sessionId === "string" ? payload.sessionId.trim() : "";
  const forceNewToken = Boolean(payload?.forceNewToken);

  if (!email && !forcedSessionId) {
    return NextResponse.json({ ok: false, error: "email or sessionId required" }, { status: 400 });
  }

  const resolveSessionRecord = async (sessionId: string) => {
    const record = await kv.get<AccountAccessSessionRecord>(sessionKey(sessionId));
    if (!record) return null;
    if (!hasRecoverableAccess(record)) return null;
    return record;
  };

  let sessionId = forcedSessionId;
  let record: AccountAccessSessionRecord | null = null;

  if (sessionId) {
    record = await resolveSessionRecord(sessionId);
    if (!record) {
      return NextResponse.json({ ok: false, error: "session_not_found_or_not_eligible" }, { status: 404 });
    }
  } else if (email) {
    const lookup = await getAccountLiteEmailSessions(email);
    const candidates = lookup?.sessions ?? [];
    for (const candidate of candidates) {
      const nextId = candidate.sessionId?.trim();
      if (!nextId) continue;
      const nextRecord = await resolveSessionRecord(nextId);
      if (nextRecord) {
        sessionId = nextId;
        record = nextRecord;
        break;
      }
    }
    if (!sessionId || !record) {
      return NextResponse.json({ ok: false, error: "no_paid_downloads_found" }, { status: 404 });
    }
  }

  if (!record) {
    return NextResponse.json({ ok: false, error: "unexpected_missing_record" }, { status: 500 });
  }

  const token = forceNewToken ? "" : await getOrCreateClaimToken(sessionId, record);
  const finalToken = token || (await getOrCreateClaimToken(sessionId, { ...record, claimToken: "" }));
  const link = `${getSiteUrl(req)}/download?token=${encodeURIComponent(finalToken)}`;
  const directDownloadLinkCandidate = `${getSiteUrl(req)}/api/download/archive?token=${encodeURIComponent(finalToken)}`;

  const targetEmail = email || record.customerEmail?.trim() || "";
  if (!targetEmail) {
    return NextResponse.json({ ok: false, error: "missing_customer_email" }, { status: 409 });
  }

  let directDownloadLink: string | undefined;
  const bucket = await getR2Bucket();
  if (bucket) {
    try {
      const object = await bucket.head(archiveKey(sessionId));
      if (object) {
        directDownloadLink = directDownloadLinkCandidate;
      }
    } catch {
      // ignore archive lookups
    }
  }

  const result = await sendAccountAccessAlert({ email: targetEmail, link, ...(directDownloadLink ? { directDownloadLink } : {}) });
  if (!result.delivered) {
    return NextResponse.json(
      { ok: false, error: result.error ?? "account_access_email_failed", provider: result.provider },
      { status: 502 },
    );
  }

  return NextResponse.json({
    ok: true,
    sessionId,
    provider: result.provider,
    email: targetEmail,
    link,
    directDownloadLink: directDownloadLink ?? null,
  });
}

