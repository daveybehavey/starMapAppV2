import Link from "next/link";
import type { Metadata } from "next";
import { kv } from "@/lib/kv";
import {
  emailStateKey,
  isValidPromotionEmail,
  normalizePromotionEmail,
  verifyPromotionUnsubscribeToken,
  type PromotionEmailState,
} from "@/lib/promotionSubscriptions";

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

  let status: "invalid" | "unsubscribed" | "already_unsubscribed" = "invalid";

  if (valid) {
    const key = emailStateKey(email);
    const existing = await kv.get<PromotionEmailState>(key);
    if (existing?.unsubscribedAt) {
      status = "already_unsubscribed";
    } else {
      await kv.set<PromotionEmailState>(key, {
        subscribedAt: existing?.subscribedAt ?? Date.now(),
        couponSentAt: existing?.couponSentAt,
        followupSentAt: existing?.followupSentAt,
        unsubscribedAt: Date.now(),
        unsubscribeReason: "email_link",
        updatedAt: Date.now(),
        lastSource: existing?.lastSource,
      });
      status = "unsubscribed";
    }
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl items-center px-6 py-16 text-white">
      <section className="w-full rounded-3xl border border-white/10 bg-white/5 p-8 shadow-2xl shadow-black/30">
        <p className="text-xs font-semibold uppercase tracking-[0.35em] text-amber-300">Email preferences</p>
        <h1 className="mt-3 text-3xl font-semibold text-white">
          {status === "invalid"
            ? "This unsubscribe link is invalid"
            : status === "already_unsubscribed"
              ? "You are already unsubscribed"
              : "You have been unsubscribed"}
        </h1>
        <p className="mt-4 text-sm text-neutral-300">
          {status === "invalid"
            ? "The link may be malformed or expired. If you still want help, contact support@starmapco.com."
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
