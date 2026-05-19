import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { checkRateLimit, rateLimitResponse } from "@/lib/rateLimit";
import { getAccountLiteEmailSessions, normalizeAccountLiteEmail } from "@/lib/accountLite";
import { kv } from "@/lib/kv";
import {
  ACCOUNT_LITE_MAGIC_LINK_TTL_SECONDS,
  accountLiteMagicKey,
} from "@/lib/accountLiteAuth";
import {
  isAccountMagicLinkEmailConfigured,
  sendAccountMagicLinkAlert,
} from "@/lib/accountMagicLinkAlerts";

const SUPPORT_EMAIL = process.env.NEXT_PUBLIC_SUPPORT_EMAIL?.trim() || "support@starmapco.com";

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

/**
 * Shared body for `POST /api/account/magic/request` and `POST /api/account/mobile/request`.
 */
export async function runAccountLiteMagicLinkRequest(params: {
  origin: string;
  emailInput: unknown;
  ip: string;
}): Promise<Response> {
  const ipRateLimit = await checkRateLimit(`account:magic:request:ip:${params.ip}`, 12, 60 * 60);
  if (!ipRateLimit.allowed) {
    return rateLimitResponse(ipRateLimit.resetIn);
  }

  const email = normalizeAccountLiteEmail(
    typeof params.emailInput === "string" ? params.emailInput : undefined,
  );
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
  const record: MagicLinkRecord = {
    email,
    emailHash,
    createdAt: Date.now(),
  };
  await kv.set(accountLiteMagicKey(token), record, { ex: ACCOUNT_LITE_MAGIC_LINK_TTL_SECONDS });

  const link = `${params.origin}/my-downloads?token=${encodeURIComponent(token)}`;
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
