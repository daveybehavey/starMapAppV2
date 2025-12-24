"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useStore } from "@/lib/store";

export default function SuccessPage() {
  const router = useRouter();
  const setPaid = useStore((s) => s.setPaid);

  useEffect(() => {
    const token = `paid-${Date.now()}`;
    localStorage.setItem("star-map-unlock", token);
    setPaid(true);
    const timer = setTimeout(() => {
      router.replace("/");
    }, 1200);
    return () => clearTimeout(timer);
  }, [router, setPaid]);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-b from-[#0b1433] via-[#0b1a30] to-[#0b1433] px-4 text-amber-50">
      <div className="relative overflow-hidden rounded-3xl border border-amber-200/30 bg-white/10 px-8 py-7 text-center shadow-2xl backdrop-blur md:px-10 md:py-9">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -left-10 -top-16 h-36 w-36 rounded-full bg-amber-300/15 blur-3xl" />
          <div className="absolute -bottom-14 right-0 h-32 w-32 rounded-full bg-amber-500/10 blur-3xl" />
        </div>
        <div className="relative inline-flex items-center gap-2 rounded-full border border-amber-200/50 bg-white/20 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.15em] text-amber-100 shadow-sm">
          StarMapCo
        </div>
        <h1 className="relative mt-4 text-2xl font-semibold text-white md:text-3xl">Payment successful</h1>
        <p className="relative mt-2 text-sm text-amber-100/90">
          We’re preparing your print-ready star map. This will only take a moment.
        </p>
        <div className="relative mt-4 inline-flex items-center justify-center gap-2 rounded-full border border-amber-200/50 bg-white/15 px-4 py-2 text-xs font-semibold text-amber-50 shadow">
          ✨ Unlocking your HD download…
        </div>
        <p className="relative mt-3 text-[11px] uppercase tracking-[0.18em] text-amber-200/70">
          You’ll be redirected shortly
        </p>
      </div>
    </main>
  );
}
