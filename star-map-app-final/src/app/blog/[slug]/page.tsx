import Link from "next/link";
import Script from "next/script";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getPost } from "@/lib/blogPosts";

type Props = {
  params: Promise<{ slug: string }>;
};

const articleDateFormatter = new Intl.DateTimeFormat("en-US", {
  year: "numeric",
  month: "long",
  day: "numeric",
  timeZone: "UTC",
});

const formatArticleDate = (date: string) => {
  if (!date) return "";
  const parsed = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return date;
  return articleDateFormatter.format(parsed);
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const post = getPost(slug);
  if (!post) return {};

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://starmapco.com";
  const url = `${siteUrl}/blog/${slug}`;
  const ogImageUrl = `${url}/opengraph-image`;

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
          url: ogImageUrl,
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
      images: [ogImageUrl],
    },
  };
}

export default async function BlogPostPage({ params }: Props) {
  const { slug } = await params;
  const post = getPost(slug);
  if (!post) return notFound();
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://starmapco.com";

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
    mainEntityOfPage: `${siteUrl}/blog/${slug}`,
    image: `${siteUrl}/blog/${slug}/opengraph-image`,
  };

  return (
    <main className="mx-auto max-w-4xl px-4 pt-8 pb-12">
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
        <div className="text-sm tracking-wide text-amber-700 uppercase">{formatArticleDate(post.date)}</div>
        <h1 className="text-midnight text-3xl font-semibold sm:text-4xl">{post.title}</h1>
        <p className="text-base text-neutral-800">{post.description}</p>
        <div className="[&_h2]:text-midnight [&_h3]:text-midnight text-[1.02rem] leading-7 text-neutral-800 [&_a]:font-medium [&_a]:text-amber-700 hover:[&_a]:text-amber-900 hover:[&_a]:underline [&_h2]:mt-10 [&_h2]:mb-4 [&_h2]:text-2xl [&_h2]:font-semibold [&_h3]:mt-7 [&_h3]:mb-2 [&_h3]:text-xl [&_h3]:font-semibold [&_li]:my-1.5 [&_ol]:my-4 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:my-4 [&_p:first-child]:mt-0 [&_table]:my-6 [&_table]:w-full [&_table]:border-collapse [&_td]:border [&_td]:border-amber-200/40 [&_td]:p-2 [&_td]:align-top [&_th]:border [&_th]:border-amber-200/50 [&_th]:bg-amber-50/50 [&_th]:p-2 [&_th]:text-left [&_th]:text-sm [&_ul]:my-4 [&_ul]:list-disc [&_ul]:pl-5">
          {post.content()}
        </div>
        <div className="mt-8 rounded-2xl border border-amber-200/60 bg-white/70 px-4 py-5 text-neutral-800 shadow-md">
          <h2 className="text-midnight text-lg font-semibold">Ready to create your own star map?</h2>
          <p className="mt-2 text-sm text-neutral-700">
            Build a custom star map from any date and location. Instant preview, print-ready downloads, and
            flexible pricing.
          </p>
          <div className="mt-4 flex flex-wrap gap-3 text-sm font-semibold">
            <Link
              href="/"
              className="text-midnight rounded-full bg-amber-400 px-4 py-2 shadow-sm transition hover:-translate-y-[1px] hover:shadow-md"
            >
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
      </article>
    </main>
  );
}
