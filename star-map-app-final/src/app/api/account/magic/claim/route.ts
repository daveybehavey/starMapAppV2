import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit, getClientIp, rateLimitResponse } from "@/lib/rateLimit";
import {
  ACCOUNT_LITE_SESSION_COOKIE,
  ACCOUNT_LITE_SESSION_TTL_SECONDS,
} from "@/lib/accountLiteAuth";
import { executeAccountLiteMagicClaim } from "@/lib/accountLiteMagicClaimCore";

export const runtime = "nodejs";

type ClaimPayload = {
  token?: unknown;
};

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  const rateLimit = await checkRateLimit(`account:magic:claim:${ip}`, 30, 60);
  if (!rateLimit.allowed) {
    return rateLimitResponse(rateLimit.resetIn);
  }

  let payload: ClaimPayload | null = null;
  try {
    payload = (await req.json()) as ClaimPayload;
  } catch {
    return NextResponse.json({ ok: false, error: "token required" }, { status: 400 });
  }

  const token = typeof payload?.token === "string" ? payload.token.trim() : "";
  if (!token) {
    return NextResponse.json({ ok: false, error: "token required" }, { status: 400 });
  }

  const result = await executeAccountLiteMagicClaim(token);
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: "invalid_token" }, { status: 404 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(ACCOUNT_LITE_SESSION_COOKIE, result.sessionToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: ACCOUNT_LITE_SESSION_TTL_SECONDS,
  });
  return response;
}
