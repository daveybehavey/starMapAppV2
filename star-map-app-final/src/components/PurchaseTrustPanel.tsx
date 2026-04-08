import Link from "next/link";

type PurchaseTrustPanelProps = {
  heading: string;
  intro: string;
  leftTitle: string;
  leftPoints: string[];
  rightTitle: string;
  rightPoints: string[];
  tone?: "light" | "dark";
  highlights?: string[];
  guideLabel?: string;
  shippingLabel?: string;
  returnsLabel?: string;
  contactLabel?: string;
};

export default function PurchaseTrustPanel({
  heading,
  intro,
  leftTitle,
  leftPoints,
  rightTitle,
  rightPoints,
  tone = "light",
  highlights = ["Preview stays free", "Pay once when ready", "Support if you get stuck"],
  guideLabel = "Print and frame guide",
  shippingLabel = "Shipping policy",
  returnsLabel = "Returns and refunds",
  contactLabel = "Contact support",
}: PurchaseTrustPanelProps) {
  const isDark = tone === "dark";

  return (
    <section
      className={
        isDark
          ? "brand-dark-card content-visibility-auto mt-6 space-y-4 rounded-3xl p-6 text-white/90"
          : "content-visibility-auto mt-6 space-y-4 rounded-3xl border border-black/5 bg-white/90 p-6 shadow-xl shadow-black/10"
      }
    >
      <h2 className={`text-lg font-semibold ${isDark ? "text-white" : "text-midnight"}`}>{heading}</h2>
      <p className={`text-sm sm:text-base ${isDark ? "text-neutral-200" : "text-neutral-800"}`}>{intro}</p>
      <div className="flex flex-wrap gap-2 text-[11px] font-semibold">
        {highlights.map((item) => (
          <span
            key={item}
            className={
              isDark
                ? "inline-flex items-center rounded-full border border-white/12 bg-white/[0.06] px-3 py-1.5 text-amber-100"
                : "inline-flex items-center rounded-full border border-amber-200/80 bg-white/80 px-3 py-1.5 text-amber-900"
            }
          >
            {item}
          </span>
        ))}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div
          className={
            isDark
              ? "rounded-2xl border border-white/10 bg-white/[0.06] p-4"
              : "rounded-2xl border border-amber-200/70 bg-amber-50/80 p-4"
          }
        >
          <h3 className={`text-sm font-semibold sm:text-base ${isDark ? "text-amber-100" : "text-midnight"}`}>{leftTitle}</h3>
          <ul className={`mt-2 list-disc space-y-1.5 pl-5 text-sm ${isDark ? "text-neutral-200" : "text-neutral-800"}`}>
            {leftPoints.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
        <div
          className={
            isDark
              ? "brand-dark-card-accent rounded-2xl p-4"
              : "rounded-2xl border border-amber-200/70 bg-amber-50/80 p-4"
          }
        >
          <h3 className={`text-sm font-semibold sm:text-base ${isDark ? "text-amber-100" : "text-midnight"}`}>{rightTitle}</h3>
          <ul className={`mt-2 list-disc space-y-1.5 pl-5 text-sm ${isDark ? "text-neutral-200" : "text-neutral-800"}`}>
            {rightPoints.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      </div>
      <div className="flex flex-wrap gap-3 text-sm">
        <Link
          href="/how-to-print-star-map"
          className={
            isDark
              ? "inline-flex rounded-full border border-white/12 bg-white/[0.06] px-3 py-1.5 text-amber-100 transition hover:border-amber-300/50 hover:bg-white/[0.1]"
              : "text-amber-700 underline hover:text-amber-800"
          }
        >
          {guideLabel}
        </Link>
        <Link
          href="/shipping"
          className={
            isDark
              ? "inline-flex rounded-full border border-white/12 bg-white/[0.06] px-3 py-1.5 text-amber-100 transition hover:border-amber-300/50 hover:bg-white/[0.1]"
              : "text-amber-700 underline hover:text-amber-800"
          }
        >
          {shippingLabel}
        </Link>
        <Link
          href="/returns"
          className={
            isDark
              ? "inline-flex rounded-full border border-white/12 bg-white/[0.06] px-3 py-1.5 text-amber-100 transition hover:border-amber-300/50 hover:bg-white/[0.1]"
              : "text-amber-700 underline hover:text-amber-800"
          }
        >
          {returnsLabel}
        </Link>
        <Link
          href="/contact"
          className={
            isDark
              ? "inline-flex rounded-full border border-white/12 bg-white/[0.06] px-3 py-1.5 text-amber-100 transition hover:border-amber-300/50 hover:bg-white/[0.1]"
              : "text-amber-700 underline hover:text-amber-800"
          }
        >
          {contactLabel}
        </Link>
      </div>
    </section>
  );
}
