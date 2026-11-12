import { NextRequest, NextResponse } from "next/server";
import { ACCOUNT_LITE_SESSION_COOKIE, accountLiteSessionKey } from "@/lib/accountLiteAuth";
import { kv } from "@/lib/kv";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  // Use the deployment URL, including local and preview hosts, as elsewhere in account routes.
  const origin = req.headers.get("origin");
  if (!origin || origin !== new URL(req.url).origin) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const token = req.cookies.get(ACCOUNT_LITE_SESSION_COOKIE)?.value?.trim();
  if (token) {
    try {
      // Revoke only this token. KV propagation can delay visibility in other colos;
      // acknowledgement does not guarantee immediate global revocation.
      await kv.deleteDurable(accountLiteSessionKey(token));
    } catch {
      return NextResponse.json({ ok: false, error: "service_unavailable" }, { status: 503 });
    }
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(ACCOUNT_LITE_SESSION_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return response;
}
