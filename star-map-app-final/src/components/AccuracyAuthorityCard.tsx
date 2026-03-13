import Link from "next/link";

type AccuracyAuthorityCardProps = {
  source: string;
  intro?: string;
};

export default function AccuracyAuthorityCard({
  source,
  intro = "See exactly what makes the map trustworthy before you buy: date handling, timezone conversion, visible-star logic, and the limits of what any star map can know.",
}: AccuracyAuthorityCardProps) {
  return (
    <section className="content-visibility-auto mt-6 rounded-3xl border border-black/5 bg-white/90 p-6 shadow-xl shadow-black/10">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-amber-500">Accuracy guide</p>
          <h2 className="text-lg font-semibold text-midnight">How accurate are StarMapCo star maps?</h2>
          <p className="max-w-2xl text-sm text-neutral-700 sm:text-base">{intro}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href={`/how-accurate-are-star-maps?source=${encodeURIComponent(source)}`}
            className="inline-flex items-center justify-center rounded-full border border-amber-200/70 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-800 transition hover:-translate-y-[1px] hover:border-amber-400 hover:bg-amber-100"
          >
            Read the full accuracy guide
          </Link>
          <Link
            href={`/editor?mode=quick&source=${encodeURIComponent(`${source}-editor`)}`}
            className="inline-flex items-center justify-center rounded-full border border-black/10 bg-white px-4 py-2 text-sm font-semibold text-midnight transition hover:-translate-y-[1px] hover:border-black/20 hover:bg-neutral-50"
          >
            Test your date + location
          </Link>
        </div>
      </div>
    </section>
  );
}
