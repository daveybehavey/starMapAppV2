import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { kv } from "@/lib/kv";
import { checkRateLimit, getClientIp, rateLimitResponse } from "@/lib/rateLimit";
import { getAccountLiteEmailSessions, normalizeAccountLiteEmail } from "@/lib/accountLite";
import {
  isAccountRecoveryEmailConfigured,
  sendAccountRecoveryAlert,
  type AccountRecoveryLinkItem,
} from "@/lib/accountRecoveryAlerts";
import { PREMIUM_COOKIE_TTL_SECONDS } from "@/lib/premium";
import type { CheckoutOrderType, CheckoutPlan, PrintVariant } from "@/lib/pricing";

export const runtime = "nodejs";

const CLAIM_TOKEN_TTL_SECONDS = PREMIUM_COOKIE_TTL_SECONDS;
const MAX_LINKS_PER_EMAIL = 5;
const MAX_SCANNED_SESSIONS = 20;
const SUPPORT_EMAIL = process.env.NEXT_PUBLIC_SUPPORT_EMAIL?.trim() || "support@starmapco.com";

type SessionRecord = {
  paid?: boolean;
  revoked?: boolean;
  created?: number;
  mapId?: string;
  plan?: CheckoutPlan;
  creditsRemaining?: number;
  subscriptionActive?: boolean;
  orderType?: CheckoutOrderType;
  printVariant?: PrintVariant;
  includesDigitalAddOn?: boolean;
  customerEmail?: string | null;
  claimToken?: string;
};

type ClaimRecord = {
  sessionId: string;
  mapId?: string;
  createdAt: number;
};

type RecoveryRequestPayload = {
  email?: unknown;
};

const sessionKey = (id: string) => `stripe:session:${id}`;
const claimKey = (token: string) => `claim:${token}`;

function isValidEmail(input: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input);
}

function hashEmail(normalizedEmail: string) {
  return createHash("sha256").update(normalizedEmail).digest("base64url").slice(0, 40);
}

function hasRecoverableAccess(record: SessionRecord) {
  if (record.revoked) return false;
  const isPrintOnly = record.orderType === "print" && !record.includesDigitalAddOn;
  if (isPrintOnly) return false;
  if (record.plan === "subscription") return Boolean(record.subscriptionActive);
  const creditsRemaining = typeof record.creditsRemaining === "number" ? record.creditsRemaining : 0;
  return creditsRemaining > 0 || Boolean(record.paid);
}

function getOfferLabel(record: SessionRecord, fallbackPlan: CheckoutPlan | undefined) {
  if (record.orderType === "print") {
    const printLabel = record.printVariant === "poster_framed" ? "Framed print order" : "Unframed print order";
    return record.includesDigitalAddOn ? `${printLabel} + HD add-on` : printLabel;
  }
  const plan = record.plan ?? fallbackPlan;
  if (plan === "pack3") return "3 HD export credits";
  if (plan === "subscription") return "Unlimited HD plan";
  return "Single HD download";
}

async function getOrCreateClaimToken(sessionId: string, record: SessionRecord) {
  let token = record.claimToken?.trim() || "";
  if (token) {
    const existing = await kv.get<ClaimRecord>(claimKey(token));
    if (!existing || existing.sessionId !== sessionId) {
      token = "";
    }
  }

  if (!token) {
    token = crypto.randomUUID();
    const claim: ClaimRecord = {
      sessionId,
      mapId: record.mapId,
      createdAt: Date.now(),
    };
    await kv.set(claimKey(token), claim, { ex: CLAIM_TOKEN_TTL_SECONDS });
    await kv.set(sessionKey(sessionId), {
      ...record,
      claimToken: token,
    });
  }

  return token;
}

function genericSuccess() {
  return NextResponse.json({
    ok: true,
    message: "If that email matches a paid order, recovery links were sent.",
  });
}

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  const ipRateLimit = await checkRateLimit(`account:recover:ip:${ip}`, 12, 60 * 60);
  if (!ipRateLimit.allowed) {
    return rateLimitResponse(ipRateLimit.resetIn);
  }

  let payload: RecoveryRequestPayload | null = null;
  try {
    payload = (await req.json()) as RecoveryRequestPayload;
  } catch {
    return NextResponse.json({ ok: false, error: "valid email required" }, { status: 400 });
  }

  const email = normalizeAccountLiteEmail(payload?.email);
  if (!email || !isValidEmail(email)) {
    return NextResponse.json({ ok: false, error: "valid email required" }, { status: 400 });
  }

  if (!isAccountRecoveryEmailConfigured()) {
    return NextResponse.json(
      {
        ok: false,
        error: "recovery_email_not_configured",
        supportEmail: SUPPORT_EMAIL,
      },
      { status: 503 },
    );
  }

  const emailHash = hashEmail(email);
  const emailRateLimit = await checkRateLimit(`account:recover:email:${emailHash}`, 4, 60 * 60);
  if (!emailRateLimit.allowed) {
    return rateLimitResponse(emailRateLimit.resetIn);
  }

  const lookup = await getAccountLiteEmailSessions(email);
  if (!lookup?.sessions?.length) {
    return genericSuccess();
  }

  const origin = new URL(req.url).origin;
  const links: AccountRecoveryLinkItem[] = [];
  for (const indexed of lookup.sessions.slice(0, MAX_SCANNED_SESSIONS)) {
    if (links.length >= MAX_LINKS_PER_EMAIL) break;
    if (!indexed?.sessionId) continue;
    const current = await kv.get<SessionRecord>(sessionKey(indexed.sessionId));
    if (!current || !hasRecoverableAccess(current)) continue;
    const currentEmail = normalizeAccountLiteEmail(current.customerEmail);
    if (currentEmail && currentEmail !== email) continue;

    const token = await getOrCreateClaimToken(indexed.sessionId, current);
    links.push({
      label: getOfferLabel(current, indexed.plan),
      url: `${origin}/download?token=${encodeURIComponent(token)}`,
      createdAt:
        typeof indexed.createdAt === "number" && Number.isFinite(indexed.createdAt)
          ? indexed.createdAt
          : typeof current.created === "number"
            ? current.created
            : Date.now(),
    });
  }

  if (!links.length) {
    return genericSuccess();
  }

  const alertResult = await sendAccountRecoveryAlert({
    email,
    links,
  });
  if (!alertResult.delivered) {
    console.warn("Account recovery email delivery failed", {
      provider: alertResult.provider,
      error: alertResult.error,
      emailHash,
    });
  }

  return genericSuccess();
}
