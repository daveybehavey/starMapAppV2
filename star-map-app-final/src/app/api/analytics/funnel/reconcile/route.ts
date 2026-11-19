import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { hasValidAdminToken, readAdminTokenFromHeaders } from "@/lib/adminAuth";
import { isQaStripeSession } from "@/lib/commerceAnalytics";
import { hasPaymentVerifiedRecord } from "@/lib/funnel";

export const runtime = "nodejs";
const stripeSecret = process.env.STRIPE_SECRET_KEY?.trim() || "";
const stripe = stripeSecret ? new Stripe(stripeSecret, {
  apiVersion: "2024-06-20", httpClient: Stripe.createFetchHttpClient(), timeout: 20_000,
}) : null;

function validInteger(value: unknown, max: number) {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= max;
}

export async function POST(req: NextRequest) {
  const configured = process.env.PRINT_ADMIN_TOKEN?.trim() || "";
  if (!hasValidAdminToken(readAdminTokenFromHeaders(req.headers), configured)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  let body: Record<string, unknown>;
  try {
    const parsed: unknown = await req.json();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error();
    body = parsed as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "Expected a JSON object" }, { status: 400 });
  }
  if (
    Object.keys(body).some((key) => !["days", "limit", "dryRun"].includes(key)) ||
    (body.days !== undefined && !validInteger(body.days, 60)) ||
    (body.limit !== undefined && !validInteger(body.limit, 500)) ||
    (body.dryRun !== undefined && typeof body.dryRun !== "boolean")
  ) {
    return NextResponse.json({ ok: false, error: "Invalid reconciliation options" }, { status: 400 });
  }
  // KV has no transaction/CAS shared with webhook writers. A process-local lock
  // or a second read cannot make replacement safe. Reject before any repair (#658).
  if (body.dryRun === false) {
    return NextResponse.json({ ok: false, error: "apply_unavailable",
      reason: "Atomic reconciliation with concurrent payment writers is not available",
    }, { status: 409 });
  }
  if (!stripe) {
    return NextResponse.json({ ok: false, error: "Stripe not configured" }, { status: 503 });
  }
  const days = (body.days as number | undefined) ?? 30;
  const limit = (body.limit as number | undefined) ?? 100;
  const now = new Date();
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const start = today - (days - 1) * 86_400_000;
  // Freeze both bounds. Today's count is only through this cutoff (exclusive).
  const created = { gte: start / 1000, lt: Math.floor(now.getTime() / 1000) };
  const countsByDate: Record<string, number> = {};
  for (let day = start; day <= today; day += 86_400_000) {
    countsByDate[new Date(day).toISOString().slice(0, 10)] = 0;
  }
  let scanned = 0;
  let excludedQa = 0;
  let excludedTest = 0;
  let complete = false;
  let startingAfter: string | undefined;
  const seen = new Set<string>();
  const eligible: Stripe.Checkout.Session[] = [];
  try {
    // Bound ALL scanned sessions, including unpaid/QA, not just eligible orders.
    while (scanned < limit) {
      const pageSize = Math.min(100, limit - scanned);
      const page = await stripe.checkout.sessions.list({
        limit: pageSize, created,
        ...(startingAfter ? { starting_after: startingAfter } : {}),
      });
      if (!Array.isArray(page.data) || typeof page.has_more !== "boolean" ||
          page.data.length > pageSize || (page.has_more && page.data.length === 0)) break;
      let invalidPage = false;
      for (const session of page.data) {
        if (!session.id || seen.has(session.id) || !Number.isInteger(session.created) ||
            session.created < created.gte || session.created >= created.lt) {
          invalidPage = true;
          break;
        }
        seen.add(session.id);
        scanned += 1;
        if (session.livemode !== true) { excludedTest += 1; continue; }
        if (isQaStripeSession(session)) { excludedQa += 1; continue; }
        const paid = session.payment_status === "paid" || session.payment_status === "no_payment_required";
        const belongs = session.metadata?.plan || session.metadata?.order_type ||
          session.metadata?.print_variant || session.metadata?.map_id || session.client_reference_id;
        if (!paid || (session.amount_total ?? 0) <= 0 || !belongs) continue;
        eligible.push(session);
      }
      if (invalidPage) break;
      if (!page.has_more) { complete = true; break; }
      startingAfter = page.data[page.data.length - 1]?.id;
      if (!startingAfter) break;
    }
  } catch {
    // Never echo provider objects/errors, which can contain private identifiers.
    return NextResponse.json({ ok: false, error: "scan_failed", complete: false }, { status: 502 });
  }
  if (!complete) {
    return NextResponse.json({ ok: false, error: "scan_incomplete", complete: false,
      dryRun: true, scanned, limit }, { status: 409 });
  }
  let alreadyRecorded = 0;
  for (const session of eligible) {
    const date = new Date(session.created * 1000).toISOString().slice(0, 10);
    countsByDate[date] += 1;
    if (await hasPaymentVerifiedRecord(session.id)) alreadyRecorded += 1;
  }
  return NextResponse.json({
    ok: true, dryRun: true, applyAvailable: false, complete, days, scanned,
    eligible: eligible.length, excludedQa, excludedTest, alreadyRecorded,
    repaired: 0, wouldRepair: eligible.length - alreadyRecorded,
    window: { startInclusive: created.gte, endExclusive: created.lt, timezone: "UTC" },
    countsByDate, sync: null,
  });
}
