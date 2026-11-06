import type { Metadata } from "next";
import GiftCardSuccessClient from "./GiftCardSuccessClient";

export const metadata: Metadata = {
  title: "Your Gift Certificate | StarMapCo",
  robots: { index: false, follow: false },
};

export default async function GiftCardSuccessPage({
  searchParams,
}: {
  searchParams: Promise<{ session_id?: string }>;
}) {
  const params = await searchParams;
  const sessionId = typeof params.session_id === "string" ? params.session_id : null;
  return (
    <main className="mx-auto max-w-2xl px-4 pt-10 pb-12 sm:pt-14">
      <GiftCardSuccessClient sessionId={sessionId} />
    </main>
  );
}
