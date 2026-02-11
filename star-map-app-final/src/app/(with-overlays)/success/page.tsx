import type { Metadata } from "next";
import { Suspense } from "react";
import SuccessClient from "./SuccessClient";

export const metadata: Metadata = {
  title: "Payment Success | StarMapCo",
  robots: { index: false, follow: false },
};

export default function SuccessPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-b from-[#0b1433] via-[#0b1a30] to-[#0b1433] px-4 text-amber-50">
          <div className="rounded-3xl border border-amber-200/30 bg-white/10 px-8 py-7 text-center shadow-2xl backdrop-blur md:px-10 md:py-9">
            <div className="inline-flex items-center gap-2 rounded-full border border-amber-200/50 bg-white/20 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.15em] text-amber-100 shadow-sm">
              StarMapCo
            </div>
            <h1 className="mt-4 text-2xl font-semibold text-white md:text-3xl">
              Verifying payment
            </h1>
            <p className="mt-2 text-sm text-amber-100/90">
              Confirming your payment with Stripe. This can take up to 45 seconds.
            </p>
          </div>
        </main>
      }
    >
      <SuccessClient />
    </Suspense>
  );
}
