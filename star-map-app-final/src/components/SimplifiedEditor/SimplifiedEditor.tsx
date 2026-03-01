"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { useStore } from "@/lib/store";
import { useShallow } from "zustand/react/shallow";
import {
  buildRecipeFromState,
  renderStarMap,
  aspectRatioToNumber,
  formatDateTimeForLocation,
  type MapRecipe,
} from "@/lib/renderSky";
import { getShapeData } from "@/lib/shapeUtils";
import type { StyleId } from "@/lib/store";
import type { Shape } from "@/lib/types";
import { applyStyleDefaults } from "@/lib/styleDefaults";
import dynamic from "next/dynamic";
import { LocationInput } from "./LocationInput";
import { AdvancedOptionsPanel } from "./AdvancedOptionsPanel";
import IOSSafeDateInput from "@/components/IOSSafeDateInput";

// Lazy load the canvas for better initial load
const PreviewCanvas = dynamic(() => import("@/components/PreviewCanvas"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center bg-[#070b1b]">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-amber-200/30 border-t-amber-400" />
    </div>
  ),
});

// Sample recipe for instant preview on load
const SAMPLE_RECIPE: MapRecipe = {
  version: 1,
  seed: "sample-wedding",
  datetimeISO: "2024-06-15T21:30:00.000Z",
  location: {
    name: "New York City",
    latitude: 40.7128,
    longitude: -74.006,
    timezone: "America/New_York",
  },
  textBoxes: [
    {
      id: "title",
      label: "Title",
      text: "Our Night Sky",
      fontFamily: "playfair",
      color: "#d7b56c",
      size: 32,
      align: "center",
      position: { x: 0.5, y: 0.12 },
    },
    {
      id: "subtitle",
      label: "Subtitle",
      text: "June 15, 2024 • New York City",
      fontFamily: "cormorant",
      color: "#d7b56c",
      size: 14,
      align: "center",
      position: { x: 0.5, y: 0.88 },
    },
  ],
  selectedStyle: "navyGold",
  shape: "rectangle",
  aspectRatio: "square",
  renderOptions: {
    visualMode: "enhanced",
    starIntensity: "normal",
    starGlow: true,
    constellationLines: "thin",
    constellationLabels: false,
    showGrid: false,
    showPlanets: true,
    premiumStars: "off",
    premiumPlanets: "off",
    planetEmphasis: "normal",
    showMoon: true,
    moonSize: "normal",
    shapeMask: "circle",
    frameEnabled: true,
  },
};

type EditorMode = "sample" | "customizing";

const DRAFT_STORAGE_KEY = "starmap-simplified-draft";
const SHARED_DRAFT_STORAGE_KEY = "star-map-draft";
const CHECKOUT_MAP_KEY = "star-map-checkout-id";
const DEFAULT_EXACT_TIME = "00:00:00";

export function SimplifiedEditor() {
  const [mode, setMode] = useState<EditorMode>("sample");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showExactTime, setShowExactTime] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [hdExporting, setHdExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [titleTouched, setTitleTouched] = useState(false);
  const [dateTouched, setDateTouched] = useState(false);
  const [dateError, setDateError] = useState<string | null>(null);
  const formRef = useRef<HTMLDivElement>(null);
  const hdExportInFlightRef = useRef(false);
  const makeItYoursTimerRef = useRef<number | null>(null);
  const draftSaveTimerRef = useRef<number | null>(null);
  const draftLoadedRef = useRef(false);

  // Generate unique IDs for form elements (accessibility)
  const formId = useId();

  const {
    dateTime,
    location,
    textBoxes,
    selectedStyle,
    shape,
    aspectRatio,
    renderOptions,
    paid,
    setDateTime,
    setLocation,
    setStyle,
    setAspectRatio,
    setShape,
    setTextBoxes,
    setRenderOptions,
    setRevealed,
    revealed,
  } = useStore(
    useShallow((state) => ({
      dateTime: state.dateTime,
      location: state.location,
      textBoxes: state.textBoxes,
      selectedStyle: state.selectedStyle,
      shape: state.shape,
      aspectRatio: state.aspectRatio,
      renderOptions: state.renderOptions,
      paid: state.paid,
      setDateTime: state.setDateTime,
      setLocation: state.setLocation,
      setStyle: state.setStyle,
      setAspectRatio: state.setAspectRatio,
      setShape: state.setShape,
      setTextBoxes: state.setTextBoxes,
      setRenderOptions: state.setRenderOptions,
      setRevealed: state.setRevealed,
      revealed: state.revealed,
    }))
  );

  // Get title and subtitle from textBoxes
  const { title, subtitle, showSubtitle } = useMemo(() => {
    const titleBox = textBoxes.find((tb) => tb.id === "title");
    const subtitleBox = textBoxes.find((tb) => tb.id === "subtitle");
    return {
      title: titleBox?.text || "",
      subtitle: subtitleBox?.text || "",
      showSubtitle: Boolean(subtitleBox),
    };
  }, [textBoxes]);

  useEffect(() => {
    if (draftLoadedRef.current) return;
    draftLoadedRef.current = true;
    try {
      const raw = localStorage.getItem(DRAFT_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as {
        dateTime?: string;
        location?: { name?: string; latitude?: number; longitude?: number; timezone?: string };
        textBoxes?: typeof textBoxes;
        selectedStyle?: StyleId;
        aspectRatio?: typeof aspectRatio;
        shape?: Shape;
        renderOptions?: typeof renderOptions;
      };
      if (typeof parsed.dateTime === "string") {
        setDateTime(parsed.dateTime);
      }
      if (parsed.location && typeof parsed.location.name === "string") {
        setLocation({
          name: parsed.location.name,
          latitude: typeof parsed.location.latitude === "number" ? parsed.location.latitude : 0,
          longitude: typeof parsed.location.longitude === "number" ? parsed.location.longitude : 0,
          timezone: typeof parsed.location.timezone === "string" ? parsed.location.timezone : "UTC",
        });
      }
      if (Array.isArray(parsed.textBoxes)) {
        setTextBoxes(parsed.textBoxes);
      }
      if (parsed.selectedStyle) {
        setStyle(parsed.selectedStyle);
      }
      if (parsed.aspectRatio) {
        setAspectRatio(parsed.aspectRatio);
      }
      if (parsed.shape) {
        setShape(parsed.shape);
      }
      if (parsed.renderOptions) {
        setRenderOptions(parsed.renderOptions);
      }
      setMode("customizing");
    } catch {
      // ignore draft parse errors
    }
  }, [aspectRatio, renderOptions, setAspectRatio, setDateTime, setLocation, setRenderOptions, setShape, setStyle, setTextBoxes]);

  const maxDateValue = new Date().toISOString().split("T")[0];

  useEffect(() => {
    if (!draftLoadedRef.current) return;
    if (mode === "sample" && !location.name) return;
    if (draftSaveTimerRef.current) {
      window.clearTimeout(draftSaveTimerRef.current);
    }
    draftSaveTimerRef.current = window.setTimeout(() => {
      try {
        const sharedDraft = buildRecipeFromState({
          dateTime,
          location,
          textBoxes,
          selectedStyle,
          aspectRatio,
          shape,
          renderOptions,
        });
        localStorage.setItem(
          DRAFT_STORAGE_KEY,
          JSON.stringify({
            dateTime,
            location,
            textBoxes,
            selectedStyle,
            aspectRatio,
            shape,
            renderOptions,
          })
        );
        localStorage.setItem(SHARED_DRAFT_STORAGE_KEY, JSON.stringify(sharedDraft));
      } catch {
        // ignore storage errors
      }
    }, 300);
    return () => {
      if (draftSaveTimerRef.current) {
        window.clearTimeout(draftSaveTimerRef.current);
      }
    };
  }, [aspectRatio, dateTime, location, mode, renderOptions, selectedStyle, shape, textBoxes]);

  const handleMakeItYours = useCallback(() => {
    setMode("customizing");
    // Scroll to form
    if (makeItYoursTimerRef.current) {
      window.clearTimeout(makeItYoursTimerRef.current);
    }
    makeItYoursTimerRef.current = window.setTimeout(() => {
      formRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 100);
  }, []);
  useEffect(() => {
    return () => {
      if (makeItYoursTimerRef.current) {
        window.clearTimeout(makeItYoursTimerRef.current);
      }
    };
  }, []);

  const handleDateChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const nextValue = e.target.value.trim();
      if (!nextValue) {
        setDateError("Please choose a valid date.");
        return;
      }
      if (!isValidIsoDateInput(nextValue)) {
        setDateError("Use a real date in YYYY-MM-DD format.");
        return;
      }
      if (nextValue > maxDateValue) {
        setDateError("Please choose a past date.");
        return;
      }
      setDateError(null);
      const currentTime = getDateTimeInputValues(dateTime, location.timezone).exactTimeValue;
      const iso = combineDateTime(nextValue, currentTime, location.timezone);
      if (iso) {
        setDateTime(iso);
      }
    },
    [dateTime, location.timezone, maxDateValue, setDateTime]
  );

  const handleExactTimeChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const nextTimeValue = e.target.value;
      const targetDateValue = getDateTimeInputValues(dateTime, location.timezone).dateInputValue || toISODate(new Date());
      const iso = combineDateTime(
        targetDateValue,
        nextTimeValue ? `${nextTimeValue}:00` : DEFAULT_EXACT_TIME,
        location.timezone
      );
      if (iso) {
        setDateTime(iso);
      }
    },
    [dateTime, location.timezone, setDateTime]
  );

  const handleTitleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const newTitle = e.target.value;
      if (!titleTouched) {
        setTitleTouched(true);
      }
      const updatedBoxes = textBoxes.map((tb) =>
        tb.id === "title" ? { ...tb, text: newTitle } : tb
      );
      setTextBoxes(updatedBoxes);
    },
    [textBoxes, setTextBoxes, titleTouched]
  );

  const handleStyleChange = useCallback(
    (style: StyleId) => {
      setStyle(style);
      const defaults = applyStyleDefaults(style, textBoxes);
      if (Object.keys(defaults.renderOptions).length) {
        setRenderOptions(defaults.renderOptions);
      }
      if (defaults.textBoxes !== textBoxes) {
        setTextBoxes(defaults.textBoxes);
      }
    },
    [setRenderOptions, setStyle, setTextBoxes, textBoxes]
  );

  const handleShapeChange = useCallback(
    (newShape: Shape) => {
      setShape(newShape);
    },
    [setShape]
  );

  const handleSubtitleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const newSubtitle = e.target.value;
      const updatedBoxes = textBoxes.map((tb) =>
        tb.id === "subtitle" ? { ...tb, text: newSubtitle } : tb
      );
      setTextBoxes(updatedBoxes);
    },
    [textBoxes, setTextBoxes]
  );

  const toggleSubtitle = useCallback(() => {
    if (showSubtitle) {
      // Remove subtitle
      setTextBoxes(textBoxes.filter((tb) => tb.id !== "subtitle"));
    } else {
      // Add subtitle
      setTextBoxes([
        ...textBoxes,
        {
          id: "subtitle",
          label: "Subtitle",
          text: "",
          fontFamily: "cormorant",
          color: "#d7b56c",
          size: 14,
          align: "center",
          position: { x: 0.5, y: 0.88 },
        },
      ]);
    }
  }, [showSubtitle, textBoxes, setTextBoxes]);

  // Export image function - renders star map and triggers download
  const exportImage = useCallback(
    async (mode: "preview" | "hd", premiumOverride?: boolean) => {
      // Ensure all fonts are loaded before export
      if (typeof document !== "undefined" && document.fonts) {
        await document.fonts.ready;
      }

      const recipe = buildRecipeFromState({
        dateTime,
        location,
        textBoxes,
        selectedStyle,
        aspectRatio,
        shape,
        renderOptions,
      });
      const width = mode === "hd" ? 6000 : 1200;
      const shapeData = await getShapeData(recipe.shape).catch(() => null);
      let ratio: number;
      if (shapeData) {
        if (shapeData.viewBox.height === 0) {
          console.warn("Invalid shape viewBox height");
          ratio = aspectRatioToNumber(recipe.aspectRatio);
        } else {
          ratio = shapeData.viewBox.width / shapeData.viewBox.height;
        }
      } else {
        ratio = aspectRatioToNumber(recipe.aspectRatio);
      }
      const height = Math.max(1, Math.round(width / ratio));
      const canvas = document.createElement("canvas");
      const watermark = mode !== "hd";
      const premium = premiumOverride ?? paid;

      let timeoutId: number | null = null;
      try {
        const timeoutPromise = new Promise<void>((_, reject) => {
          timeoutId = window.setTimeout(() => reject(new Error("Export timed out")), 30000);
        });
        await Promise.race([
          renderStarMap({
            recipe,
            canvas,
            width,
            height,
            watermark,
            quality: mode === "hd" ? "export" : "preview",
            premium,
          }),
          timeoutPromise,
        ]);
      } finally {
        if (timeoutId) {
          window.clearTimeout(timeoutId);
        }
      }

      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((result) => {
          if (result) {
            resolve(result);
          } else {
            reject(new Error("Failed to generate image"));
          }
        }, "image/png");
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.download = mode === "hd" ? "star-map-hd.png" : "star-map-preview.png";
      link.href = url;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    },
    [aspectRatio, dateTime, location, paid, renderOptions, selectedStyle, shape, textBoxes]
  );

  // Handle free preview download
  const handleFreePreview = useCallback(async () => {
    if (exporting) return;
    setExporting(true);
    setExportError(null);
    try {
      await exportImage("preview");
    } catch (err) {
      console.error("Preview export error:", err);
      setExportError("Failed to generate preview. Please try again.");
    } finally {
      setExporting(false);
    }
  }, [exporting, exportImage]);

  // Handle HD download - redirects to checkout if not paid
  const handleHdDownload = useCallback(async () => {
    if (hdExportInFlightRef.current) return;
    setExportError(null);

    if (paid) {
      // User has paid - do direct HD export
      hdExportInFlightRef.current = true;
      setHdExporting(true);
      try {
        await exportImage("hd", true);
      } catch (err) {
        console.error("HD export error:", err);
        setExportError("Failed to generate HD download. Please try again.");
      } finally {
        hdExportInFlightRef.current = false;
        setHdExporting(false);
      }
      return;
    }

    // User hasn't paid - save recipe and redirect to checkout
    hdExportInFlightRef.current = true;
    setHdExporting(true);
    try {
      // Save the recipe first
      const recipe = buildRecipeFromState({
        dateTime,
        location,
        textBoxes,
        selectedStyle,
        aspectRatio,
        shape,
        renderOptions,
      });

      let mapId: string | null = null;
      try {
        const mapRes = await fetch("/api/maps", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(recipe),
        });
        if (mapRes.ok) {
          const data = (await mapRes.json()) as { id?: string };
          if (typeof data.id === "string" && data.id.trim()) {
            mapId = data.id.trim();
            try {
              localStorage.setItem(CHECKOUT_MAP_KEY, mapId);
            } catch {
              // ignore storage errors
            }
          }
        }
      } catch {
        // Map persistence is best-effort
      }

      // Create checkout session
      const checkoutPayload: { mapId?: string; plan: string } = { plan: "single" };
      if (mapId) checkoutPayload.mapId = mapId;

      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), 30000);
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(checkoutPayload),
        signal: controller.signal,
      });
      window.clearTimeout(timeout);

      if (!res.ok) {
        throw new Error("Checkout failed");
      }

      const data = (await res.json()) as { url?: string };
      if (data.url) {
        try {
          const nextUrl = new URL(data.url);
          if (nextUrl.protocol.startsWith("http")) {
            window.location.href = nextUrl.toString();
            return;
          }
        } catch {
          // fall through to error
        }
      }
      throw new Error("No checkout URL");
    } catch (err) {
      console.error("Checkout error:", err);
      setExportError("Unable to start checkout. Please try again.");
      // Reset state on error
      hdExportInFlightRef.current = false;
      setHdExporting(false);
    }
  }, [aspectRatio, dateTime, exportImage, location, paid, renderOptions, selectedStyle, shape, textBoxes]);

  // Check if we have enough data to show custom preview
  // User has entered a location if name is set and coordinates aren't default
  const hasValidLocation = Boolean(location.name && location.latitude !== 0);
  const locationIsValid = hasValidLocation && location.name.trim().length >= 3;
  // For simplified editor, only switch to store-based preview when user enters location
  const canShowCustomPreview = hasValidLocation;

  // Auto-reveal when user has entered location
  useEffect(() => {
    if (hasValidLocation && !revealed) {
      setRevealed(true);
    }
  }, [hasValidLocation, revealed, setRevealed]);

  const styles: { id: StyleId; name: string; swatchClass: string }[] = [
    { id: "navyGold", name: "Navy & Gold", swatchClass: "bg-[#070b1b] border-[#d4af37]" },
    { id: "vintageEngraving", name: "Vintage", swatchClass: "bg-[#564531] border-[#c7a56d]" },
    { id: "parchmentScroll", name: "Parchment", swatchClass: "bg-[#e8d48b] border-[#111111]" },
    { id: "midnightMinimal", name: "Minimal", swatchClass: "bg-[#050505] border-white" },
  ];

  const shapes: { id: Shape; name: string; icon: string }[] = [
    { id: "rectangle", name: "Square", icon: "□" },
    { id: "circle", name: "Circle", icon: "○" },
    { id: "heart", name: "Heart", icon: "♥" },
    { id: "star", name: "Star", icon: "★" },
  ];

  const { dateInputValue, exactTimeValue } = useMemo(
    () => getDateTimeInputValues(dateTime, location.timezone),
    [dateTime, location.timezone]
  );
  const exactTimeInputValue = exactTimeValue === DEFAULT_EXACT_TIME ? "" : exactTimeValue.slice(0, 5);
  const hasCustomExactTime = exactTimeValue !== DEFAULT_EXACT_TIME;
  const exactTimeDisplayLabel = formatTimeLabel(exactTimeValue);
  const exactTimeToggleLabel = showExactTime
    ? "Hide exact time"
    : hasCustomExactTime
      ? `Edit exact time (${exactTimeDisplayLabel})`
      : "+ Add exact time (optional)";
  const titleTrimmed = title.trim();
  const titleIsValid = titleTrimmed.length > 0 && titleTrimmed.length <= 100;
  const dateIsValid = !dateError && (!dateInputValue || dateInputValue <= maxDateValue);
  const canExport = mode !== "sample" && locationIsValid && titleIsValid && dateIsValid;
  const showTitleError = mode === "customizing" && titleTouched && !titleIsValid;
  const showDateError = mode === "customizing" && dateTouched && Boolean(dateError);

  // Dynamic recipe that applies user's style/shape/renderOptions choices to the sample preview
  const dynamicRecipe: MapRecipe = useMemo(() => {
    const effectiveTextBoxes = textBoxes.length > 0 ? textBoxes : SAMPLE_RECIPE.textBoxes;
    return {
      ...SAMPLE_RECIPE,
      selectedStyle,
      shape,
      textBoxes: effectiveTextBoxes,
      renderOptions,
    };
  }, [selectedStyle, shape, textBoxes, renderOptions]);

  return (
    <div
      className="flex flex-col gap-7 md:flex-row md:gap-6 lg:gap-8"
      role="region"
      aria-label="Star map editor"
    >
      {/* Preview Section */}
      <div className="relative flex-1">
        <div
          className="relative animate-float will-change-transform transform-gpu aspect-square w-full overflow-hidden rounded-2xl border border-white/15 bg-[#070b1b] shadow-[0_10px_24px_rgba(0,0,0,0.2)]"
          role="img"
          aria-label={canShowCustomPreview ? "Your custom star map preview" : "Sample star map preview"}
        >
          {!canShowCustomPreview ? (
            <PreviewCanvas key={`${selectedStyle}-${shape}`} readOnly={mode === "sample"} externalRecipe={dynamicRecipe} />
          ) : (
            <PreviewCanvas />
          )}
        </div>

        {/* Make it yours overlay - only show in sample mode */}
        {mode === "sample" && (
          <div className="absolute inset-0 flex items-end justify-center pb-10">
            {/* Gradient fade at bottom */}
            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-32 rounded-b-2xl bg-gradient-to-t from-black/45 via-black/15 to-transparent" />
            <button
              type="button"
              onClick={handleMakeItYours}
              className="animate-pulse-subtle relative z-10 rounded-full bg-gradient-to-r from-amber-400 via-amber-300 to-amber-400 px-8 py-4 text-base font-bold text-[#0b1433] shadow-[0_0_30px_rgba(251,191,36,0.5)] transition-all hover:-translate-y-1 hover:scale-105 hover:shadow-[0_0_40px_rgba(251,191,36,0.7)] max-[374px]:px-6 max-[374px]:py-3.5 max-[374px]:text-sm focus:outline-none focus:ring-2 focus:ring-amber-300 focus:ring-offset-2 focus:ring-offset-[#070b1b]"
              aria-label="Start customizing your star map"
            >
              ✨ Make it yours
            </button>
          </div>
        )}
      </div>

      {/* Form Section */}
      <div
        ref={formRef}
        className={`min-w-0 flex flex-col gap-5 lg:w-[380px] xl:w-[420px] ${
          mode === "sample" ? "opacity-60" : "opacity-100"
        } transition-opacity duration-300`}
        aria-disabled={mode === "sample"}
      >
        <form
          className="glass-panel min-w-0 rounded-2xl p-5 sm:p-6"
          onSubmit={(e) => e.preventDefault()}
          aria-label="Star map customization form"
        >
          <h3 className="mb-5 text-xl font-semibold text-white max-[374px]:text-lg" id={`${formId}-heading`}>
            {mode === "sample" ? "Customize your moment" : "Your moment"}
          </h3>

          {/* Date Input */}
          <div className="mb-4 min-w-0">
            <label
              htmlFor={`${formId}-date`}
              className="mb-1.5 block text-sm font-medium text-amber-100/80"
            >
              When was it?
            </label>
            <IOSSafeDateInput
              id={`${formId}-date`}
              value={dateInputValue}
              onChange={handleDateChange}
              onBlur={() => setDateTouched(true)}
              max={maxDateValue}
              placeholder="YYYY-MM-DD"
              disabled={mode === "sample"}
              aria-invalid={showDateError}
              aria-describedby={`${formId}-date-hint${showDateError ? ` ${formId}-date-error` : ""}`}
              className="input-glow ios-form-control min-w-0 w-full rounded-lg border border-white/30 bg-white/10 px-3 py-3 text-base text-white placeholder:text-white/40 transition-all focus:border-amber-400/50 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
            />
            <span id={`${formId}-date-hint`} className="sr-only">
              Select the date of your special moment
            </span>
            {showDateError && (
              <p id={`${formId}-date-error`} className="mt-1 text-[10px] text-red-300">
                {dateError ?? "Please choose a valid date."}
              </p>
            )}
            {mode === "customizing" && (
              <div className="mt-2">
                <button
                  type="button"
                  onClick={() => setShowExactTime((prev) => !prev)}
                  aria-expanded={showExactTime}
                  aria-controls={`${formId}-exact-time`}
                  className="text-xs text-amber-400/80 transition hover:text-amber-300 focus:outline-none focus:underline"
                >
                  {exactTimeToggleLabel}
                </button>
                {showExactTime && (
                  <div id={`${formId}-exact-time`} className="mt-2 min-w-0">
                    <label
                      htmlFor={`${formId}-time`}
                      className="mb-1.5 block text-xs font-medium text-amber-100/70"
                    >
                      Exact time
                    </label>
                    <input
                      id={`${formId}-time`}
                      type="time"
                      step={60}
                      value={exactTimeInputValue}
                      onChange={handleExactTimeChange}
                      className="input-glow ios-form-control min-w-0 w-full rounded-lg border border-white/30 bg-white/10 px-3 py-3 text-base text-white placeholder:text-white/40 transition-all focus:border-amber-400/50 focus:outline-none"
                    />
                    <p className="mt-1 text-[10px] text-white/50">
                      Leave blank to default to midnight
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Location Input */}
          <div className="mb-4">
            <label
              htmlFor={`${formId}-location`}
              className="mb-1.5 block text-sm font-medium text-amber-100/80"
            >
              Where were you?
            </label>
            <LocationInput disabled={mode === "sample"} inputId={`${formId}-location`} />
          </div>

          {/* Title Input */}
          <div className="mb-4">
            <label
              htmlFor={`${formId}-title`}
              className="mb-1.5 block text-sm font-medium text-amber-100/80"
            >
              Title
            </label>
            <input
              id={`${formId}-title`}
              type="text"
              value={title}
              onChange={handleTitleChange}
              onBlur={() => setTitleTouched(true)}
              disabled={mode === "sample"}
              maxLength={100}
              placeholder="Our Night Sky"
              aria-invalid={showTitleError}
              aria-describedby={`${formId}-title-hint${showTitleError ? ` ${formId}-title-error` : ""}`}
              className="input-glow w-full rounded-lg border border-white/30 bg-white/10 px-3 py-3 text-base text-white placeholder:text-white/40 transition-all focus:border-amber-400/50 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
            />
            <span id={`${formId}-title-hint`} className="sr-only">
              Enter a title for your star map
            </span>
            {showTitleError && (
              <p id={`${formId}-title-error`} className="mt-1 text-[10px] text-red-300">
                Title is required (1-100 characters).
              </p>
            )}
          </div>

          {/* Subtitle Input */}
          <div className="mb-5">
            <div className="mb-1.5 flex items-center justify-between">
              <label
                htmlFor={`${formId}-subtitle`}
                className="text-sm font-medium text-amber-100/80"
              >
                Subtitle
              </label>
              <button
                type="button"
                onClick={toggleSubtitle}
                disabled={mode === "sample"}
                aria-pressed={showSubtitle}
                aria-label={showSubtitle ? "Remove subtitle" : "Add subtitle"}
                className="text-xs text-amber-400/70 hover:text-amber-400 focus:outline-none focus:underline disabled:opacity-50"
              >
                {showSubtitle ? "Remove" : "+ Add subtitle"}
              </button>
            </div>
            {showSubtitle && (
              <input
                id={`${formId}-subtitle`}
                type="text"
                value={subtitle}
                onChange={handleSubtitleChange}
                disabled={mode === "sample"}
                maxLength={150}
                placeholder="June 15, 2024 • New York"
                aria-describedby={`${formId}-subtitle-hint`}
                className="input-glow w-full rounded-lg border border-white/30 bg-white/10 px-3 py-3 text-base text-white placeholder:text-white/40 transition-all focus:border-amber-400/50 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
              />
            )}
            {showSubtitle && mode === "customizing" && (
              <p id={`${formId}-subtitle-hint`} className="mt-1 text-xs text-white/50">
                Tip: Drag text on the preview to reposition
              </p>
            )}
          </div>

          {/* Style Picker */}
          <fieldset className="mb-5">
            <legend className="mb-2 block text-sm font-medium text-amber-100/80">
              Style
            </legend>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" role="radiogroup" aria-label="Map style">
              {styles.map((style) => (
                <button
                  key={style.id}
                  type="button"
                  role="radio"
                  aria-checked={selectedStyle === style.id}
                  onClick={() => handleStyleChange(style.id)}
                  className={`flex flex-col items-center gap-1.5 rounded-lg border p-3 transition focus:outline-none focus:ring-2 focus:ring-amber-400/50 ${
                    selectedStyle === style.id
                      ? "border-amber-400 bg-amber-400/10"
                      : "border-white/10 bg-white/5 hover:border-white/30"
                  } disabled:cursor-not-allowed disabled:opacity-50`}
                >
                  <div
                    className={`h-8 w-8 rounded-full border-2 ${style.swatchClass}`}
                    style={style.id === "parchmentScroll" ? { borderColor: "#000000", borderWidth: 3 } : undefined}
                    aria-hidden="true"
                  />
                  <span className="text-[10px] text-white/70">{style.name}</span>
                </button>
              ))}
            </div>
          </fieldset>

          {/* Shape Picker */}
          <fieldset className="mb-4">
            <legend className="mb-2 block text-xs font-medium text-amber-100/70">
              Shape
            </legend>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" role="radiogroup" aria-label="Map shape">
              {shapes.map((shapeOption) => (
                <button
                  key={shapeOption.id}
                  type="button"
                  role="radio"
                  aria-checked={shape === shapeOption.id}
                  onClick={() => handleShapeChange(shapeOption.id)}
                  className={`flex flex-col items-center gap-1 rounded-lg border p-3 transition focus:outline-none focus:ring-2 focus:ring-amber-400/50 ${
                    shape === shapeOption.id
                      ? "border-amber-400 bg-amber-400/10"
                      : "border-white/10 bg-white/5 hover:border-white/30"
                  } disabled:cursor-not-allowed disabled:opacity-50`}
                >
                  <span className="text-xl text-white/80" aria-hidden="true">{shapeOption.icon}</span>
                  <span className="text-[10px] text-white/70">{shapeOption.name}</span>
                </button>
              ))}
            </div>
          </fieldset>

          {/* Customize More Toggle */}
          <button
            type="button"
            onClick={() => setShowAdvanced(!showAdvanced)}
            disabled={mode === "sample"}
            aria-expanded={showAdvanced}
            aria-controls={`${formId}-advanced`}
            className="w-full rounded-lg border border-white/10 bg-white/5 py-2 text-xs font-medium text-white/60 transition hover:border-white/20 hover:text-white/80 focus:outline-none focus:ring-2 focus:ring-amber-400/30 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {showAdvanced ? "− Less options" : "+ Customize more"}
          </button>

          {/* Advanced Options (hidden by default) */}
          <div id={`${formId}-advanced`} aria-hidden={!showAdvanced || mode === "sample"}>
            {showAdvanced && mode === "customizing" && (
              <AdvancedOptionsPanel
                selectedStyle={selectedStyle}
                renderOptions={renderOptions}
                setRenderOptions={setRenderOptions}
                textBoxes={textBoxes}
                setTextBoxes={setTextBoxes}
                paid={paid}
              />
            )}
          </div>
        </form>

        {/* Error Message */}
        {exportError && (
          <div
            role="alert"
            aria-live="polite"
            className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm text-red-200"
          >
            <span className="sr-only">Error: </span>
            {exportError}
            <button
              type="button"
              onClick={() => setExportError(null)}
              className="ml-2 text-red-300 hover:text-red-100 focus:outline-none focus:underline"
              aria-label="Dismiss error"
            >
              ✕
            </button>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex flex-col gap-3" role="group" aria-label="Download options">
          <button
            type="button"
            onClick={handleFreePreview}
            disabled={!canExport || exporting}
            aria-busy={exporting}
            aria-describedby={`${formId}-preview-hint`}
            className="w-full rounded-full bg-white/10 py-4 text-sm font-semibold text-white transition hover:bg-white/20 focus:outline-none focus:ring-2 focus:ring-white/30 focus:ring-offset-2 focus:ring-offset-[#070b1b] disabled:cursor-not-allowed disabled:opacity-50 sm:py-3.5"
          >
            {exporting ? (
              <>
                <span className="inline-block animate-spin mr-2" aria-hidden="true">⏳</span>
                Exporting...
              </>
            ) : (
              <>⬇️ Free preview</>
            )}
          </button>
          <span id={`${formId}-preview-hint`} className="sr-only">
            Download a free watermarked preview of your star map
          </span>

          <button
            type="button"
            onClick={handleHdDownload}
            disabled={!canExport || hdExporting}
            aria-busy={hdExporting}
            aria-describedby={`${formId}-hd-hint`}
            className="w-full rounded-full bg-gradient-to-r from-amber-400 via-amber-500 to-amber-400 py-4 text-sm font-semibold text-[#0b1433] shadow-lg transition hover:-translate-y-0.5 hover:shadow-xl focus:outline-none focus:ring-2 focus:ring-amber-300 focus:ring-offset-2 focus:ring-offset-[#070b1b] disabled:cursor-not-allowed disabled:opacity-50 sm:py-3.5"
          >
            {hdExporting ? (
              <>
                <span className="inline-block animate-spin mr-2" aria-hidden="true">⏳</span>
                Processing...
              </>
            ) : paid ? (
              <>⬇️ HD download</>
            ) : (
              <>🔒 Unlock HD</>
            )}
          </button>
          <span id={`${formId}-hd-hint`} className="sr-only">
            {paid ? "Download high-resolution star map" : "Purchase to unlock high-resolution download"}
          </span>
        </div>

        {/* Status hint for screen readers */}
        <div aria-live="polite" className="sr-only">
          {!locationIsValid && mode === "customizing" && "Enter a location to enable downloads"}
          {showTitleError && "Enter a title to enable downloads"}
          {showDateError && "Choose a valid date to enable downloads"}
          {exporting && "Generating preview..."}
          {hdExporting && "Processing download..."}
        </div>
      </div>
    </div>
  );
}

export default SimplifiedEditor;

function formatDateInput(date: Date) {
  if (!Number.isFinite(date.getTime())) return "";
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function formatTimeInput(date: Date) {
  if (!Number.isFinite(date.getTime())) return DEFAULT_EXACT_TIME;
  const h = String(date.getHours()).padStart(2, "0");
  const m = String(date.getMinutes()).padStart(2, "0");
  const s = String(date.getSeconds()).padStart(2, "0");
  return `${h}:${m}:${s}`;
}

function combineDateTime(date: string, time: string, timezone?: string) {
  if (!date) return null;
  const normalizedTime = normalizeTimeInput(time);

  if (!timezone || timezone === "UTC") {
    const combined = new Date(`${date}T${normalizedTime}`);
    if (!Number.isFinite(combined.getTime())) return null;
    return combined.toISOString();
  }

  try {
    const [yearStr, monthStr, dayStr] = date.split("-");
    const [hourStr, minuteStr] = normalizedTime.split(":");
    const year = Number(yearStr);
    const month = Number(monthStr);
    const day = Number(dayStr);
    const hour = Number(hourStr);
    const minute = Number(minuteStr);

    if (
      !Number.isFinite(year) ||
      !Number.isFinite(month) ||
      !Number.isFinite(day) ||
      !Number.isFinite(hour) ||
      !Number.isFinite(minute)
    ) {
      return null;
    }

    const testDate = new Date(Date.UTC(year, month - 1, day, hour, minute, 0));
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });

    const parts = formatter.formatToParts(testDate);
    const localYear = Number(parts.find((p) => p.type === "year")?.value);
    const localMonth = Number(parts.find((p) => p.type === "month")?.value);
    const localDay = Number(parts.find((p) => p.type === "day")?.value);
    const localHour = Number(parts.find((p) => p.type === "hour")?.value);
    const localMinute = Number(parts.find((p) => p.type === "minute")?.value);

    const localMs = Date.UTC(localYear, localMonth - 1, localDay, localHour, localMinute, 0);
    const utcMs = testDate.getTime();
    const offsetMs = utcMs - localMs;

    const targetLocalMs = Date.UTC(year, month - 1, day, hour, minute, 0);
    const result = new Date(targetLocalMs + offsetMs);

    if (!Number.isFinite(result.getTime())) return null;
    return result.toISOString();
  } catch (error) {
    console.warn("Failed to convert timezone in combineDateTime:", timezone, error);
    const combined = new Date(`${date}T${normalizedTime}`);
    if (!Number.isFinite(combined.getTime())) return null;
    return combined.toISOString();
  }
}

function normalizeTimeInput(time: string) {
  if (!time) return DEFAULT_EXACT_TIME;
  if (time.length === 5) return `${time}:00`;
  return time;
}

function isValidIsoDateInput(value: string) {
  const trimmed = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return false;
  const [yearStr, monthStr, dayStr] = trimmed.split("-");
  const year = Number(yearStr);
  const month = Number(monthStr);
  const day = Number(dayStr);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return false;
  const parsed = new Date(year, month - 1, day, 12, 0, 0, 0);
  return (
    parsed.getFullYear() === year &&
    parsed.getMonth() === month - 1 &&
    parsed.getDate() === day
  );
}

function toISODate(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function formatTimeLabel(time: string) {
  const [h, m] = time.split(":").map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return "12:00 AM";
  const suffix = h >= 12 ? "PM" : "AM";
  const hour12 = ((h + 11) % 12) + 1;
  return `${String(hour12).padStart(2, "0")}:${String(m).padStart(2, "0")} ${suffix}`;
}

function getDateTimeInputValues(dateTime: string, timezone?: string) {
  const byTimezone = formatDateTimeForLocation(dateTime, timezone || "UTC");
  if (byTimezone) {
    return {
      dateInputValue: byTimezone.date,
      exactTimeValue: `${byTimezone.time}:00`,
    };
  }

  const parsed = new Date(dateTime);
  return {
    dateInputValue: formatDateInput(parsed),
    exactTimeValue: formatTimeInput(parsed),
  };
}
