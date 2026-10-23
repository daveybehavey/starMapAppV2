import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit, getClientIp, rateLimitResponse } from "@/lib/rateLimit";
import { getAccountLiteEmailSessions, normalizeAccountLiteEmail } from "@/lib/accountLite";
import { kv } from "@/lib/kv";
import {
  ACCOUNT_LITE_MAGIC_LINK_TTL_SECONDS,
  accountLiteMagicKey,
} from "@/lib/accountLiteAuth";
import {
  createConsistencyCoordinatorClient,
  magicCoordinatorName,
} from "@/lib/consistencyCoordinator";
import {
  isAccountMagicLinkEmailConfigured,
  sendAccountMagicLinkAlert,
} from "@/lib/accountMagicLinkAlerts";

export const runtime = "nodejs";

const SUPPORT_EMAIL = process.env.NEXT_PUBLIC_SUPPORT_EMAIL?.trim() || "support@starmapco.com";

type RequestPayload = {
  email?: unknown;
};

type MagicLinkRecord = {
  email: string;
  emailHash: string;
  createdAt: number;
  usedAt?: number;
};

function isValidEmail(input: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input);
}

function hashEmail(normalizedEmail: string) {
  return createHash("sha256").update(normalizedEmail).digest("base64url").slice(0, 40);
}

function genericSuccess() {
  return NextResponse.json({
    ok: true,
    message: "If that email matches a paid order, a sign-in link has been sent.",
  });
}

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  const ipRateLimit = await checkRateLimit(`account:magic:request:ip:${ip}`, 12, 60 * 60);
  if (!ipRateLimit.allowed) {
    return rateLimitResponse(ipRateLimit.resetIn);
  }

  let payload: RequestPayload | null = null;
  try {
    payload = (await req.json()) as RequestPayload;
  } catch {
    return NextResponse.json({ ok: false, error: "valid email required" }, { status: 400 });
  }

  const email = normalizeAccountLiteEmail(payload?.email);
  if (!email || !isValidEmail(email)) {
    return NextResponse.json({ ok: false, error: "valid email required" }, { status: 400 });
  }

  if (!isAccountMagicLinkEmailConfigured()) {
    return NextResponse.json(
      {
        ok: false,
        error: "account_magic_link_not_configured",
        supportEmail: SUPPORT_EMAIL,
      },
      { status: 503 },
    );
  }

  const emailHash = hashEmail(email);
  const emailRateLimit = await checkRateLimit(`account:magic:request:email:${emailHash}`, 4, 60 * 60);
  if (!emailRateLimit.allowed) {
    return rateLimitResponse(emailRateLimit.resetIn);
  }

  const lookup = await getAccountLiteEmailSessions(email);
  if (!lookup?.sessions?.length) {
    return genericSuccess();
  }

  const token = crypto.randomUUID();
  const now = Date.now();
  const record: MagicLinkRecord = {
    email,
    emailHash,
    createdAt: now,
  };
  // A2-1 (T-SM-KVRACE): register the token with the Consistency
  // Coordinator before the link is sent, with its explicit expiry
  // (design S3-A). A registration failure sends nothing — the response
  // stays the generic success either way, so a failed issuance is
  // indistinguishable from a sent one (anti-enumeration) and the user
  // can simply retry.
  try {
    const client = createConsistencyCoordinatorClient();
    await client.registerMagicToken(magicCoordinatorName(token), {
      email,
      emailHash,
      expiresAt: now + ACCOUNT_LITE_MAGIC_LINK_TTL_SECONDS * 1000,
      now,
    });
  } catch (error) {
    console.error("magic link coordinator registration failed", { emailHash, error });
    return genericSuccess();
  }
  await kv.set(accountLiteMagicKey(token), record, { ex: ACCOUNT_LITE_MAGIC_LINK_TTL_SECONDS });

  const origin = new URL(req.url).origin;
  const link = `${origin}/my-downloads?token=${encodeURIComponent(token)}`;
  const alert = await sendAccountMagicLinkAlert({ email, link });
  if (!alert.delivered) {
    console.warn("Account magic link email delivery failed", {
      provider: alert.provider,
      error: alert.error,
      emailHash,
    });
  }

  return genericSuccess();
}
