import { SimplifiedEditor } from "@/components/SimplifiedEditor";

export const metadata = {
  title: "Simplified Editor Test | StarMapCo",
  robots: { index: false, follow: false },
};

export default function SimpleTestPage() {
  return (
    <main className="min-h-screen bg-[#0a0f1f] text-white">
      <div className="mx-auto w-full max-w-6xl px-6 py-10">
        <SimplifiedEditor />
      </div>
    </main>
  );
}
