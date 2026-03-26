import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit, getClientIp, rateLimitResponse } from "@/lib/rateLimit";
import { getFunnelDashboard, recordFunnelStep } from "@/lib/funnel";
import { isFunnelStep, isServerCanonicalFunnelStep } from "@/lib/funnelSteps";

export const runtime = "nodejs";

type FunnelRequestBody = {
  step?: string;
  source?: string;
  plan?: string;
  experiment?: string;
  variant?: string;
};

const dashboardToken = process.env.FUNNEL_DASHBOARD_TOKEN?.trim() || "";
function hasDashboardAccess(req: NextRequest) {
  if (!dashboardToken) return true;
  const token =
    req.headers.get("x-funnel-token")?.trim() ||
    new URL(req.url).searchParams.get("token")?.trim() ||
    "";
  return token === dashboardToken;
}

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  const rateLimit = await checkRateLimit(`analytics:funnel:post:${ip}`, 120, 60);
  if (!rateLimit.allowed) return rateLimitResponse(rateLimit.resetIn);

  let body: FunnelRequestBody;

  try {
    body = (await req.json()) as FunnelRequestBody;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const step = typeof body.step === "string" ? body.step.trim() : "";
  if (!isFunnelStep(step)) {
    return NextResponse.json({ ok: false, error: "Invalid step" }, { status: 400 });
  }

  // These milestones are now recorded server-side only to keep funnel math trustworthy.
  // Returning 202 avoids breaking older cached clients that may still try to post them.
  if (isServerCanonicalFunnelStep(step)) {
    return NextResponse.json({ ok: true, ignored: true, reason: "server_canonical_step" }, { status: 202 });
  }

  await recordFunnelStep({
    step,
    source: body.source,
    plan: body.plan,
    experiment: body.experiment,
    variant: body.variant,
  });

  return NextResponse.json({ ok: true });
}

export async function GET(req: NextRequest) {
  const ip = getClientIp(req);
  const rateLimit = await checkRateLimit(`analytics:funnel:get:${ip}`, 20, 60);
  if (!rateLimit.allowed) return rateLimitResponse(rateLimit.resetIn);

  if (!hasDashboardAccess(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const daysParam = Number.parseInt(new URL(req.url).searchParams.get("days") || "14", 10);
  const data = await getFunnelDashboard(daysParam);
  return NextResponse.json({ ok: true, data });
}
