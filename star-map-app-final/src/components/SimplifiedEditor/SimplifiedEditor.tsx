"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "@/lib/store";
import { useShallow } from "zustand/react/shallow";
import { buildRecipeFromState, renderStarMap, aspectRatioToNumber, type MapRecipe } from "@/lib/renderSky";
import { getShapeData } from "@/lib/shapeUtils";
import type { StyleId } from "@/lib/store";
import type { Shape } from "@/lib/types";
import dynamic from "next/dynamic";
import { LocationInput } from "./LocationInput";
import { AdvancedOptionsPanel } from "./AdvancedOptionsPanel";

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

export function SimplifiedEditor() {
  const [mode, setMode] = useState<EditorMode>("sample");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [hdExporting, setHdExporting] = useState(false);
  const formRef = useRef<HTMLDivElement>(null);
  const hdExportInFlightRef = useRef(false);

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
      setShape: state.setShape,
      setTextBoxes: state.setTextBoxes,
      setRenderOptions: state.setRenderOptions,
      setRevealed: state.setRevealed,
      revealed: state.revealed,
    }))
  );

  // Get title and subtitle from textBoxes
  const titleBox = textBoxes.find((tb) => tb.id === "title");
  const subtitleBox = textBoxes.find((tb) => tb.id === "subtitle");
  const title = titleBox?.text || "";
  const subtitle = subtitleBox?.text || "";
  const showSubtitle = Boolean(subtitleBox);

  const handleMakeItYours = useCallback(() => {
    setMode("customizing");
    // Scroll to form
    setTimeout(() => {
      formRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 100);
  }, []);

  const handleDateChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const newDate = new Date(e.target.value);
      if (!isNaN(newDate.getTime())) {
        setDateTime(newDate.toISOString());
      }
    },
    [setDateTime]
  );

  const handleTitleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const newTitle = e.target.value;
      const updatedBoxes = textBoxes.map((tb) =>
        tb.id === "title" ? { ...tb, text: newTitle } : tb
      );
      setTextBoxes(updatedBoxes);
    },
    [textBoxes, setTextBoxes]
  );

  const handleStyleChange = useCallback(
    (style: StyleId) => {
      setStyle(style);
    },
    [setStyle]
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

      // Render the map
      await renderStarMap({
        recipe,
        canvas,
        width,
        height,
        watermark,
        quality: mode === "hd" ? "export" : "preview",
        premium,
      });

      const url = canvas.toDataURL("image/png");
      const link = document.createElement("a");
      link.download = mode === "hd" ? "star-map-hd.png" : "star-map-preview.png";
      link.href = url;
      link.click();
    },
    [aspectRatio, dateTime, location, paid, renderOptions, selectedStyle, shape, textBoxes]
  );

  // Handle free preview download
  const handleFreePreview = useCallback(async () => {
    if (exporting) return;
    setExporting(true);
    try {
      await exportImage("preview");
    } finally {
      setExporting(false);
    }
  }, [exporting, exportImage]);

  // Handle HD download - redirects to checkout if not paid
  const handleHdDownload = useCallback(async () => {
    if (hdExportInFlightRef.current) return;

    if (paid) {
      // User has paid - do direct HD export
      hdExportInFlightRef.current = true;
      setHdExporting(true);
      try {
        await exportImage("hd", true);
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
              localStorage.setItem("checkout-map-id", mapId);
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

      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(checkoutPayload),
      });

      if (!res.ok) {
        throw new Error("Checkout failed");
      }

      const data = (await res.json()) as { url?: string };
      if (data.url) {
        window.location.href = data.url;
        return;
      }
      throw new Error("No checkout URL");
    } catch (err) {
      console.error("Checkout error:", err);
      // Reset state on error
      hdExportInFlightRef.current = false;
      setHdExporting(false);
    }
  }, [aspectRatio, dateTime, exportImage, location, paid, renderOptions, selectedStyle, shape, textBoxes]);

  // Check if we have enough data to show custom preview
  // User has entered a location if name is set and coordinates aren't default
  const hasValidLocation = Boolean(location.name && location.latitude !== 0);
  // For simplified editor, only switch to store-based preview when user enters location
  const canShowCustomPreview = hasValidLocation;

  // Auto-reveal when user has entered location
  useEffect(() => {
    if (hasValidLocation && !revealed) {
      setRevealed(true);
    }
  }, [hasValidLocation, revealed, setRevealed]);

  const styles: { id: StyleId; name: string; preview: string }[] = [
    { id: "navyGold", name: "Navy & Gold", preview: "bg-[#070b1b]" },
    { id: "vintageEngraving", name: "Vintage", preview: "bg-[#1b1b1b]" },
    { id: "parchmentScroll", name: "Parchment", preview: "bg-[#f5f0e6]" },
    { id: "midnightMinimal", name: "Minimal", preview: "bg-[#0c0f1a]" },
  ];

  const shapes: { id: Shape; name: string; icon: string }[] = [
    { id: "rectangle", name: "Square", icon: "□" },
    { id: "circle", name: "Circle", icon: "○" },
    { id: "heart", name: "Heart", icon: "♥" },
    { id: "star", name: "Star", icon: "★" },
  ];

  // Format date for input
  const dateInputValue = dateTime
    ? new Date(dateTime).toISOString().split("T")[0]
    : "";

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
    <div className="flex flex-col gap-6 lg:flex-row lg:gap-8">
      {/* Preview Section */}
      <div className="relative flex-1">
        <div className="aspect-square w-full overflow-hidden rounded-2xl border border-white/10 bg-[#070b1b] shadow-2xl">
          {!canShowCustomPreview ? (
            <PreviewCanvas key={`${selectedStyle}-${shape}`} readOnly={mode === "sample"} externalRecipe={dynamicRecipe} />
          ) : (
            <PreviewCanvas />
          )}
        </div>

        {/* Make it yours overlay - only show in sample mode */}
        {mode === "sample" && (
          <div className="absolute inset-0 flex items-end justify-center pb-8">
            <button
              type="button"
              onClick={handleMakeItYours}
              className="rounded-full bg-gradient-to-r from-amber-400 via-amber-500 to-amber-400 px-6 py-3 text-sm font-semibold text-[#0b1433] shadow-lg transition hover:-translate-y-0.5 hover:shadow-xl"
            >
              ✨ Make it yours
            </button>
          </div>
        )}
      </div>

      {/* Form Section */}
      <div
        ref={formRef}
        className={`flex flex-col gap-4 lg:w-80 ${
          mode === "sample" ? "opacity-50" : "opacity-100"
        } transition-opacity`}
      >
        <div className="rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur">
          <h3 className="mb-4 text-lg font-semibold text-white">
            {mode === "sample" ? "Customize your moment" : "Your moment"}
          </h3>

          {/* Date Input */}
          <div className="mb-4">
            <label className="mb-1.5 block text-xs font-medium text-amber-100/70">
              When was it?
            </label>
            <input
              type="date"
              value={dateInputValue}
              onChange={handleDateChange}
              disabled={mode === "sample"}
              className="w-full rounded-lg border border-white/20 bg-white/10 px-3 py-2.5 text-sm text-white placeholder:text-white/40 focus:border-amber-400/50 focus:outline-none focus:ring-1 focus:ring-amber-400/30 disabled:cursor-not-allowed disabled:opacity-50"
            />
          </div>

          {/* Location Input */}
          <div className="mb-4">
            <label className="mb-1.5 block text-xs font-medium text-amber-100/70">
              Where were you?
            </label>
            <LocationInput disabled={mode === "sample"} />
          </div>

          {/* Title Input */}
          <div className="mb-4">
            <label className="mb-1.5 block text-xs font-medium text-amber-100/70">
              Title
            </label>
            <input
              type="text"
              value={title}
              onChange={handleTitleChange}
              disabled={mode === "sample"}
              placeholder="Our Night Sky"
              className="w-full rounded-lg border border-white/20 bg-white/10 px-3 py-2.5 text-sm text-white placeholder:text-white/40 focus:border-amber-400/50 focus:outline-none focus:ring-1 focus:ring-amber-400/30 disabled:cursor-not-allowed disabled:opacity-50"
            />
          </div>

          {/* Subtitle Input */}
          <div className="mb-4">
            <div className="mb-1.5 flex items-center justify-between">
              <label className="text-xs font-medium text-amber-100/70">
                Subtitle
              </label>
              <button
                type="button"
                onClick={toggleSubtitle}
                disabled={mode === "sample"}
                className="text-[10px] text-amber-400/70 hover:text-amber-400 disabled:opacity-50"
              >
                {showSubtitle ? "Remove" : "+ Add subtitle"}
              </button>
            </div>
            {showSubtitle && (
              <input
                type="text"
                value={subtitle}
                onChange={handleSubtitleChange}
                disabled={mode === "sample"}
                placeholder="June 15, 2024 • New York"
                className="w-full rounded-lg border border-white/20 bg-white/10 px-3 py-2.5 text-sm text-white placeholder:text-white/40 focus:border-amber-400/50 focus:outline-none focus:ring-1 focus:ring-amber-400/30 disabled:cursor-not-allowed disabled:opacity-50"
              />
            )}
            {showSubtitle && mode === "customizing" && (
              <p className="mt-1 text-[10px] text-white/40">
                Tip: Drag text on the preview to reposition
              </p>
            )}
          </div>

          {/* Style Picker */}
          <div className="mb-4">
            <label className="mb-2 block text-xs font-medium text-amber-100/70">
              Style
            </label>
            <div className="grid grid-cols-4 gap-2">
              {styles.map((style) => (
                <button
                  key={style.id}
                  type="button"
                  onClick={() => handleStyleChange(style.id)}
                  disabled={mode === "sample"}
                  className={`flex flex-col items-center gap-1.5 rounded-lg border p-2 transition ${
                    selectedStyle === style.id
                      ? "border-amber-400 bg-amber-400/10"
                      : "border-white/10 bg-white/5 hover:border-white/30"
                  } disabled:cursor-not-allowed disabled:opacity-50`}
                >
                  <div
                    className={`h-8 w-8 rounded-full ${style.preview} border border-white/20`}
                  />
                  <span className="text-[10px] text-white/70">{style.name}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Shape Picker */}
          <div className="mb-4">
            <label className="mb-2 block text-xs font-medium text-amber-100/70">
              Shape
            </label>
            <div className="grid grid-cols-4 gap-2">
              {shapes.map((shapeOption) => (
                <button
                  key={shapeOption.id}
                  type="button"
                  onClick={() => handleShapeChange(shapeOption.id)}
                  disabled={mode === "sample"}
                  className={`flex flex-col items-center gap-1 rounded-lg border p-2 transition ${
                    shape === shapeOption.id
                      ? "border-amber-400 bg-amber-400/10"
                      : "border-white/10 bg-white/5 hover:border-white/30"
                  } disabled:cursor-not-allowed disabled:opacity-50`}
                >
                  <span className="text-xl text-white/80">{shapeOption.icon}</span>
                  <span className="text-[10px] text-white/70">{shapeOption.name}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Customize More Toggle */}
          <button
            type="button"
            onClick={() => setShowAdvanced(!showAdvanced)}
            disabled={mode === "sample"}
            className="w-full rounded-lg border border-white/10 bg-white/5 py-2 text-xs font-medium text-white/60 transition hover:border-white/20 hover:text-white/80 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {showAdvanced ? "− Less options" : "+ Customize more"}
          </button>

          {/* Advanced Options (hidden by default) */}
          {showAdvanced && mode === "customizing" && (
            <AdvancedOptionsPanel
              renderOptions={renderOptions}
              setRenderOptions={setRenderOptions}
              textBoxes={textBoxes}
              setTextBoxes={setTextBoxes}
              paid={paid}
            />
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={handleFreePreview}
            disabled={mode === "sample" || !canShowCustomPreview || exporting}
            className="w-full rounded-full bg-white/10 py-3 text-sm font-semibold text-white transition hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {exporting ? "⏳ Exporting..." : "⬇️ Free preview"}
          </button>
          <button
            type="button"
            onClick={handleHdDownload}
            disabled={mode === "sample" || !canShowCustomPreview || hdExporting}
            className="w-full rounded-full bg-gradient-to-r from-amber-400 via-amber-500 to-amber-400 py-3 text-sm font-semibold text-[#0b1433] shadow-lg transition hover:-translate-y-0.5 hover:shadow-xl disabled:cursor-not-allowed disabled:opacity-50"
          >
            {hdExporting ? "⏳ Processing..." : paid ? "⬇️ HD download" : "🔒 Unlock HD"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default SimplifiedEditor;
