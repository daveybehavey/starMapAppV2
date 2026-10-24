import { NextRequest, NextResponse } from "next/server";
import { kv } from "@/lib/kv";
import { checkRateLimit, getClientIp, rateLimitResponse } from "@/lib/rateLimit";
import {
  ACCOUNT_LITE_MAGIC_LINK_TTL_SECONDS,
  ACCOUNT_LITE_SESSION_COOKIE,
  ACCOUNT_LITE_SESSION_TTL_SECONDS,
  accountLiteMagicKey,
  accountLiteSessionKey,
  type AccountLiteAuthSession,
} from "@/lib/accountLiteAuth";
import {
  createConsistencyCoordinatorClient,
  magicCoordinatorName,
} from "@/lib/consistencyCoordinator";

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

  // A2-1 (T-SM-KVRACE): consumption is decided and committed by the
  // per-token Consistency Coordinator BEFORE any session exists (design
  // S3-A). The legacy KV record rides along as a monotone import fact
  // for tokens issued before the cutover; the coordinator's consumed
  // state can never be cleared by it. The old sequence — read `usedAt`,
  // mint the session, then write `usedAt` — let two concurrent claims
  // both pass the check and mint two sessions.
  const legacyRecord = await kv.get<MagicLinkRecord>(accountLiteMagicKey(token));
  let consumed: { email: string; emailHash: string };
  try {
    const client = createConsistencyCoordinatorClient();
    const result = await client.consumeMagicToken(magicCoordinatorName(token), {
      legacyRecord: legacyRecord ?? null,
      legacyTtlMs: ACCOUNT_LITE_MAGIC_LINK_TTL_SECONDS * 1000,
      now: Date.now(),
    });
    if (result.status !== "consumed") {
      return NextResponse.json({ ok: false, error: "invalid_token" }, { status: 404 });
    }
    consumed = { email: result.email, emailHash: result.emailHash };
  } catch {
    // Coordinator unavailable: retryable, and no session is issued.
    return NextResponse.json({ ok: false, error: "service_unavailable" }, { status: 503 });
  }

  const sessionToken = crypto.randomUUID();
  const authSession: AccountLiteAuthSession = {
    email: consumed.email,
    emailHash: consumed.emailHash,
    createdAt: Date.now(),
  };
  try {
    await kv.set(accountLiteSessionKey(sessionToken), authSession, { ex: ACCOUNT_LITE_SESSION_TTL_SECONDS });
  } catch {
    // The token is spent (at-most-once by design); the user requests a
    // fresh link. Never set a cookie for a session that was not stored.
    return NextResponse.json({ ok: false, error: "service_unavailable" }, { status: 503 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(ACCOUNT_LITE_SESSION_COOKIE, sessionToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: ACCOUNT_LITE_SESSION_TTL_SECONDS,
  });
  return response;
}
