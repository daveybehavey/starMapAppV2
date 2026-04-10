import { NextRequest, NextResponse } from "next/server";
import { kv } from "@/lib/kv";
import { checkRateLimit, getClientIp, rateLimitResponse } from "@/lib/rateLimit";
import { isProductionLikeRuntime } from "@/lib/runtimeEnv";
import { getAccountLiteEmailSessions, normalizeAccountLiteEmail } from "@/lib/accountLite";
import {
  ACCOUNT_LITE_SESSION_COOKIE,
  accountLiteSessionKey,
  type AccountLiteAuthSession,
} from "@/lib/accountLiteAuth";
import {
  getOfferLabel,
  getOrCreateClaimToken,
  hasRecoverableAccess,
  type AccountAccessSessionRecord,
} from "@/lib/accountAccessLinks";

export const runtime = "nodejs";

type SessionListItem = {
  sessionId: string;
  createdAt: number;
  label: string;
  orderType: "digital" | "print";
  printVariant: "poster_framed" | "poster_unframed" | null;
  plan: "single" | "pack3" | "subscription" | null;
  hasMapId: boolean;
  downloadUrl: string | null;
  creditsRemaining: number | null;
  subscriptionActive: boolean;
};

const stripeSessionKey = (id: string) => `stripe:session:${id}`;

function unauthorizedResponse() {
  const response = NextResponse.json(
    { ok: false, error: "Unauthorized" },
    { status: 401, headers: { "Cache-Control": "no-store" } },
  );
  response.cookies.set(ACCOUNT_LITE_SESSION_COOKIE, "", {
    httpOnly: true,
    secure: isProductionLikeRuntime(),
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return response;
}

export async function GET(req: NextRequest) {
  const ip = getClientIp(req);
  const rateLimit = await checkRateLimit(`account:my-sessions:${ip}`, 40, 60);
  if (!rateLimit.allowed) {
    return rateLimitResponse(rateLimit.resetIn);
  }

  const sessionToken = req.cookies.get(ACCOUNT_LITE_SESSION_COOKIE)?.value?.trim();
  if (!sessionToken) return unauthorizedResponse();

  const auth = await kv.get<AccountLiteAuthSession>(accountLiteSessionKey(sessionToken));
  const email = normalizeAccountLiteEmail(auth?.email);
  if (!auth || !email) {
    return unauthorizedResponse();
  }

  const lookup = await getAccountLiteEmailSessions(email);
  if (!lookup?.sessions?.length) {
    return NextResponse.json(
      {
        ok: true,
        sessions: [],
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  const origin = new URL(req.url).origin;
  const items: SessionListItem[] = [];
  for (const indexed of lookup.sessions.slice(0, 20)) {
    if (!indexed?.sessionId) continue;
    const current = await kv.get<AccountAccessSessionRecord>(stripeSessionKey(indexed.sessionId));
    if (!current) continue;
    const currentEmail = normalizeAccountLiteEmail(current.customerEmail);
    if (currentEmail && currentEmail !== email) continue;
    const label = getOfferLabel(current, indexed.plan);
    let downloadUrl: string | null = null;
    if (hasRecoverableAccess(current)) {
      const token = await getOrCreateClaimToken(indexed.sessionId, current);
      downloadUrl = `${origin}/download?token=${encodeURIComponent(token)}`;
    }
    items.push({
      sessionId: indexed.sessionId,
      createdAt:
        typeof indexed.createdAt === "number" && Number.isFinite(indexed.createdAt)
          ? indexed.createdAt
          : typeof current.created === "number"
            ? current.created
            : Date.now(),
      label,
      orderType: current.orderType === "print" ? "print" : "digital",
      printVariant:
        current.printVariant === "poster_framed" || current.printVariant === "poster_unframed"
          ? current.printVariant
          : null,
      plan:
        current.plan === "single" || current.plan === "pack3" || current.plan === "subscription"
          ? current.plan
          : null,
      hasMapId: Boolean(current.mapId && String(current.mapId).trim()),
      downloadUrl,
      creditsRemaining: typeof current.creditsRemaining === "number" ? current.creditsRemaining : null,
      subscriptionActive: Boolean(current.subscriptionActive),
    });
  }

  return NextResponse.json(
    {
      ok: true,
      sessions: items,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
