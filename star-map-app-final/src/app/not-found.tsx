import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-10 sm:py-14">
      <div className="cosmic-panel rounded-3xl border border-amber-200/70 bg-[rgba(247,241,227,0.9)] p-6 shadow-2xl sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.25em] text-amber-700">404</p>
        <h1 className="mt-2 text-3xl font-semibold text-midnight sm:text-4xl">That page is not on this map</h1>
        <p className="mt-3 text-sm text-neutral-900 sm:text-base">
          The page you are looking for does not exist or may have moved. Your sky is still easy to find — start from
          one of these instead:
        </p>
        <div className="mt-6 flex flex-wrap gap-3 text-sm">
          <Link
            href="/editor"
            className="inline-flex items-center justify-center rounded-full bg-midnight px-5 py-2.5 font-semibold text-white transition hover:bg-midnight/90"
          >
            Create your star map
          </Link>
          <Link
            href="/shop"
            className="inline-flex items-center justify-center rounded-full border border-amber-300/70 bg-amber-50 px-5 py-2.5 font-semibold text-amber-950 transition hover:bg-amber-100"
          >
            Browse prints &amp; gifts
          </Link>
        </div>
        <p className="mt-6 text-sm text-neutral-900">
          Still stuck? Visit{" "}
          <Link className="font-semibold text-midnight underline" href="/support">
            Support
          </Link>{" "}
          and we will point you in the right direction.
        </p>
      </div>
    </main>
  );
}
