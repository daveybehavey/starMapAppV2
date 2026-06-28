import Link from "next/link";
import {
  getBlogConversionIntro,
  getOrderedBlogConversionLinks,
  resolveBlogOccasion,
} from "@/lib/blogConversionLinks";

type BlogPostConversionLinksProps = {
  /** PostHog / analytics source slug */
  source: string;
  /** Blog post slug — used to prioritize occasion-relevant money pages */
  postSlug?: string;
  className?: string;
};

export default function BlogPostConversionLinks({ source, postSlug, className }: BlogPostConversionLinksProps) {
  const occasion = postSlug ? resolveBlogOccasion(postSlug) : "general";
  const links = postSlug ? getOrderedBlogConversionLinks(postSlug) : getOrderedBlogConversionLinks("general");
  const intro = getBlogConversionIntro(occasion);

  return (
    <section
      className={`rounded-2xl border border-amber-200/40 bg-amber-400/10 p-5 ${className ?? ""}`.trim()}
    >
      <h2 className="text-lg font-semibold text-amber-100">Ready to design yours?</h2>
      <p className="mt-1 text-sm text-neutral-200">{intro}</p>
      <ul className="mt-4 flex flex-wrap gap-2">
        {links.map((item) => (
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
