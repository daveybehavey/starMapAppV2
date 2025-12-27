import Link from "next/link";
import { notFound } from "next/navigation";
import { getPost } from "@/lib/blogPosts";

type Props = {
  params: Promise<{ slug: string }>;
};

export default async function BlogPostPage({ params }: Props) {
  const { slug } = await params;
  const post = getPost(slug);
  if (!post) return notFound();

  return (
    <main className="mx-auto max-w-4xl px-4 pb-12 pt-8">
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
        <div className="text-sm text-neutral-700">{post.content()}</div>
      </article>
    </main>
  );
}
