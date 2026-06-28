import Link from "next/link";
import type { Metadata } from "next";
import { Breadcrumbs, BreadcrumbSchema } from "@/components/Breadcrumbs";
import FaqSchema from "@/components/FaqSchema";
import FramedProofSection from "@/components/FramedProofSection";
import MoneyPagePriceAtGlance from "@/components/MoneyPagePriceAtGlance";
import OccasionLinks from "@/components/OccasionLinks";
import PhysicalProductGallerySection from "@/components/PhysicalProductGallerySection";
import PreviewStartForm from "@/components/PreviewStartForm";
import PurchaseTrustPanel from "@/components/PurchaseTrustPanel";
import StickyCtaBar from "@/components/StickyCtaBar";
import { galleryStyleQuickLinks } from "@/lib/galleryExamples";
import { getPrintPhysicalOrderSummaryLine } from "@/lib/commerceFacts";
import { getPrintShippingDisclosure } from "@/lib/printCheckoutConfig";

export const revalidate = 86400;

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://starmapco.com";
const ogImage = `${siteUrl}/og-default.png`;
const breadcrumbs = [
  { href: "/", label: "Home" },
  { href: "/star-map-gift-ideas", label: "Star map gift ideas" },
];

const seasonalIdeas = [
  {
    title: "Valentine's Day",
    description: "A romantic map of the night you met, first kissed, or said yes.",
    href: "/star-map-for/valentines-day",
  },
  {
    title: "Mother's Day",
    description: "Celebrate the moment a family grew with a personalized sky.",
    href: "/star-map-for/mothers-day",
  },
  {
    title: "Father's Day",
    description: "Honor a milestone night or a shared trip under the stars.",
    href: "/star-map-for/fathers-day",
  },
  {
    title: "Canada Day",
    description: "Turn July 1 into a keepsake with a summer celebration sky.",
    href: "/blog/canada-day-star-map-gift-ideas",
  },
  {
    title: "July 4th",
    description: "Preserve fireworks night with a personalized holiday star map.",
    href: "/blog/july-4th-star-map-gift-ideas",
  },
  {
    title: "Graduation",
    description: "Mark the night they finished the journey with a bold, celebratory map.",
    href: "/star-map-for/graduation",
  },
  {
    title: "Christmas",
    description: "A meaningful holiday gift that feels personal and timeless.",
    href: "/star-map-for/christmas",
  },
  {
    title: "New Baby",
    description: "Capture the sky from the night they arrived.",
    href: "/star-map-for/new-baby",
  },
];

export const metadata: Metadata = {
  title: "Star Map Gift Ideas | StarMapCo",
  description:
    "Star map gift ideas for anniversaries, birthdays, weddings, and seasonal holidays. Start with a free preview, then choose framed print, unframed print, or HD digital delivery.",
  alternates: { canonical: `${siteUrl}/star-map-gift-ideas` },
  openGraph: {
    title: "Star Map Gift Ideas | StarMapCo",
    description:
      "Star map gift ideas for anniversaries, birthdays, weddings, and seasonal holidays. Start with a free preview, then choose framed print, unframed print, or HD digital delivery.",
    url: `${siteUrl}/star-map-gift-ideas`,
    images: [{ url: ogImage, width: 1200, height: 630 }],
    type: "website",
  },
  twitter: { card: "summary_large_image", images: [ogImage] },
};

export default function StarMapGiftIdeasPage() {
  const shippingDisclosure = getPrintShippingDisclosure();

  return (
    <main className="mx-auto max-w-4xl px-4 pb-12 pt-10 sm:pt-14">
      <header className="space-y-3 text-center">
        <Breadcrumbs items={breadcrumbs} className="flex justify-center" />
        <p className="text-xs uppercase tracking-[0.3em] text-amber-300">StarMapCo</p>
        <h1 className="text-3xl font-bold text-white sm:text-4xl">Star Map Gift Ideas</h1>
        <p className="text-sm text-white/90 sm:text-base">
          Find the most meaningful star map gift for any occasion. Use seasonal ideas below or start with your own moment,
          then choose framed print, unframed print, or HD digital delivery.
        </p>
        <MoneyPagePriceAtGlance className="mx-auto max-w-lg" />
        <div className="flex flex-wrap items-center justify-center gap-2 pt-1 text-[11px] font-semibold text-amber-100/90">
          <span className="rounded-full border border-amber-300/50 bg-amber-300/20 px-3 py-1">Framed print</span>
          <span className="rounded-full border border-amber-300/50 bg-amber-300/20 px-3 py-1">Unframed print</span>
          <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1">HD digital delivery</span>
        </div>
      </header>

      <PreviewStartForm
        source="star-map-gift-ideas"
        title="Start your gift preview"
        description="Choose the date and location, then start with framed print, unframed print, or a neutral preview-first route."
        intentOptions={[
          {
            label: "Preview framed print",
            sourceSuffix: "framed",
            checkout: "print",
            printVariant: "poster_framed",
            plan: "print_framed",
            tone: "recommended",
            detail: "Best when the gift should arrive ready to hang.",
          },
          {
            label: "Preview unframed print",
            sourceSuffix: "unframed",
            checkout: "print",
            printVariant: "poster_unframed",
            plan: "print_unframed",
            tone: "default",
            detail: "Best if you want the physical print but already know the frame plan.",
          },
          {
            label: "Preview first, decide later",
            plan: "preview",
            tone: "neutral",
            detail: "Keep the editor neutral until the design feels right.",
          },
        ]}
      />
      <StickyCtaBar
        source="sticky-star-map-gift-ideas"
        secondaryButtonLabel="Preview framed print"
        secondaryHref="/editor?mode=quick&source=sticky-star-map-gift-ideas-framed&checkout=print&print_variant=poster_framed"
        secondaryPlan="print_framed"
      />

      <FramedProofSection sourcePrefix="gift-ideas-proof" />
      <PhysicalProductGallerySection
        heading="See what the physical gift looks like"
        intro="Room mockups from current StarMapCo artwork — framed, unframed, and in-home styling."
        sourcePrefix="gift-ideas-physical-proof"
      />

      <section className="content-visibility-auto mt-8 space-y-4 rounded-3xl border border-black/5 bg-white/90 p-6 shadow-xl shadow-black/10">
        <div className="space-y-2">
          <h2 className="text-xl font-semibold text-midnight">Gift finder (2 quick steps)</h2>
          <p className="text-sm text-neutral-800 sm:text-base">
            Pick the occasion, then choose a look for inspiration. You&apos;ll land on the best page to start.
          </p>
        </div>
        <div className="grid gap-5 sm:grid-cols-2">
          <div className="rounded-2xl border border-amber-100 bg-amber-50/70 p-4">
            <h3 className="text-sm font-semibold text-midnight">1) Choose the occasion</h3>
            <div className="mt-3 flex flex-wrap gap-2 text-sm font-semibold text-amber-700">
              <Link href="/anniversary" className="rounded-full border border-amber-200/60 bg-white/80 px-3 py-1.5">
                Anniversary
              </Link>
              <Link href="/wedding" className="rounded-full border border-amber-200/60 bg-white/80 px-3 py-1.5">
                Wedding
              </Link>
              <Link href="/birthday" className="rounded-full border border-amber-200/60 bg-white/80 px-3 py-1.5">
                Birthday
              </Link>
              <Link href="/star-map-for/graduation" className="rounded-full border border-amber-200/60 bg-white/80 px-3 py-1.5">
                Graduation
              </Link>
              <Link href="/star-map-for/new-baby" className="rounded-full border border-amber-200/60 bg-white/80 px-3 py-1.5">
                New Baby
              </Link>
              <Link href="/star-map-for/memorial" className="rounded-full border border-amber-200/60 bg-white/80 px-3 py-1.5">
                Memorial
              </Link>
            </div>
          </div>
          <div className="rounded-2xl border border-amber-100 bg-amber-50/70 p-4">
            <h3 className="text-sm font-semibold text-midnight">2) Choose a look</h3>
            <p className="mt-2 text-xs text-neutral-700">
              Each style has its own feel. Browse the gallery to see real examples.
            </p>
            <div className="mt-3 flex flex-wrap gap-2 text-sm font-semibold text-amber-700">
              {galleryStyleQuickLinks.map((link) => (
                <Link key={link.href} href={link.href} className="rounded-full border border-amber-200/60 bg-white/80 px-3 py-1.5">
                  {link.label}
                </Link>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="content-visibility-auto mt-8 space-y-4 rounded-3xl border border-black/5 bg-white/90 p-6 shadow-xl shadow-black/10">
        <div className="space-y-2">
          <h2 className="text-xl font-semibold text-midnight">Seasonal gift ideas</h2>
          <p className="text-sm text-neutral-800 sm:text-base">
            These holidays bring the most gift searches each year. Pick one and personalize the night that matters.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {seasonalIdeas.map((idea) => (
            <div key={idea.href} className="rounded-2xl border border-amber-100 bg-amber-50/70 p-4">
              <h3 className="text-base font-semibold text-midnight">{idea.title}</h3>
              <p className="mt-2 text-sm text-neutral-800">{idea.description}</p>
              <Link href={idea.href} className="mt-3 inline-flex text-sm font-semibold text-amber-700 underline hover:text-amber-800">
                View {idea.title} ideas
              </Link>
            </div>
          ))}
        </div>
      </section>

      <section className="content-visibility-auto mt-6 space-y-3 rounded-3xl border border-black/5 bg-amber-50/80 p-6 shadow-inner shadow-black/5">
        <h2 className="text-lg font-semibold text-midnight">Milestone gift ideas</h2>
        <p className="text-sm text-neutral-800 sm:text-base">
          Star maps shine for anniversaries, weddings, birthdays, new homes, and memorials. Start with one free preview,
          then take the framed route, unframed route, or HD digital route that fits your timing and budget.
        </p>
        <div className="flex flex-wrap gap-3 text-sm font-semibold">
          <Link href="/star-map-gift" className="text-amber-700 underline hover:text-amber-800">
            Star map gift
          </Link>
          <Link href="/night-sky-map-gift" className="text-amber-700 underline hover:text-amber-800">
            Night sky map gift
          </Link>
          <Link href="/star-map-gallery" className="text-amber-700 underline hover:text-amber-800">
            Star map gallery
          </Link>
        </div>
      </section>

      <OccasionLinks />

      <PurchaseTrustPanel
        heading="Before you buy"
        intro="Preview for free first. Pick the occasion and format once the design feels right."
        leftTitle="Checkout and files"
        leftPoints={[
          "Secure Stripe checkout",
          "Instant HD download after payment",
          "No watermark on paid exports",
        ]}
        rightTitle="Print and support"
        rightPoints={[
          "Framed and unframed print paths available after preview",
          shippingDisclosure,
          getPrintPhysicalOrderSummaryLine(),
          "Support is available at support@starmapco.com",
        ]}
        guideLabel="Print and frame guide"
      />

      <section className="content-visibility-auto mt-6 space-y-4 rounded-3xl border border-black/5 bg-white/90 p-6 shadow-xl shadow-black/10">
        <h2 className="text-lg font-semibold text-midnight">Star map gift ideas FAQ</h2>
        <div className="space-y-4 text-sm text-neutral-800 sm:text-base">
          <div>
            <h3 className="font-semibold text-midnight">What date should I choose for a gift?</h3>
            <p>Pick the moment that means the most — the day you met, the proposal, a birth, or a shared trip.</p>
          </div>
          <div>
            <h3 className="font-semibold text-midnight">Can I preview the map before purchasing?</h3>
            <p>Yes. You can preview the exact sky for free, then choose framed print, unframed print, or HD digital delivery.</p>
          </div>
        </div>
      </section>
      <FaqSchema
        items={[
          {
            question: "What date should I choose for a gift?",
            answer: "Pick the moment that means the most — the day you met, the proposal, a birth, or a shared trip.",
          },
          {
            question: "Can I preview the map before purchasing?",
            answer: "Yes. You can preview the exact sky for free, then choose framed print, unframed print, or HD digital delivery.",
          },
        ]}
      />
      <BreadcrumbSchema items={breadcrumbs} baseUrl={siteUrl} />
    </main>
  );
}
