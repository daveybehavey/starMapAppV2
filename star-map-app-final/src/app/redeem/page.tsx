import type { Metadata } from "next";
import { Breadcrumbs, BreadcrumbSchema } from "@/components/Breadcrumbs";
import RedeemClient from "./RedeemClient";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://starmapco.com";
const breadcrumbs = [
  { href: "/", label: "Home" },
  { href: "/redeem", label: "Redeem a gift certificate" },
];

export const metadata: Metadata = {
  title: "Redeem a Gift Certificate | StarMapCo",
  description:
    "Enter your StarMapCo gift certificate code to add your HD star map download and start creating your own personalized star map.",
  alternates: { canonical: `${siteUrl}/redeem` },
  robots: { index: false, follow: false },
};

export default function RedeemPage() {
  return (
    <main className="mx-auto max-w-4xl px-4 pt-10 pb-12 sm:pt-14">
      <header className="space-y-3 text-center">
        <Breadcrumbs items={breadcrumbs} className="flex justify-center" />
        <p className="text-xs tracking-[0.3em] text-amber-300 uppercase">StarMapCo</p>
        <h1 className="text-3xl font-bold text-white sm:text-4xl">Redeem your gift certificate</h1>
        <p className="mx-auto max-w-xl text-sm text-neutral-200 sm:text-base">
          Someone gave you the night sky. Enter the code from your certificate and your HD download is
          added right away — then create the star map that means something to you.
        </p>
      </header>
      <section className="mt-8">
        <RedeemClient />
      </section>
      <BreadcrumbSchema items={breadcrumbs} baseUrl={siteUrl} />
    </main>
  );
}
