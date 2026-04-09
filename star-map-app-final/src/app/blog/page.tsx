import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { blogPosts } from "@/lib/blogPosts";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://starmapco.com";
const redirectedBlogSlugs = new Set(["most-meaningful-valentines-day-gift-custom-star-map"]);

export const metadata: Metadata = {
  title: "Blog: Custom Star Map Guides | StarMapCo",
  description:
    "Read StarMapCo blog guides for gift-buying decisions, personalized star map ideas, seasonal occasions, and astronomy-backed customization tips.",
  keywords: [
    "custom star map blog",
    "star map gift guide",
    "is a star map a good gift",
    "framed vs unframed star map",
    "personalized star map guides",
    "valentine's day star map gift ideas",
    "mother's day star map gift ideas",
    "father's day star map gift ideas",
    "graduation star map gift ideas",
    "anniversary star map ideas",
    "wedding star map tips",
  ],
  alternates: { canonical: `${siteUrl}/blog` },
  openGraph: {
    title: "Blog: Custom Star Map Guides",
    description:
      "Read our blog for ideas on Valentine's Day, anniversary, birthday, and wedding star maps, plus astronomy tips.",
    images: [
      {
        url: `${siteUrl}/custom-star-map-anniversary.webp`,
        width: 1200,
        height: 630,
        alt: "StarMapCo blog open graph image",
      },
    ],
  },
  twitter: {
    title: "Blog: Custom Star Map Guides",
    description:
      "Read our blog for ideas on Valentine's Day, anniversary, birthday, and wedding star maps, plus astronomy tips.",
    images: [`${siteUrl}/custom-star-map-anniversary.webp`],
    card: "summary_large_image",
  },
};

type IndexPost = {
  slug: string;
  title: string;
  excerpt: string;
  date: string;
  image: string;
  alt: string;
};

const FALLBACK_BLOG_IMAGE = "/custom-star-map-anniversary.webp";
const FEATURED_BLOG_SLUGS = [
  "mothers-day-star-map-gift-ideas",
  "graduation-star-map-gift",
  "fathers-day-star-map-gift-ideas",
] as const;

function resolveBlogCardImage(rawImage?: string) {
  if (!rawImage) return FALLBACK_BLOG_IMAGE;
  if (rawImage.toLowerCase().endsWith(".svg")) return FALLBACK_BLOG_IMAGE;
  return rawImage;
}

const allIndexPosts: IndexPost[] = [...blogPosts]
  .filter((post) => !redirectedBlogSlugs.has(post.slug))
  .sort((a, b) => b.date.localeCompare(a.date))
  .map((post) => ({
    slug: post.slug,
    title: post.title,
    excerpt: post.description,
    date: post.date,
    image: resolveBlogCardImage(post.ogImage),
    alt: post.title,
  }));

const featuredPostSlugSet = new Set<string>(FEATURED_BLOG_SLUGS);
const featuredPosts: IndexPost[] = FEATURED_BLOG_SLUGS.map((slug) =>
  allIndexPosts.find((post) => post.slug === slug),
).filter((post): post is IndexPost => Boolean(post));

const indexPosts: IndexPost[] = allIndexPosts.filter((post) => !featuredPostSlugSet.has(post.slug));

const blogDateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});

const formatBlogDate = (date: string) => {
  if (!date) return "";
  const parsed = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return date;
  return blogDateFormatter.format(parsed);
};

export default function BlogIndex() {
  return (
    <main className="bg-[#050915] px-4 pt-10 pb-16 text-white">
      <header className="mx-auto mb-8 max-w-5xl space-y-3">
        <p className="text-sm tracking-[0.25em] text-amber-300 uppercase">Blog</p>
        <h1 className="text-3xl font-bold text-amber-200 sm:text-4xl">
          StarMapCo Blog: Stories &amp; Guides
        </h1>
        <p className="text-base text-neutral-200 sm:text-lg">
          Explore guides and inspiration for creating your perfect custom star map. From anniversary ideas to
          astronomy insights.
        </p>
      </header>

      <section className="mx-auto max-w-5xl">
        {featuredPosts.length ? (
          <section className="mb-10 rounded-3xl border border-amber-200/30 bg-white/[0.04] p-5 shadow-lg shadow-black/20">
            <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
              <div className="space-y-1">
                <p className="text-xs uppercase tracking-[0.28em] text-amber-300/85">Seasonal guides</p>
                <h2 className="text-2xl font-semibold text-amber-100 sm:text-3xl">
                  Timely gift guides worth surfacing now
                </h2>
              </div>
              <Link href="/" className="text-sm font-semibold text-amber-300 hover:underline">
                Start free preview
              </Link>
            </div>
            <div className="grid gap-5 md:grid-cols-3">
              {featuredPosts.map((post) => (
                <article
                  key={`featured-${post.slug}`}
                  className="text-midnight flex h-full flex-col overflow-hidden rounded-2xl border border-amber-200/60 bg-[rgba(247,241,227,0.94)] shadow-lg transition hover:-translate-y-[2px] hover:shadow-2xl"
                >
                  <div className="relative h-44 w-full">
                    <Image
                      src={post.image}
                      alt={post.alt}
                      fill
                      className="object-cover"
                      loading="lazy"
                      sizes="(min-width: 768px) 33vw, 100vw"
                    />
                  </div>
                  <div className="flex flex-1 flex-col p-4">
                    <div className="text-xs tracking-wide text-amber-700 uppercase">{formatBlogDate(post.date)}</div>
                    <h3 className="text-midnight mt-2 text-lg font-semibold">
                      <Link href={`/blog/${post.slug}`} className="hover:underline">
                        {post.title}
                      </Link>
                    </h3>
                    <p className="mt-2 line-clamp-4 text-sm text-neutral-800">{post.excerpt}</p>
                    <div className="mt-auto pt-3">
                      <Link
                        href={`/blog/${post.slug}`}
                        className="inline-flex items-center gap-2 text-sm font-semibold text-amber-700 hover:underline"
                      >
                        Read guide →
                      </Link>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </section>
        ) : null}

        <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
          {indexPosts.map((post) => (
            <article
              key={post.slug + post.title}
              className="text-midnight flex h-full flex-col overflow-hidden rounded-2xl border border-amber-200/60 bg-[rgba(247,241,227,0.9)] shadow-lg transition hover:-translate-y-[2px] hover:shadow-2xl"
            >
              <div className="relative h-48 w-full">
                <Image
                  src={post.image}
                  alt={post.alt}
                  fill
                  className="object-cover"
                  loading="lazy"
                  sizes="(min-width: 1024px) 33vw, (min-width: 768px) 50vw, 100vw"
                />
              </div>
              <div className="flex flex-1 flex-col p-4">
                <div className="text-xs tracking-wide text-amber-700 uppercase">{formatBlogDate(post.date)}</div>
                <h2 className="text-midnight mt-2 text-xl font-semibold">
                  <Link href={`/blog/${post.slug}`} className="hover:underline">
                    {post.title}
                  </Link>
                </h2>
                <p className="mt-2 line-clamp-3 text-sm text-neutral-800">{post.excerpt}</p>
                <div className="mt-auto pt-3">
                  <Link
                    href={`/blog/${post.slug}`}
                    className="inline-flex items-center gap-2 text-sm font-semibold text-amber-700 hover:underline"
                  >
                    Read more →
                  </Link>
                </div>
              </div>
            </article>
          ))}
        </div>

        <div className="mt-10 text-center text-base text-neutral-200">
          Ready to create?{" "}
          <Link href="/" className="font-semibold text-amber-300 hover:underline">
            Start free preview
          </Link>
        </div>
      </section>
    </main>
  );
}
