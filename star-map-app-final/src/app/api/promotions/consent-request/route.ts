import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit, getClientIp, rateLimitResponse } from "@/lib/rateLimit";
import { requestPromotionConsentFlow } from "@/lib/promotionCoordinator";
import { normalizePromotionEmail, isValidPromotionEmail } from "@/lib/promotionSubscriptions";
import { RD_K_DISCLOSURE } from "@/lib/promotionDisclosure";
import { PROMOTION_SIGNUP_MESSAGES } from "@/lib/promotionSignupStatus";

function respond(req: NextRequest, status: keyof typeof PROMOTION_SIGNUP_MESSAGES, json: Response) {
  // Native navigation requests accept HTML; API callers keep the JSON contract.
  const accept = req.headers.get("accept") ?? "";
  if (!accept.includes("text/html") || accept.includes("application/json")) return json;
  let target = new URL("/", req.url);
  try {
    const referrer = new URL(req.headers.get("referer") ?? "");
    if (referrer.origin === target.origin && ["/", "/editor"].includes(referrer.pathname)) {
      target = referrer;
    }
  } catch { /* Missing/invalid referrer returns to the storefront home. */ }
  target.searchParams.set("promo", status);
  target.searchParams.delete("code");
  return NextResponse.redirect(target, { status: 303 });
}

/** Stage A captures a pending request only. It never sends or exposes the token.
 * Confirmation delivery/activation is separately authorized, outside this stage. */
export async function POST(req: NextRequest) {
  const limit = await checkRateLimit(`rd-k:request:${getClientIp(req)}`, 10, 60);
  if (!limit.allowed) return respond(req, "rate_limited", rateLimitResponse(limit.resetIn));
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return respond(req, "error", NextResponse.json({ error: "invalid_request" }, { status: 400 }));
  }
  const email = normalizePromotionEmail(form.get("email"));
  if (
    !isValidPromotionEmail(email) ||
    form.get("consent") !== "yes" ||
    form.get("disclosureVersion") !== RD_K_DISCLOSURE.version ||
    form.get("disclosureHash") !== RD_K_DISCLOSURE.hash
  ) {
    return respond(req, "error", NextResponse.json({ error: "fresh_consent_required" }, { status: 400 }));
  }
  if (!form.get("website")) {
    try {
      await requestPromotionConsentFlow({
        email,
        capture: {
          email,
          disclosureVersion: RD_K_DISCLOSURE.version,
          disclosureHash: RD_K_DISCLOSURE.hash,
          affirmativeAction: "checkbox_and_submit",
        },
      });
    } catch {
      return respond(req, "capture_unavailable", NextResponse.json({ error: "capture_unavailable" }, { status: 503 }));
    }
  }
  return respond(req, "pending", NextResponse.json({
    ok: true,
    status: "pending",
    message: PROMOTION_SIGNUP_MESSAGES.pending,
  }));
}
