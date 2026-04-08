import Link from "next/link";

type PrimaryIntentLink = {
  href: string;
  label: string;
  recommended?: boolean;
};

type PrimaryIntentLinksSectionProps = {
  heading: string;
  intro: string;
  links: PrimaryIntentLink[];
};

export default function PrimaryIntentLinksSection({
  heading,
  intro,
  links,
}: PrimaryIntentLinksSectionProps) {
  const recommendedLink = links.find((link) => link.recommended) ?? null;
  const secondaryLinks = recommendedLink ? links.filter((link) => link.href !== recommendedLink.href) : links;

  return (
    <section className="content-visibility-auto mt-6 rounded-3xl border border-black/5 bg-white/90 p-5 shadow-xl shadow-black/10">
      <h2 className="text-base font-semibold text-midnight">{heading}</h2>
      <p className="mt-2 text-sm text-neutral-700">{intro}</p>
      {recommendedLink ? (
        <div className="mt-4 rounded-2xl border border-amber-200/70 bg-gradient-to-br from-amber-50 via-white to-amber-50/80 p-4 shadow-sm shadow-amber-100/60">
          <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-amber-700">Best starting page</p>
          <Link
            href={recommendedLink.href}
            className="mt-2 inline-flex rounded-full border border-amber-300/70 bg-amber-100 px-3 py-1.5 text-sm font-semibold text-amber-800 transition hover:border-amber-500 hover:bg-amber-200"
          >
            {recommendedLink.label}
          </Link>
          <p className="mt-2 text-sm text-neutral-700">
            Use this route when you want the strongest main page for this search intent instead of a supporting explainer.
          </p>
        </div>
      ) : null}
      {secondaryLinks.length > 0 ? (
        <div className="mt-4">
          {recommendedLink ? (
            <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-neutral-500">Also useful</p>
          ) : null}
          <div className="mt-2 flex flex-wrap gap-2 text-sm font-semibold text-amber-700">
            {secondaryLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="rounded-full border border-amber-200/60 bg-white/80 px-3 py-1.5 transition hover:border-amber-400 hover:bg-amber-50"
              >
                {link.label}
              </Link>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}
