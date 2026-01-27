import Link from "next/link";
import Script from "next/script";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getPost } from "@/lib/blogPosts";

type Props = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const post = getPost(slug);
  if (!post) return {};

  const url = `https://starmapco.com/blog/${slug}`;

  return {
    title: post.title,
    description: post.description,
    keywords: post.keywords,
    alternates: { canonical: url },
    openGraph: {
      title: post.title,
      description: post.description,
      url,
      type: "article",
      publishedTime: post.date,
      images: [
        {
          url: "https://starmapco.com/custom-star-map-anniversary.webp",
          width: 1200,
          height: 630,
          alt: post.title,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: post.title,
      description: post.description,
      images: ["https://starmapco.com/custom-star-map-anniversary.webp"],
    },
  };
}

export default async function BlogPostPage({ params }: Props) {
  const { slug } = await params;
  const post = getPost(slug);
  if (!post) return notFound();

  const articleSchema = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: post.title,
    description: post.description,
    datePublished: post.date,
    dateModified: post.date,
    author: { "@type": "Organization", name: "StarMapCo" },
    publisher: {
      "@type": "Organization",
      name: "StarMapCo",
      logo: { "@type": "ImageObject", url: "https://starmapco.com/favicon.png" },
    },
    mainEntityOfPage: `https://starmapco.com/blog/${slug}`,
    image: "https://starmapco.com/custom-star-map-anniversary.webp",
  };

  return (
    <main className="mx-auto max-w-4xl px-4 pb-12 pt-8">
      <Script
        id="article-schema"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(articleSchema) }}
      />
      <Link
        href="/blog"
        className="mb-4 inline-flex items-center gap-2 rounded-full border border-amber-200 bg-[rgba(247,241,227,0.95)] px-3 py-1 text-sm font-semibold text-neutral-800 shadow-sm transition hover:-translate-y-[1px] hover:shadow"
      >
        ← Back to blog
      </Link>
      <article className="space-y-4 rounded-3xl border border-amber-200 bg-[rgba(247,241,227,0.95)] px-5 py-6 shadow-lg">
        <div className="text-sm uppercase tracking-wide text-amber-700">
          {new Date(post.date).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })}
        </div>
        <h1 className="text-3xl font-semibold text-midnight sm:text-4xl">{post.title}</h1>
        <p className="text-base text-neutral-800">{post.description}</p>
        <div className="text-sm text-neutral-700">
          {post.content()}
          <div className="mt-8 rounded-2xl border border-amber-200/60 bg-white/70 px-4 py-5 text-neutral-800 shadow-md">
            <h2 className="text-lg font-semibold text-midnight">Ready to create your own star map?</h2>
            <p className="mt-2 text-sm text-neutral-700">
              Build a custom star map from any date and location. Instant preview, print-ready download, and a one-time unlock.
            </p>
            <div className="mt-4 flex flex-wrap gap-3 text-sm font-semibold">
              <Link href="/" className="rounded-full bg-amber-400 px-4 py-2 text-midnight shadow-sm transition hover:-translate-y-[1px] hover:shadow-md">
                Start free preview
              </Link>
              <Link href="/star-map-generator" className="text-amber-700 underline hover:text-amber-900">
                Star map generator
              </Link>
              <Link href="/constellation-map" className="text-amber-700 underline hover:text-amber-900">
                Constellation map
              </Link>
              <Link href="/personalized-star-map" className="text-amber-700 underline hover:text-amber-900">
                Personalized star map
              </Link>
            </div>
          </div>
        </div>
      </article>
    </main>
  );
}
