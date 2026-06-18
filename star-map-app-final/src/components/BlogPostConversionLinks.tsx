import Link from "next/link";

type BlogPostConversionLinksProps = {
  /** PostHog / analytics source slug */
  source: string;
};

const LINKS = [
  { href: "/editor", label: "Create your star map" },
  { href: "/star-map-for/engagement", label: "Engagement star map gift" },
  { href: "/star-map-for/proposal", label: "Proposal star map gift" },
  { href: "/star-map-for/memorial", label: "Memorial star map gift" },
  { href: "/hd-star-map", label: "Instant HD download" },
  { href: "/personalized-star-map", label: "Personalized star map gifts" },
  { href: "/star-map-for/new-baby", label: "New baby star maps" },
  { href: "/birthday", label: "Birthday star maps" },
  { href: "/star-map-gift", label: "Star map gift ideas" },
  { href: "/wedding", label: "Wedding star maps" },
  { href: "/how-accurate-are-star-maps", label: "How accurate are star maps?" },
] as const;

export default function BlogPostConversionLinks({ source }: BlogPostConversionLinksProps) {
  return (
    <section className="mt-10 rounded-2xl border border-amber-200/40 bg-amber-400/10 p-5">
      <h2 className="text-lg font-semibold text-amber-100">Ready to design yours?</h2>
      <p className="mt-1 text-sm text-neutral-200">
        Free preview in the editor — HD download or printed delivery when you are happy with the sky.
      </p>
      <ul className="mt-4 flex flex-wrap gap-2">
        {LINKS.map((item) => (
          <li key={item.href}>
            <Link
              href={`${item.href}?source=blog_${source}`}
              className="inline-flex rounded-full border border-amber-200/50 bg-white/10 px-3 py-1.5 text-xs font-semibold text-amber-50 transition hover:border-amber-200 hover:bg-white/15"
            >
              {item.label}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
