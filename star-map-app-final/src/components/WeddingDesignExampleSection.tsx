import Image from "next/image";
import Link from "next/link";
import { WEDDING_PROOF } from "@/lib/weddingProofAssets";

type WeddingDesignExampleSectionProps = {
  previewHref: string;
};

export default function WeddingDesignExampleSection({ previewHref }: WeddingDesignExampleSectionProps) {
  return (
    <section className="content-visibility-auto mt-8 overflow-hidden rounded-3xl border border-amber-200/60 bg-gradient-to-br from-white via-amber-50/40 to-white shadow-xl shadow-black/10">
      <div className="grid gap-0 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)] lg:items-center">
        <figure className="relative mx-auto w-full max-w-sm p-5 lg:max-w-none lg:p-8">
          <div className="relative aspect-square overflow-hidden rounded-2xl border border-black/10 bg-[#0a1228] shadow-lg">
            <Image
              src={WEDDING_PROOF.designExample}
              alt="Example wedding star map with heart layout, ceremony date, and location"
              width={900}
              height={900}
              sizes="(max-width: 1024px) 90vw, 420px"
              className="h-full w-full scale-[1.22] object-cover object-center"
            />
          </div>
          <figcaption className="mt-3 text-center text-[11px] font-medium text-neutral-600 lg:text-left">
            Example wedding preset · your date, place, and dedication replace the sample text
          </figcaption>
        </figure>

        <div className="space-y-4 px-6 pb-8 pt-2 lg:px-8 lg:py-8">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-amber-800">What you personalize</p>
          <h2 className="text-xl font-semibold text-midnight sm:text-2xl">Ceremony night, written in the stars</h2>
          <p className="text-sm leading-relaxed text-neutral-800 sm:text-base">
            Every map uses your wedding date, ceremony location, and optional dedication lines. Preview the exact layout
            before you pay — then order framed + HD from the same approved design.
          </p>
          <ul className="space-y-2.5 text-sm text-neutral-800">
            {[
              "Heart or circle layout with gold accents for wedding gifts",
              "Accurate constellations for your date, time, and coordinates",
              "Framed print + instant HD digital from one checkout",
            ].map((item) => (
              <li key={item} className="flex gap-2">
                <span className="mt-0.5 text-amber-600" aria-hidden="true">
                  ✓
                </span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
          <Link
            href={previewHref}
            className="inline-flex min-h-11 items-center justify-center rounded-full bg-gradient-to-r from-amber-400 via-amber-500 to-amber-400 px-5 py-3 text-sm font-semibold text-midnight shadow-lg shadow-amber-200/80 transition hover:-translate-y-[1px] focus:outline-none focus:ring-2 focus:ring-gold"
          >
            Preview with your date &amp; place
          </Link>
        </div>
      </div>
    </section>
  );
}
