import { NextRequest, NextResponse } from "next/server";
import { kv } from "@/lib/kv";
import { PREMIUM_COOKIE_NAME } from "@/lib/premium";
import { checkRateLimit, getClientIp, rateLimitResponse } from "@/lib/rateLimit";
import type { CheckoutOrderType, CheckoutPlan, PrintVariant } from "@/lib/pricing";

export const runtime = "nodejs";

const MAP_ID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type SessionRecord = {
  paid?: boolean;
  revoked?: boolean;
  mapId?: string | null;
  orderType?: CheckoutOrderType;
  plan?: CheckoutPlan | null;
  printVariant?: PrintVariant | null;
};

type ProofConsentRecord = {
  sessionId: string;
  mapId: string;
  source: "success" | "download";
  orderType: CheckoutOrderType;
  plan?: CheckoutPlan | null;
  printVariant?: PrintVariant | null;
  websiteUsageAllowed: boolean;
  buyerContext?: string | null;
  buyerNote?: string | null;
  feedbackUpdatedAt?: string | null;
  reviewStatus?: "new" | "contacted" | "approved" | "published" | "rejected";
  reviewUpdatedAt?: string;
  createdAt: string;
  updatedAt: string;
};

type RouteError = { error: NextResponse };
type AuthorizedSession = {
  sessionId: string;
  session: SessionRecord;
};
type AuthorizedMap = AuthorizedSession & {
  mapId: string;
};

const sessionKey = (id: string) => `stripe:session:${id}`;
const proofConsentMapKey = (mapId: string) => `proof:consent:map:${mapId}`;
const proofConsentSessionKey = (sessionId: string) => `proof:consent:session:${sessionId}`;
const MAX_BUYER_CONTEXT_LENGTH = 80;
const MAX_BUYER_NOTE_LENGTH = 320;

function normalizeMapId(raw: unknown) {
  if (typeof raw !== "string") return null;
  const value = raw.trim();
  return MAP_ID_REGEX.test(value) ? value : null;
}

function normalizeSource(raw: unknown): "success" | "download" | null {
  return raw === "success" || raw === "download" ? raw : null;
}

function normalizeOrderType(raw: unknown): CheckoutOrderType | null {
  return raw === "print" ? "print" : raw === "digital" ? "digital" : null;
}

function normalizePlan(raw: unknown): CheckoutPlan | null {
  return raw === "single" || raw === "pack3" || raw === "subscription" ? raw : null;
}

function normalizePrintVariant(raw: unknown): PrintVariant | null {
  return raw === "poster_framed" || raw === "poster_unframed" ? raw : null;
}

function normalizeOptionalText(raw: unknown, maxLength: number) {
  if (raw == null) return { ok: true as const, value: null };
  if (typeof raw !== "string") {
    return { ok: false as const, error: NextResponse.json({ ok: false, error: "invalid_text" }, { status: 400 }) };
  }

  const value = raw.replace(/\u0000/g, "").trim();
  if (!value) return { ok: true as const, value: null };
  if (value.length > maxLength) {
    return { ok: false as const, error: NextResponse.json({ ok: false, error: "text_too_long" }, { status: 400 }) };
  }

  return { ok: true as const, value };
}

async function getAuthorizedSession(req: NextRequest): Promise<AuthorizedSession | RouteError> {
  const sessionId = req.cookies.get(PREMIUM_COOKIE_NAME)?.value?.trim();
  if (!sessionId) {
    return { error: NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 }) };
  }

  const session = await kv.get<SessionRecord>(sessionKey(sessionId));
  if (!session?.paid || session.revoked) {
    return { error: NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 }) };
  }

  return { sessionId, session };
}

async function resolveAuthorizedMap(req: NextRequest, rawMapId: unknown): Promise<AuthorizedMap | RouteError> {
  const auth = await getAuthorizedSession(req);
  if ("error" in auth) return auth;

  const bodyMapId = normalizeMapId(rawMapId);
  const sessionMapId = normalizeMapId(auth.session.mapId);
  const mapId = bodyMapId || sessionMapId;

  if (!mapId) {
    return { error: NextResponse.json({ ok: false, error: "missing_map_id" }, { status: 409 }) };
  }

  if (bodyMapId && sessionMapId && bodyMapId !== sessionMapId) {
    return { error: NextResponse.json({ ok: false, error: "map_mismatch" }, { status: 409 }) };
  }

  return {
    sessionId: auth.sessionId,
    session: auth.session,
    mapId,
  };
}

export async function GET(req: NextRequest) {
  const ip = getClientIp(req);
  const rateLimit = await checkRateLimit(`proof:consent:get:${ip}`, 30, 60);
  if (!rateLimit.allowed) {
    return rateLimitResponse(rateLimit.resetIn);
  }

  const { searchParams } = new URL(req.url);
  const resolved = await resolveAuthorizedMap(req, searchParams.get("mapId"));
  if ("error" in resolved) return resolved.error;

  const record = await kv.get<ProofConsentRecord>(proofConsentMapKey(resolved.mapId));
  return NextResponse.json({
    ok: true,
    available: true,
    optedIn: Boolean(record?.websiteUsageAllowed),
    buyerContext: record?.buyerContext ?? null,
    buyerNote: record?.buyerNote ?? null,
    feedbackUpdatedAt: record?.feedbackUpdatedAt ?? null,
    updatedAt: record?.updatedAt ?? null,
  });
}

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  const rateLimit = await checkRateLimit(`proof:consent:post:${ip}`, 10, 60 * 60);
  if (!rateLimit.allowed) {
    return rateLimitResponse(rateLimit.resetIn);
  }

  const body = (await req.json().catch(() => null)) as
    | {
        mapId?: unknown;
        source?: unknown;
        orderType?: unknown;
        plan?: unknown;
        printVariant?: unknown;
      }
    | null;

  const resolved = await resolveAuthorizedMap(req, body?.mapId);
  if ("error" in resolved) return resolved.error;

  const source = normalizeSource(body?.source) ?? "success";
  const orderType = resolved.session.orderType ?? normalizeOrderType(body?.orderType) ?? "digital";
  const plan = resolved.session.plan ?? normalizePlan(body?.plan) ?? null;
  const printVariant = resolved.session.printVariant ?? normalizePrintVariant(body?.printVariant) ?? null;
  const now = new Date().toISOString();
  const existing = await kv.get<ProofConsentRecord>(proofConsentMapKey(resolved.mapId));

  const record: ProofConsentRecord = {
    sessionId: resolved.sessionId,
    mapId: resolved.mapId,
    source,
    orderType,
    plan,
    printVariant,
    websiteUsageAllowed: true,
    buyerContext: existing?.buyerContext ?? null,
    buyerNote: existing?.buyerNote ?? null,
    feedbackUpdatedAt: existing?.feedbackUpdatedAt ?? null,
    reviewStatus: existing?.reviewStatus ?? "new",
    reviewUpdatedAt: existing?.reviewUpdatedAt ?? now,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };

  await kv.set(proofConsentMapKey(resolved.mapId), record, { ex: 60 * 60 * 24 * 400 });
  await kv.set(proofConsentSessionKey(resolved.sessionId), record, { ex: 60 * 60 * 24 * 400 });

  return NextResponse.json({
    ok: true,
    optedIn: true,
    updatedAt: record.updatedAt,
  });
}

export async function DELETE(req: NextRequest) {
  const ip = getClientIp(req);
  const rateLimit = await checkRateLimit(`proof:consent:delete:${ip}`, 10, 60 * 60);
  if (!rateLimit.allowed) {
    return rateLimitResponse(rateLimit.resetIn);
  }

  const { searchParams } = new URL(req.url);
  const resolved = await resolveAuthorizedMap(req, searchParams.get("mapId"));
  if ("error" in resolved) return resolved.error;

  const existing = await kv.get<ProofConsentRecord>(proofConsentMapKey(resolved.mapId));
  const now = new Date().toISOString();
  const record: ProofConsentRecord = {
    sessionId: resolved.sessionId,
    mapId: resolved.mapId,
    source: existing?.source ?? "success",
    orderType: existing?.orderType ?? resolved.session.orderType ?? "digital",
    plan: existing?.plan ?? resolved.session.plan ?? null,
    printVariant: existing?.printVariant ?? resolved.session.printVariant ?? null,
    websiteUsageAllowed: false,
    buyerContext: existing?.buyerContext ?? null,
    buyerNote: existing?.buyerNote ?? null,
    feedbackUpdatedAt: existing?.feedbackUpdatedAt ?? null,
    reviewStatus: existing?.reviewStatus ?? "new",
    reviewUpdatedAt: existing?.reviewUpdatedAt ?? now,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };

  await kv.set(proofConsentMapKey(resolved.mapId), record, { ex: 60 * 60 * 24 * 400 });
  await kv.set(proofConsentSessionKey(resolved.sessionId), record, { ex: 60 * 60 * 24 * 400 });

  return NextResponse.json({
    ok: true,
    optedIn: false,
    updatedAt: record.updatedAt,
  });
}

export async function PATCH(req: NextRequest) {
  const ip = getClientIp(req);
  const rateLimit = await checkRateLimit(`proof:consent:patch:${ip}`, 10, 60 * 60);
  if (!rateLimit.allowed) {
    return rateLimitResponse(rateLimit.resetIn);
  }

  const body = (await req.json().catch(() => null)) as
    | {
        mapId?: unknown;
        buyerContext?: unknown;
        buyerNote?: unknown;
      }
    | null;

  const resolved = await resolveAuthorizedMap(req, body?.mapId);
  if ("error" in resolved) return resolved.error;

  const normalizedContext = normalizeOptionalText(body?.buyerContext, MAX_BUYER_CONTEXT_LENGTH);
  if (!normalizedContext.ok) return normalizedContext.error;
  const normalizedNote = normalizeOptionalText(body?.buyerNote, MAX_BUYER_NOTE_LENGTH);
  if (!normalizedNote.ok) return normalizedNote.error;

  const existing = await kv.get<ProofConsentRecord>(proofConsentMapKey(resolved.mapId));
  const now = new Date().toISOString();
  const record: ProofConsentRecord = {
    sessionId: resolved.sessionId,
    mapId: resolved.mapId,
    source: existing?.source ?? "success",
    orderType: existing?.orderType ?? resolved.session.orderType ?? "digital",
    plan: existing?.plan ?? resolved.session.plan ?? null,
    printVariant: existing?.printVariant ?? resolved.session.printVariant ?? null,
    websiteUsageAllowed: existing?.websiteUsageAllowed ?? false,
    buyerContext: normalizedContext.value,
    buyerNote: normalizedNote.value,
    feedbackUpdatedAt: now,
    reviewStatus: existing?.reviewStatus ?? "new",
    reviewUpdatedAt: existing?.reviewUpdatedAt ?? now,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };

  await kv.set(proofConsentMapKey(resolved.mapId), record, { ex: 60 * 60 * 24 * 400 });
  await kv.set(proofConsentSessionKey(resolved.sessionId), record, { ex: 60 * 60 * 24 * 400 });

  return NextResponse.json({
    ok: true,
    buyerContext: record.buyerContext,
    buyerNote: record.buyerNote,
    feedbackUpdatedAt: record.feedbackUpdatedAt,
    updatedAt: record.updatedAt,
  });
}
