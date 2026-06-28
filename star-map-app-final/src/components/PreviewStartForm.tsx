"use client";

import { type FormEvent, type ReactNode, useCallback, useState } from "react";
import { track, trackFunnelStep } from "@/lib/analytics";
import IOSSafeDateInput from "@/components/IOSSafeDateInput";
import { MOBILE_DATE_HELPER_TEXT, STANDARD_DATE_PLACEHOLDER } from "@/lib/dateInput";
import type { PrintVariant } from "@/lib/pricing";

type PreviewStartIntent = {
  label: string;
  sourceSuffix?: string;
  checkout?: "print" | "digital";
  printVariant?: PrintVariant;
  includeDigitalAddOn?: boolean;
  includeCardAddOn?: boolean;
  plan: string;
  tone?: "recommended" | "default" | "neutral";
  detail?: string;
};

type PreviewStartFormProps = {
  title?: string;
  description?: string;
  buttonLabel?: string;
  source?: string;
  intentOptions?: PreviewStartIntent[];
  /** When false, hides the iOS date-keyboard helper under the date field. */
  showMobileDateHelper?: boolean;
  /** Optional links or notes rendered inside the card below the form. */
  footerContent?: ReactNode;
};

function buildEditorAction(
  source: string,
  checkout?: "print" | "digital",
  printVariant?: PrintVariant,
  includeDigitalAddOn?: boolean,
  includeCardAddOn?: boolean,
): string {
  const params = new URLSearchParams({
    mode: "quick",
    source,
  });

  if (checkout) {
    params.set("checkout", checkout);
  }
  if (printVariant) {
    params.set("print_variant", printVariant);
  }
  if (includeDigitalAddOn) {
    params.set("include_digital_addon", "1");
  }
  if (includeCardAddOn) {
    params.set("include_card_addon", "1");
  }

  return `/editor?${params.toString()}`;
}

export default function PreviewStartForm({
  title = "Start a free preview",
  description = "Enter the date and location to open the editor with your sky ready to customize.",
  buttonLabel = "Preview your map",
  source,
  intentOptions,
  showMobileDateHelper = true,
  footerContent,
}: PreviewStartFormProps) {
  const resolvedSource = source?.trim() || "preview-start-form";
  const [validationMessage, setValidationMessage] = useState<string | null>(null);
  const handleSubmit = useCallback((event: FormEvent<HTMLFormElement>) => {
    const formData = new FormData(event.currentTarget);
    const hasDate = String(formData.get("date") ?? "").trim().length > 0;
    const hasLocation = String(formData.get("location") ?? "").trim().length > 0;

    if (!hasDate || !hasLocation) {
      event.preventDefault();
      setValidationMessage("Enter date and location first.");
      return;
    }

    setValidationMessage(null);
    const nativeSubmitEvent = event.nativeEvent as SubmitEvent | undefined;
    const submitter = nativeSubmitEvent?.submitter instanceof HTMLButtonElement ? nativeSubmitEvent.submitter : null;
    const selectedSource = submitter?.dataset.source?.trim() || resolvedSource;
    const selectedPlan = submitter?.dataset.plan?.trim() || "preview";
    const selectedCheckout = submitter?.dataset.checkout?.trim() || undefined;
    const selectedPrintVariant = submitter?.dataset.printVariant?.trim() || undefined;

    track("preview_start_submit", {
      source: selectedSource,
      plan: selectedPlan,
      hasDate,
      hasLocation,
      checkout: selectedCheckout,
      printVariant: selectedPrintVariant,
    });
    trackFunnelStep("hero_plan_click", {
      source: selectedSource,
      plan: selectedPlan,
    });
  }, [resolvedSource]);

  return (
    <section className="content-visibility-auto mt-8 rounded-3xl border border-black/5 bg-amber-50/80 p-6 shadow-inner shadow-black/5">
      <h2 className="text-lg font-semibold text-midnight">{title}</h2>
      <p className="mt-2 text-sm text-neutral-800 sm:text-base">{description}</p>
      <form action="/editor" method="GET" className="mt-4" onSubmit={handleSubmit}>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="min-w-0">
            <label className="sr-only" htmlFor="preview-date">
              Date
            </label>
            <IOSSafeDateInput
              id="preview-date"
              name="date"
              autoComplete="bday"
              placeholder={STANDARD_DATE_PLACEHOLDER}
              className="ios-form-control min-w-0 w-full rounded-xl border border-amber-200/80 bg-white px-3 py-3 text-sm text-neutral-800 placeholder:text-neutral-400 shadow-sm focus:border-amber-300 focus:outline-none focus:ring-2 focus:ring-amber-200"
            />
          </div>
          <div className="min-w-0">
            <label className="sr-only" htmlFor="preview-location">
              Location
            </label>
            <input
              id="preview-location"
              name="location"
              type="text"
              placeholder="City or address"
              autoComplete="address-level2"
              className="ios-form-control min-w-0 w-full rounded-xl border border-amber-200/80 bg-white px-3 py-3 text-sm text-neutral-800 placeholder:text-neutral-400 shadow-sm focus:border-amber-300 focus:outline-none focus:ring-2 focus:ring-amber-200"
            />
          </div>
        </div>
        {showMobileDateHelper ? (
          <p className="mt-2 text-xs text-neutral-600">{MOBILE_DATE_HELPER_TEXT}</p>
        ) : null}
        {validationMessage ? (
          <p className="mt-2 text-sm font-semibold text-amber-800" role="alert">
            {validationMessage}
          </p>
        ) : null}
        {intentOptions?.length ? (
          <div className="mt-4 space-y-3">
            <div className="grid gap-2 sm:grid-cols-2">
              {intentOptions.map((intent) => {
                const actionSource = intent.sourceSuffix
                  ? `${resolvedSource}-${intent.sourceSuffix}`
                  : resolvedSource;
                const toneClass =
                  intent.tone === "recommended"
                    ? "border-amber-300/70 bg-gradient-to-r from-amber-400 via-amber-500 to-amber-400 text-midnight shadow-lg shadow-amber-200"
                    : intent.tone === "neutral"
                      ? "border-black/10 bg-white text-midnight shadow-sm"
                      : "border-amber-300/70 bg-amber-300/15 text-midnight shadow-sm";

                return (
                  <button
                    key={`${intent.plan}-${intent.label}`}
                    type="submit"
                    formAction={buildEditorAction(
                      actionSource,
                      intent.checkout,
                      intent.printVariant,
                      intent.includeDigitalAddOn,
                      intent.includeCardAddOn,
                    )}
                    data-source={actionSource}
                    data-plan={intent.plan}
                    data-checkout={intent.checkout}
                    data-print-variant={intent.printVariant}
                    className={`rounded-2xl border px-4 py-3 text-left transition hover:-translate-y-[1px] hover:shadow-md focus:outline-none focus:ring-2 focus:ring-gold focus:ring-offset-2 focus:ring-offset-amber-50 ${toneClass}`}
                  >
                    <span className="block text-sm font-semibold">{intent.label}</span>
                    {intent.detail ? <span className="mt-1 block text-xs opacity-90">{intent.detail}</span> : null}
                  </button>
                );
              })}
            </div>
            <p className="text-xs text-neutral-600">
              These quick-start buttons keep your date and location, then open the editor with the matching checkout
              path already selected.
            </p>
          </div>
        ) : (
          <button
            type="submit"
            formAction={buildEditorAction(resolvedSource)}
            data-source={resolvedSource}
            data-plan="preview"
            className="mt-4 w-full rounded-full bg-gradient-to-r from-amber-400 via-amber-500 to-amber-400 px-5 py-3 text-sm font-semibold text-midnight shadow-lg shadow-amber-200 transition hover:-translate-y-[1px] hover:shadow-xl focus:outline-none focus:ring-2 focus:ring-gold focus:ring-offset-2 focus:ring-offset-amber-50"
          >
            {buttonLabel}
          </button>
        )}
        <p className="mt-2 text-xs text-neutral-600">Free preview · No account required</p>
        <p className="mt-1 text-xs font-semibold text-amber-700">
          Best wedding gift: framed print + HD digital — free standard shipping on $100+ orders. Shipping shown before
          payment.
        </p>
        {footerContent ? <div className="mt-5 border-t border-amber-200/60 pt-4">{footerContent}</div> : null}
      </form>
    </section>
  );
}
