import type { Metadata } from "next";
import Link from "next/link";
import { Breadcrumbs, BreadcrumbSchema } from "@/components/Breadcrumbs";
import ResilientImage from "@/components/ResilientImage";
import { Card } from "@/components/ui/Card";
import { HOME_MOCKUPS } from "@/lib/homeMockups";
import { PRINT_CATALOG } from "@/lib/printCatalog";
import { formatPrice } from "@/lib/pricing";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://starmapco.com";
const primaryCta =
  "inline-flex min-h-11 items-center justify-center rounded-full bg-gradient-to-r from-amber-400 via-amber-500 to-amber-400 px-5 py-3 text-sm font-semibold text-midnight shadow-md transition hover:-translate-y-[1px] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-amber-300";

type OccasionGift = {
  slug: string;
  label: string;
  title: string;
  description: string;
  heading: string;
  intro: string;
  storyHeading: string;
  story: string;
  steps: string[];
  faqs: { question: string; answer: string }[];
};

export function giftMetadata(gift: OccasionGift): Metadata {
  const url = `${siteUrl}/gifts/${gift.slug}`;
  return {
    title: gift.title,
    description: gift.description,
    alternates: { canonical: url },
    openGraph: {
      title: gift.title,
      description: gift.description,
      url,
      type: "website",
      images: [{ url: `${siteUrl}${HOME_MOCKUPS.framedBedroom}` }],
    },
  };
}

export default function OccasionGiftPage({ gift }: { gift: OccasionGift }) {
  const breadcrumbs = [
    { href: "/", label: "Home" },
    { href: `/gifts/${gift.slug}`, label: gift.label },
  ];
  const editorHref = `/editor?mode=quick&source=${gift.slug}`;
  // Match /black-friday's real Pacific clock; never leave a seasonal offer live indefinitely.
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const earlyChristmasOffer = today >= "2026-11-01" && today < "2026-11-27";
  const prints = PRINT_CATALOG.filter(
    (product) =>
      product.id === "poster_framed" ||
      product.id === "poster_unframed" ||
      product.id === "poster_unframed_16x16"
  );

  return (
    <main className="mx-auto max-w-6xl space-y-10 px-4 pt-10 pb-12 sm:px-6 sm:pt-14">
      <header className="space-y-5 text-center">
        <Breadcrumbs items={breadcrumbs} className="flex justify-center" />
        <p className="text-xs tracking-[0.3em] text-amber-300 uppercase">StarMapCo · {gift.label}</p>
        <h1 className="text-4xl font-bold text-white sm:text-5xl">{gift.heading}</h1>
        <p className="mx-auto max-w-2xl text-neutral-200">{gift.intro}</p>
        <Link href={editorHref} prefetch={false} className={primaryCta}>
          Create a free preview
        </Link>
      </header>

      <section aria-labelledby="story-heading" className="grid items-center gap-6 md:grid-cols-2">
        <div className="space-y-4">
          <h2 id="story-heading" className="text-2xl font-semibold text-white">
            {gift.storyHeading}
          </h2>
          <p className="text-neutral-200">{gift.story}</p>
          <ol className="list-decimal space-y-3 pl-5 text-neutral-200">
            {gift.steps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </div>
        <div className="relative aspect-square overflow-hidden rounded-3xl">
          <ResilientImage
            src={HOME_MOCKUPS.framedBedroom}
            fallbackSrc={HOME_MOCKUPS.framedBedroom}
            alt="Example personalized star map in a frame; customize the date, place and dedication in the editor"
            fill
            sizes="(max-width: 768px) 100vw, 50vw"
            className="object-contain"
          />
        </div>
      </section>

      <section aria-labelledby="prints-heading">
        <h2 id="prints-heading" className="text-2xl font-semibold text-white">
          Choose your keepsake
        </h2>
        <p className="mt-2 text-sm text-neutral-200">
          Catalogue prices before discounts, in USD and CAD. Shipping and taxes are shown at checkout.
        </p>
        {earlyChristmasOffer ? (
          <p className="mt-3 font-semibold text-amber-200" data-testid="current-offer">
            XMAS15 is live now: 15% off prints. Enter your code at checkout. HD digital is excluded.
          </p>
        ) : null}
        <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {prints.map((product) => (
            <article key={product.id} data-print-variant={product.id} className="flex">
              <Card variant="light" padding="none" className="flex w-full flex-col overflow-hidden">
                <div className="relative aspect-[4/3] bg-white">
                  <ResilientImage
                    src={product.includesFrame ? HOME_MOCKUPS.framedBedroom : HOME_MOCKUPS.unframedPoster}
                    fallbackSrc={HOME_MOCKUPS.unframedPoster}
                    alt={`Example star map: ${product.labelFallback}`}
                    fill
                    sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                    className="object-contain"
                  />
                </div>
                <div className="flex flex-1 flex-col gap-3 p-5">
                  <h3 className="text-midnight text-lg font-semibold">{product.labelFallback}</h3>
                  <p className="font-semibold text-amber-900">
                    {formatPrice(product.priceFallbackCents, "USD")}
                    <span className="mt-1 block text-sm">
                      {formatPrice(product.priceCadFallbackCents, "CAD")}
                    </span>
                  </p>
                  <Link href={editorHref} prefetch={false} className={`${primaryCta} mt-auto`}>
                    Customize your star map
                  </Link>
                </div>
              </Card>
            </article>
          ))}
        </div>
      </section>

      <section
        aria-labelledby="order-by-heading"
        className="text-midnight rounded-3xl border border-amber-200/40 bg-amber-50/90 p-5 sm:p-6"
      >
        <h2 id="order-by-heading" className="text-2xl font-semibold">
          Christmas 2026 order-by dates
        </h2>
        <p className="mt-2 text-sm text-neutral-700">
          Giving this keepsake at Christmas? Plan ahead with these dates.
        </p>
        {/* Same operator-verified campaign dates and framing as /black-friday. */}
        <table className="mt-5 w-full text-left text-sm">
          <caption className="sr-only">Christmas 2026 order-by dates for framed prints and posters</caption>
          <thead className="border-b border-amber-300">
            <tr>
              <th scope="col" className="py-3 pr-3">
                Product / destination
              </th>
              <th scope="col" className="py-3">
                Order by
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-amber-200">
            <tr>
              <th scope="row" className="py-3 pr-3 font-medium">
                Framed print · Canada
              </th>
              <td className="py-3">Dec 3</td>
            </tr>
            <tr>
              <th scope="row" className="py-3 pr-3 font-medium">
                Framed print · US
              </th>
              <td className="py-3">Dec 8</td>
            </tr>
            <tr>
              <th scope="row" className="py-3 pr-3 font-medium">
                Posters
              </th>
              <td className="py-3">Dec 10</td>
            </tr>
          </tbody>
        </table>
        <p className="mt-3 text-xs text-neutral-700">
          Buffered estimates for standard shipping, not guarantees.
        </p>
        <Link
          href="/shipping"
          className="mt-4 inline-flex min-h-11 items-center font-semibold text-amber-900 underline"
        >
          Read the shipping policy
        </Link>
      </section>

      <section aria-labelledby="faq-heading" className="space-y-4">
        <h2 id="faq-heading" className="text-2xl font-semibold text-white">
          {gift.label} questions
        </h2>
        {gift.faqs.map((faq) => (
          <div key={faq.question} className="rounded-2xl border border-white/15 p-5">
            <h3 className="font-semibold text-white">{faq.question}</h3>
            <p className="mt-2 text-neutral-200">{faq.answer}</p>
          </div>
        ))}
      </section>
      <nav
        aria-label="More occasion gifts"
        className="flex flex-wrap justify-center gap-5 text-amber-200 underline"
      >
        {Object.values(occasionGifts)
          .filter((other) => other.slug !== gift.slug)
          .map((other) => (
            <Link key={other.slug} href={`/gifts/${other.slug}`}>
              {other.label}
            </Link>
          ))}
      </nav>
      <footer className="space-y-4 text-center">
        <h2 className="text-2xl font-semibold text-white">Make a moment into a keepsake</h2>
        <Link href={editorHref} prefetch={false} className={primaryCta}>
          Preview your star map
        </Link>
      </footer>
      <BreadcrumbSchema items={breadcrumbs} baseUrl={siteUrl} />
    </main>
  );
}

export const occasionGifts = {
  wedding: {
    slug: "wedding-star-map",
    label: "Wedding star map gifts",
    title: "Wedding Star Map Gift | Personalized Keepsake | StarMapCo",
    description:
      "Celebrate their wedding with a personalized star map of a meaningful date and place. Add names and a dedication, preview free, then choose a poster or framed print.",
    heading: "A wedding star map for the day they said yes",
    intro:
      "Turn the couple’s wedding date and place into a personal sky map they can display in their home. Begin with a free preview and make the dedication your own.",
    storyHeading: "Give their wedding day a place on the wall",
    story:
      "Choose the ceremony venue, the proposal location, or another place in their story. A wedding star map pairs that date and location with names and a message, so the gift feels connected to the couple rather than picked from a shelf.",
    steps: [
      "Choose the wedding date and venue location.",
      "Add the couple’s names and a short dedication, such as ‘Our beginning’.",
      "Preview the design together or keep it a surprise, then choose a print format.",
    ],
    faqs: [
      {
        question: "Which moment should I choose for a wedding star map?",
        answer:
          "The wedding date and ceremony venue are a natural starting point. You can also choose the proposal or first meeting if that moment is more meaningful to the couple.",
      },
      {
        question: "What if I do not know the ceremony time?",
        answer:
          "Ask the couple or check the invitation before choosing a time. If you use an approximate time, treat the map as a representation of that chosen moment rather than a record of the ceremony time.",
      },
      {
        question: "Can I personalize it before ordering?",
        answer:
          "Yes. Start in the editor, choose the date and place, and customize the text and style. Review the free preview before choosing your print.",
      },
    ],
  },
  anniversary: {
    slug: "anniversary-star-map",
    label: "Anniversary star map gifts",
    title: "Anniversary Star Map Gift | Your Shared Sky | StarMapCo",
    description:
      "Mark an anniversary with a personalized star map of your wedding, first date or another shared milestone. Preview your design free and explore posters and framed prints.",
    heading: "An anniversary star map of a night you share",
    intro:
      "Celebrate another year together with a sky map tied to your story. Choose your wedding, first date or a milestone you both remember, then add a message for this anniversary.",
    storyHeading: "Return to the beginning, or mark a new chapter",
    story:
      "An anniversary gift can look back to the day you married or celebrate the life you have built since. Choose one moment, use its date and location, and write a dedication that says what the years together mean to you.",
    steps: [
      "Pick the shared milestone you want to remember.",
      "Use that moment’s date and location, then add names or an anniversary message.",
      "Review the preview and choose a poster for your own frame or a framed print.",
    ],
    faqs: [
      {
        question: "Should I use our wedding date or this year’s anniversary?",
        answer:
          "Use your wedding date to revisit the beginning, or this year’s anniversary to mark a new chapter. The important detail is choosing the date and location that match the story you want to tell.",
      },
      {
        question: "Can this work for a first anniversary or a later milestone?",
        answer:
          "Yes. Personalize the dedication for the year you are celebrating, while keeping the sky map tied to your chosen shared moment.",
      },
      {
        question: "Can I preview before deciding on a print?",
        answer:
          "Yes. The editor provides a free preview so you can review the date, place, wording and style before choosing a physical format.",
      },
    ],
  },
  baby: {
    slug: "new-baby-star-map",
    label: "New baby star map gifts",
    title: "New Baby Star Map Gift | A Birth Keepsake | StarMapCo",
    description:
      "Welcome a new baby with a personalized star map of their birth date and place. Add a name and dedication, preview free, and choose a poster or framed keepsake.",
    heading: "A new baby star map for their first chapter",
    intro:
      "Celebrate a new arrival with a personal sky map of their birth date and place. Add their name and a gentle dedication to create a keepsake for the family.",
    storyHeading: "Remember the day their world began",
    story:
      "A birth keepsake can hold the details a family wants to remember: a name, a date, a place and a few words of welcome. Keep the wording simple and choose a style that will still feel at home as the child grows.",
    steps: [
      "Confirm the baby’s name, birth date and birthplace with the family.",
      "Add the birth time if the family wants it included, plus a short welcome message.",
      "Check every detail in the free preview before choosing a poster or framed print.",
    ],
    faqs: [
      {
        question: "What details do I need for a new baby star map?",
        answer:
          "Start with the birth date and birthplace. You can choose a birth time and personalize the text with a name and dedication. Confirm spelling and details with the family before ordering.",
      },
      {
        question: "Can I make a map for a daytime birth?",
        answer:
          "Yes. You can select a daytime birth moment in the editor. The map represents the sky for the chosen date, time and location; it does not mean those stars were visible in daylight.",
      },
      {
        question: "Is it suitable as a baby shower gift?",
        answer:
          "If the baby has not arrived, wait for the confirmed birth details before creating a birth map. Alternatively, choose a different meaningful family moment and describe it clearly in the dedication.",
      },
    ],
  },
} satisfies Record<string, OccasionGift>;
