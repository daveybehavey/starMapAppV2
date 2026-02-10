import HeroCheckoutButtons from "@/components/HeroCheckoutButtons";
import HeroEditorIsland from "@/components/HeroEditorIsland";

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

          <HeroCheckoutButtons priceLabels={priceLabels} />
        </div>
        <HeroEditorIsland />
      </section>
    </main>
  );
}
