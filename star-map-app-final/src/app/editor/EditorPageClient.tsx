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

export default function EditorPageClient() {
  return (
    <EditorFontShell>
      <main className="flex flex-col items-center px-6 py-4 md:px-8 md:py-8 lg:px-12 lg:py-0">
        <EditorExperience variant="quick" allowAdvancedInQuick />
      </main>
    </EditorFontShell>
  );
}
