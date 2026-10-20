import { NextRequest, NextResponse } from "next/server";
import { normalizePromotionEmail } from "@/lib/promotionSubscriptions";
import { getReviewOptOutSecret, verifyReviewOptOutToken } from "@/lib/reviewRequestEmail";
import { recordReviewOptOut } from "@/lib/reviewRequests";
import { createWrapperKvScanStore } from "@/lib/reviewRequestRuntime";
import { escapeHtml } from "@/lib/transactionalEmailLayout";

export const runtime = "nodejs";

/**
 * Review-request opt-out (T1).
 *
 * GET  — confirmation page ONLY. It never mutates state: mail scanners
 *        prefetch links, and a GET that unsubscribes would silently opt out
 *        people who never clicked (Step-0 Codex critique, P2). This is a
 *        deliberate deviation from OurImprint's GET-mutates shape.
 * POST — performs the opt-out (confirmation form, or a mail client's
 *        List-Unsubscribe-Post one-click POST). Token-gated either way.
 *
 * The opt-out suppresses review requests only; it does not touch order or
 * shipping emails.
 */

const NO_STORE = { "Cache-Control": "no-store" } as const;

function page(title: string, bodyHtml: string, status = 200): NextResponse {
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${escapeHtml(title)} — StarMapCo</title></head>
<body style="margin:0;padding:32px 16px;background:#050915;color:#f8fafc;font-family:Georgia,'Times New Roman',serif;">
<main style="max-width:520px;margin:0 auto;">
<h1 style="font-size:24px;margin:0 0 16px;">${escapeHtml(title)}</h1>
${bodyHtml}
</main></body></html>`;
  return new NextResponse(html, {
    status,
    headers: { ...NO_STORE, "Content-Type": "text/html; charset=utf-8" },
  });
}

function readCredentials(req: NextRequest, form?: FormData | null): { email: string; token: string } {
  const url = new URL(req.url);
  const email = (form?.get("e")?.toString() ?? url.searchParams.get("e") ?? "").trim();
  const token = (form?.get("t")?.toString() ?? url.searchParams.get("t") ?? "").trim();
  return { email, token };
}

function verify(email: string, token: string): boolean {
  const secret = getReviewOptOutSecret();
  if (!secret || !email || !token) return false;
  return verifyReviewOptOutToken(normalizePromotionEmail(email), token, secret);
}

export async function GET(req: NextRequest) {
  if (!getReviewOptOutSecret()) {
    return page(
      "Unsubscribe unavailable",
      `<p>We can't process unsubscribe links right now. Reply to any StarMapCo email and ask to be removed from review requests — we'll do it manually.</p>`,
      503,
    );
  }
  const { email, token } = readCredentials(req);
  if (!verify(email, token)) {
    return page(
      "This link isn't valid",
      `<p>This unsubscribe link is invalid or has expired. If you'd like to stop review requests, reply to any StarMapCo email and let us know.</p>`,
      400,
    );
  }
  const form = `<form method="post" action="/api/reviews/opt-out">
<input type="hidden" name="e" value="${escapeHtml(email)}"/>
<input type="hidden" name="t" value="${escapeHtml(token)}"/>
<p>Confirm you'd like to stop receiving review-request emails from StarMapCo. This only affects review requests — order and shipping emails are unchanged.</p>
<button type="submit" style="background:#fbbf24;color:#050915;border:0;border-radius:999px;padding:12px 22px;font-size:15px;cursor:pointer;">Unsubscribe from review requests</button>
</form>`;
  return page("Unsubscribe from review requests", form);
}

export async function POST(req: NextRequest) {
  if (!getReviewOptOutSecret()) {
    return page(
      "Unsubscribe unavailable",
      `<p>We can't process unsubscribe links right now. Reply to any StarMapCo email and ask to be removed from review requests — we'll do it manually.</p>`,
      503,
    );
  }
  let form: FormData | null = null;
  try {
    form = await req.formData();
  } catch {
    form = null; // List-Unsubscribe-Post bodies are form-encoded; a parse
    // failure just means we fall back to the query-string credentials.
  }
  const { email, token } = readCredentials(req, form);
  if (!verify(email, token)) {
    return page(
      "This link isn't valid",
      `<p>This unsubscribe link is invalid or has expired. No changes were made.</p>`,
      400,
    );
  }
  const oneClick = (form?.get("List-Unsubscribe")?.toString() ?? "") === "One-Click";
  await recordReviewOptOut(
    createWrapperKvScanStore(),
    email,
    Date.now(),
    oneClick ? "list_unsubscribe" : "opt_out_page",
  );
  return page(
    "You're unsubscribed",
    `<p>You won't receive review-request emails from StarMapCo again. Order and shipping emails are unaffected.</p>`,
  );
}
