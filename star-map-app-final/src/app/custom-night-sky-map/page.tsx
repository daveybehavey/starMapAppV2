import Link from "next/link";
import { Breadcrumbs, BreadcrumbSchema } from "@/components/Breadcrumbs";
import DeliveryFormatModule from "@/components/DeliveryFormatModule";
import FramedProofSection from "@/components/FramedProofSection";
import FaqSchema from "@/components/FaqSchema";
import OccasionLinks from "@/components/OccasionLinks";
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
  title: "Custom Night Sky Map — Personalized Print or Digital Gift | StarMapCo",
  description:
    "Create a custom night sky map from any date and location. Preview free, then choose a framed print, unframed poster, or instant HD digital download — no account required.",
  alternates: { canonical: `${siteUrl}/custom-night-sky-map` },
  openGraph: {
    title: "Custom Night Sky Map — Personalized Print or Digital Gift | StarMapCo",
    description:
      "Create a custom night sky map from any date and location. Preview free, then choose a framed print, unframed poster, or instant HD digital download — no account required.",
    url: `${siteUrl}/custom-night-sky-map`,
    images: [{ url: ogImage, width: 1200, height: 630 }],
    type: "website",
  },
  twitter: { card: "summary_large_image", images: [ogImage] },
};

export default function CustomNightSkyMapPage() {
  return (
    <main className="mx-auto max-w-4xl px-4 pt-10 pb-12 sm:pt-14">
      <header className="space-y-3 text-center">
        <Breadcrumbs items={breadcrumbs} className="flex justify-center" />
        <p className="text-xs tracking-[0.3em] text-amber-300 uppercase">StarMapCo</p>
        <h1 className="text-3xl font-bold text-white sm:text-4xl">Custom Night Sky Map</h1>
        <p className="text-sm text-white/90 sm:text-base">
          Design a custom night sky map showing the exact stars above a meaningful date and place — a wedding,
          a birth, an anniversary. Preview free with no account, then choose a{" "}
          <strong className="font-semibold text-amber-100">framed print</strong>, unframed poster, or instant
          HD digital download.
        </p>
      </header>

      <PreviewStartForm
        source="custom-night-sky-map"
        title="Start your custom night-sky preview"
        description="Enter the date and place, then open the editor with the framed path, the unframed path, or a neutral preview-first start."
        intentOptions={[
          {
            label: "Preview framed print",
            sourceSuffix: "framed",
            checkout: "print",
            printVariant: "poster_framed",
            plan: "print_framed",
            tone: "recommended",
            detail: "Use framed when the finished piece should arrive ready to display.",
          },
          {
            label: "Preview unframed print",
            sourceSuffix: "unframed",
            checkout: "print",
            printVariant: "poster_unframed",
            plan: "print_unframed",
            tone: "default",
            detail: "Use unframed when you want the physical print with a lower total.",
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

      <section className="content-visibility-auto mt-8 space-y-4 rounded-3xl border border-black/5 bg-white/90 p-6 shadow-xl shadow-black/10">
        <h2 className="text-midnight text-xl font-semibold">A night sky map that matches your moment</h2>
        <p className="text-sm leading-relaxed text-neutral-800 sm:text-base">
          The positions of stars and constellations depend on time and location. We calculate the real sky so
          your map matches the moment you want to remember.
        </p>
        <ul className="list-disc space-y-2 pl-5 text-sm text-neutral-800 sm:text-base">
          <li>Accurate star positions for any date and location</li>
          <li>Custom styles, labels, and typography</li>
          <li>Instant preview with framed, unframed, and HD delivery routes</li>
          <li>One approved design can stay digital or move into print without rebuilding</li>
        </ul>
      </section>

      <section className="content-visibility-auto mt-6 space-y-3 rounded-3xl border border-black/5 bg-amber-50/80 p-6 shadow-inner shadow-black/5">
        <h2 className="text-midnight text-lg font-semibold">Create your custom night sky map</h2>
        <ol className="list-decimal space-y-2 pl-5 text-sm text-neutral-800 sm:text-base">
          <li>Enter your date, time, and location</li>
          <li>Choose a design style and shape</li>
          <li>Preview the sky instantly</li>
          <li>Choose framed print, unframed print, or HD digital delivery at checkout</li>
        </ol>
        <div className="pt-2">
          <Link
            href="/editor?mode=quick&source=custom-night-sky-map-cta-framed&checkout=print&print_variant=poster_framed"
            className="text-midnight focus:ring-gold inline-flex items-center justify-center rounded-full bg-gradient-to-r from-amber-400 via-amber-500 to-amber-400 px-5 py-3 text-sm font-semibold shadow-lg shadow-amber-200 transition hover:-translate-y-[1px] hover:shadow-xl focus:ring-2 focus:ring-offset-2 focus:ring-offset-amber-50 focus:outline-none"
          >
            Start with framed print preview
          </Link>
        </div>
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
        <h2 className="text-midnight text-lg font-semibold">Related ideas</h2>
        <p className="text-sm text-neutral-800 sm:text-base">
          Looking for a specific format? Explore these popular options.
        </p>
        <div className="flex flex-wrap gap-3 text-sm text-neutral-800">
          <Link href="/night-sky-map-gift" className="text-amber-700 underline hover:text-amber-800">
            Night sky map gift
          </Link>
          <Link href="/personalized-star-map" className="text-amber-700 underline hover:text-amber-800">
            Personalized star map
          </Link>
          <Link href="/star-map-generator" className="text-amber-700 underline hover:text-amber-800">
            Star map generator
          </Link>
          <Link href="/wedding" className="text-amber-700 underline hover:text-amber-800">
            Wedding star map
          </Link>
          <Link href="/anniversary" className="text-amber-700 underline hover:text-amber-800">
            Anniversary star map
          </Link>
        </div>
      </section>

      <OccasionLinks />

      <section className="content-visibility-auto mt-6 space-y-4 rounded-3xl border border-black/5 bg-white/90 p-6 shadow-xl shadow-black/10">
        <h2 className="text-midnight text-lg font-semibold">Custom night sky map FAQ</h2>
        <div className="space-y-4 text-sm text-neutral-800 sm:text-base">
          <div>
            <h3 className="text-midnight font-semibold">What is a custom night sky map?</h3>
            <p>
              A custom night sky map is a star map generated from a specific date, time, and location —
              showing the real positions of stars and constellations as they appeared at that moment. It is
              commonly used as a personalized gift for anniversaries, weddings, birthdays, and other
              milestones.
            </p>
          </div>
          <div>
            <h3 className="text-midnight font-semibold">Can I preview the night sky map before buying?</h3>
            <p>
              Yes. The preview is free and requires no account. Enter your date and location, refine the
              design, and then choose framed print, unframed print, or HD digital delivery when you are ready
              to buy.
            </p>
          </div>
          <div>
            <h3 className="text-midnight font-semibold">How accurate is the custom night sky map?</h3>
            <p>
              The map is calculated from real astronomical data, so the star positions and constellation
              shapes match the sky at your exact date, time, and geographic coordinates — not a generic
              illustration.
            </p>
          </div>
          <div>
            <h3 className="text-midnight font-semibold">
              Can I make a custom night sky map for a wedding date?
            </h3>
            <p>
              Yes. Enter the wedding date and ceremony location to generate the exact night sky for that
              moment. Many couples order the framed print as a keepsake. You can preview the design for free
              before choosing a format.
            </p>
          </div>
          <div>
            <h3 className="text-midnight font-semibold">
              What formats are available for the custom night sky map?
            </h3>
            <p>
              After preview, you can choose a framed print (arrives ready to display), an unframed poster
              (lower cost, you frame it), or an instant HD digital download. All three use the same approved
              design.
            </p>
          </div>
        </div>
      </section>
      <FaqSchema
        items={[
          {
            question: "What is a custom night sky map?",
            answer:
              "A custom night sky map is a star map generated from a specific date, time, and location — showing the real positions of stars and constellations as they appeared at that moment. It is commonly used as a personalized gift for anniversaries, weddings, birthdays, and other milestones.",
          },
          {
            question: "Can I preview the night sky map before buying?",
            answer:
              "Yes. The preview is free and requires no account. Enter your date and location, refine the design, and then choose framed print, unframed print, or HD digital delivery when you are ready to buy.",
          },
          {
            question: "How accurate is the custom night sky map?",
            answer:
              "The map is calculated from real astronomical data, so the star positions and constellation shapes match the sky at your exact date, time, and geographic coordinates — not a generic illustration.",
          },
          {
            question: "Can I make a custom night sky map for a wedding date?",
            answer:
              "Yes. Enter the wedding date and ceremony location to generate the exact night sky for that moment. Many couples order the framed print as a keepsake. You can preview the design for free before choosing a format.",
          },
          {
            question: "What formats are available for the custom night sky map?",
            answer:
              "After preview, you can choose a framed print (arrives ready to display), an unframed poster (lower cost, you frame it), or an instant HD digital download. All three use the same approved design.",
          },
        ]}
      />
      <BreadcrumbSchema items={breadcrumbs} baseUrl={siteUrl} />
    </main>
  );
}
