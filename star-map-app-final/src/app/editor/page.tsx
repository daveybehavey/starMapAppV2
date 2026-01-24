import dynamic from "next/dynamic";
import { Suspense } from "react";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Star Map Editor",
  description: "Create and customize your personalized star map with our interactive editor.",
  robots: { index: false, follow: false },
};

// Lazy load the heavy EditorExperience component
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
  }
);

export default function EditorPage() {
  return (
    <Suspense fallback={null}>
      <main className="flex flex-col items-center px-6 md:px-8 lg:px-12 py-4 md:py-8 lg:py-0">
        <EditorExperience variant="full" />
      </main>
    </Suspense>
  );
}
