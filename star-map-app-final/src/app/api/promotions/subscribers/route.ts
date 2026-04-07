import { NextRequest, NextResponse } from "next/server";
import { kv } from "@/lib/kv";
import { hasValidAdminToken, readAdminTokenFromHeaders } from "@/lib/adminAuth";
import {
  keyNameToPromotionEmail,
  summarizePromotionEmailStates,
  type PromotionEmailState,
} from "@/lib/promotionSubscriptions";

export const runtime = "nodejs";

function requireAdmin(req: NextRequest) {
  const configured = process.env.PRINT_ADMIN_TOKEN?.trim() || "";
  const candidate = readAdminTokenFromHeaders(req.headers);
  return hasValidAdminToken(candidate, configured);
}

function parseLimit(raw: string | null) {
  const parsed = Number.parseInt(raw || "", 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return 100;
  return Math.min(500, parsed);
}

export async function GET(req: NextRequest) {
  if (!requireAdmin(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const limit = parseLimit(req.nextUrl.searchParams.get("limit"));
  const cursor = req.nextUrl.searchParams.get("cursor")?.trim() || undefined;
  const includeUnsubscribed = /^(1|true|yes)$/i.test(
    (req.nextUrl.searchParams.get("include_unsubscribed") || "").trim(),
  );

  const listed = await kv.list({
    prefix: "promotions:email:",
    limit,
    cursor,
  });

  const rows = await Promise.all(
    listed.keys.map(async (key) => {
      const email = keyNameToPromotionEmail(key);
      const state = await kv.get<PromotionEmailState>(key);
      return {
        key,
        email,
        state,
      };
    }),
  );

  const subscribers = rows
    .filter((row) => row.email && row.state)
    .filter((row) => includeUnsubscribed || !row.state?.unsubscribedAt)
    .map((row) => ({
      email: row.email,
      subscribedAt: row.state?.subscribedAt ?? null,
      unsubscribedAt: row.state?.unsubscribedAt ?? null,
      couponSentAt: row.state?.couponSentAt ?? null,
      followupSentAt: row.state?.followupSentAt ?? null,
      followupDueAt: row.state?.followupDueAt ?? null,
      followupLastError: row.state?.followupLastError ?? null,
      followupNextStep: row.state?.followupNextStep ?? null,
      followupHistory: row.state?.followupHistory ?? [],
      updatedAt: row.state?.updatedAt ?? null,
      lastSource: row.state?.lastSource ?? null,
    }))
    .sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));

  const summary = summarizePromotionEmailStates(
    rows
      .filter((row) => row.email && row.state)
      .filter((row) => includeUnsubscribed || !row.state?.unsubscribedAt)
      .map((row) => row.state),
    listed.listComplete,
  );

  return NextResponse.json({
    ok: true,
    subscribers,
    summary,
    nextCursor: listed.cursor ?? null,
    listComplete: listed.listComplete,
  });
}
