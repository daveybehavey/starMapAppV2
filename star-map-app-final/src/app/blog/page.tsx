"use client";

import Link from "next/link";
import { blogPosts } from "@/lib/blogPosts";

export default function BlogIndex() {
  return (
    <main className="mx-auto max-w-4xl px-4 pb-12 pt-8">
      <header className="mb-8">
        <p className="text-xs uppercase tracking-[0.35em] text-amber-200">Blog</p>
        <h1 className="mt-2 text-3xl font-semibold text-white sm:text-4xl">Stories & Guides</h1>
        <p className="mt-2 text-base text-amber-50/80">
          Inspiration and how-tos for creating personalized star maps for weddings, anniversaries, and milestones.
        </p>
      </header>
      <div className="grid gap-4">
        {blogPosts.map((post) => (
          <Link
            key={post.slug}
            href={`/blog/${post.slug}`}
            className="rounded-2xl border border-amber-200/70 bg-[rgba(247,241,227,0.9)] px-4 py-4 shadow-md transition hover:-translate-y-[1px] hover:shadow-lg"
          >
            <div className="text-sm uppercase tracking-wide text-amber-700">{new Date(post.date).toDateString()}</div>
            <h2 className="mt-1 text-xl font-semibold text-midnight">{post.title}</h2>
            <p className="mt-1 text-sm text-neutral-800">{post.description}</p>
            <div className="mt-2 flex flex-wrap gap-2 text-xs text-neutral-600">
              {post.keywords.slice(0, 3).map((kw) => (
                <span
                  key={kw}
                  className="rounded-full border border-amber-200 bg-[rgba(247,241,227,0.95)] px-2 py-1 font-semibold"
                >
                  {kw}
                </span>
              ))}
            </div>
          </Link>
        ))}
      </div>
    </main>
  );
}
