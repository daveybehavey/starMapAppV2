import { NextResponse } from "next/server";
import { ACCOUNT_LITE_SESSION_COOKIE } from "@/lib/accountLiteAuth";

export const runtime = "nodejs";

export async function POST() {
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
