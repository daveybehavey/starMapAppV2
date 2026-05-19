import { NextRequest, NextResponse } from "next/server";
import { kv } from "@/lib/kv";
import { checkRateLimit, getClientIp, rateLimitResponse } from "@/lib/rateLimit";
import { normalizeAccountLiteEmail } from "@/lib/accountLite";
import {
  ACCOUNT_LITE_SESSION_COOKIE,
  accountLiteSessionKey,
  type AccountLiteAuthSession,
} from "@/lib/accountLiteAuth";
import { listAccountLiteSessionsForEmail } from "@/lib/accountLiteSessionList";

export const runtime = "nodejs";

function unauthorizedResponse() {
  const response = NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  response.cookies.set(ACCOUNT_LITE_SESSION_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
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

  const origin = new URL(req.url).origin;
  const { sessions } = await listAccountLiteSessionsForEmail(email, origin);

  return NextResponse.json({
    ok: true,
    sessions,
  });
}
