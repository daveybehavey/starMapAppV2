import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit, getClientIp, rateLimitResponse } from "@/lib/rateLimit";
import { requestPromotionConsentFlow } from "@/lib/promotionCoordinator";
import { normalizePromotionEmail, isValidPromotionEmail } from "@/lib/promotionSubscriptions";
import { RD_K_DISCLOSURE } from "@/lib/promotionDisclosure";

/** Stage A captures a pending request only. It never sends or exposes the token.
 * Confirmation delivery/activation is separately authorized, outside this stage. */
export async function POST(req: NextRequest) {
  const limit = await checkRateLimit(`rd-k:request:${getClientIp(req)}`, 10, 60);
  if (!limit.allowed) return rateLimitResponse(limit.resetIn);
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }
  const email = normalizePromotionEmail(form.get("email"));
  if (
    !isValidPromotionEmail(email) ||
    form.get("consent") !== "yes" ||
    form.get("disclosureVersion") !== RD_K_DISCLOSURE.version ||
    form.get("disclosureHash") !== RD_K_DISCLOSURE.hash
  ) {
    return NextResponse.json({ error: "fresh_consent_required" }, { status: 400 });
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
      return NextResponse.json({ error: "capture_unavailable" }, { status: 503 });
    }
  }
  return NextResponse.json({
    ok: true,
    status: "pending",
    message: "Request recorded. Email confirmation is not yet available. Your subscription is not complete.",
  });
}
