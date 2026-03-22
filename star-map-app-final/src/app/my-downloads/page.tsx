import { Suspense } from "react";
import MyDownloadsClient from "./MyDownloadsClient";

export const metadata = {
  title: "My Downloads | StarMapCo",
  description: "Access your recent StarMapCo download links from any device.",
  robots: {
    index: false,
    follow: false,
  },
};

export default function MyDownloadsPage() {
  return (
    <Suspense fallback={<main className="min-h-screen bg-[#0b1433]" />}>
      <MyDownloadsClient />
    </Suspense>
  );
}
