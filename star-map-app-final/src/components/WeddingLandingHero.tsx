import Image from "next/image";
import Link from "next/link";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import MoneyPagePriceAtGlance from "@/components/MoneyPagePriceAtGlance";
import type { VerifiedTestimonial } from "@/data/testimonials";
import { HOME_MOCKUPS } from "@/lib/homeMockups";

type BreadcrumbItem = { href: string; label: string };

type WeddingLandingHeroProps = {
  breadcrumbs: BreadcrumbItem[];
  primaryHref: string;
  bundlePriceLine: string;
  featuredTestimonial: VerifiedTestimonial;
};

export default function WeddingLandingHero({
  breadcrumbs,
  primaryHref,
  bundlePriceLine,
  featuredTestimonial,
}: WeddingLandingHeroProps) {
  return (
    <header className="grid gap-8 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] lg:items-center lg:gap-10">
      <div className="space-y-5 text-center text-white lg:text-left">
        <Breadcrumbs items={breadcrumbs} className="flex justify-center lg:justify-start" />
        <div className="space-y-3">
          <p className="text-xs uppercase tracking-[0.3em] text-amber-300">Wedding gift · Framed + HD</p>
          <h1 className="text-3xl font-bold leading-tight sm:text-4xl lg:text-[2.65rem] lg:leading-[1.1]">
            The night you said &ldquo;I do&rdquo; — framed for the wall
          </h1>
          <p className="mx-auto max-w-xl text-sm leading-relaxed text-white/90 sm:text-base lg:mx-0">
            Preview the exact sky from your ceremony, then order the{" "}
            <span className="font-semibold text-amber-50">{bundlePriceLine}</span> gift bundle when it feels right.
          </p>
        </div>

        <figure className="mx-auto max-w-xl rounded-2xl border border-amber-200/30 bg-gradient-to-br from-amber-50/10 via-white/5 to-transparent p-5 text-left shadow-lg shadow-black/20 lg:mx-0">
          <div className="flex gap-1 text-amber-300" aria-hidden="true">
            {Array.from({ length: 5 }).map((_, index) => (
              <span key={index} className="text-sm">
                ★
              </span>
            ))}
          </div>
          <blockquote className="mt-2 text-base font-medium leading-relaxed text-amber-50 sm:text-lg">
            &ldquo;{featuredTestimonial.quote}&rdquo;
          </blockquote>
          <figcaption className="mt-3 text-xs font-semibold text-amber-100/90 sm:text-sm">
            {featuredTestimonial.author}
            <span className="font-normal text-amber-100/70"> · {featuredTestimonial.context}</span>
          </figcaption>
        </figure>

        <MoneyPagePriceAtGlance className="mx-auto max-w-md lg:mx-0" weddingTone compact />

        <ul className="mx-auto flex max-w-md flex-col gap-2 text-left text-sm text-white/90 sm:text-base lg:mx-0">
          <li className="flex gap-2">
            <span className="mt-0.5 text-amber-300" aria-hidden="true">
              ✓
            </span>
            <span>Free live preview — no account required</span>
          </li>
          <li className="flex gap-2">
            <span className="mt-0.5 text-amber-300" aria-hidden="true">
              ✓
            </span>
            <span>Astronomically accurate for your date, time, and location</span>
          </li>
        </ul>

        <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-center lg:items-start lg:justify-start">
          <Link
            href={primaryHref}
            className="inline-flex min-h-12 w-full min-w-[14rem] items-center justify-center rounded-full bg-gradient-to-r from-amber-400 via-amber-500 to-amber-400 px-6 py-3.5 text-sm font-semibold text-midnight shadow-lg shadow-amber-200 transition hover:-translate-y-[1px] hover:shadow-xl focus:outline-none focus:ring-2 focus:ring-gold focus:ring-offset-2 focus:ring-offset-midnight sm:w-auto"
          >
            Preview your wedding map
          </Link>
          <Link
            href="/editor?mode=quick&source=wedding-hero-preview"
            className="text-sm font-semibold text-white underline decoration-white/50 underline-offset-4 transition hover:text-amber-200 hover:decoration-amber-200/70"
          >
            Or start a free preview first
          </Link>
        </div>
      </div>

      <figure className="mx-auto w-full max-w-md overflow-hidden rounded-3xl border border-white/15 bg-white/5 shadow-2xl shadow-black/30 lg:max-w-none">
        <div className="relative aspect-[4/5] sm:aspect-square">
          <Image
            src={HOME_MOCKUPS.framedBedroom}
            alt="Framed wedding star map displayed in a styled bedroom"
            width={900}
            height={1125}
            priority
            sizes="(max-width: 1024px) 100vw, 420px"
            className="h-full w-full object-cover"
          />
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-midnight/90 via-midnight/50 to-transparent px-4 pb-4 pt-16">
            <p className="text-sm font-semibold text-amber-50">Gift-ready framed print</p>
            <p className="mt-1 text-xs text-amber-100/85">
              Room styling mockup — personalized to your wedding date and venue.
            </p>
          </div>
        </div>
      </figure>
    </header>
  );
}
