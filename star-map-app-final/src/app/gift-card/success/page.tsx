import type { Metadata } from "next";
import GiftCardSuccessClient from "./GiftCardSuccessClient";

export const metadata: Metadata = {
  title: "Your Gift Certificate | StarMapCo",
  robots: { index: false, follow: false },
  // Q1 bearer hygiene: this page's URL carries the checkout session
  // id (the certificate-view credential) on arrival. Never let it
  // leave as a Referer — mirrors the no-referrer meta on the Stripe
  // checkout handoff document (stripeCheckoutNavigation.ts).
  other: { referrer: "no-referrer" },
};

export default async function GiftCardSuccessPage({
  searchParams,
}: {
  searchParams: Promise<{ session_id?: string }>;
}) {
  const params = await searchParams;
  const sessionId = typeof params.session_id === "string" ? params.session_id : null;
  return (
    <main className="mx-auto max-w-2xl px-4 pt-10 pb-12 sm:pt-14">
      <GiftCardSuccessClient sessionId={sessionId} />
    </main>
  );
}
