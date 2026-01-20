import { Suspense } from "react";
import { EditorExperience } from "@/components/EditorExperience";

export default function EditorPage() {
  return (
    <Suspense fallback={null}>
      <main className="flex flex-col items-center px-6 md:px-8 lg:px-12 py-4 md:py-8 lg:py-0">
        <EditorExperience variant="full" />
      </main>
    </Suspense>
  );
}
