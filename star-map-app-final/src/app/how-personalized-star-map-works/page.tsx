import Link from "next/link";
import { Breadcrumbs, BreadcrumbSchema } from "@/components/Breadcrumbs";
import FaqSchema from "@/components/FaqSchema";
import GiftFormatLadder from "@/components/GiftFormatLadder";
import InstantHdHeroExtras from "@/components/InstantHdHeroExtras";
import MoneyPagePriceAtGlance from "@/components/MoneyPagePriceAtGlance";
import OccasionLinks from "@/components/OccasionLinks";
import PreviewStartForm from "@/components/PreviewStartForm";
import StickyCtaBar from "@/components/StickyCtaBar";
import { ASPECT_OPTIONS } from "@/lib/aspectOptions";
import { styles, shapes, constellationPresets, visualModes } from "@/lib/config";
import {
  buildInstantHdPreviewIntents,
  getInstantHdHeroHref,
  getInstantHdPriceLine,
} from "@/lib/digitalGiftCheckout";
import { fontOptions } from "@/lib/fonts";
import { FRAME_STYLE_OPTIONS } from "@/lib/frameStyle";
import { HOW_PERSONALIZED_STAR_MAP_WORKS_FAQ_ITEMS } from "@/lib/landingFaqs";
import { getGiftLadderIntro } from "@/lib/moneyPageGiftCheckout";
import { PAYWALL_PRINT_CHECKOUT_ROWS, PRINT_CATALOG } from "@/lib/printCatalog";
import type { Metadata } from "next";

export const revalidate = 86400;

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://starmapco.com";
const pageUrl = `${siteUrl}/how-personalized-star-map-works`;
const ogImage = `${siteUrl}/custom-star-map-anniversary.webp`;
const breadcrumbs = [
  { href: "/", label: "Home" },
  { href: "/how-personalized-star-map-works", label: "How a personalized star map works" },
];

const title = "How a Personalized Star Map Works | StarMapCo";
const description =
  "Step-by-step: pick a date and place, generate a free preview of that night sky, customize style and text, then order framed print, poster, canvas, or HD digital.";

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: pageUrl },
  openGraph: {
    title,
    description,
    url: pageUrl,
    images: [{ url: ogImage, width: 1200, height: 630 }],
    type: "article",
  },
  twitter: { card: "summary_large_image", images: [ogImage] },
};

const catalogById = Object.fromEntries(PRINT_CATALOG.map((item) => [item.id, item]));
const livePrintLabels = PAYWALL_PRINT_CHECKOUT_ROWS.map((row) => {
  if (row.headline) return row.headline;
  return catalogById[row.variant]?.labelFallback ?? row.variant;
});

export default function HowPersonalizedStarMapWorksPage() {
  const instantHref = getInstantHdHeroHref("how-personalized-works-hero-instant");
  const instantPrice = getInstantHdPriceLine();
  const previewIntents = buildInstantHdPreviewIntents("how-personalized-works");
  const freeShapes = shapes.filter((shape) => shape.id === "rectangle" || shape.id === "circle");
  const hdOnlyShapes = shapes.filter((shape) => shape.id !== "rectangle" && shape.id !== "circle");

  return (
    <main className="mx-auto max-w-4xl px-4 pb-12 pt-10 sm:pt-14">
      <header className="space-y-3 text-center">
        <Breadcrumbs items={breadcrumbs} className="flex justify-center" />
        <p className="text-xs tracking-[0.3em] text-amber-300 uppercase">StarMapCo</p>
        <h1 className="text-3xl font-bold text-white sm:text-4xl">
          How a Personalized Star Map Works
        </h1>
        <p className="text-sm text-neutral-200 sm:text-base">
          A personalized star map captures a meaningful night sky for a date and place you choose — the map
          shows that exact sky. Calculated in the editor, customized with your wording, then delivered as
          framed print, unframed print, canvas, or HD digital. Follow the same steps the product uses to make
          a moment into a keepsake.
        </p>
        <MoneyPagePriceAtGlance className="mx-auto max-w-lg" />
        <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
          <Link
            href="/editor?mode=quick&source=how-personalized-works-hero-preview"
            className="text-midnight focus:ring-gold inline-flex min-h-11 items-center justify-center rounded-full bg-gradient-to-r from-amber-400 via-amber-500 to-amber-400 px-5 py-3 text-sm font-semibold shadow-lg shadow-amber-200 transition hover:-translate-y-[1px] hover:shadow-xl focus:ring-2 focus:ring-offset-2 focus:ring-offset-transparent focus:outline-none"
          >
            Start free preview
          </Link>
          <Link
            href={instantHref}
            className="inline-flex min-h-11 items-center justify-center rounded-full border border-[#f1c27d] bg-transparent px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/10 focus:ring-2 focus:ring-amber-200 focus:ring-offset-2 focus:ring-offset-transparent focus:outline-none"
          >
            HD digital from {instantPrice}
          </Link>
        </div>
        <InstantHdHeroExtras source="how-personalized-works-hero-instant" showButton={false} />
      </header>

      <PreviewStartForm
        title="Start with date and place"
        description="Enter the moment you want to keep — the editor unlocks Generate preview once both are set."
        buttonLabel="Preview your map"
        source="how-personalized-works"
        intentOptions={previewIntents}
      />
      <StickyCtaBar
        source="sticky-how-personalized-works-preview"
        title="Ready to see your sky?"
        description="Free preview first — then choose framed print, poster, canvas, or HD digital from the same design."
        buttonLabel="Start free preview"
        primaryHref="/editor?mode=quick&source=sticky-how-personalized-works-preview"
        primaryPlan="preview"
        secondaryButtonLabel={`HD digital from ${instantPrice}`}
        secondaryHref={instantHref}
        secondaryPlan="hd_digital"
      />

      <section className="content-visibility-auto mt-8 space-y-4 rounded-3xl border border-black/5 bg-white/90 p-6 shadow-xl shadow-black/10">
        <h2 className="text-midnight text-xl font-semibold">The flow, step by step</h2>
        <p className="text-sm leading-relaxed text-neutral-800 sm:text-base">
          This matches the live editor at{" "}
          <Link href="/editor?mode=quick&source=how-personalized-works-inline" className="font-semibold text-amber-800 underline hover:text-amber-950">
            /editor
          </Link>
          . Nothing below invents a product step that is not already in the create experience.
        </p>
        <ol className="list-decimal space-y-4 pl-5 text-sm text-neutral-800 sm:text-base">
          <li>
            <strong>Pick the date (and time if you know it).</strong> The map is calculated for that
            moment. Adding a time refines Moon and planet placement; date and place alone still produce a
            meaningful map.
          </li>
          <li>
            <strong>Confirm the place.</strong> Choose a location from suggestions so the editor has a
            confirmed place. Until date and place are both set, the primary control stays locked with
            “Add date + place to unlock preview.”
          </li>
          <li>
            <strong>Generate preview.</strong> Click <em>Generate preview</em>. The editor shows
            “Revealing your sky…” while the night sky for that moment is calculated, then the preview
            unlocks.
          </li>
          <li>
            <strong>Customize.</strong> Use Text Styling for title, subtitle, and dedication. Choose a
            style, shape, and frame options (aspect ratio and border). Advanced options cover map look,
            constellation lines, Moon, planets, and related render toggles.
          </li>
          <li>
            <strong>Preview and order.</strong> Export a free watermarked preview, unlock HD digital, or
            continue to a print path — framed, unframed, or canvas — from the same approved design.
          </li>
        </ol>
      </section>

      <section className="content-visibility-auto mt-6 space-y-4 rounded-3xl border border-black/5 bg-amber-50/80 p-6 shadow-inner shadow-black/5">
        <h2 className="text-midnight text-lg font-semibold">What you can customize</h2>
        <div className="space-y-3 text-sm text-neutral-800 sm:text-base">
          <div>
            <h3 className="text-midnight font-semibold">Styles</h3>
            <ul className="mt-1 list-disc space-y-1 pl-5">
              {styles.map((style) => (
                <li key={style.id}>
                  <strong>{style.name}</strong> — {style.note}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h3 className="text-midnight font-semibold">Shapes</h3>
            <p>
              Available shapes: {shapes.map((shape) => shape.label).join(", ")}.{" "}
              {freeShapes.map((shape) => shape.label).join(" and ")} are available without HD unlock.
              {hdOnlyShapes.length > 0 ? (
                <>
                  {" "}
                  {hdOnlyShapes.map((shape) => shape.label).join(", ")} are labeled{" "}
                  <em>HD only</em> in the editor — still selectable for preview before payment.
                </>
              ) : null}
            </p>
          </div>
          <div>
            <h3 className="text-midnight font-semibold">Frame and aspect</h3>
            <p>
              Aspect ratios: {ASPECT_OPTIONS.map((option) => option.label).join(", ")}. Frame border
              styles when the frame is on:{" "}
              {FRAME_STYLE_OPTIONS.map((option) => option.label).join(", ")}.
            </p>
          </div>
          <div>
            <h3 className="text-midnight font-semibold">Text and fonts</h3>
            <p>
              Title, subtitle, and dedication lines support font, color, size, and alignment. Font
              choices include {fontOptions.map((font) => font.label).join(", ")}.
            </p>
          </div>
          <div>
            <h3 className="text-midnight font-semibold">Sky look</h3>
            <p>
              Visual modes: {visualModes.map((mode) => mode.label).join(", ")}. Constellation lines:{" "}
              {constellationPresets.map((preset) => preset.label).join(", ")}. Moon and planets can be
              toggled when you want them on the map.
            </p>
          </div>
        </div>
      </section>

      <GiftFormatLadder
        sourcePrefix="how-personalized-works-ladder"
        heading="Choose how you receive the map"
        intro={getGiftLadderIntro()}
        includeCanvas
        className="mt-8"
      />

      <section className="content-visibility-auto mt-6 space-y-3 rounded-3xl border border-black/5 bg-white/90 p-6 shadow-xl shadow-black/10">
        <h2 className="text-midnight text-lg font-semibold">Live print formats in checkout</h2>
        <p className="text-sm text-neutral-800 sm:text-base">
          Physical checkout rows currently offered alongside HD digital:
        </p>
        <ul className="list-disc space-y-2 pl-5 text-sm text-neutral-800 sm:text-base">
          {livePrintLabels.map((label) => (
            <li key={label}>{label}</li>
          ))}
        </ul>
        <p className="text-sm text-neutral-700">
          Current pricing appears in the modules above and in the{" "}
          <Link href="/shop" className="font-semibold text-amber-800 underline hover:text-amber-950">
            shop
          </Link>
          . For print sizing tips, see{" "}
          <Link
            href="/how-to-print-star-map"
            className="font-semibold text-amber-800 underline hover:text-amber-950"
          >
            how to print a star map
          </Link>
          . For astronomy detail, see{" "}
          <Link
            href="/how-accurate-are-star-maps"
            className="font-semibold text-amber-800 underline hover:text-amber-950"
          >
            how accurate star maps are
          </Link>
          .
        </p>
      </section>

      <section className="content-visibility-auto mt-6 space-y-3 rounded-3xl border border-black/5 bg-amber-50/80 p-6 shadow-inner shadow-black/5">
        <h2 className="text-midnight text-lg font-semibold">Popular gift occasions</h2>
        <p className="text-sm text-neutral-800 sm:text-base">
          Gift occasions get personal when they capture a shared night — a wedding, a birth, an anniversary,
          or another once-in-a-lifetime sky. The sky on the night they arrived suits a nursery keepsake; a
          proposal or ceremony date keeps the exact sky from the day they said yes. Once you understand the
          flow, start from the occasion that matches your date —{" "}
          <Link href="/anniversary" className="font-semibold text-amber-800 underline hover:text-amber-950">
            anniversary
          </Link>
          ,{" "}
          <Link href="/wedding" className="font-semibold text-amber-800 underline hover:text-amber-950">
            wedding
          </Link>
          ,{" "}
          <Link href="/new-baby" className="font-semibold text-amber-800 underline hover:text-amber-950">
            new baby
          </Link>
          ,{" "}
          <Link href="/proposal" className="font-semibold text-amber-800 underline hover:text-amber-950">
            wedding &amp; proposal
          </Link>
          ,{" "}
          <Link
            href="/first-christmas-star-map"
            className="font-semibold text-amber-800 underline hover:text-amber-950"
          >
            first Christmas
          </Link>
          , or{" "}
          <Link
            href="/christmas-star-map-gift"
            className="font-semibold text-amber-800 underline hover:text-amber-950"
          >
            Christmas gifts
          </Link>
          .
        </p>
      </section>

      <OccasionLinks />

      <section className="content-visibility-auto mt-6 space-y-4 rounded-3xl border border-black/5 bg-white/90 p-6 shadow-xl shadow-black/10">
        <h2 className="text-midnight text-lg font-semibold">Personalized star map FAQ</h2>
        <div className="space-y-4 text-sm text-neutral-800 sm:text-base">
          {HOW_PERSONALIZED_STAR_MAP_WORKS_FAQ_ITEMS.map((item) => (
            <div key={item.question}>
              <h3 className="text-midnight font-semibold">{item.question}</h3>
              <p>{item.answer}</p>
            </div>
          ))}
        </div>
      </section>
      <FaqSchema items={HOW_PERSONALIZED_STAR_MAP_WORKS_FAQ_ITEMS} />
      <BreadcrumbSchema items={breadcrumbs} baseUrl={siteUrl} />
    </main>
  );
}
