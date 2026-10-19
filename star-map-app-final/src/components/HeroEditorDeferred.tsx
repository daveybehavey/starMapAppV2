"use client";

import { type FormEvent, useCallback, useState } from "react";
import { track, trackFunnelStep } from "@/lib/analytics";
import IOSSafeDateInput from "@/components/IOSSafeDateInput";
import LocationTypeahead from "@/components/LocationTypeahead";
import { MOBILE_DATE_HELPER_TEXT, STANDARD_DATE_PLACEHOLDER } from "@/lib/dateInput";
import { resolvePreviewLocationFields, type PickedPreviewLocation } from "@/lib/previewStartLocation";

export default function HeroEditorDeferred() {
  const [locationText, setLocationText] = useState("");
  const [pickedLocation, setPickedLocation] = useState<PickedPreviewLocation | null>(null);

  // Same editor-entry payload contract as PreviewStartForm: a picked
  // suggestion submits coordinate-resolved; free text stays name-only,
  // exactly as this form always submitted.
  const locationFields = resolvePreviewLocationFields({
    locationText,
    picked: pickedLocation,
    defaultCoords: null,
    initialLocation: "",
  });
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
              placeholder={STANDARD_DATE_PLACEHOLDER}
              className="input-glow ios-form-control min-w-0 w-full rounded-lg border border-white/30 bg-white/10 px-3 py-3 text-base text-white placeholder:text-white/40"
            />
          </div>
          <div className="min-w-0">
            <label className="sr-only" htmlFor="hero-location">
              Where was it?
            </label>
            <LocationTypeahead
              id="hero-location"
              name="location"
              value={locationText}
              onValueChange={setLocationText}
              onPick={setPickedLocation}
              placeholder="City or address"
              autoComplete="address-level2"
              selectedName={
                pickedLocation && locationText === pickedLocation.name ? pickedLocation.name : undefined
              }
              className="input-glow ios-form-control w-full min-w-0 rounded-lg border border-white/30 bg-white/10 px-3 py-3 text-base text-white placeholder:text-white/40"
            />
          </div>
        </div>
        {locationFields.lat !== undefined ? (
          <>
            <input type="hidden" name="lat" value={locationFields.lat} />
            <input type="hidden" name="lon" value={locationFields.lon} />
            <input type="hidden" name="tz" value={locationFields.tz} />
          </>
        ) : null}
        <p className="mt-2 text-xs text-white/60">{MOBILE_DATE_HELPER_TEXT}</p>
        <button
          type="submit"
          className="text-midnight mt-5 w-full rounded-full bg-amber-400 px-4 py-3 text-sm font-semibold shadow-sm transition hover:-translate-y-[1px] hover:shadow-md focus:ring-2 focus:ring-amber-300 focus:outline-none"
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
