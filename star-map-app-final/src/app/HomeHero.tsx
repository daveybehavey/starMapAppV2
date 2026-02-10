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

          <div className="mx-auto grid w-full max-w-sm grid-cols-1 gap-3 pt-2 sm:max-w-lg sm:grid-cols-3">
            <a
              href="/api/checkout?plan=single"
              className="pricing-card max-[374px]:px-4 max-[374px]:py-4 w-full text-center focus:outline-none focus:ring-2 focus:ring-amber-300/80 focus:ring-offset-2 focus:ring-offset-transparent"
            >
              <div className="text-xs uppercase tracking-wide text-neutral-400">Single Map</div>
              <div className="text-lg font-bold text-white">{priceLabels.single}</div>
              <div className="mt-1 text-[11px] font-semibold text-amber-300">Buy single</div>
            </a>
            <a
              href="/api/checkout?plan=pack3"
              className="pricing-card featured max-[374px]:px-4 max-[374px]:py-4 w-full text-center focus:outline-none focus:ring-2 focus:ring-amber-300/80 focus:ring-offset-2 focus:ring-offset-transparent"
            >
              <div className="text-xs uppercase tracking-wide text-amber-300">3-Pack</div>
              <div className="text-lg font-bold text-white">{priceLabels.pack3}</div>
              <div className="mt-1 text-[10px] font-semibold uppercase tracking-wider text-amber-400">
                {priceLabels.packSavingsPercent > 0 ? `Save ${priceLabels.packSavingsPercent}%` : "Best value"}
              </div>
              <div className="mt-1 text-[11px] font-semibold text-amber-300">Get 3-pack</div>
            </a>
            <a
              href="/api/checkout?plan=subscription"
              className="pricing-card max-[374px]:px-4 max-[374px]:py-4 w-full text-center focus:outline-none focus:ring-2 focus:ring-amber-300/80 focus:ring-offset-2 focus:ring-offset-transparent"
            >
              <div className="text-xs uppercase tracking-wide text-neutral-400">Unlimited</div>
              <div className="text-lg font-bold text-white">
                {priceLabels.subscription}
                <span className="text-sm font-normal text-neutral-400">/mo</span>
              </div>
              <div className="mt-1 text-[11px] font-semibold text-amber-300">Start unlimited</div>
            </a>
          </div>
        </div>
        <HeroEditorDeferred />
      </section>
    </main>
  );
}
