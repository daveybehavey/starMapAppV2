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
    <main className="flex min-h-screen flex-col items-center justify-center bg-[#0b0f3b] px-4 text-amber-50">
      <div className="rounded-2xl bg-white/10 p-6 text-center shadow-2xl backdrop-blur">
        <p className="text-lg font-semibold">Payment successful</p>
        <p className="mt-2 text-sm text-amber-100">Unlocking your HD download…</p>
      </div>
    </main>
  );
}
