"use client";

import DateTimeControls from "@/components/DateTimeControls";
import LocationSearch from "@/components/LocationSearch";
import PreviewCanvas from "@/components/PreviewCanvas";
import { StyleId, TextBox, useStore, RenderOptions } from "@/lib/store";
import { aspectRatioToNumber, buildRecipeFromState, renderStarMap } from "@/lib/renderSky";
import { getShapeData } from "@/lib/shapeUtils";
import type { Shape } from "@/lib/types";
import { track } from "@/lib/analytics";
import { useCallback, useEffect, useRef, useState } from "react";
import { useShallow } from "zustand/react/shallow";

const styles: { id: StyleId; name: string; note: string }[] = [
  { id: "navyGold", name: "Navy & Gold", note: "Luxe midnight with gilded accents" },
  { id: "vintageEngraving", name: "Vintage Engraving", note: "Linework etched on deep charcoal" },
  { id: "parchmentScroll", name: "Parchment Scroll", note: "Warm cream with antique border" },
  { id: "midnightMinimal", name: "Midnight Minimal", note: "Clean noir with subtle glow" },
];

const DRAFT_KEY = "star-map-draft";
const AUTO_EXPORT_KEY = "star-map-auto-export";
const REVEALED_FLAG = "star-map-last-revealed";

const fontOptions: Array<{ id: TextBox["fontFamily"]; label: string }> = [
  { id: "playfair", label: "Playfair Display" },
  { id: "cinzel", label: "Cinzel" },
  { id: "script", label: "Great Vibes" },
  { id: "cormorant", label: "Cormorant Garamond" },
  { id: "montserrat", label: "Montserrat" },
];

const visualModes: Array<{ id: RenderOptions["visualMode"]; label: string; description: string }> = [
  { id: "astronomical", label: "Astronomical", description: "Pure star field, minimal embellishment" },
  { id: "enhanced", label: "Enhanced", description: "Balanced glow and detail (default)" },
  { id: "illustrated", label: "Illustrated", description: "Artistic finish with richer accents" },
];

const shapes: Array<{ id: Shape; label: string }> = [
  { id: "rectangle", label: "Rectangle" },
  { id: "heart", label: "Heart" },
  { id: "circle", label: "Circle" },
];

const constellationPresets: Array<{ id: RenderOptions["constellationLines"]; label: string; note: string }> = [
  { id: "off", label: "Off", note: "No lines visible" },
  { id: "thin", label: "Thin", note: "Subtle guides (default)" },
  { id: "thick", label: "Bold", note: "Stronger, etched lines" },
];

export default function Home() {
  const {
    dateTime,
    textBoxes,
    selectedStyle,
    aspectRatio,
    shape,
    renderOptions,
    paid,
    revealed,
    location,
    setLocation,
    setDateTime,
    updateTextBox,
    removeTextBox,
    addTextBox,
    setStyle,
    setAspectRatio,
    setShape,
    setRenderOptions,
    setPaid,
    setRevealed,
    setTextBoxes,
  } = useStore(
    useShallow((state) => ({
      dateTime: state.dateTime,
      textBoxes: state.textBoxes,
      selectedStyle: state.selectedStyle,
      aspectRatio: state.aspectRatio,
      shape: state.shape,
      renderOptions: state.renderOptions,
      paid: state.paid,
      revealed: state.revealed,
      location: state.location,
      setLocation: state.setLocation,
      setDateTime: state.setDateTime,
      updateTextBox: state.updateTextBox,
      removeTextBox: state.removeTextBox,
      addTextBox: state.addTextBox,
      setStyle: state.setStyle,
      setAspectRatio: state.setAspectRatio,
      setShape: state.setShape,
      setRenderOptions: state.setRenderOptions,
      setPaid: state.setPaid,
      setRevealed: state.setRevealed,
      setTextBoxes: state.setTextBoxes,
    })),
  );

  const [collapsedCards, setCollapsedCards] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(textBoxes.map((box) => [box.id, true])),
  );
  const [restored, setRestored] = useState(false);
  const [paywallOpen, setPaywallOpen] = useState(false);
  const [pendingExport, setPendingExport] = useState<"preview" | "hd" | null>(null);
  const [shareLink, setShareLink] = useState<string | null>(null);
  const [autoExportPending, setAutoExportPending] = useState(false);
  const [canvasReady, setCanvasReady] = useState(false);
  const locationName = location.name?.trim() ?? "";
  const hasDate = Number.isFinite(new Date(dateTime).getTime());
  const canReveal = Boolean(locationName);
  const previewRef = useRef<HTMLDivElement>(null);
  const inputsRef = useRef<HTMLDivElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const handleEditScroll = useCallback(() => {
    inputsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const token = localStorage.getItem("star-map-unlock");
    if (token) {
      setPaid(true);
    }
    const draft = localStorage.getItem(DRAFT_KEY);
    if (draft) {
      try {
        const parsed = JSON.parse(draft) as ReturnType<typeof buildRecipeFromState>;
        if (parsed.datetimeISO) setDateTime(parsed.datetimeISO);
        if (parsed.location) setLocation(parsed.location);
        if (parsed.textBoxes?.length) setTextBoxes(parsed.textBoxes);
        if (parsed.selectedStyle) setStyle(parsed.selectedStyle);
        if (parsed.aspectRatio) setAspectRatio(parsed.aspectRatio as any);
        if ((parsed as any).shape) {
          setShape((parsed as any).shape);
        } else if ((parsed.renderOptions as any)?.shapeMask) {
          setShape((parsed.renderOptions as any).shapeMask);
        }
        if (parsed.renderOptions) setRenderOptions(parsed.renderOptions);
        setRevealed(false);
        setRestored(true);
      } catch {
        // ignore bad drafts
      }
    }
    const revealedFlag = localStorage.getItem(REVEALED_FLAG);
    if (revealedFlag === "true") {
      setRevealed(true);
    }
    const autoFlag = localStorage.getItem(AUTO_EXPORT_KEY);
    if (autoFlag === "hd") {
      setAutoExportPending(true);
    }
  }, [
    setPaid,
    setDateTime,
    setLocation,
    setRenderOptions,
    setRevealed,
    setStyle,
    setTextBoxes,
    setAspectRatio,
    setShape,
  ]);

  useEffect(() => {
    if (typeof window === "undefined" || !restored) return;
    const recipe = buildRecipeFromState({
      dateTime,
      location,
      textBoxes,
      selectedStyle,
      aspectRatio,
      shape,
      renderOptions,
    });
    localStorage.setItem(DRAFT_KEY, JSON.stringify(recipe));
  }, [aspectRatio, dateTime, location, renderOptions, restored, selectedStyle, shape, textBoxes]);

  const toggleCard = (id: string) =>
    setCollapsedCards((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));

  const handleReveal = useCallback(() => {
    if (!canReveal || !hasDate) {
      inputsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    setRevealed(true);
    track("reveal_map", { visualMode: renderOptions.visualMode, isPaid: paid });
    if (typeof window !== "undefined") {
      localStorage.setItem(REVEALED_FLAG, "true");
    }
    requestAnimationFrame(() => {
      previewRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }, [canReveal, hasDate, setRevealed]);

  const exportImage = useCallback(
    async (mode: "preview" | "hd") => {
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
      const ratio = shapeData
        ? shapeData.viewBox.width / shapeData.viewBox.height
        : aspectRatioToNumber(recipe.aspectRatio);
      const height = Math.max(1, Math.round(width / ratio));
      const canvas = document.createElement("canvas");
      const watermark = mode !== "hd";
      await renderStarMap({
        recipe,
        canvas,
        width,
        height,
        watermark,
        quality: mode === "hd" ? "export" : "preview",
      });
      const url = canvas.toDataURL("image/png");
      const link = document.createElement("a");
      link.download = mode === "hd" ? "star-map-hd.png" : "star-map-preview.png";
      link.href = url;
      link.click();
    },
    [aspectRatio, dateTime, location, renderOptions, selectedStyle, shape, textBoxes],
  );

  useEffect(() => {
    if (!restored || !autoExportPending || !paid) return;
    setRevealed(true);
  }, [autoExportPending, paid, restored, setRevealed]);

  useEffect(() => {
    if (!autoExportPending || !canvasReady) return;
    previewRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [autoExportPending, canvasReady]);

  useEffect(() => {
    if (!autoExportPending || !canvasReady || !paid) return;
    const id = requestAnimationFrame(() => {
      exportImage("hd")
        .catch(() => {})
        .finally(() => {
          localStorage.removeItem(AUTO_EXPORT_KEY);
          setAutoExportPending(false);
        });
    });
    return () => cancelAnimationFrame(id);
  }, [autoExportPending, canvasReady, exportImage, paid]);

  const handleExport = useCallback(
    (mode: "preview" | "hd") => {
      if (mode === "hd" && !paid) {
        setPendingExport(mode);
        setPaywallOpen(true);
        track("paywall_opened", { visualMode: renderOptions.visualMode });
        if (typeof window !== "undefined") {
          localStorage.setItem(AUTO_EXPORT_KEY, mode);
          if (revealed) localStorage.setItem(REVEALED_FLAG, "true");
        }
        return;
      }
      track(mode === "hd" ? "export_hd_clicked" : "export_free_clicked", {
        isPaid: paid,
        visualMode: renderOptions.visualMode,
        exportResolution: mode === "hd" ? 6000 : 1200,
      });
      exportImage(mode).catch(() => {});
    },
    [exportImage, paid, renderOptions.visualMode, revealed],
  );

  const startCheckout = useCallback(async () => {
    try {
      track("checkout_started", { visualMode: renderOptions.visualMode });
      const res = await fetch("/api/checkout", { method: "POST" });
      if (!res.ok) throw new Error("checkout failed");
      const data = (await res.json()) as { url?: string };
      if (data.url) {
        window.location.href = data.url;
        return;
      }
      throw new Error("no url");
    } catch (err) {
      console.error(err);
      setPaid(true);
      track("purchase_success", { isPaid: true });
      if (pendingExport) {
        await exportImage(pendingExport).catch(() => {});
        setPendingExport(null);
      }
      setPaywallOpen(false);
    }
  }, [exportImage, pendingExport, renderOptions.visualMode, setPaid]);

  const handleShare = useCallback(async () => {
    const recipe = buildRecipeFromState({
      dateTime,
      location,
      textBoxes,
      selectedStyle,
      aspectRatio,
      shape,
      renderOptions,
    });
    const res = await fetch("/api/maps", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(recipe),
    });
    if (!res.ok) return;
    const { id } = (await res.json()) as { id: string };
    const url = `${window.location.origin}/m/${id}`;
    setShareLink(url);
    track("share_link_clicked", { isPaid: paid, visualMode: renderOptions.visualMode });
    if (navigator.share) {
      await navigator.share({ url, title: "My Star Map", text: "See this night sky moment" }).catch(() => {});
    } else {
      await navigator.clipboard.writeText(url).catch(() => {});
    }
  }, [aspectRatio, dateTime, location, paid, renderOptions, selectedStyle, shape, textBoxes]);

  const handleShareImage = useCallback(async () => {
    const recipe = buildRecipeFromState({
      dateTime,
      location,
      textBoxes,
      selectedStyle,
      aspectRatio,
      shape,
      renderOptions,
    });
    const width = 1200;
    const shapeData = await getShapeData(recipe.shape).catch(() => null);
    const ratio = shapeData
      ? shapeData.viewBox.width / shapeData.viewBox.height
      : aspectRatioToNumber(recipe.aspectRatio);
    const height = Math.max(1, Math.round(width / ratio));
    const canvas = document.createElement("canvas");
    await renderStarMap({
      recipe,
      canvas,
      width,
      height,
      watermark: true,
      quality: "preview",
    });
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!blob) return;
    track("share_image_clicked", { isPaid: paid, visualMode: renderOptions.visualMode });

    const file = new File([blob], "star-map-share.png", { type: "image/png" });
    const shareData: ShareData = { files: [file], title: "My Star Map", text: "See this night sky moment" };

    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share(shareData);
        return;
      } catch {
        // fallback below
      }
    }

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "star-map-share.png";
    link.click();
    URL.revokeObjectURL(url);
  }, [aspectRatio, dateTime, location, paid, renderOptions, selectedStyle, shape, textBoxes]);

  return (
    <main className="mx-auto max-w-5xl px-4 pb-6 pt-6 sm:pt-8 lg:py-12">
      <header className="mb-6 flex flex-col gap-3 md:mb-8 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.35em] text-gold">StarMapCo</p>
          <h1 className="mt-2 text-3xl font-bold text-midnight sm:text-[34px] md:text-4xl">
            Craft a personalized night sky map
          </h1>
          <p className="mt-1 text-sm text-neutral-700 md:text-base">
            Select your moment, style, and dedication. Reveal an astronomically accurate sky when you’re ready.
          </p>
        </div>
      </header>

      <div className="flex flex-col gap-5 lg:gap-6">
        <section
          ref={previewRef}
          className="flex flex-col gap-3 rounded-3xl border border-black/5 bg-white/70 p-3 shadow-2xl shadow-black/10 backdrop-blur transition-all duration-500 sm:p-4"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.25em] text-neutral-500">Preview</p>
              <h3 className="text-xl font-semibold text-midnight sm:text-2xl">StarMapCo night sky</h3>
              <p className="text-xs text-neutral-600 sm:text-sm">
                {revealed
                  ? "Your sky is revealed. Tap edit to refine."
                  : "Hidden until you reveal. Perfect your inputs first."}
              </p>
            </div>
            <div className="rounded-full border border-gold/50 bg-amber-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-gold shadow-sm">
              {styles.find((s) => s.id === selectedStyle)?.name ?? "Style"}
            </div>
          </div>
          <div
            className="relative overflow-hidden rounded-2xl border border-black/5 bg-[#0b1a30] p-2 shadow-inner shadow-black/10"
            style={
              revealed
                ? undefined
                : {
                    backgroundColor: "#0b0f3b",
                    backgroundImage:
                      "url('/ribbon-overlay.png'), radial-gradient(circle at 50% 65%, rgba(28, 34, 94, 0.55), rgba(7, 9, 26, 0.98))",
                    backgroundRepeat: "no-repeat, no-repeat",
                    backgroundSize: "100% auto, cover",
                    backgroundPosition: "center 26px, center",
                  }
            }
          >
            <div
              className={`relative min-h-[70vh] overflow-hidden rounded-xl sm:min-h-[75vh] lg:min-h-[80vh] ${
                revealed ? "" : "bg-transparent"
              }`}
            >
              {!revealed && (
                <div className="absolute inset-0 flex flex-col items-center justify-end gap-4 pb-10 text-center text-sm text-amber-50">
                  <div className="pointer-events-none absolute inset-0 opacity-35">
                    <div className="absolute inset-10 rounded-full bg-gradient-to-br from-amber-500/10 via-amber-200/5 to-transparent blur-3xl" />
                  </div>
                  <div className="relative z-10 px-6">
                    <p className="text-base font-semibold text-amber-100">Your sky is wrapped and waiting.</p>
                    <p className="text-xs text-amber-200/80">Enter a place, then tap reveal to unveil the night.</p>
                  </div>
                  <button
                    type="button"
                    onClick={handleReveal}
                    className={`relative z-10 inline-flex w-full max-w-xs items-center justify-center gap-2 rounded-full px-4 py-3 text-sm font-semibold text-midnight shadow-lg shadow-amber-200 transition hover:-translate-y-[1px] hover:shadow-xl focus:outline-none focus:ring-2 focus:ring-gold focus:ring-offset-2 focus:ring-offset-[#0b1a30] ${
                      canReveal && hasDate
                        ? "bg-gradient-to-r from-amber-400 via-amber-500 to-amber-400"
                        : "cursor-pointer bg-neutral-400/60 text-neutral-700 shadow-none"
                    }`}
                    aria-disabled={!canReveal || !hasDate}
                  >
                    ✨ Find your special moment
                  </button>
                  {(!canReveal || !hasDate) && (
                    <p className="relative z-10 text-xs text-amber-200/80">
                      Add a location and date to unlock your reveal.
                    </p>
                  )}
                </div>
              )}
              {revealed && (
                <>
                  <PreviewCanvas onRendered={() => setCanvasReady(true)} />
                  <div className="pointer-events-none absolute right-3 top-3 inline-flex items-center gap-2 rounded-full border border-gold/40 bg-white/80 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-gold shadow-sm backdrop-blur">
                    <span className="h-2 w-2 rounded-full bg-emerald-500 shadow-[0_0_0_4px_rgba(16,185,129,0.15)]" />
                    Live Preview
                  </div>
                  <div className="pointer-events-none absolute inset-0 rounded-xl ring-1 ring-black/5" />
                  <div className="absolute bottom-3 left-3 right-3 flex flex-wrap items-center justify-end gap-2 sm:gap-3">
                    <button
                      type="button"
                      onClick={() => handleExport("preview")}
                      className="inline-flex items-center gap-2 rounded-full border border-black/10 bg-white/90 px-3 py-2 text-xs font-semibold text-neutral-800 shadow-sm transition hover:-translate-y-[1px] hover:shadow focus:outline-none focus:ring-2 focus:ring-gold focus:ring-offset-2"
                    >
                      Free ⬇️
                    </button>
                    <button
                      type="button"
                      onClick={() => handleExport("hd")}
                      className="inline-flex items-center gap-2 rounded-full border border-amber-200 bg-gradient-to-r from-amber-400 via-amber-500 to-amber-400 px-4 py-2 text-xs font-semibold text-midnight shadow-md transition hover:-translate-y-[1px] hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-gold focus:ring-offset-2"
                    >
                      {!paid && "🔒 "}HD ⬇️
                    </button>
                    <button
                      type="button"
                      onClick={handleShareImage}
                      className="inline-flex items-center gap-2 rounded-full border border-black/10 bg-white/90 px-3 py-2 text-xs font-semibold text-neutral-800 shadow-sm transition hover:-translate-y-[1px] hover:shadow focus:outline-none focus:ring-2 focus:ring-gold focus:ring-offset-2"
                    >
                      🔗 Share
                    </button>
                    <button
                      type="button"
                      onClick={handleShare}
                      className="inline-flex items-center gap-2 rounded-full border border-black/10 bg-white/90 px-3 py-2 text-xs font-semibold text-neutral-800 shadow-sm transition hover:-translate-y-[1px] hover:shadow focus:outline-none focus:ring-2 focus:ring-gold focus:ring-offset-2"
                    >
                      💾 Save & Remix
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsFullscreen(true)}
                    className="absolute bottom-3 right-3 inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/80 text-lg text-neutral-800 shadow-md backdrop-blur transition hover:-translate-y-[1px] hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-gold focus:ring-offset-2"
                    aria-label="Open fullscreen"
                  >
                    ⤢
                  </button>
                  <button
                    type="button"
                    onClick={handleEditScroll}
                    className="absolute left-3 top-3 inline-flex items-center gap-2 rounded-full border border-black/10 bg-white/90 px-3 py-1.5 text-xs font-semibold text-neutral-800 shadow-sm transition hover:-translate-y-[1px] hover:shadow focus:outline-none focus:ring-2 focus:ring-gold focus:ring-offset-2"
                  >
                    ← Edit
                  </button>
                </>
              )}
            </div>
          </div>
          {revealed && (
            <div className="flex items-center justify-end">
              <span className="text-xs text-neutral-500">Tap edit to adjust details</span>
            </div>
          )}
        </section>

        <section
          ref={inputsRef}
          className="rounded-3xl border border-black/5 bg-white/90 p-4 shadow-xl shadow-black/10 backdrop-blur sm:p-5"
        >
          <h2 className="text-lg font-semibold text-midnight">Inputs</h2>
          <p className="mb-4 text-sm text-neutral-600">
            Set the celestial moment, place, and the words that anchor your print.
          </p>

          <div className="space-y-4">
            <DateTimeControls dateTime={dateTime} onChange={setDateTime} />

            <LocationSearch />

            <div className="divide-y divide-black/5 rounded-2xl border border-black/5 bg-neutral-50/70">
              {textBoxes.map((box) => (
                <div key={box.id} className="space-y-2 p-3 sm:p-4">
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => toggleCard(box.id)}
                        className="h-7 w-7 rounded-full border border-black/10 bg-white text-sm font-semibold text-neutral-600 shadow-sm transition hover:-translate-y-[1px] hover:shadow"
                        aria-pressed={!!collapsedCards[box.id]}
                        aria-label={`Toggle ${box.label}`}
                      >
                        {collapsedCards[box.id] ? "▾" : "▴"}
                      </button>
                      <span className="font-medium text-neutral-800">{box.label}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <select
                        value={box.fontFamily}
                        onChange={(e) =>
                          paid && updateTextBox(box.id, { fontFamily: e.target.value as TextBox["fontFamily"] })
                        }
                        disabled={!paid}
                        className={`rounded-md border px-2 py-2 text-sm shadow-inner shadow-black/5 outline-none transition focus:border-gold focus:ring-2 focus:ring-gold/30 ${
                          paid ? "bg-white text-neutral-800" : "cursor-not-allowed bg-neutral-100 text-neutral-400"
                        }`}
                      >
                        {fontOptions.map((opt) => (
                          <option key={opt.id} value={opt.id}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => removeTextBox(box.id)}
                        className="h-7 w-7 rounded-full border border-rose-200 bg-rose-50 text-base font-semibold leading-none text-rose-600 transition hover:-translate-y-[1px] hover:shadow"
                        aria-label={`Remove ${box.label}`}
                      >
                        –
                      </button>
                    </div>
                  </div>
                  {!collapsedCards[box.id] && (
                    <>
                      <input
                        type="text"
                        value={box.text}
                        onChange={(e) => updateTextBox(box.id, { text: e.target.value })}
                        className="w-full rounded-md border border-black/10 bg-white px-3 py-2 text-sm shadow-inner shadow-black/5 outline-none transition focus:border-gold focus:ring-2 focus:ring-gold/30"
                      />
                      <div className="flex flex-wrap items-center gap-2">
                        <input
                          type="color"
                          aria-label={`${box.label} color`}
                          value={box.color}
                          onChange={(e) => updateTextBox(box.id, { color: e.target.value })}
                          className="h-10 w-14 cursor-pointer rounded-md border border-black/10 bg-white"
                        />
                        <input
                          type="number"
                          min={10}
                          max={48}
                          value={box.size}
                          onChange={(e) =>
                            updateTextBox(box.id, { size: Number.parseInt(e.target.value, 10) || box.size })
                          }
                          className="w-24 rounded-md border border-black/10 bg-white px-2 py-2 text-sm shadow-inner shadow-black/5 outline-none transition focus:border-gold focus:ring-2 focus:ring-gold/30"
                        />
                        <select
                          value={box.align}
                          onChange={(e) => updateTextBox(box.id, { align: e.target.value as TextBox["align"] })}
                          className="flex-1 rounded-md border border-black/10 bg-white px-2 py-2 text-sm shadow-inner shadow-black/5 outline-none transition focus:border-gold focus:ring-2 focus:ring-gold/30"
                        >
                          <option value="left">Left</option>
                          <option value="center">Center</option>
                          <option value="right">Right</option>
                        </select>
                        <button
                          type="button"
                          onClick={() => paid && updateTextBox(box.id, { textShadow: !box.textShadow })}
                          disabled={!paid}
                          className={`inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-semibold shadow-inner shadow-black/5 transition ${
                            paid
                              ? box.textShadow
                                ? "border-amber-300 bg-amber-100/80 text-midnight shadow-amber-200/60 hover:-translate-y-[1px] hover:shadow-md"
                                : "border-black/10 bg-white text-neutral-800 hover:-translate-y-[1px] hover:shadow"
                              : "cursor-not-allowed border-black/10 bg-neutral-100 text-neutral-400"
                          }`}
                          aria-pressed={!!box.textShadow}
                          aria-label={`Toggle text shadow for ${box.label}`}
                        >
                          Shadow
                        </button>
                        <button
                          type="button"
                          onClick={() => paid && updateTextBox(box.id, { textGlow: !box.textGlow })}
                          disabled={!paid}
                          className={`inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-semibold shadow-inner shadow-black/5 transition ${
                            paid
                              ? box.textGlow
                                ? "border-amber-300 bg-amber-50 text-midnight shadow-amber-200/80 hover:-translate-y-[1px] hover:shadow-md"
                                : "border-black/10 bg-white text-neutral-800 hover:-translate-y-[1px] hover:shadow"
                              : "cursor-not-allowed border-black/10 bg-neutral-100 text-neutral-400"
                          }`}
                          aria-pressed={!!box.textGlow}
                          aria-label={`Toggle text glow for ${box.label}`}
                        >
                          Glow
                        </button>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={addTextBox}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-black/15 bg-white/80 px-3 py-3 text-sm font-semibold text-neutral-700 shadow-sm transition hover:-translate-y-[1px] hover:shadow"
            >
              <span className="text-lg">＋</span>
              Add text line
            </button>

            <div>
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-neutral-800">Style</label>
                <span className="text-xs uppercase tracking-wide text-neutral-500">4 of 10 presets</span>
              </div>
              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                {styles.map((style) => (
                  <button
                    key={style.id}
                    type="button"
                    onClick={() => setStyle(style.id)}
                    className={`rounded-xl border px-3 py-3 text-left shadow-sm transition hover:-translate-y-[1px] hover:shadow-md ${
                      selectedStyle === style.id
                        ? "border-gold bg-amber-50/70 text-midnight"
                        : "border-black/10 bg-white/80 text-neutral-800"
                    }`}
                  >
                    <div className="text-sm font-semibold">{style.name}</div>
                    <div className="mt-1 text-xs text-neutral-600">{style.note}</div>
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2 rounded-2xl border border-black/5 bg-white/85 p-3 shadow-inner shadow-black/5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-neutral-900">Visual mode</p>
                  <p className="text-xs text-neutral-600">Paid unlock · choose the finish</p>
                </div>
                {!paid && (
                  <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-amber-700">
                    Paid
                  </span>
                )}
              </div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                {visualModes.map((mode) => {
                  const active = renderOptions.visualMode === mode.id;
                  const locked = !paid && mode.id !== "enhanced";
                  return (
                    <button
                      key={mode.id}
                      type="button"
                      disabled={locked}
                      onClick={() => {
                        if (!paid) return;
                        setRenderOptions({ visualMode: mode.id });
                        track("visual_mode_changed", { visualMode: mode.id, isPaid: paid });
                      }}
                      className={`rounded-xl border px-3 py-3 text-left text-sm shadow-sm transition ${
                        active ? "border-gold bg-amber-50" : "border-black/10 bg-white"
                      } ${locked ? "cursor-not-allowed opacity-60" : "hover:-translate-y-[1px] hover:shadow-md"}`}
                    >
                      <div className="font-semibold">{mode.label}</div>
                      <div className="text-xs text-neutral-600">{mode.description}</div>
                      {locked && <div className="mt-1 text-[10px] font-semibold text-amber-600">Unlock to use</div>}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-2 rounded-2xl border border-black/5 bg-white/85 p-3 shadow-inner shadow-black/5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-neutral-900">Constellations</p>
                  <p className="text-xs text-neutral-600">Paid unlock · lines and labels</p>
                </div>
                {!paid && (
                  <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-amber-700">
                    Paid
                  </span>
                )}
              </div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                {constellationPresets.map((preset) => {
                  const active = renderOptions.constellationLines === preset.id;
                  const locked = !paid && preset.id !== "thin";
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      disabled={locked}
                      onClick={() => paid && setRenderOptions({ constellationLines: preset.id })}
                      className={`rounded-xl border px-3 py-3 text-left text-sm shadow-sm transition ${
                        active ? "border-gold bg-amber-50" : "border-black/10 bg-white"
                      } ${locked ? "cursor-not-allowed opacity-60" : "hover:-translate-y-[1px] hover:shadow-md"}`}
                    >
                      <div className="font-semibold">{preset.label}</div>
                      <div className="text-xs text-neutral-600">{preset.note}</div>
                      {locked && <div className="mt-1 text-[10px] font-semibold text-amber-600">Unlock to use</div>}
                    </button>
                  );
                })}
              </div>
              <div className="flex items-center justify-between rounded-xl border border-black/5 bg-white/80 px-3 py-2">
                <div className="text-sm font-medium text-neutral-800">Constellation labels</div>
                <button
                  type="button"
                  disabled={!paid}
                  onClick={() => paid && setRenderOptions({ constellationLabels: !renderOptions.constellationLabels })}
                  className={`rounded-full border px-3 py-1.5 text-xs font-semibold uppercase tracking-wide transition ${
                    renderOptions.constellationLabels ? "border-gold bg-amber-50 text-midnight" : "border-black/10 bg-white text-neutral-700"
                  } ${!paid ? "cursor-not-allowed opacity-60" : "hover:-translate-y-[1px] hover:shadow"}`}
                >
                  {renderOptions.constellationLabels ? "Labels on" : "Labels off"}
                </button>
              </div>

              {!paid && (
                <div className="mt-3 space-y-2 rounded-xl border border-amber-200/70 bg-amber-50/80 px-4 py-3 text-neutral-800 shadow-sm">
                  <div className="text-sm font-semibold text-midnight">Instant unlock</div>
                  <ul className="list-disc pl-5 text-xs text-neutral-700">
                    <li>Print-ready 6000×6000 poster file</li>
                    <li>Illustrated & astronomical visual modes</li>
                    <li>Bold constellations, glow, labels</li>
                    <li>Customizable fonts</li>
                    <li>No watermark</li>
                  </ul>
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-amber-700">
                    One-time purchase · No subscription
                  </div>
                  <button
                    type="button"
                    onClick={() => setPaywallOpen(true)}
                    className="mt-2 inline-flex w-full items-center justify-center rounded-full bg-gradient-to-r from-amber-400 via-amber-500 to-amber-400 px-4 py-2 text-sm font-semibold text-midnight shadow-lg shadow-amber-200 transition hover:-translate-y-[1px] hover:shadow-xl focus:outline-none focus:ring-2 focus:ring-gold focus:ring-offset-2"
                  >
                    🔓 Unlock premium styles →
                  </button>
                  <div className="text-center text-[11px] font-semibold text-neutral-700">$9.99 · One-time purchase</div>
                </div>
              )}
            </div>

            <div className="space-y-2 rounded-2xl border border-black/5 bg-white/85 p-3 shadow-inner shadow-black/5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-neutral-900">Shape</p>
                  <p className="text-xs text-neutral-600">Drop custom SVGs into public/shapes/</p>
                </div>
                {!paid && (
                  <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-amber-700">
                    Paid
                  </span>
                )}
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="block text-sm font-medium text-neutral-800">Frame shape</label>
                  <select
                    value={shape}
                    onChange={(e) => {
                      const next = e.target.value as Shape;
                      if (!paid && next !== "rectangle") {
                        setPaywallOpen(true);
                        return;
                      }
                      setShape(next);
                    }}
                    className="mt-1 block w-full rounded-md border border-neutral-300 px-3 py-2 text-sm shadow-inner shadow-black/5 outline-none transition focus:border-gold focus:ring-2 focus:ring-gold/30"
                  >
                    {(paid ? shapes : shapes.filter((opt) => opt.id === "rectangle")).map((opt) => (
                      <option key={opt.id} value={opt.id}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                  <p className="mt-1 text-xs text-neutral-500">
                    Add more by dropping SVGs into public/shapes/ and adding their filenames here.
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <label className="text-sm font-semibold text-neutral-800">Background color</label>
                  <input
                    type="color"
                    value={renderOptions.backgroundColor || "#0b1a30"}
                    onChange={(e) => setRenderOptions({ backgroundColor: e.target.value })}
                    className="h-9 w-14 cursor-pointer rounded-md border border-black/10 bg-white shadow-inner shadow-black/5"
                  />
                </div>
              </div>
            </div>

            {!revealed && (
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={handleReveal}
                  className={`inline-flex w-full items-center justify-center gap-2 rounded-full px-4 py-3 text-sm font-semibold text-midnight shadow-lg shadow-amber-200 transition hover:-translate-y-[1px] hover:shadow-xl focus:outline-none focus:ring-2 focus:ring-gold focus:ring-offset-2 focus:ring-offset-white ${
                    canReveal && hasDate
                      ? "bg-gradient-to-r from-amber-400 via-amber-500 to-amber-400"
                      : "cursor-pointer bg-neutral-200 text-neutral-600 shadow-none"
                  }`}
                  aria-disabled={!canReveal || !hasDate}
                >
                  ✨ Find your special moment
                </button>
                {(!canReveal || !hasDate) && (
                  <p className="text-xs text-neutral-500">
                    Please enter a location and date to reveal your sky.
                  </p>
                )}
              </div>
            )}
          </div>
        </section>
      </div>
      {paywallOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl shadow-black/20">
            <h3 className="text-lg font-semibold text-midnight">Download your print-ready star map</h3>
            <ul className="mt-3 space-y-1 text-sm text-neutral-700">
              <li>• 6000px high resolution (poster quality)</li>
              <li>• No watermark</li>
              <li>• Instant digital download</li>
              <li>• One-time payment — $9.99 USD</li>
              <li className="text-xs text-neutral-500">Secure checkout · No subscription</li>
            </ul>
            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setPaywallOpen(false);
                  setPendingExport(null);
                }}
                className="rounded-full border border-black/10 bg-white px-3 py-2 text-sm font-semibold text-neutral-700 shadow-sm transition hover:-translate-y-[1px] hover:shadow"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={startCheckout}
                className="rounded-full bg-gradient-to-r from-amber-400 via-amber-500 to-amber-400 px-4 py-2 text-sm font-semibold text-midnight shadow-md transition hover:-translate-y-[1px] hover:shadow-lg"
              >
                Continue to secure checkout
              </button>
            </div>
          </div>
        </div>
      )}
      {shareLink && (
        <div className="fixed bottom-4 left-1/2 z-40 w-[90%] max-w-xl -translate-x-1/2 rounded-full bg-white/90 px-4 py-2 text-center text-xs font-semibold text-neutral-800 shadow-lg">
          Link copied: {shareLink}
        </div>
      )}
      {isFullscreen && (
        <div className="fixed inset-0 z-50 bg-gradient-to-b from-[#0b1a30] via-[#050b18] to-[#0b1a30] p-4 sm:p-6">
          <div className="relative mx-auto flex h-full max-w-6xl flex-col gap-3">
            <button
              type="button"
              onClick={() => {
                setIsFullscreen(false);
                requestAnimationFrame(() => {
                  previewRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
                });
              }}
              className="self-start rounded-full border border-white/20 bg-white/90 px-4 py-2 text-sm font-semibold text-neutral-800 shadow transition hover:-translate-y-[1px] hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-gold focus:ring-offset-2 focus:ring-offset-[#0b1a30]"
              aria-label="Exit fullscreen"
            >
              ⤡ Exit fullscreen
            </button>
            <div className="flex-1 overflow-hidden rounded-2xl border border-white/10 bg-white/5 shadow-2xl">
              <PreviewCanvas />
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
