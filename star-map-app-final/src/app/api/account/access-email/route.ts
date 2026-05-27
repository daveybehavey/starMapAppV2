import { NextRequest, NextResponse } from "next/server";
import { sendPostPurchaseAccessEmail } from "@/lib/accountAccessDelivery";
import { hasRecoverableAccess, type AccountAccessSessionRecord } from "@/lib/accountAccessLinks";
import { isAccountAccessEmailConfigured } from "@/lib/accountAccessAlerts";
import { ENTITLEMENT_KV } from "@/lib/entitlementsStore";
import { normalizeAccountLiteEmail } from "@/lib/accountLite";
import { kv } from "@/lib/kv";
import { checkRateLimit, getClientIp, rateLimitResponse } from "@/lib/rateLimit";
import { PREMIUM_COOKIE_NAME } from "@/lib/premium";

export const runtime = "nodejs";

const SUPPORT_EMAIL = process.env.NEXT_PUBLIC_SUPPORT_EMAIL?.trim() || "support@starmapco.com";

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

  const record = await kv.get<AccountAccessSessionRecord>(ENTITLEMENT_KV.stripeSession(sessionId));
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

  const result = await sendPostPurchaseAccessEmail({
    siteOrigin: getSiteUrl(req),
    email,
    sessionId,
    record,
  });

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
    message: "Check your email for your HD download link.",
  });
}
