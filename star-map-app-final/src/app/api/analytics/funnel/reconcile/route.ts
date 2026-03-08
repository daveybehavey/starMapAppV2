import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { hasValidAdminToken, readAdminTokenFromHeaders } from "@/lib/adminAuth";
import { hasPaymentVerifiedRecord, recordPaymentVerifiedOnce } from "@/lib/funnel";

export const runtime = "nodejs";

const stripeSecret = process.env.STRIPE_SECRET_KEY?.trim() || "";
const stripe =
  stripeSecret
    ? new Stripe(stripeSecret, {
        apiVersion: "2024-06-20",
        httpClient: Stripe.createFetchHttpClient(),
        timeout: 20_000,
      })
    : null;

type ReconcileBody = {
  days?: unknown;
  limit?: unknown;
  dryRun?: unknown;
};

function requireAdmin(req: NextRequest) {
  const configured = process.env.PRINT_ADMIN_TOKEN?.trim() || "";
  const candidate = readAdminTokenFromHeaders(req.headers);
  return hasValidAdminToken(candidate, configured);
}

function toPositiveInt(raw: unknown, fallback: number, max: number) {
  const parsed = typeof raw === "number" ? raw : typeof raw === "string" ? Number.parseInt(raw, 10) : NaN;
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

function isPaidCheckoutSession(session: Stripe.Checkout.Session) {
  return session.payment_status === "paid" || session.payment_status === "no_payment_required";
}

function belongsToStarMap(session: Stripe.Checkout.Session) {
  return Boolean(
    session.metadata?.plan ||
      session.metadata?.order_type ||
      session.metadata?.print_variant ||
      session.metadata?.map_id ||
      session.client_reference_id,
  );
}

function classifyOrder(session: Stripe.Checkout.Session) {
  return session.metadata?.order_type === "print" || session.metadata?.print_variant ? "print" : "digital";
}

function resolvePlan(session: Stripe.Checkout.Session) {
  const plan = typeof session.metadata?.plan === "string" ? session.metadata.plan.trim() : "";
  if (plan === "single" || plan === "pack3" || plan === "subscription") {
    return plan;
  }
  return classifyOrder(session) === "print" ? undefined : session.mode === "subscription" ? "subscription" : "single";
}

export async function POST(req: NextRequest) {
  if (!requireAdmin(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  if (!stripe) {
    return NextResponse.json({ ok: false, error: "Stripe not configured" }, { status: 503 });
  }

  let body: ReconcileBody = {};
  try {
    body = (await req.json()) as ReconcileBody;
  } catch {
    body = {};
  }

  const days = toPositiveInt(body.days, 30, 60);
  const limit = toPositiveInt(body.limit, 100, 500);
  const dryRun = toBoolean(body.dryRun, false);
  const createdGte = Math.floor(Date.now() / 1000) - days * 24 * 60 * 60;

  const eligibleSessions: Stripe.Checkout.Session[] = [];
  let scanned = 0;
  let startingAfter: string | undefined;

  while (eligibleSessions.length < limit) {
    const page = await stripe.checkout.sessions.list({
      limit: Math.min(100, limit - eligibleSessions.length),
      created: { gte: createdGte },
      ...(startingAfter ? { starting_after: startingAfter } : {}),
    });

    scanned += page.data.length;
    for (const session of page.data) {
      if (!isPaidCheckoutSession(session) || !belongsToStarMap(session)) continue;
      eligibleSessions.push(session);
      if (eligibleSessions.length >= limit) break;
    }

    if (!page.has_more || !page.data.length) break;
    startingAfter = page.data[page.data.length - 1]?.id;
    if (!startingAfter) break;
  }

  const results: Array<{
    sessionId: string;
    createdAt: string;
    orderType: "digital" | "print";
    plan: string | null;
    action: "already_recorded" | "repaired";
  }> = [];

  let alreadyRecorded = 0;
  let repaired = 0;

  for (const session of eligibleSessions) {
    const existing = await hasPaymentVerifiedRecord(session.id);
    if (existing) {
      alreadyRecorded += 1;
      results.push({
        sessionId: session.id,
        createdAt: new Date(session.created * 1000).toISOString(),
        orderType: classifyOrder(session),
        plan: resolvePlan(session) ?? null,
        action: "already_recorded",
      });
      continue;
    }

    if (!dryRun) {
      await recordPaymentVerifiedOnce({
        sessionId: session.id,
        source: classifyOrder(session) === "print" ? "stripe_reconcile_print" : "stripe_reconcile_digital",
        plan: resolvePlan(session),
        occurredAt: session.created * 1000,
      });
    }

    repaired += 1;
    results.push({
      sessionId: session.id,
      createdAt: new Date(session.created * 1000).toISOString(),
      orderType: classifyOrder(session),
      plan: resolvePlan(session) ?? null,
      action: "repaired",
    });
  }

  return NextResponse.json({
    ok: true,
    dryRun,
    days,
    scanned,
    eligible: eligibleSessions.length,
    alreadyRecorded,
    repaired,
    results,
  });
}
