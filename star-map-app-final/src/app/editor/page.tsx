import type { Metadata } from "next";
import EditorPageClient from "./EditorPageClient";

export const metadata: Metadata = {
  title: "Star Map Editor",
  description: "Create and customize your personalized star map with our interactive editor.",
  robots: { index: false, follow: false },
};

export default function EditorPage() {
  return <EditorPageClient />;
}
