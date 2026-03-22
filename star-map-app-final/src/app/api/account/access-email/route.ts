import { NextRequest, NextResponse } from "next/server";
import { kv } from "@/lib/kv";
import { checkRateLimit, getClientIp, rateLimitResponse } from "@/lib/rateLimit";
import { PREMIUM_COOKIE_NAME } from "@/lib/premium";
import { getOrCreateClaimToken, hasRecoverableAccess, type AccountAccessSessionRecord } from "@/lib/accountAccessLinks";
import { isAccountAccessEmailConfigured, sendAccountAccessAlert } from "@/lib/accountAccessAlerts";
import { normalizeAccountLiteEmail } from "@/lib/accountLite";

export const runtime = "nodejs";

const SUPPORT_EMAIL = process.env.NEXT_PUBLIC_SUPPORT_EMAIL?.trim() || "support@starmapco.com";

const sessionKey = (id: string) => `stripe:session:${id}`;

function getSiteUrl(req: NextRequest) {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (configured) return configured.replace(/\/+$/, "");
  return new URL(req.url).origin;
}

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  const rateLimit = await checkRateLimit(`account:access-email:${ip}`, 10, 60 * 60);
  if (!rateLimit.allowed) {
    return rateLimitResponse(rateLimit.resetIn);
  }

  if (!isAccountAccessEmailConfigured()) {
    return NextResponse.json(
      {
        ok: false,
        error: "account_access_email_not_configured",
        supportEmail: SUPPORT_EMAIL,
      },
      { status: 503 },
    );
  }

  const sessionId = req.cookies.get(PREMIUM_COOKIE_NAME)?.value?.trim();
  if (!sessionId) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const record = await kv.get<AccountAccessSessionRecord>(sessionKey(sessionId));
  if (!record || !hasRecoverableAccess(record)) {
    return NextResponse.json({ ok: false, error: "No active access" }, { status: 403 });
  }

  const email = normalizeAccountLiteEmail(record.customerEmail);
  if (!email) {
    return NextResponse.json(
      {
        ok: false,
        error: "missing_customer_email",
        supportEmail: SUPPORT_EMAIL,
      },
      { status: 409 },
    );
  }

  const token = await getOrCreateClaimToken(sessionId, record);
  const link = `${getSiteUrl(req)}/download?token=${encodeURIComponent(token)}`;
  const result = await sendAccountAccessAlert({ email, link });

  if (!result.delivered) {
    return NextResponse.json(
      {
        ok: false,
        error: result.error ?? "account_access_email_failed",
      },
      { status: 502 },
    );
  }

  return NextResponse.json({
    ok: true,
    message: "Access link sent.",
  });
}
