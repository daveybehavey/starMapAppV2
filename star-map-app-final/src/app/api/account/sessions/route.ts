import { NextRequest, NextResponse } from "next/server";
import { kv } from "@/lib/kv";
import { hasValidAdminToken, readAdminTokenFromHeaders } from "@/lib/adminAuth";
import { getAccountLiteEmailSessions, normalizeAccountLiteEmail } from "@/lib/accountLite";
import type { CheckoutOrderType, CheckoutPlan, PrintVariant } from "@/lib/pricing";

export const runtime = "nodejs";

type SessionRecord = {
  paid?: boolean;
  revoked?: boolean;
  created?: number;
  mapId?: string;
  plan?: CheckoutPlan;
  creditsRemaining?: number;
  subscriptionActive?: boolean;
  orderType?: CheckoutOrderType;
  printVariant?: PrintVariant;
  includesDigitalAddOn?: boolean;
  amountTotal?: number | null;
  currency?: string | null;
  customerEmail?: string | null;
};

const sessionKey = (id: string) => `stripe:session:${id}`;

function requireAdmin(req: NextRequest) {
  const configured = process.env.PRINT_ADMIN_TOKEN?.trim() || "";
  const candidate = readAdminTokenFromHeaders(req.headers);
  return hasValidAdminToken(candidate, configured);
}

function parseLimit(raw: string | null) {
  if (!raw) return 20;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 1) return 20;
  return Math.min(40, parsed);
}

export async function GET(req: NextRequest) {
  if (!requireAdmin(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const email = normalizeAccountLiteEmail(req.nextUrl.searchParams.get("email"));
  if (!email) {
    return NextResponse.json({ ok: false, error: "valid email required" }, { status: 400 });
  }
  const limit = parseLimit(req.nextUrl.searchParams.get("limit"));
  const lookup = await getAccountLiteEmailSessions(email);
  if (!lookup) {
    return NextResponse.json({
      ok: true,
      emailHash: null,
      updatedAt: null,
      sessions: [],
    });
  }

  const sessions = await Promise.all(
    lookup.sessions.slice(0, limit).map(async (entry) => {
      const current = await kv.get<SessionRecord>(sessionKey(entry.sessionId));
      return {
        index: entry,
        current: current
          ? {
              paid: Boolean(current.paid),
              revoked: Boolean(current.revoked),
              created: current.created ?? null,
              mapId: current.mapId ?? null,
              plan: current.plan ?? null,
              creditsRemaining: typeof current.creditsRemaining === "number" ? current.creditsRemaining : null,
              subscriptionActive: Boolean(current.subscriptionActive),
              orderType: current.orderType ?? null,
              printVariant: current.printVariant ?? null,
              includesDigitalAddOn: Boolean(current.includesDigitalAddOn),
              amountTotal: typeof current.amountTotal === "number" ? current.amountTotal : null,
              currency: current.currency ?? null,
              customerEmail: current.customerEmail ?? null,
            }
          : null,
      };
    }),
  );

  return NextResponse.json({
    ok: true,
    emailHash: lookup.emailHash,
    updatedAt: lookup.updatedAt,
    sessions,
  });
}
