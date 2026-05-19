import { NextRequest, NextResponse } from "next/server";
import { getClientIp } from "@/lib/rateLimit";
import { runAccountLiteMagicLinkRequest } from "@/lib/accountLiteMagicLinkRequestCore";

export const runtime = "nodejs";

type RequestPayload = {
  email?: unknown;
};

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  let payload: RequestPayload | null = null;
  try {
    payload = (await req.json()) as RequestPayload;
  } catch {
    return NextResponse.json({ ok: false, error: "valid email required" }, { status: 400 });
  }

  return runAccountLiteMagicLinkRequest({
    ip,
    origin: new URL(req.url).origin,
    emailInput: payload?.email,
  });
}
