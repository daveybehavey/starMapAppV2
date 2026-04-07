import { NextRequest, NextResponse } from "next/server";
import { hasValidAdminToken, readAdminTokenFromHeaders } from "@/lib/adminAuth";
import { kv } from "@/lib/kv";
import {
  getPromotionLifecycleDelaySeconds,
  PROMOTION_COUPON_CODE,
  runPromotionFollowup,
} from "@/lib/promotions";
import {
  EMAIL_STATE_PREFIX,
  keyNameToPromotionEmail,
  type PromotionFollowupHistoryEntry,
  type PromotionFollowupStep,
  type PromotionEmailState,
} from "@/lib/promotionSubscriptions";

export const runtime = "nodejs";

type DispatchBody = {
  limit?: unknown;
  dryRun?: unknown;
};

function requireAdmin(req: NextRequest) {
  const configured = process.env.PRINT_ADMIN_TOKEN?.trim() || "";
  const candidate = readAdminTokenFromHeaders(req.headers);
  return hasValidAdminToken(candidate, configured);
}

function toPositiveInt(raw: unknown, fallback: number, max: number) {
  const parsed = typeof raw === "number" ? raw : typeof raw === "string" ? Number.parseInt(raw, 10) : Number.NaN;
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(max, Math.floor(parsed));
}

function toBoolean(raw: unknown, fallback = false) {
  if (typeof raw === "boolean") return raw;
  if (typeof raw === "string") {
    const normalized = raw.trim().toLowerCase();
    if (["1", "true", "yes"].includes(normalized)) return true;
    if (["0", "false", "no"].includes(normalized)) return false;
  }
  return fallback;
}

export async function POST(req: NextRequest) {
  if (!requireAdmin(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  let body: DispatchBody = {};
  try {
    body = (await req.json()) as DispatchBody;
  } catch {
    body = {};
  }

  const limit = toPositiveInt(body.limit, 100, 500);
  const dryRun = toBoolean(body.dryRun, false);
  const now = Date.now();
  const listed = await kv.list({ prefix: EMAIL_STATE_PREFIX, limit });
  const dispatchResults: Array<{
    email: string;
    step: PromotionFollowupStep;
    dueAt: number;
    status: "due" | "sent" | "failed";
    provider?: string;
    error?: string;
  }> = [];

  let dueCount = 0;
  let sentCount = 0;
  let failedCount = 0;

  for (const key of listed.keys) {
    const email = keyNameToPromotionEmail(key);
    if (!email) continue;
    const state = await kv.get<PromotionEmailState>(key);
    if (!state) continue;
    if (state.unsubscribedAt || !state.couponSentAt) continue;
    const step = state.followupNextStep;
    if (!step) continue;

    const dueAtCandidate =
      typeof state.followupDueAt === "number" && Number.isFinite(state.followupDueAt)
        ? state.followupDueAt
        : state.couponSentAt + getPromotionLifecycleDelaySeconds(step) * 1000;
    if (dueAtCandidate > now) continue;

    dueCount += 1;
    if (dryRun) {
      dispatchResults.push({
        email,
        step,
        dueAt: dueAtCandidate,
        status: "due",
      });
      continue;
    }

    const sendResult = await runPromotionFollowup(email, PROMOTION_COUPON_CODE, step);
    if (sendResult.delivered) {
      sentCount += 1;
      const sentAt = Date.now();
      const history: PromotionFollowupHistoryEntry[] = [...(state.followupHistory ?? []), { step, sentAt }];
      const nextState: PromotionEmailState = {
        ...state,
        followupSentAt: sentAt,
        followupHistory: history,
        followupNextStep: step === "objection" ? "urgency" : undefined,
        followupDueAt:
          step === "objection"
            ? state.couponSentAt + getPromotionLifecycleDelaySeconds("urgency") * 1000
            : undefined,
        followupLastError: undefined,
        updatedAt: sentAt,
      };
      await kv.set(key, nextState);
      dispatchResults.push({
        email,
        step,
        dueAt: dueAtCandidate,
        status: "sent",
        provider: sendResult.provider,
      });
      continue;
    }

    failedCount += 1;
    const retryAt = Date.now() + 60 * 60 * 1000;
    const error = sendResult.error || `promotion_followup_${sendResult.provider}_failed`;
    const nextState: PromotionEmailState = {
      ...state,
      followupDueAt: retryAt,
      followupLastError: error,
      followupNextStep: step,
      updatedAt: Date.now(),
    };
    await kv.set(key, nextState);
    dispatchResults.push({
      email,
      step,
      dueAt: dueAtCandidate,
      status: "failed",
      provider: sendResult.provider,
      error,
    });
  }

  return NextResponse.json({
    ok: true,
    dryRun,
    scanned: listed.keys.length,
    due: dueCount,
    processed: dryRun ? 0 : sentCount + failedCount,
    sent: sentCount,
    failed: failedCount,
    listComplete: listed.listComplete,
    nextCursor: listed.cursor ?? null,
    results: dispatchResults,
  });
}
