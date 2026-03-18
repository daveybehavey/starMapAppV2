import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit, getClientIp, rateLimitResponse } from "@/lib/rateLimit";
import { getCheckoutFailureDashboard, recordCheckoutFailure } from "@/lib/checkoutDiagnostics";
import { hasValidAdminToken, readAdminTokenFromHeaders } from "@/lib/adminAuth";

export const runtime = "nodejs";

const CHECKOUT_CLIENT_DIAGNOSTIC_ALLOWED_REASONS = new Set([
  "missing_shipping_country",
  "print_render_failed",
  "print_asset_failed",
  "print_asset_too_large",
  "asset_upload_failed",
  "missing_recipe",
  "missing_print_asset",
  "invalid_promotion_code",
  "promotion_not_applicable",
  "promotion_lookup_failed",
  "print_checkout_disabled",
  "print_shipping_country_invalid",
  "print_margin_guard_blocked",
  "print_promotion_margin_blocked",
  "checkout_failed",
  "no_checkout_url",
  "no_url",
  "network_error",
  "request_aborted",
  "unknown_client_error",
]);

function normalizeReason(raw: unknown) {
  if (typeof raw !== "string") return "unknown_client_error";
  const normalized = raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80);
  if (!normalized) return "unknown_client_error";
  if (normalized.includes("failed_to_fetch") || normalized.includes("networkerror")) return "network_error";
  if (normalized.includes("abort")) return "request_aborted";
  if (CHECKOUT_CLIENT_DIAGNOSTIC_ALLOWED_REASONS.has(normalized)) return normalized;
  return "unknown_client_error";
}

function normalizeDimension(raw: unknown, max = 48) {
  if (typeof raw !== "string") return undefined;
  const cleaned = raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, max);
  return cleaned || undefined;
}

type CheckoutClientDiagnosticPayload = {
  reason?: unknown;
  source?: unknown;
  plan?: unknown;
};

function hasAccess(req: NextRequest) {
  const configured = process.env.PRINT_ADMIN_TOKEN?.trim() || "";
  const candidate = readAdminTokenFromHeaders(req.headers);
  return hasValidAdminToken(candidate, configured);
}

export async function GET(req: NextRequest) {
  const ip = getClientIp(req);
  const rateLimit = await checkRateLimit(`analytics:checkout-diagnostics:get:${ip}`, 20, 60);
  if (!rateLimit.allowed) return rateLimitResponse(rateLimit.resetIn);

  if (!hasAccess(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const daysParam = Number.parseInt(new URL(req.url).searchParams.get("days") || "14", 10);
  const data = await getCheckoutFailureDashboard(daysParam);
  return NextResponse.json({ ok: true, data });
}

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  const rateLimit = await checkRateLimit(`analytics:checkout-diagnostics:post:${ip}`, 20, 60);
  if (!rateLimit.allowed) return rateLimitResponse(rateLimit.resetIn);

  let body: CheckoutClientDiagnosticPayload | null = null;
  try {
    body = (await req.json()) as CheckoutClientDiagnosticPayload;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid payload" }, { status: 400 });
  }

  if (!body || typeof body !== "object" || typeof body.reason !== "string" || !body.reason.trim()) {
    return NextResponse.json({ ok: false, error: "Missing reason" }, { status: 400 });
  }

  const reason = normalizeReason(body.reason);
  const source = normalizeDimension(body.source);
  const plan = normalizeDimension(body.plan);
  await recordCheckoutFailure({
    reason: `client_${reason}`,
    source,
    plan,
  });
  return NextResponse.json({ ok: true });
}
