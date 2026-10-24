import Link from "next/link";
import type { Metadata } from "next";
import {
  isValidPromotionEmail,
  normalizePromotionEmail,
  verifyPromotionUnsubscribeToken,
} from "@/lib/promotionSubscriptions";
import { unsubscribePromotionFlow } from "@/lib/promotionCoordinator";
import { getReviewOptOutSecret } from "@/lib/reviewRequestEmail";
import {
  createReviewSuppressionClient,
  deriveReviewSuppressionName,
} from "@/lib/reviewRequestSuppression";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Unsubscribe | StarMapCo",
  description: "Manage promotional email preferences",
  robots: { index: false, follow: false },
};

type PageProps = {
  searchParams?: Promise<{ email?: string; token?: string }>;
};

export default async function UnsubscribePage({ searchParams }: PageProps) {
  const params = (await searchParams) ?? {};
  const email = normalizePromotionEmail(params.email);
  const token = typeof params.token === "string" ? params.token.trim() : "";

  const valid = isValidPromotionEmail(email) && verifyPromotionUnsubscribeToken(email, token);

  let status: "invalid" | "unsubscribed" | "already_unsubscribed" | "error" = "invalid";

  if (valid) {
    // Two obligations, deliberately decoupled (T-T1 + Codex re-gate):
    //
    // (1) The PROMOTIONAL opt-out. A valid promotions unsubscribe token
    // must always be able to record the opt-out below (since T-SM-KVRACE
    // the authoritative record is the per-email Consistency Coordinator,
    // which also cancels eligible pending delivery jobs; its KV
    // projection keeps the readers below working). Promotions
    // links may be signed with any supported promotions secret (the
    // promotionSubscriptions fallbacks), including configurations where
    // no purpose-built review opt-out secret exists — the promotional
    // unsubscribe must not depend on review-engine readiness.
    //
    // (2) The REVIEW suppression record. When the review opt-out secret
    // IS configured, the authoritative suppression-DO record is
    // established BEFORE any acknowledgement — including on the
    // already-unsubscribed path, where the KV row alone never proved
    // the authoritative record exists — and a failed write fails the
    // page closed: nothing is written, nothing is acknowledged. When
    // the secret is NOT configured there is no key to name a record
    // with, and the review engine cannot dispatch at all (its tick
    // blocks on signing_secret_missing); a KV opt-out recorded in that
    // state is still honoured later, because the tick treats the
    // promotions KV state as a suppression source. Suppression
    // enforcement therefore sits on the dispatch side rather than
    // breaking a valid promotional unsubscribe.
    //
    // The review secret set is NOT broadened to match the promotions
    // fallbacks: payment and referral secrets never key review
    // suppression (secret separation, reviewRequestEmail.ts).
    const secret = getReviewOptOutSecret();
    const suppressionSettled = secret
      ? await createReviewSuppressionClient().record(
          deriveReviewSuppressionName(email, secret),
          "promotions_unsubscribe",
          Date.now(),
        )
      : true;
    if (!suppressionSettled) {
      status = "error";
    } else {
      try {
        const result = await unsubscribePromotionFlow({ email, reason: "email_link" });
        if (result.wasAlreadyUnsubscribed) {
          status = "already_unsubscribed";
        } else {
          status = "unsubscribed";
        }
      } catch {
        // A coordinator failure fails the page closed, exactly like a
        // suppression failure: nothing is written, nothing acknowledged.
        status = "error";
      }
    }
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl items-center px-6 py-16 text-white">
      <section className="w-full rounded-3xl border border-white/10 bg-white/5 p-8 shadow-2xl shadow-black/30">
        <p className="text-xs font-semibold uppercase tracking-[0.35em] text-amber-300">Email preferences</p>
        <h1 className="mt-3 text-3xl font-semibold text-white">
          {status === "invalid"
            ? "This unsubscribe link is invalid"
            : status === "error"
              ? "We couldn't record your unsubscribe"
              : status === "already_unsubscribed"
                ? "You are already unsubscribed"
                : "You have been unsubscribed"}
        </h1>
        <p className="mt-4 text-sm text-neutral-300">
          {status === "invalid"
            ? "The link may be malformed or expired. If you still want help, contact support@starmapco.com."
            : status === "error"
              ? "Nothing was changed. Please try again in a few minutes, or reply to any StarMapCo email and ask to be removed — we'll do it manually."
              : `We will stop sending promo updates to ${email}. You can subscribe again any time from the site.`}
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            href="/"
            className="inline-flex items-center justify-center rounded-full bg-amber-300 px-5 py-3 text-sm font-semibold text-slate-950"
          >
            Back to homepage
          </Link>
          <Link
            href="/contact"
            className="inline-flex items-center justify-center rounded-full border border-white/20 px-5 py-3 text-sm font-semibold text-white"
          >
            Contact support
          </Link>
        </div>
      </section>
    </main>
  );
}
