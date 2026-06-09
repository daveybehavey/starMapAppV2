import HeroEditorDeferred from "@/components/HeroEditorDeferred";
import { HomeHeroCta } from "./HomeHeroCta";
import { HomeHeroTracker } from "./HomeHeroTracker";

function HeroStarIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 2.5l2.2 5.4 5.8.5-4.4 3.8 1.3 5.7L12 15.8 7.1 18l1.3-5.7-4.4-3.8 5.8-.5L12 2.5z" />
    </svg>
  );
}

function HeroPlayIcon({ className = "h-3.5 w-3.5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M8 5.5v13l11-6.5-11-6.5z" />
    </svg>
  );
}

function HeroBadgeIcon({ className = "h-6 w-6" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9 12.75 11.25 15 15 9.75M21 12c0 1.268-.63 2.39-1.593 3.068a3.745 3.745 0 0 1-1.043 3.296 3.745 3.745 0 0 1-3.296 1.043A3.745 3.745 0 0 1 12 21c-1.268 0-2.39-.63-3.068-1.593a3.746 3.746 0 0 1-3.296-1.043 3.745 3.745 0 0 1-1.043-3.296A3.745 3.745 0 0 1 3 12c0-1.268.63-2.39 1.593-3.068a3.745 3.745 0 0 1 1.043-3.296 3.746 3.746 0 0 1 3.296-1.043A3.745 3.745 0 0 1 12 3c1.268 0 2.39.63 3.068 1.593a3.746 3.746 0 0 1 3.296 1.043 3.746 3.746 0 0 1 1.043 3.296A3.745 3.745 0 0 1 21 12Z"
      />
    </svg>
  );
}

function HeroGiftIcon({ className = "h-6 w-6" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M21 11.25v8.25a1.5 1.5 0 0 1-1.5 1.5H5.25a1.5 1.5 0 0 1-1.5-1.5v-8.25M12 4.875A2.625 2.625 0 1 0 9.375 7.5H12m0-2.625V7.5m0-2.625A2.625 2.625 0 1 1 14.625 7.5H12m0 0V21m-8.625-9.75h18c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125h-18c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125Z"
      />
    </svg>
  );
}

function HeroTruckIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M8.25 18.75a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 0 1-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a18.902 18.902 0 0 0-3.213-9.193 2.056 2.056 0 0 0-1.58-.86H14.25M16.5 18.75h-2.25m0-11.177A48.78 48.78 0 0 0 12 6.75c-2.291 0-4.545.16-6.75.47m13.5 0c1.01.143 2.01.317 3 .52m-3-.52 2.62 10.726c.122.499-.106 1.028-.589 1.202a18.934 18.934 0 0 1-5.856 1.015 19.023 19.023 0 0 1-5.856-1.015 1.208 1.208 0 0 1-.589-1.202m0 0V6.75"
      />
    </svg>
  );
}

function HeroReturnIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182"
      />
    </svg>
  );
}

const VALUE_PROPS = [
  { title: "100% Personalized", detail: "Your exact date, time & location", icon: HeroStarIcon },
  { title: "Premium Quality", detail: "Museum-grade prints & materials", icon: HeroBadgeIcon },
  { title: "Made to Gift", detail: "Beautifully packaged for every order", icon: HeroGiftIcon },
] as const;

const TRUST_ITEMS = [
  { title: "Free shipping", detail: "On orders over $75", icon: HeroTruckIcon },
  { title: "30-day returns", detail: "Love it or return it", icon: HeroReturnIcon },
  { title: "5-star reviews", detail: "Thousands of happy customers", icon: HeroStarIcon },
] as const;

export default function HomeHero() {
  return (
    <>
      <HomeHeroTracker />
      <section className="hero-plan" aria-labelledby="home-hero-heading">
        <div className="hero-plan__media" aria-hidden="true">
          <picture>
            <source media="(min-width: 1024px)" srcSet="/textures/star-map-hero/desktop.webp" />
            <source media="(min-width: 640px)" srcSet="/textures/star-map-hero/tablet.webp" />
            <img
              src="/textures/star-map-hero/phone.webp"
              alt=""
              fetchPriority="high"
              decoding="async"
              width={1080}
              height={1920}
              className="hero-plan__bg-img"
            />
          </picture>
        </div>

        <div className="hero-plan__inner">
          <div className="hero-plan__copy">
            <p className="hero-plan__eyebrow">Your story. Written in the stars.</p>
            <h1 id="home-hero-heading" className="hero-plan__headline font-[var(--font-playfair)]">
              The night you became everything.
            </h1>
            <p className="hero-plan__subhead">
              Personalized star maps that capture life&apos;s most meaningful moments.
            </p>

            <div className="hero-plan__cta-row">
              <HomeHeroCta
                href="/editor?mode=quick&source=home-hero-create"
                className="hero-plan__cta hero-plan__cta--primary"
                plan="create"
                placement="primary"
                label="create_your_star_map"
              >
                <HeroStarIcon className="h-4 w-4 shrink-0" />
                Create your star map
              </HomeHeroCta>
              <HomeHeroCta
                href="#how-it-works"
                className="hero-plan__cta hero-plan__cta--ghost"
                plan="how_it_works"
                placement="secondary"
                label="how_it_works"
              >
                <HeroPlayIcon className="h-3.5 w-3.5 shrink-0" />
                How it works
              </HomeHeroCta>
            </div>
            <p className="hero-plan__cta-note">
              Or{" "}
              <a href="#preview" className="hero-plan__cta-note-link">
                try the free live preview
              </a>{" "}
              first — no account required.
            </p>

            <ul className="hero-plan__value-props">
              {VALUE_PROPS.map((item) => {
                const Icon = item.icon;
                return (
                  <li key={item.title} className="hero-plan__value-prop">
                    <Icon className="hero-plan__value-icon" />
                    <div>
                      <p className="hero-plan__value-title">{item.title}</p>
                      <p className="hero-plan__value-detail">{item.detail}</p>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>

        <div className="hero-plan__trust" aria-label="Purchase assurances">
          {TRUST_ITEMS.map((item) => {
            const Icon = item.icon;
            return (
              <div key={item.title} className="hero-plan__trust-item">
                <Icon className="hero-plan__trust-icon" />
                <div>
                  <p className="hero-plan__trust-title">{item.title}</p>
                  <p className="hero-plan__trust-detail">{item.detail}</p>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="hero-plan-preview px-4 py-8 sm:px-6 sm:py-10 lg:px-12">
        <div className="mx-auto w-full max-w-2xl">
          <div className="mb-5 text-center">
            <p className="hero-plan__eyebrow text-amber-200/90">Free live preview</p>
            <h2 className="mt-2 text-xl font-semibold text-white sm:text-2xl font-[var(--font-playfair)]">
              Enter your date and location
            </h2>
            <p className="mt-2 text-sm text-neutral-300">See your sky in seconds — no account required.</p>
          </div>
          <HeroEditorDeferred />
        </div>
      </section>
    </>
  );
}
