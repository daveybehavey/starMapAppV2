import Link from "next/link";
import { Breadcrumbs, BreadcrumbSchema } from "@/components/Breadcrumbs";
import DeliveryFormatModule from "@/components/DeliveryFormatModule";
import FramedProofSection from "@/components/FramedProofSection";
import FaqSchema from "@/components/FaqSchema";
import OccasionLinks from "@/components/OccasionLinks";
import PrimaryIntentLinksSection from "@/components/PrimaryIntentLinksSection";
import PreviewStartForm from "@/components/PreviewStartForm";
import StickyCtaBar from "@/components/StickyCtaBar";
import type { Metadata } from "next";

export const revalidate = 86400; // refresh once per day

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://starmapco.com";
const ogImage = `${siteUrl}/og-default.png`;
const breadcrumbs = [
  { href: "/", label: "Home" },
  { href: "/custom-night-sky-map", label: "Custom night sky map" },
];

export const metadata: Metadata = {
  title: "Custom Night Sky Map | StarMapCo",
  description:
    "Preview a custom night sky map from any meaningful date and place, compare digital and print routes, and explore related gift ideas.",
  alternates: { canonical: `${siteUrl}/custom-night-sky-map` },
  openGraph: {
    title: "Custom Night Sky Map | StarMapCo",
    description:
      "Preview a custom night sky map from any meaningful date and place, compare digital and print routes, and explore related gift ideas.",
    url: `${siteUrl}/custom-night-sky-map`,
    images: [{ url: ogImage, width: 1200, height: 630 }],
    type: "website",
  },
  twitter: { card: "summary_large_image", images: [ogImage] },
};

export default function CustomNightSkyMapPage() {
  return (
    <main className="mx-auto max-w-4xl px-4 pb-12 pt-10 sm:pt-14">
      <header className="space-y-3 text-center">
        <Breadcrumbs items={breadcrumbs} className="flex justify-center" />
        <p className="text-xs uppercase tracking-[0.3em] text-amber-300">StarMapCo</p>
        <h1 className="text-3xl font-bold text-white sm:text-4xl">Custom Night Sky Map</h1>
        <p className="text-sm text-white/90 sm:text-base">
          Preview a custom night sky map from any meaningful date and place, then compare digital and print routes from the same design.
        </p>
      </header>

      <PreviewStartForm
        source="custom-night-sky-map"
        title="Start your custom night-sky preview"
        description="Enter the date and place to open the preview. Choose the final delivery route after the design feels right."
        intentOptions={[
          {
            label: "Preview framed print",
            sourceSuffix: "framed",
            checkout: "print",
            printVariant: "poster_framed",
            plan: "print_framed",
            tone: "recommended",
            detail: "Best if you want the finished piece to arrive ready to display.",
          },
          {
            label: "Preview unframed print",
            sourceSuffix: "unframed",
            checkout: "print",
            printVariant: "poster_unframed",
            plan: "print_unframed",
            tone: "default",
            detail: "Best if you want the physical print with a lower total.",
          },
          {
            label: "Preview first, decide later",
            plan: "preview",
            tone: "neutral",
            detail: "Keep the editor neutral until the wording, layout, and style are right.",
          },
        ]}
      />
      <StickyCtaBar
        source="sticky-custom-night-sky-map"
        secondaryButtonLabel="Preview framed print"
        secondaryHref="/editor?mode=quick&source=sticky-custom-night-sky-map-framed&checkout=print&print_variant=poster_framed"
        secondaryPlan="print_framed"
      />
      <PrimaryIntentLinksSection
        heading="Primary start pages"
        intro="Use this page for broad night-sky-map intent. If you want the stronger primary route after previewing, start with one of these pages."
        links={[
          { href: "/personalized-star-map", label: "Personalized star map", recommended: true },
          { href: "/star-map-gift", label: "Star map gift" },
          { href: "/star-map-gallery", label: "Star map gallery" },
        ]}
      />

      <section className="content-visibility-auto mt-8 space-y-4 rounded-3xl border border-black/5 bg-white/90 p-6 shadow-xl shadow-black/10">
        <h2 className="text-xl font-semibold text-midnight">A night sky map that matches your moment</h2>
        <p className="text-sm leading-relaxed text-neutral-800 sm:text-base">
          The positions of stars and constellations depend on time and location. We calculate the real sky so your map matches
          the moment you want to remember.
        </p>
        <ul className="list-disc space-y-2 pl-5 text-sm text-neutral-800 sm:text-base">
          <li>Accurate star positions for any date and location</li>
          <li>Custom styles, labels, and typography</li>
          <li>Instant preview with framed, unframed, and HD delivery routes</li>
          <li>One approved design can stay digital or move into print without rebuilding</li>
        </ul>
      </section>

      <section className="content-visibility-auto mt-6 space-y-3 rounded-3xl border border-black/5 bg-amber-50/80 p-6 shadow-inner shadow-black/5">
        <h2 className="text-lg font-semibold text-midnight">Create your custom night sky map</h2>
        <ol className="list-decimal space-y-2 pl-5 text-sm text-neutral-800 sm:text-base">
          <li>Enter your date, time, and location</li>
          <li>Choose a design style and shape</li>
          <li>Preview the sky instantly</li>
          <li>Choose framed print, unframed print, or HD digital delivery at checkout</li>
        </ol>
      </section>

      <DeliveryFormatModule
        heading="Preview first, then decide how you want it delivered"
        intro="A custom night sky map can become a framed gift, a lower-total unframed print, or HD digital delivery once the design is approved."
        sourcePrefix="custom-night-sky-format"
      />

      <FramedProofSection
        heading="The night sky map can become a real framed keepsake"
        intro="Use the exact night sky preview as the source of truth, then decide whether the final version should arrive framed, ship unframed, or stay digital."
        sourcePrefix="custom-night-sky-proof"
      />

      <section className="content-visibility-auto mt-6 space-y-3 rounded-3xl border border-black/5 bg-white/90 p-6 shadow-xl shadow-black/10">
        <h2 className="text-lg font-semibold text-midnight">Related ideas</h2>
        <p className="text-sm text-neutral-800 sm:text-base">
          Looking for a specific format? Explore these popular options.
        </p>
        <div className="flex gap-3 text-sm text-neutral-800">
          <Link href="/star-map-gift" className="text-amber-700 underline hover:text-amber-800">
            Star map gift
          </Link>
          <Link href="/personalized-star-map" className="text-amber-700 underline hover:text-amber-800">
            Personalized star map
          </Link>
        </div>
      </section>

      <OccasionLinks />

      <section className="content-visibility-auto mt-6 space-y-4 rounded-3xl border border-black/5 bg-white/90 p-6 shadow-xl shadow-black/10">
        <h2 className="text-lg font-semibold text-midnight">Custom night sky map FAQ</h2>
        <div className="space-y-4 text-sm text-neutral-800 sm:text-base">
          <div>
            <h3 className="font-semibold text-midnight">What is a custom night sky map?</h3>
            <p>
              A custom night sky map is a star map created from a specific date and location, showing the real sky from that
              moment.
            </p>
          </div>
          <div>
            <h3 className="font-semibold text-midnight">Can I preview the night sky map before buying?</h3>
            <p>
              Yes. You can preview the map for free, then choose framed print, unframed print, or HD digital delivery when you are ready.
            </p>
          </div>
        </div>
      </section>
      <FaqSchema
        items={[
          {
            question: "What is a custom night sky map?",
            answer:
              "A custom night sky map is a star map created from a specific date and location, showing the real sky from that moment.",
          },
          {
            question: "Can I preview the night sky map before buying?",
            answer: "Yes. You can preview the map for free, then choose framed print, unframed print, or HD digital delivery when you are ready.",
          },
        ]}
      />
      <BreadcrumbSchema items={breadcrumbs} baseUrl={siteUrl} />
    </main>
  );
}
