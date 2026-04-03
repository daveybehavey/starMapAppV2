type QuickStartStepsSectionProps = {
  heading: string;
  intro: string;
  steps: string[];
  note?: string;
};

export default function QuickStartStepsSection({
  heading,
  intro,
  steps,
  note,
}: QuickStartStepsSectionProps) {
  return (
    <section className="content-visibility-auto mt-6 space-y-4 rounded-3xl border border-black/5 bg-amber-50/80 p-6 shadow-inner shadow-black/5">
      <div className="space-y-2">
        <h2 className="text-lg font-semibold text-midnight">{heading}</h2>
        <p className="text-sm text-neutral-800 sm:text-base">{intro}</p>
      </div>
      <ol className="grid gap-3 sm:grid-cols-3">
        {steps.map((step, index) => (
          <li
            key={`${index + 1}-${step}`}
            className="rounded-2xl border border-amber-200/70 bg-white/80 p-4 text-sm text-neutral-800 shadow-sm"
          >
            <span className="mb-2 inline-flex h-7 w-7 items-center justify-center rounded-full border border-amber-300/70 bg-amber-200/65 text-xs font-semibold text-midnight">
              {index + 1}
            </span>
            <p>{step}</p>
          </li>
        ))}
      </ol>
      {note ? <p className="text-sm text-neutral-800 sm:text-base">{note}</p> : null}
    </section>
  );
}
