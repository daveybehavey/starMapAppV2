import type { ReactNode } from "react";

type PolicyShellProps = {
  variant?: "cosmic" | "dark";
  eyebrow?: string;
  title: string;
  lastUpdatedLabel: string;
  maxWidthClass?: string;
  children: ReactNode;
};

export default function PolicyShell({
  variant = "cosmic",
  eyebrow,
  title,
  lastUpdatedLabel,
  maxWidthClass = "max-w-3xl",
  children,
}: PolicyShellProps) {
  const titleClass =
    variant === "dark"
      ? "mt-2 text-3xl font-bold text-midnight sm:text-4xl"
      : `text-3xl font-semibold text-midnight sm:text-4xl${eyebrow ? " mt-2" : ""}`;

  const eyebrowClass =
    variant === "dark"
      ? "text-sm font-semibold uppercase tracking-[0.25em] text-amber-700"
      : "text-xs font-semibold uppercase tracking-[0.25em] text-amber-700";

  const header = (
    <>
      {eyebrow ? <p className={eyebrowClass}>{eyebrow}</p> : null}
      <h1 className={titleClass}>{title}</h1>
      <p className="mt-2 text-sm text-neutral-700">{lastUpdatedLabel}</p>
    </>
  );

  if (variant === "dark") {
    return (
      <main className="bg-[#050915] px-4 py-12 text-white sm:py-16">
        <div
          className={`mx-auto ${maxWidthClass} rounded-3xl border border-amber-200/70 bg-[rgba(247,241,227,0.92)] p-6 text-midnight shadow-2xl sm:p-8`}
        >
          {header}
          {children}
        </div>
      </main>
    );
  }

  return (
    <main className={`mx-auto ${maxWidthClass} px-4 py-10 sm:py-14`}>
      <div className="cosmic-panel rounded-3xl border border-amber-200/70 bg-[rgba(247,241,227,0.9)] p-6 shadow-2xl sm:p-8">
        {header}
        {children}
      </div>
    </main>
  );
}
