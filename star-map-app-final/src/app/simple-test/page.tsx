import dynamic from "next/dynamic";

const SimplifiedEditor = dynamic(
  () => import("@/components/SimplifiedEditor"),
  { ssr: false }
);

export default function SimpleTestPage() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-[#0b1433] via-[#0b1a30] to-[#0b1433] px-4 py-12">
      <div className="mx-auto max-w-5xl">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold text-white">
            Simplified Editor Test
          </h1>
          <p className="mt-2 text-amber-100/70">
            Testing the new "Preview First" flow
          </p>
        </div>
        <SimplifiedEditor />
      </div>
    </main>
  );
}
