import { NextRequest, NextResponse } from "next/server";
import { kv } from "@/lib/kv";
import { checkRateLimit, getClientIp, rateLimitResponse } from "@/lib/rateLimit";
import { getAccountLiteEmailSessions, normalizeAccountLiteEmail } from "@/lib/accountLite";
import {
  ACCOUNT_LITE_SESSION_TTL_SECONDS,
  accountLiteSessionKey,
  type AccountLiteAuthSession,
} from "@/lib/accountLiteAuth";
import { hashEmailForAccountLite, verifyGoogleIdTokenForMobile } from "@/lib/googleMobileAuth";

export const runtime = "nodejs";

type GooglePayload = {
  idToken?: unknown;
};

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  const rateLimit = await checkRateLimit(`account:mobile:google:${ip}`, 30, 60);
  if (!rateLimit.allowed) {
    return rateLimitResponse(rateLimit.resetIn);
  }

  let payload: GooglePayload | null = null;
  try {
    payload = (await req.json()) as GooglePayload;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_google_token" }, { status: 400 });
  }

  const idToken = typeof payload?.idToken === "string" ? payload.idToken : "";
  const verified = await verifyGoogleIdTokenForMobile(idToken);
  if (!verified.ok) {
    const status =
      verified.failure.error === "google_signin_not_configured"
        ? 503
        : verified.failure.error === "google_email_not_verified"
          ? 403
          : 401;
    return NextResponse.json({ ok: false, error: verified.failure.error }, { status });
  }

  const email = normalizeAccountLiteEmail(verified.email);
  if (!email) {
    return NextResponse.json({ ok: false, error: "invalid_google_email" }, { status: 400 });
  }

  const lookup = await getAccountLiteEmailSessions(email);
  if (!lookup?.sessions?.length) {
    return NextResponse.json({ ok: false, error: "no_account_orders" }, { status: 404 });
  }

  const sessionToken = crypto.randomUUID();
  const authSession: AccountLiteAuthSession = {
    email,
    emailHash: hashEmailForAccountLite(email),
    createdAt: Date.now(),
  };
  await kv.set(accountLiteSessionKey(sessionToken), authSession, { ex: ACCOUNT_LITE_SESSION_TTL_SECONDS });

  return NextResponse.json({
    ok: true,
    mobileToken: sessionToken,
    expiresIn: ACCOUNT_LITE_SESSION_TTL_SECONDS,
    email,
  });
}
