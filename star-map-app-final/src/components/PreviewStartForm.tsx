"use client";

import { type FormEvent, useCallback } from "react";
import { track, trackFunnelStep } from "@/lib/analytics";
import IOSSafeDateInput from "@/components/IOSSafeDateInput";

type PreviewStartFormProps = {
  title?: string;
  description?: string;
  buttonLabel?: string;
  source?: string;
};

export default function PreviewStartForm({
  title = "Start a free preview",
  description = "Enter the date and location to open the editor with your sky ready to customize.",
  buttonLabel = "Preview your map",
  source,
}: PreviewStartFormProps) {
  const resolvedSource = source?.trim() || "preview-start-form";
  const handleSubmit = useCallback((event: FormEvent<HTMLFormElement>) => {
    const formData = new FormData(event.currentTarget);
    const hasDate = String(formData.get("date") ?? "").trim().length > 0;
    const hasLocation = String(formData.get("location") ?? "").trim().length > 0;

    track("preview_start_submit", {
      source: resolvedSource,
      hasDate,
      hasLocation,
    });
    trackFunnelStep("hero_plan_click", {
      source: resolvedSource,
      plan: "preview",
    });
  }, [resolvedSource]);

  return (
    <section className="content-visibility-auto mt-8 rounded-3xl border border-black/5 bg-amber-50/80 p-6 shadow-inner shadow-black/5">
      <h2 className="text-lg font-semibold text-midnight">{title}</h2>
      <p className="mt-2 text-sm text-neutral-800 sm:text-base">{description}</p>
      <form action="/editor" method="GET" className="mt-4" onSubmit={handleSubmit}>
        <input type="hidden" name="mode" value="quick" />
        {source ? <input type="hidden" name="source" value={source} /> : null}
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="min-w-0">
            <label className="sr-only" htmlFor="preview-date">
              Date
            </label>
            <IOSSafeDateInput
              id="preview-date"
              name="date"
              autoComplete="bday"
              placeholder="YYYY-MM-DD"
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
        <button
          type="submit"
          className="mt-4 w-full rounded-full bg-gradient-to-r from-amber-400 via-amber-500 to-amber-400 px-5 py-3 text-sm font-semibold text-midnight shadow-lg shadow-amber-200 transition hover:-translate-y-[1px] hover:shadow-xl focus:outline-none focus:ring-2 focus:ring-gold focus:ring-offset-2 focus:ring-offset-amber-50"
        >
          {buttonLabel}
        </button>
        <p className="mt-2 text-xs text-neutral-600">Free preview · No account required</p>
        <p className="mt-1 text-xs font-semibold text-amber-700">
          Physical checkout is available: unframed print, framed print, or print + HD file.
        </p>
      </form>
    </section>
  );
}
