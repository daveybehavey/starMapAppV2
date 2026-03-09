"use client";

import { type FormEvent, useCallback } from "react";
import { track, trackFunnelStep } from "@/lib/analytics";
import IOSSafeDateInput from "@/components/IOSSafeDateInput";

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

  const handleFramedPathClick = useCallback(() => {
    track("print_options_clicked", {
      source: "home-hero",
      placement: "hero-form-footer",
      intent: "framed",
    });
    trackFunnelStep("hero_plan_click", {
      source: "home-hero",
      plan: "delivery_print_framed",
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
              placeholder="YYYY-MM-DD"
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
        <button
          type="submit"
          className="mt-5 w-full rounded-full bg-amber-400 px-4 py-3 text-sm font-semibold text-midnight shadow-sm transition hover:-translate-y-[1px] hover:shadow-md focus:outline-none focus:ring-2 focus:ring-amber-300"
        >
          Preview your map
        </button>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-white/75">
          <span>Want a physical gift?</span>
          <a
            href="/editor?mode=quick&source=home-hero-framed&checkout=print&print_variant=poster_framed"
            onClick={handleFramedPathClick}
            className="rounded-full border border-amber-300/60 bg-amber-300/20 px-3 py-1 font-semibold text-amber-100 transition hover:-translate-y-[1px] hover:bg-amber-300/30"
          >
            Preview framed print
          </a>
        </div>
      </form>
    </div>
  );
}
