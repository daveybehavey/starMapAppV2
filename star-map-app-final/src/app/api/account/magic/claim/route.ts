import { NextRequest, NextResponse } from "next/server";
import { kv } from "@/lib/kv";
import { checkRateLimit, getClientIp, rateLimitResponse } from "@/lib/rateLimit";
import { isProductionLikeRuntime } from "@/lib/runtimeEnv";
import {
  ACCOUNT_LITE_SESSION_COOKIE,
  ACCOUNT_LITE_SESSION_TTL_SECONDS,
  accountLiteMagicKey,
  accountLiteSessionKey,
  type AccountLiteAuthSession,
} from "@/lib/accountLiteAuth";

export const runtime = "nodejs";

type ClaimPayload = {
  token?: unknown;
};

type MagicLinkRecord = {
  email?: string;
  emailHash?: string;
  createdAt?: number;
  usedAt?: number;
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

  const magic = await kv.get<MagicLinkRecord>(accountLiteMagicKey(token));
  if (!magic?.email || !magic?.emailHash || magic.usedAt) {
    return NextResponse.json({ ok: false, error: "invalid_token" }, { status: 404 });
  }

  const sessionToken = crypto.randomUUID();
  const authSession: AccountLiteAuthSession = {
    email: magic.email,
    emailHash: magic.emailHash,
    createdAt: Date.now(),
  };
  await kv.set(accountLiteSessionKey(sessionToken), authSession, { ex: ACCOUNT_LITE_SESSION_TTL_SECONDS });
  await kv.set(accountLiteMagicKey(token), {
    ...magic,
    usedAt: Date.now(),
  });

  const response = NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  response.cookies.set(ACCOUNT_LITE_SESSION_COOKIE, sessionToken, {
    httpOnly: true,
    secure: isProductionLikeRuntime(),
    sameSite: "lax",
    path: "/",
    maxAge: ACCOUNT_LITE_SESSION_TTL_SECONDS,
  });
  return response;
}
