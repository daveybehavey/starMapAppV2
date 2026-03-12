"use client";

import dynamic from "next/dynamic";
import EditorFontShell from "@/components/EditorFontShell";

const EditorExperience = dynamic(
  () => import("@/components/EditorExperience").then((mod) => mod.EditorExperience),
  {
    loading: () => (
      <div className="flex min-h-[600px] items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="h-10 w-10 animate-spin rounded-full border-2 border-amber-400/30 border-t-amber-400" />
          <span className="text-sm text-neutral-400">Loading editor...</span>
        </div>
      </div>
    ),
    ssr: false,
  },
);

type EditorPageClientProps = {
  promoStatus?: string;
  promoCode?: string;
};

export default function EditorPageClient({ promoStatus, promoCode }: EditorPageClientProps) {
  const showPromo = promoStatus === "success" || promoStatus === "error";
  const promoMessage =
    promoStatus === "success"
      ? promoCode
        ? `You're on the list! Code ${promoCode} is saved for your first single HD digital checkout.`
        : "You're on the list! Watch your inbox for your 50% off first HD file code."
      : "We couldn't save that email. Please try again.";

  return (
    <EditorFontShell>
      <main className="flex w-full flex-col items-center px-4 py-4 sm:px-6 md:px-8 md:py-8 lg:px-12 lg:py-0">
        {showPromo ? (
          <div className="mb-4 w-full max-w-4xl rounded-2xl border border-amber-200/60 bg-amber-50/90 px-4 py-3 text-sm font-semibold text-amber-900 shadow-sm">
            {promoMessage}
          </div>
        ) : null}
        <EditorExperience variant="quick" allowAdvancedInQuick />
      </main>
    </EditorFontShell>
  );
}
