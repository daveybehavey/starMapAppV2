import { NextRequest, NextResponse } from "next/server";
import { kv } from "@/lib/kv";
import { checkRateLimit, getClientIp, rateLimitResponse } from "@/lib/rateLimit";
import { normalizeAccountLiteEmail } from "@/lib/accountLite";
import { accountLiteSessionKey, type AccountLiteAuthSession } from "@/lib/accountLiteAuth";

export const runtime = "nodejs";

const revenueCatLinkKey = (mobileToken: string) => `mobile:revenuecat:${mobileToken}`;

type LinkPayload = {
  appUserId?: unknown;
  sessionId?: unknown;
};

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  const rateLimit = await checkRateLimit(`account:mobile:revenuecat:link:${ip}`, 40, 60);
  if (!rateLimit.allowed) {
    return rateLimitResponse(rateLimit.resetIn);
  }

  const authHeader = req.headers.get("authorization")?.trim() ?? "";
  const mobileToken = authHeader.toLowerCase().startsWith("bearer ")
    ? authHeader.slice(7).trim()
    : "";
  if (!mobileToken) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const auth = await kv.get<AccountLiteAuthSession>(accountLiteSessionKey(mobileToken));
  const email = normalizeAccountLiteEmail(auth?.email);
  if (!auth || !email) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  let payload: LinkPayload | null = null;
  try {
    payload = (await req.json()) as LinkPayload;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_body" }, { status: 400 });
  }

  const appUserId = typeof payload?.appUserId === "string" ? payload.appUserId.trim() : "";
  if (!appUserId) {
    return NextResponse.json({ ok: false, error: "appUserId required" }, { status: 400 });
  }

  const sessionId = typeof payload?.sessionId === "string" ? payload.sessionId.trim() : "";

  await kv.set(
    revenueCatLinkKey(mobileToken),
    {
      appUserId,
      sessionId: sessionId || undefined,
      linkedAt: Date.now(),
    },
    { ex: 60 * 60 * 24 * 90 },
  );

  return NextResponse.json({
    ok: true,
    appUserId,
    sessionId,
  });
}
