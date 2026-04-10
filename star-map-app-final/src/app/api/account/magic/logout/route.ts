import { NextResponse } from "next/server";
import { ACCOUNT_LITE_SESSION_COOKIE } from "@/lib/accountLiteAuth";
import { isProductionLikeRuntime } from "@/lib/runtimeEnv";

export const runtime = "nodejs";

export async function POST() {
  const response = NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  response.cookies.set(ACCOUNT_LITE_SESSION_COOKIE, "", {
    httpOnly: true,
    secure: isProductionLikeRuntime(),
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return response;
}
