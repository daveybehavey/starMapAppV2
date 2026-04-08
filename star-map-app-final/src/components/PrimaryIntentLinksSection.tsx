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
  return (
    <section className="content-visibility-auto mt-6 rounded-3xl border border-black/5 bg-white/90 p-5 shadow-xl shadow-black/10">
      <h2 className="text-base font-semibold text-midnight">{heading}</h2>
      <p className="mt-2 text-sm text-neutral-700">{intro}</p>
      <div className="mt-4 flex flex-wrap gap-2 text-sm font-semibold text-amber-700">
        {links.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className={
              link.recommended
                ? "rounded-full border border-amber-200/60 bg-amber-50/70 px-3 py-1.5 transition hover:border-amber-400 hover:bg-amber-100"
                : "rounded-full border border-amber-200/60 bg-white/80 px-3 py-1.5 transition hover:border-amber-400 hover:bg-amber-50"
            }
          >
            {link.label}
          </Link>
        ))}
      </div>
    </section>
  );
}
