import HeroEditorDeferred from "@/components/HeroEditorDeferred";

type PriceLabels = {
  single: string;
  pack3: string;
  subscription: string;
  packSavingsPercent: number;
};

type HomeHeroProps = {
  priceLabels: PriceLabels;
};

export default function HomeHero({ priceLabels }: HomeHeroProps) {
  return (
    <main className="flex flex-col items-center px-4 py-6 sm:px-6 sm:py-8 md:px-8 lg:px-12 lg:py-10">
      <section className="particles-bg mx-auto w-full max-w-7xl py-12 sm:py-16 lg:py-20">
        <div className="mb-8 space-y-5 text-center lg:mb-10">
          <h1 className="max-[374px]:text-[1.75rem] text-3xl font-bold leading-tight text-white sm:text-4xl lg:text-5xl">
            Create a custom{" "}
            <span className="bg-gradient-to-r from-amber-200 via-amber-400 to-amber-200 bg-clip-text text-transparent animate-shimmer">
              star map
            </span>{" "}
            of the night sky
          </h1>
          <p className="mx-auto max-w-2xl text-base text-neutral-200 sm:text-lg">
            See the exact sky from your wedding, birthday, or meaningful moment — personalized in seconds.
          </p>
          <div className="mx-auto flex max-w-2xl flex-wrap items-center justify-center gap-2 pt-1 text-[11px] font-semibold text-amber-100/90">
            <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1">Free live preview</span>
            <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1">No account required</span>
            <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1">HD export in seconds</span>
          </div>
        </div>

        <HeroEditorDeferred />

        <div className="mx-auto mt-4 w-full max-w-2xl rounded-2xl border border-white/10 bg-white/5 px-4 py-4 text-left sm:px-5">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-200/80">
            Ready to buy now?
          </p>
          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            <a
              href="/api/checkout?plan=single"
              rel="nofollow"
              className="rounded-full border border-white/20 bg-white/10 px-4 py-2 text-center text-sm font-semibold text-white transition hover:-translate-y-[1px] hover:border-amber-300/60 hover:bg-white/15"
            >
              Single {priceLabels.single}
            </a>
            <a
              href="/api/checkout?plan=pack3"
              rel="nofollow"
              className="rounded-full border border-amber-300/40 bg-amber-300/15 px-4 py-2 text-center text-sm font-semibold text-amber-100 transition hover:-translate-y-[1px] hover:border-amber-300/70 hover:bg-amber-300/20"
            >
              3-pack {priceLabels.pack3}
              {priceLabels.packSavingsPercent > 0 ? ` (${priceLabels.packSavingsPercent}% off)` : ""}
            </a>
            <a
              href="/api/checkout?plan=subscription"
              rel="nofollow"
              className="rounded-full border border-white/20 bg-white/10 px-4 py-2 text-center text-sm font-semibold text-white transition hover:-translate-y-[1px] hover:border-amber-300/60 hover:bg-white/15"
            >
              Unlimited {priceLabels.subscription}/mo
            </a>
          </div>
        </div>
      </section>
    </main>
  );
}
