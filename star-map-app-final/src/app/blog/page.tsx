import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { blogPosts } from "@/lib/blogPosts";

export const metadata: Metadata = {
  title: "StarMapCo Blog | Guides & Inspiration for Custom Star Maps",
  description:
    "Read our blog for ideas on anniversary, birthday, and wedding star maps, plus astronomy tips.",
  keywords: [
    "custom star map blog",
    "personalized star map guides",
    "anniversary star map ideas",
    "wedding star map tips",
  ],
  openGraph: {
    title: "StarMapCo Blog | Guides & Inspiration for Custom Star Maps",
    description:
      "Read our blog for ideas on anniversary, birthday, and wedding star maps, plus astronomy tips.",
    images: [
      {
        url: "https://starmapco.com/custom-star-map-anniversary.webp",
        width: 1200,
        height: 630,
        alt: "StarMapCo blog open graph image",
      },
    ],
  },
  twitter: {
    title: "StarMapCo Blog | Guides & Inspiration for Custom Star Maps",
    description:
      "Read our blog for ideas on anniversary, birthday, and wedding star maps, plus astronomy tips.",
    images: ["https://starmapco.com/custom-star-map-anniversary.webp"],
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

const indexPosts: IndexPost[] = [
  {
    slug: "custom-star-maps-for-weddings",
    title: "Custom Star Maps for Weddings: How to Capture Your Night Sky",
    excerpt: "Learn how to create a personalized star map for your wedding day, from choosing location and time to styling and printing.",
    date: "2024-05-01",
    image: "/custom-star-map-anniversary.webp",
    alt: "Custom star map for wedding night sky",
  },
  {
    slug: "custom-star-map-for-anniversary",
    title: "Custom Star Map for Anniversary: A Timeless Romantic Gift",
    excerpt:
      "Discover why a custom star map for anniversary moments is one of the most romantic, personal, and unforgettable gifts you can give.",
    date: "2025-12-31",
    image: "/custom-star-map-anniversary.webp",
    alt: "Custom star map for anniversary gift",
  },
  {
    slug: "personalized-star-map-birthday-gift",
    title: "Personalized Star Map Birthday Gift - Capture the Stars on Their Special Day",
    excerpt:
      "A personalized star map birthday gift recreates the night sky from their birth date, making a thoughtful keepsake for any age.",
    date: "2025-12-31",
    image: "/custom-star-map-anniversary.webp",
    alt: "Personalized star map birthday gift preview",
  },
  {
    slug: "astronomy-behind-star-maps",
    title: "Astronomy Behind Star Maps - How Science Makes Them Accurate",
    excerpt:
      "Explore how real data from catalogs and precise calculations create accurate night-sky recreations for custom star maps.",
    date: "2025-12-31",
    image: "/custom-star-map-anniversary.webp",
    alt: "Astronomy behind star maps",
  },
  {
    slug: "choose-date-location-custom-star-map",
    title: "Choose Date Location Custom Star Map - Tips for Perfect Accuracy",
    excerpt:
      "Learn how to pick the right date and location for a custom star map, avoid common pitfalls, and capture your moment perfectly.",
    date: "2025-12-31",
    image: "/custom-star-map-anniversary.webp",
    alt: "Choose date and location for custom star map",
  },
];

export default function BlogIndex() {
  return (
    <main className="bg-[#050915] px-4 pb-16 pt-10 text-white">
      <header className="mx-auto mb-8 max-w-5xl space-y-3">
        <p className="text-sm uppercase tracking-[0.25em] text-amber-300">Blog</p>
        <h1 className="text-3xl font-bold text-amber-200 sm:text-4xl">StarMapCo Blog: Stories &amp; Guides</h1>
        <p className="text-base text-neutral-200 sm:text-lg">
          Explore guides and inspiration for creating your perfect custom star map. From anniversary ideas to astronomy
          insights.
        </p>
      </header>

      <section className="mx-auto max-w-5xl">
        <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
          {indexPosts.map((post) => (
            <article
              key={post.slug + post.title}
              className="flex h-full flex-col overflow-hidden rounded-2xl border border-amber-200/60 bg-[rgba(247,241,227,0.9)] text-midnight shadow-lg transition hover:-translate-y-[2px] hover:shadow-2xl"
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
                <div className="text-xs uppercase tracking-wide text-amber-700">
                  {post.date === "#" ? "Coming Soon" : new Date(post.date).toDateString()}
                </div>
                <h2 className="mt-2 text-xl font-semibold text-midnight">
                  {post.slug !== "#" ? (
                    <Link href={`/blog/${post.slug}`} className="hover:underline">
                      {post.title}
                    </Link>
                  ) : (
                    post.title
                  )}
                </h2>
                <p className="mt-2 line-clamp-3 text-sm text-neutral-800">{post.excerpt}</p>
                <div className="mt-auto pt-3">
                  {post.slug !== "#" ? (
                    <Link
                      href={`/blog/${post.slug}`}
                      className="inline-flex items-center gap-2 text-sm font-semibold text-amber-700 hover:underline"
                    >
                      Read more →
                    </Link>
                  ) : (
                    <span className="text-sm font-semibold text-neutral-600">Coming soon</span>
                  )}
                </div>
              </div>
            </article>
          ))}
        </div>

        <div className="mt-10 text-center text-base text-neutral-200">
          Ready to create?{" "}
          <Link href="/" className="text-amber-300 font-semibold hover:underline">
            Start now
          </Link>
        </div>
      </section>
    </main>
  );
}
