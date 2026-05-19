import { NextRequest, NextResponse } from "next/server";
import { kv } from "@/lib/kv";
import { checkRateLimit, getClientIp, rateLimitResponse } from "@/lib/rateLimit";
import { normalizeAccountLiteEmail } from "@/lib/accountLite";
import { accountLiteSessionKey, type AccountLiteAuthSession } from "@/lib/accountLiteAuth";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  const rateLimit = await checkRateLimit(`account:mobile:logout:${ip}`, 40, 60);
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

  await kv.del(accountLiteSessionKey(mobileToken));
  return NextResponse.json({ ok: true });
}
