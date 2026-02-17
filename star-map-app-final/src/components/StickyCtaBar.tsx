type StickyCtaBarProps = {
  source?: string;
  title?: string;
  description?: string;
  buttonLabel?: string;
  className?: string;
};

export default function StickyCtaBar({
  source,
  title = "Ready for a free preview?",
  description = "Create your star map in minutes — no account required.",
  buttonLabel = "Start free preview",
  className = "",
}: StickyCtaBarProps) {
  const baseHref = "/editor?mode=quick";
  const href = source ? `${baseHref}&source=${encodeURIComponent(source)}` : baseHref;

  return (
    <div className={`sticky top-3 z-20 mt-6 ${className}`}>
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-200/70 bg-[rgba(247,241,227,0.96)] px-4 py-3 text-midnight shadow-lg shadow-black/10 backdrop-blur">
        <div>
          <p className="text-sm font-semibold">{title}</p>
          <p className="text-xs text-neutral-600">{description}</p>
        </div>
        <a
          href={href}
          className="inline-flex items-center justify-center rounded-full bg-gradient-to-r from-amber-400 via-amber-500 to-amber-400 px-4 py-2 text-sm font-semibold text-midnight shadow-md transition hover:-translate-y-[1px] hover:shadow-lg"
        >
          {buttonLabel}
        </a>
      </div>
    </div>
  );
}
