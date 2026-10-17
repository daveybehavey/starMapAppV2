"use client";

import { create } from "zustand";
import {
  maybeRebaseUntouchedDefaultOnTimezoneChange,
  resolveBrowserTimeZone,
} from "./dateTime";
import type { MapLookTier } from "./mapLookTiers";
import type { AspectRatio, Shape } from "./types";

export type StyleId =
  | "navyGold"
  | "vintageEngraving"
  | "parchmentScroll"
  | "midnightMinimal";

export type TextAlign = "left" | "center" | "right";

export interface TextBox {
  id: string;
  label: string;
  text: string;
  fontFamily:
    | "playfair"
    | "cinzel"
    | "script"
    | "cormorant"
    | "montserrat"
    | "libreBaskerville"
    | "ebGaramond"
    | "crimsonText"
    | "lora"
    | "raleway"
    | "poppins"
    | "dancingScript"
    | "parisienne"
    | "bebasNeue"
    | "abrilFatface";
  color: string;
  size: number;
  fontWeight?: number;
  align: TextAlign;
  textShadow?: boolean;
  textGlow?: boolean;
  position?: {
    x: number; // 0-1 relative horizontal position
    y: number; // 0-1 relative vertical position
  };
}

export interface LocationState {
  name: string;
  latitude: number;
  longitude: number;
  timezone: string;
}

export type VisualMode = "astronomical" | "enhanced" | "illustrated";
export type ConstellationLines = "off" | "thin" | "thick";
export type { MapLookTier, ExportMatPurpose } from "./mapLookTiers";

export interface RenderOptions {
  /** Product tier: minimal (flat/clean), polished (signature look), or custom knobs. */
  mapLookTier?: MapLookTier;
  visualMode: VisualMode;
  starIntensity: "subtle" | "normal" | "bold";
  starGlow: boolean;
  constellationLines: ConstellationLines;
  constellationLabels: boolean;
  showGrid: boolean;
  showPlanets: boolean;
  premiumStars: "off" | "subtle" | "realistic";
  premiumPlanets: "off" | "realistic";
  planetEmphasis: "normal" | "highlighted";
  showMoon: boolean;
  moonSize: "normal" | "large";
  shapeMask: "rectangle" | "circle" | "heart" | "star" | "diamond";
  frameEnabled: boolean;
  backgroundColor?: string;
  constellationColor?: string;
  constellationLineScale?: number;
  /** Skip outer mat fill on export/preview — sky clip only (minimal tier). */
  transparentBackground?: boolean;
  /** Subtle degree ring overlay (polished tier accent). */
  showTechnicalRing?: boolean;
}

/** Last sample-design texts written by picker auto-sync (not manual edits). */
export type SampleDesignLastAutoSyncedState = {
  subtitle: string | null;
  dedication: string | null;
};

export interface EditorState {
  dateTime: string;
  /**
   * True while date/time is still the pre-populated evening default the user has
   * not edited. Location timezone changes rebase that default to 21:00 local.
   */
  dateTimeIsUntouchedDefault: boolean;
  location: LocationState;
  textBoxes: TextBox[];
  /** Last auto-synced subtitle/dedication values for repeatable sample sync. */
  sampleDesignLastAutoSynced: SampleDesignLastAutoSyncedState;
  selectedStyle: StyleId;
  aspectRatio: AspectRatio;
  shape: Shape;
  renderOptions: RenderOptions;
  previewFidelity: "standard" | "high";
  paid: boolean;
  revealed: boolean;
  setDateTime: (dateTime: string) => void;
  setLocation: (location: Partial<LocationState>) => void;
  setTextBoxes: (boxes: TextBox[]) => void;
  updateTextBox: (id: string, payload: Partial<TextBox>) => void;
  removeTextBox: (id: string) => void;
  addTextBox: () => void;
  setSampleDesignLastAutoSynced: (next: Partial<SampleDesignLastAutoSyncedState>) => void;
  clearSampleDesignLastAutoSynced: () => void;
  setStyle: (style: StyleId) => void;
  setAspectRatio: (aspectRatio: AspectRatio) => void;
  setShape: (shape: Shape) => void;
  setRenderOptions: (options: Partial<RenderOptions>) => void;
  setPreviewFidelity: (fidelity: EditorState["previewFidelity"]) => void;
  setPaid: (paid: boolean) => void;
  setRevealed: (revealed: boolean) => void;
}

const EMPTY_SAMPLE_DESIGN_LAST_AUTO_SYNCED: SampleDesignLastAutoSyncedState = {
  subtitle: null,
  dedication: null,
};

const initialDate = (() => {
  const now = new Date();
  // Match DEFAULT_TIME (9:00 PM) so a blank exact-time field stays consistent.
  now.setHours(21, 0, 0, 0);
  return now;
})();

/** Unset DEFAULT_RECIPE coords — same sentinel as checkoutSkyGuard / editor prefill. */
function isInitialPlaceholderLocation(location: LocationState): boolean {
  return location.latitude === 0 && location.longitude === 0;
}

const storeImpl = (set: (partial: Partial<EditorState> | ((state: EditorState) => Partial<EditorState>)) => void): EditorState => ({
  dateTime: initialDate.toISOString(),
  dateTimeIsUntouchedDefault: true,
  location: {
    name: "",
    latitude: 0,
    longitude: 0,
    // Timezone-of-record for the untouched evening default matches browser-local
    // construction of initialDate (not a real selected sky until coords change).
    timezone: resolveBrowserTimeZone(),
  },
  aspectRatio: "square",
  shape: "rectangle",
  textBoxes: [
    {
      id: "title",
      label: "Title",
      text: "Our Night Sky",
      fontFamily: "cinzel",
      color: "#d7b56c", // cinematic gold
      size: 48,
      align: "center",
      textShadow: false,
      textGlow: false,
      position: { x: 0.5, y: 0.12 },
    },
    {
      id: "subtitle",
      label: "Subtitle",
      text: "Under the vintage stars",
      fontFamily: "raleway",
      color: "#c8a662", // softer gold accent for subtitle
      size: 28,
      align: "center",
      textShadow: false,
      textGlow: false,
      position: { x: 0.5, y: 0.18 },
    },
    {
      id: "dedication",
      label: "Dedication",
      text: "Celebrating our constellation of moments.",
      fontFamily: "script",
      color: "#b98a3d", // deeper gold tone for dedication line
      size: 26,
      align: "center",
      textShadow: false,
      textGlow: false,
      position: { x: 0.5, y: 0.9 },
    },
  ],
  sampleDesignLastAutoSynced: { ...EMPTY_SAMPLE_DESIGN_LAST_AUTO_SYNCED },
  selectedStyle: "navyGold",
  renderOptions: {
    mapLookTier: "polished",
    visualMode: "enhanced",
    starIntensity: "normal",
    starGlow: true,
    constellationLines: "thin",
    constellationLabels: false,
    showGrid: false,
    showPlanets: true,
    premiumStars: "off",
    premiumPlanets: "off",
    planetEmphasis: "highlighted",
    showMoon: true,
    moonSize: "large",
    shapeMask: "circle",
    frameEnabled: true,
    backgroundColor: "",
    constellationColor: "",
    constellationLineScale: 1.1,
  },
  previewFidelity: "standard",
  paid: false,
  revealed: false,
  setDateTime: (dateTime) => set({ dateTime, dateTimeIsUntouchedDefault: false }),
  setLocation: (location) =>
    set((state) => {
      const nextLocation = { ...state.location, ...location };
      const nextDateTime = maybeRebaseUntouchedDefaultOnTimezoneChange({
        dateTimeIso: state.dateTime,
        previousTimezone: state.location.timezone,
        nextTimezone: nextLocation.timezone,
        dateTimeIsUntouchedDefault: state.dateTimeIsUntouchedDefault,
        isInitialPlaceholder: isInitialPlaceholderLocation(state.location),
      });
      return {
        location: nextLocation,
        dateTime: nextDateTime,
      };
    }),
  setTextBoxes: (boxes) => set({ textBoxes: boxes }),
  updateTextBox: (id, payload) =>
    set((state) => ({
      textBoxes: state.textBoxes.map((box) =>
        box.id === id ? { ...box, ...payload } : box,
      ),
    })),
  removeTextBox: (id) =>
    set((state) => ({
      textBoxes: state.textBoxes.filter((box) => box.id !== id),
    })),
  addTextBox: () =>
    set((state) => {
      const nextIndex = state.textBoxes.length + 1;
      const newBox: TextBox = {
        id: `custom-${Date.now()}`,
        label: `Line ${nextIndex}`,
        text: "New text",
        fontFamily: "playfair",
        color: "#0c1021",
        size: 28,
        align: "center",
        position: { x: 0.5, y: Math.min(0.85, 0.7 + nextIndex * 0.06) },
      };
      return { textBoxes: [...state.textBoxes, newBox] };
    }),
  setSampleDesignLastAutoSynced: (next) =>
    set((state) => ({
      sampleDesignLastAutoSynced: {
        ...state.sampleDesignLastAutoSynced,
        ...next,
      },
    })),
  clearSampleDesignLastAutoSynced: () =>
    set({ sampleDesignLastAutoSynced: { ...EMPTY_SAMPLE_DESIGN_LAST_AUTO_SYNCED } }),
  setStyle: (selectedStyle) => set({ selectedStyle }),
  setAspectRatio: (aspectRatio) => set({ aspectRatio }),
  setShape: (shape) => set({ shape }),
  setRenderOptions: (options) =>
    set((state) => ({ renderOptions: { ...state.renderOptions, ...options } })),
  setPreviewFidelity: (previewFidelity) => set({ previewFidelity }),
  setPaid: (paid) => set({ paid }),
  setRevealed: (revealed) => set({ revealed }),
});

export const useStore = create<EditorState>(storeImpl);

// Expose store globally for testing/export scripts in development
if (typeof window !== "undefined" && process.env.NODE_ENV !== "production") {
  (window as unknown as { __ZUSTAND_STORE__: typeof useStore }).__ZUSTAND_STORE__ = useStore;
}
