import { NextRequest, NextResponse } from "next/server";
import { kv } from "@/lib/kv";
import { checkRateLimit, getClientIp, rateLimitResponse } from "@/lib/rateLimit";
import { normalizeAccountLiteEmail } from "@/lib/accountLite";
import { accountLiteSessionKey, type AccountLiteAuthSession } from "@/lib/accountLiteAuth";
import { listAccountLiteSessionsForEmail } from "@/lib/accountLiteSessionList";

export const runtime = "nodejs";

function unauthorizedResponse() {
  return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
}

export async function GET(req: NextRequest) {
  const ip = getClientIp(req);
  const rateLimit = await checkRateLimit(`account:mobile:state:${ip}`, 60, 60);
  if (!rateLimit.allowed) {
    return rateLimitResponse(rateLimit.resetIn);
  }

  const authHeader = req.headers.get("authorization")?.trim() ?? "";
  const mobileToken = authHeader.toLowerCase().startsWith("bearer ")
    ? authHeader.slice(7).trim()
    : "";
  if (!mobileToken) {
    return unauthorizedResponse();
  }

  const auth = await kv.get<AccountLiteAuthSession>(accountLiteSessionKey(mobileToken));
  const email = normalizeAccountLiteEmail(auth?.email);
  if (!auth || !email) {
    return unauthorizedResponse();
  }

  const origin = new URL(req.url).origin;
  const { sessions, premium } = await listAccountLiteSessionsForEmail(email, origin);

  return NextResponse.json({
    ok: true,
    sessions,
    premium,
  });
}
