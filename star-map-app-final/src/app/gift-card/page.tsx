import Link from "next/link";
import type { Metadata } from "next";
import { Breadcrumbs, BreadcrumbSchema } from "@/components/Breadcrumbs";
import FaqSchema from "@/components/FaqSchema";
import GiftCertificateBuy from "@/components/GiftCertificateBuy";
import OccasionLinks from "@/components/OccasionLinks";
import {
  GIFT_CERTIFICATE_TIERS,
  getGiftCertificatePriceCents,
} from "@/lib/giftCertificates";
import { formatPrice } from "@/lib/pricing";

export const revalidate = 86400; // refresh once per day

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://starmapco.com";
const ogImage = `${siteUrl}/custom-star-map-anniversary.webp`;
const breadcrumbs = [
  { href: "/", label: "Home" },
  { href: "/gift-card", label: "Gift card" },
];

const giftCardTitle = "Star Map Gift Certificate | Give a Personalized Star Map | StarMapCo";
const giftCardDescription =
  "Give a StarMapCo gift certificate for a personalized HD star map download. The recipient redeems the code, creates their own map, and downloads it in HD. Code redeemable for 12 months.";

export const metadata: Metadata = {
  title: giftCardTitle,
  description: giftCardDescription,
  alternates: { canonical: `${siteUrl}/gift-card` },
  openGraph: {
    title: giftCardTitle,
    description: giftCardDescription,
    url: `${siteUrl}/gift-card`,
    images: [{ url: ogImage, width: 1200, height: 630 }],
    type: "website",
  },
  twitter: { card: "summary_large_image", images: [ogImage] },
};

const faqItems = [
  {
    question: "How does a StarMapCo gift certificate work?",
    answer:
      "You buy the certificate for one of our HD download tiers. We email you a certificate with a redeem code, and you can also print it. The recipient enters the code on our redeem page, creates their own personalized star map in the editor, and downloads it in HD.",
  },
  {
    question: "What does the recipient get?",
    answer:
      "Exactly the tier on the certificate: a single HD download, or 3 HD export credits they can use across map versions. They choose the date, place, wording and style themselves — you are giving the download, not a finished design.",
  },
  {
    question: "How long is the certificate valid?",
    answer:
      "The redeem code can be used once, any time within 12 months of purchase. Once it is redeemed, the download itself follows our usual terms — paid downloads do not expire.",
  },
  {
    question: "Can I use a promo code or referral discount on a gift certificate?",
    answer:
      "No — gift certificates are sold at the tier's regular price and promo or referral discounts do not apply to the purchase or the redemption. The recipient always receives the full tier named on the certificate.",
  },
  {
    question: "Can the recipient order a print with the certificate?",
    answer:
      "The certificate covers the HD digital download. Prints are a separate order the recipient can place from their finished design once they have created it.",
  },
  {
    question: "What if the certificate email doesn't arrive?",
    answer:
      "Your purchase confirmation page shows the same certificate and code, so you can print or save it from there. If you still need help, contact support with the email address you used at checkout.",
  },
];

function priceLines(tierId: keyof typeof GIFT_CERTIFICATE_TIERS): string[] {
  const tier = GIFT_CERTIFICATE_TIERS[tierId];
  return [
    formatPrice(getGiftCertificatePriceCents(tier, "usd"), "usd"),
    formatPrice(getGiftCertificatePriceCents(tier, "cad"), "cad"),
  ];
}

export default function GiftCardPage() {
  const tiers = [
    {
      tierId: GIFT_CERTIFICATE_TIERS.hd_single.id,
      plan: GIFT_CERTIFICATE_TIERS.hd_single.plan,
      label: GIFT_CERTIFICATE_TIERS.hd_single.label,
      priceLines: priceLines("hd_single"),
      blurb: "One HD download of the recipient's own star map design — print-ready, no watermark.",
    },
    {
      tierId: GIFT_CERTIFICATE_TIERS.hd_pack3.id,
      plan: GIFT_CERTIFICATE_TIERS.hd_pack3.plan,
      label: GIFT_CERTIFICATE_TIERS.hd_pack3.label,
      priceLines: priceLines("hd_pack3"),
      blurb: "Three HD export credits, so the recipient can keep more than one version of their night sky.",
    },
  ];

  return (
    <main className="mx-auto max-w-4xl px-4 pt-10 pb-12 sm:pt-14">
      <header className="space-y-3 text-center">
        <Breadcrumbs items={breadcrumbs} className="flex justify-center" />
        <p className="text-xs tracking-[0.3em] text-amber-300 uppercase">StarMapCo</p>
        <h1 className="text-3xl font-bold text-white sm:text-4xl">Star Map Gift Certificate</h1>
        <p className="text-sm text-neutral-200 sm:text-base">
          Some gifts work better when the recipient makes them their own. A gift certificate lets them
          pick the date, the place and the words for their own personalized star map — and download it
          in HD when it looks right.
        </p>
      </header>

      <section aria-label="Choose a gift certificate" className="mt-8">
        <GiftCertificateBuy tiers={tiers} />
        <p className="mt-3 text-center text-xs text-neutral-400">
          Prices shown in USD and CAD; the checkout charges the book for your location, at the same
          prices as the downloads themselves.
        </p>
      </section>

      <section className="mt-12 space-y-3">
        <h2 className="text-xl font-semibold text-white">How it works</h2>
        <ol className="list-decimal space-y-2 pl-5 text-sm leading-relaxed text-neutral-200">
          <li>Choose a tier above and check out. The certificate is for that download tier, at its regular price.</li>
          <li>
            We email the certificate to you with its redeem code, and your confirmation page shows the
            same certificate ready to print or save as a PDF.
          </li>
          <li>
            Give it however you like — forwarded email, printed card, or tucked into a greeting card.
          </li>
          <li>
            The recipient enters the code on the{" "}
            <Link href="/redeem" className="underline decoration-white/30 underline-offset-2 hover:text-white">
              redeem page
            </Link>
            , creates their star map in the editor, and downloads it in HD.
          </li>
        </ol>
      </section>

      <section className="mt-10 space-y-3">
        <h2 className="text-xl font-semibold text-white">Good to know</h2>
        <ul className="list-disc space-y-2 pl-5 text-sm leading-relaxed text-neutral-200">
          <li>The code can be redeemed once, any time within 12 months of purchase.</li>
          <li>
            Once redeemed, the download follows our usual terms — paid downloads do not expire, so
            there is no deadline on using it after redemption.
          </li>
          <li>
            The certificate covers the HD digital download. Printed and framed versions are separate
            orders the recipient can place from their finished design.
          </li>
          <li>Promo codes and referral discounts do not apply to gift certificate purchases.</li>
        </ul>
      </section>

      <section className="mt-10 space-y-4">
        <h2 className="text-xl font-semibold text-white">Gift certificate questions</h2>
        <div className="space-y-4">
          {faqItems.map((item) => (
            <div key={item.question} className="rounded-2xl border border-white/10 bg-white/5 p-5">
              <h3 className="text-base font-semibold text-white">{item.question}</h3>
              <p className="mt-2 text-sm leading-relaxed text-neutral-200">{item.answer}</p>
            </div>
          ))}
        </div>
      </section>

      <OccasionLinks />
      <FaqSchema items={[...faqItems]} />
      <BreadcrumbSchema items={breadcrumbs} baseUrl={siteUrl} />
    </main>
  );
}
