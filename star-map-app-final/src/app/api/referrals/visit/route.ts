import { NextRequest, NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { kv } from "@/lib/kv";
import { checkRateLimit, getClientIp, rateLimitResponse } from "@/lib/rateLimit";
import { normalizeReferralCode, referralKey, type ReferralRecord } from "@/lib/referrals";
import { PREMIUM_COOKIE_NAME } from "@/lib/premium";

export const runtime = "nodejs";

const VISIT_DEDUPE_WINDOW_SECONDS = 12 * 60 * 60;

function dedupeKey(code: string, fingerprint: string) {
  return `referral:visit:dedupe:${code}:${fingerprint}`;
}

function fingerprintVisitor(ip: string, userAgent: string) {
  return createHash("sha256").update(`${ip}|${userAgent}`).digest("base64url").slice(0, 24);
}

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  const rateLimit = await checkRateLimit(`referrals:visit:${ip}`, 60, 60);
  if (!rateLimit.allowed) {
    return rateLimitResponse(rateLimit.resetIn);
  }

  let code: string | null = null;
  try {
    const body = (await req.json()) as { code?: unknown } | null;
    code = normalizeReferralCode(body?.code);
  } catch {
    code = null;
  }
  if (!code) {
    return NextResponse.json({ ok: false, error: "Invalid referral code" }, { status: 400 });
  }

  const record = await kv.get<ReferralRecord>(referralKey(code));
  if (!record?.sessionId) {
    return NextResponse.json({ ok: false, error: "Referral not found" }, { status: 404 });
  }

  const currentSessionId = req.cookies.get(PREMIUM_COOKIE_NAME)?.value?.trim();
  if (currentSessionId && currentSessionId === record.sessionId) {
    return NextResponse.json({ ok: true, deduped: true });
  }

  const userAgent = req.headers.get("user-agent")?.slice(0, 200) ?? "";
  const fingerprint = fingerprintVisitor(ip, userAgent);
  const duplicate = await kv.get<{ seen?: boolean }>(dedupeKey(code, fingerprint));
  if (duplicate?.seen) {
    return NextResponse.json({ ok: true, deduped: true });
  }

  await kv.set(
    dedupeKey(code, fingerprint),
    { seen: true, createdAt: Date.now() },
    { ex: VISIT_DEDUPE_WINDOW_SECONDS },
  );

  await kv.set(referralKey(code), {
    ...record,
    visits: (record.visits ?? 0) + 1,
  });

  return NextResponse.json({ ok: true, deduped: false });
}
