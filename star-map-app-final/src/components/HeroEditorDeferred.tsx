"use client";

import { type FormEvent, useCallback } from "react";
import { track, trackFunnelStep } from "@/lib/analytics";
import IOSSafeDateInput from "@/components/IOSSafeDateInput";
import { MOBILE_DATE_HELPER_TEXT, STANDARD_DATE_PLACEHOLDER } from "@/lib/dateInput";

export default function HeroEditorDeferred() {
  const handleSubmit = useCallback((event: FormEvent<HTMLFormElement>) => {
    const formData = new FormData(event.currentTarget);
    const hasDate = String(formData.get("date") ?? "").trim().length > 0;
    const hasLocation = String(formData.get("location") ?? "").trim().length > 0;

    track("hero_preview_submit", {
      source: "home-hero",
      hasDate,
      hasLocation,
    });
    trackFunnelStep("hero_plan_click", {
      source: "home-hero",
      plan: "preview",
    });
  }, []);

  return (
    <div className="mx-auto w-full max-w-2xl">
      <form
        id="preview"
        action="/editor"
        method="GET"
        onSubmit={handleSubmit}
        className="glass-panel min-w-0 rounded-2xl px-5 py-6 sm:px-6 sm:py-7"
      >
        <input type="hidden" name="mode" value="quick" />
        <input type="hidden" name="source" value="home-hero" />
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-100/80">
            Create your map
          </p>
          <span className="text-xs text-white/60">Opens a simple editor first</span>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="min-w-0">
            <label className="sr-only" htmlFor="hero-date">
              When was it?
            </label>
            <IOSSafeDateInput
              id="hero-date"
              name="date"
              autoComplete="bday"
              placeholder={STANDARD_DATE_PLACEHOLDER}
              className="input-glow ios-form-control min-w-0 w-full rounded-lg border border-white/30 bg-white/10 px-3 py-3 text-base text-white placeholder:text-white/40"
            />
          </div>
          <div className="min-w-0">
            <label className="sr-only" htmlFor="hero-location">
              Where was it?
            </label>
            <input
              id="hero-location"
              name="location"
              type="text"
              placeholder="City or address"
              autoComplete="address-level2"
              className="input-glow ios-form-control min-w-0 w-full rounded-lg border border-white/30 bg-white/10 px-3 py-3 text-base text-white placeholder:text-white/40"
            />
          </div>
        </div>
        <p className="mt-2 text-xs text-white/60">{MOBILE_DATE_HELPER_TEXT}</p>
        <button
          type="submit"
          className="mt-5 w-full rounded-full bg-amber-400 px-4 py-3 text-sm font-semibold text-midnight shadow-sm transition hover:-translate-y-[1px] hover:shadow-md focus:outline-none focus:ring-2 focus:ring-amber-300"
        >
          Preview your map
        </button>
        <p className="mt-3 text-xs text-white/75">
          Free preview first. Choose framed print, unframed print, or HD delivery after the design feels right.
        </p>
      </form>
    </div>
  );
}
