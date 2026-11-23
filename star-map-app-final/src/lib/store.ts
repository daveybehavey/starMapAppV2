"use client";

import { create } from "zustand";
import {
  maybeRebaseUntouchedDefaultOnTimezoneChange,
  resolveBrowserTimeZone,
} from "./dateTime";
import type { MapLookTier } from "./mapLookTiers";
import {
  applyDefaultTextRowsForShape,
  remapDefaultTextRowsForFootprintChange,
} from "./textFit";
import { resolveShapeMaskFootprint } from "./shapeLayout";
import { getStyleTextDefaults } from "./styleDefaults";
import {
  AUTOMATIC_TEXT_STYLE_BINDING,
  cloneTextBoxWithNormalizedBinding,
  normalizeTextStyleBinding,
} from "./textStyleBinding";
import type { AspectRatio, Shape } from "./types";
import type { RenderModeId } from "./renderModes";

export type StyleId =
  | "navyGold"
  | "vintageEngraving"
  | "evergreenAtlas"
  | "parchmentScroll"
  | "midnightMinimal";

export type TextAlign = "left" | "center" | "right";

/**
 * Per-property ownership of a text box's typography (issue #408).
 * "automatic" follows style defaults / tier typography; "explicit" is
 * user- or preset-authored and automatic layers must not overwrite it.
 * A missing binding resolves to explicit per property (see textStyleBinding.ts).
 */
export interface TextStyleBinding {
  color: "automatic" | "explicit";
  fontFamily: "automatic" | "explicit";
  fontWeight: "automatic" | "explicit";
}

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
  textStyleBinding?: TextStyleBinding;
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
  /** Absent preserves style defaults, including historical premium-star colors. */
  starColorMode?: "fixed" | "spectral";
  constellationLines: ConstellationLines;
  constellationLabels: boolean;
  planetLabels: boolean;
  showGrid: boolean;
  showPlanets: boolean;
  premiumStars: "off" | "subtle" | "realistic";
  premiumPlanets: "off" | "realistic";
  planetEmphasis: "normal" | "highlighted";
  showMoon: boolean;
  moonSize: "normal" | "large";
  shapeMask: "rectangle" | "circle" | "heart" | "star" | "diamond";
  /**
   * Shape-mask layout version (#406, SQ-02): 2 renders the path
   * shapes (heart/star/diamond) with uniform contain scaling —
   * proportionate silhouettes at every aspect, mat fills the
   * remainder. Absent or 1 is the historical independent X/Y stretch.
   * New designs are stamped 2 (see the store's initial state); a
   * saved design's stored value — including its absence — is carried
   * through verbatim and never silently converted.
   */
  shapeLayoutVersion?: number;
  frameEnabled: boolean;
  /**
   * Frame rule style (PROD-SM W3-5, #503): "classic" is the single
   * rule every design has always rendered; "double" adds a second
   * hairline rule outside it; "hairline" is a single fine rule.
   * Absent means classic — a saved design's stored value, including
   * its absence, is carried verbatim (see frameStyle.ts).
   */
  frameStyle?: "classic" | "double" | "hairline";
  /** Background-only sky brightness: 1 darkest, 9 city sky; absent means 4.5. */
  bortleClass?: number;
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
  /**
   * Monotonic count of recipe-state changes (S93-2 class 5 /
   * S96-2 F7). Advanced SYNCHRONOUSLY inside the store's setState
   * notification whenever a recipe field (dateTime, location,
   * textBoxes, selectedStyle, aspectRatio, shape, renderOptions,
   * selectedOccasion) or a recipe-intent field (renderMode,
   * intensity, intensityDisplay) actually changes — see the
   * subscription below — or via bumpEditGeneration().
   * EditorExperience's hydration guard reads it via
   * useStore.getState() at fetch start and again when the response
   * arrives; because the advance happens inside the mutation call
   * itself, no response continuation can observe a pre-edit value.
   * The editor's own automatic initialization writes (draft
   * restore, URL prefill, the first visual-options application)
   * run inside runAsSystemWrite() and never advance it, so the
   * guard can anchor its baseline at restore completion and treat
   * ANY later advance as user work (audit B-01).
   */
  editGeneration: number;
  previewFidelity: "standard" | "high";
  paid: boolean;
  revealed: boolean;
  /**
   * The persisted occasion selection (a recipe field — it is
   * serialized into the draft). Store-resident so every editor
   * surface reads and writes the SAME value: it lived in
   * useEditorLogic's per-instance useState, and the desktop and
   * mobile hook instances held divergent copies whose competing
   * draft writes lost selections (audit B-03).
   */
  selectedOccasion: string | null;
  /**
   * Render-mode / intensity intent. These fields are not part of
   * the persisted recipe — they DERIVE five renderOptions fields
   * via useEditorLogic.applyVisualOptions — but they are design
   * intent all the same: changing them must count as an edit the
   * moment the setter runs, not ~150 ms later when the derived
   * write lands (audit B-05, the S96-2 F7 class). Store-resident
   * so the desktop and mobile surfaces share one mode/intensity
   * instead of each hook instance initializing its own and the
   * second instance's mount writes overwriting the first surface's
   * choices in the shared store (audit B-04).
   */
  renderMode: RenderModeId;
  intensity: number;
  intensityDisplay: number;
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
  setSelectedOccasion: (id: string | null) => void;
  setRenderMode: (mode: RenderModeId) => void;
  setIntensity: (value: number) => void;
  setIntensityDisplay: (value: number) => void;
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
      textStyleBinding: { ...AUTOMATIC_TEXT_STYLE_BINDING },
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
      textStyleBinding: { ...AUTOMATIC_TEXT_STYLE_BINDING },
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
      textStyleBinding: { ...AUTOMATIC_TEXT_STYLE_BINDING },
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
    planetLabels: false,
    showGrid: false,
    showPlanets: true,
    premiumStars: "off",
    premiumPlanets: "off",
    planetEmphasis: "highlighted",
    showMoon: true,
    moonSize: "large",
    shapeMask: "rectangle",
    // #406: a fresh editor session is a NEW design, so it is stamped
    // with the uniform shape layout. Hydration of a saved design or
    // draft overwrites this explicitly with the stored value (absent
    // = legacy) — see EditorExperience / SimplifiedEditor.
    shapeLayoutVersion: 2,
    frameEnabled: true,
    bortleClass: 4.5,
    backgroundColor: "",
    constellationColor: "",
    constellationLineScale: 1.1,
  },
  editGeneration: 0,
  previewFidelity: "standard",
  paid: false,
  revealed: false,
  selectedOccasion: null,
  // The quick variant's defaults (cinematic, 70) — the only
  // variant mounted in production. The driving useEditorLogic
  // instance seeds the full variant's 50 on first mount via
  // seedEditorIntensityDefaults below.
  renderMode: "cinematic",
  intensity: 70,
  intensityDisplay: 70,
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
  setTextBoxes: (boxes) =>
    set({ textBoxes: boxes.map((box) => cloneTextBoxWithNormalizedBinding(box)) }),
  updateTextBox: (id, payload) =>
    set((state) => ({
      textBoxes: state.textBoxes.map((box) => {
        if (box.id !== id) return box;
        // Own-property presence marks a typography property explicit: this
        // is the user-edit boundary. A payload can never set the binding
        // itself, and non-typography payloads preserve ownership as-is.
        const binding = normalizeTextStyleBinding(box.textStyleBinding);
        if (Object.prototype.hasOwnProperty.call(payload, "color")) {
          binding.color = "explicit";
        }
        if (Object.prototype.hasOwnProperty.call(payload, "fontFamily")) {
          binding.fontFamily = "explicit";
        }
        if (Object.prototype.hasOwnProperty.call(payload, "fontWeight")) {
          binding.fontWeight = "explicit";
        }
        const nextPayload: Partial<TextBox> = { ...payload };
        delete nextPayload.textStyleBinding;
        return { ...box, ...nextPayload, textStyleBinding: binding };
      }),
    })),
  removeTextBox: (id) =>
    set((state) => ({
      textBoxes: state.textBoxes.filter((box) => box.id !== id),
    })),
  addTextBox: () =>
    set((state) => {
      const nextIndex = state.textBoxes.length + 1;
      // New lines take the selected template's designed text colour/font
      // (#408: the old hardcoded playfair/#0c1021 was invisible on dark
      // templates) and stay automatic so later style switches keep them
      // readable on the new template too.
      const textDefaults = getStyleTextDefaults(state.selectedStyle);
      const newBox: TextBox = {
        id: `custom-${Date.now()}`,
        label: `Line ${nextIndex}`,
        text: "New text",
        fontFamily: textDefaults.fontFamily,
        color: textDefaults.color,
        textStyleBinding: { ...AUTOMATIC_TEXT_STYLE_BINDING },
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
  setAspectRatio: (aspectRatio) =>
    set((state) => {
      // #407 (Codex P2 on PR #432): heart/star default rows are
      // stored converted through the footprint of the aspect in
      // force; remap untouched defaults through the footprint
      // change so the next shape switch still recognises them.
      const parseAspect = (value: string): [number, number] =>
        value === "square" ? [1, 1] : (value.split(":").map(Number) as [number, number]);
      const [fromW, fromH] = parseAspect(state.aspectRatio);
      const [toW, toH] = parseAspect(aspectRatio);
      const version = state.renderOptions.shapeLayoutVersion;
      return {
        aspectRatio,
        textBoxes: remapDefaultTextRowsForFootprintChange(
          state.textBoxes,
          state.shape,
          resolveShapeMaskFootprint(fromW, fromH, version),
          resolveShapeMaskFootprint(toW, toH, version),
          fromH,
          toH,
        ),
      };
    }),
  // renderOptions.shapeMask mirrors the selected shape: legacy readers
  // (recipe hydration, older drafts) resolve the shape from the mask, so
  // the two must never disagree (fleet U14: mask stayed "circle" for
  // every shape while `shape` was correct).
  setShape: (shape) =>
    set((state) => {
      // #407: the heart/star default rows are mask-authored, so the
      // migration converts them through the design's layout — the
      // mask footprint for the CURRENT aspect under the design's
      // persisted layout version. Aspect-ratio parts are used as the
      // canvas (any canvas of this aspect gives identical row
      // fractions), so every caller derives the same rows.
      const [aspectW, aspectH] =
        state.aspectRatio === "square"
          ? [1, 1]
          : state.aspectRatio.split(":").map(Number);
      return {
        shape,
        renderOptions: { ...state.renderOptions, shapeMask: shape },
        // Designed boxes still sitting on the previous shape's DEFAULT
        // rows follow the shape (fleet PR #16: on diamond the standard
        // rows sit in the apex zones). Boxes the user moved — or that a
        // preset authored — are user data and stay put; see
        // applyDefaultTextRowsForShape in textFit.ts.
        textBoxes: applyDefaultTextRowsForShape(
          state.textBoxes,
          shape,
          resolveShapeMaskFootprint(
            aspectW,
            aspectH,
            state.renderOptions.shapeLayoutVersion,
          ),
          aspectH,
        ),
      };
    }),
  setRenderOptions: (options) =>
    set((state) => ({ renderOptions: { ...state.renderOptions, ...options } })),
  setPreviewFidelity: (previewFidelity) => set({ previewFidelity }),
  setPaid: (paid) => set({ paid }),
  setRevealed: (revealed) => set({ revealed }),
  setSelectedOccasion: (selectedOccasion) => set({ selectedOccasion }),
  setRenderMode: (renderMode) => set({ renderMode }),
  setIntensity: (intensity) => set({ intensity }),
  setIntensityDisplay: (intensityDisplay) => set({ intensityDisplay }),
});

export const useStore = create<EditorState>(storeImpl);

/**
 * The recipe fields whose change counts as an edit for the
 * hydration guard — the store-resident subset of the field set
 * EditorExperience's S93-2 wiring tracked (selectedOccasion is
 * hook-local state and bumps the same counter from its setter in
 * useEditorLogic).
 */
const RECIPE_EDIT_FIELDS = [
  "dateTime",
  "location",
  "textBoxes",
  "selectedStyle",
  "aspectRatio",
  "shape",
  "renderOptions",
  "selectedOccasion",
] as const satisfies readonly (keyof EditorState)[];

/**
 * Recipe-INTENT fields: not persisted in the recipe itself, but a
 * change to any of them is user design work the hydration guard
 * must respect the moment it happens (audit B-05). They advance
 * the same generation, through the same subscription.
 */
const INTENT_EDIT_FIELDS = [
  "renderMode",
  "intensity",
  "intensityDisplay",
] as const satisfies readonly (keyof EditorState)[];

/**
 * System-write scope (audit B-01). The editor's AUTOMATIC
 * writes — the draft restore, the URL prefill, the hook's
 * derived visual-options applications, and the display→intensity
 * sync (whose unpaid premium cap fires with no user gesture) —
 * run inside runAsSystemWrite(). While the scope is active the
 * generation does not advance: initialization is not user work,
 * and the hydration baseline is anchored at restore completion,
 * so a user edit that lands at ANY point after restore — even
 * before the hydration fetch starts — advances the generation
 * past the baseline and defeats late hydration. Zustand notifies
 * subscribers synchronously inside setState, so a synchronous
 * try/finally scope is exact: every write performed by fn is
 * observed inside the scope, and no write outside it can be.
 * Callers must pass a fully synchronous fn — a write deferred
 * past fn's return (timer, promise continuation) is a user-path
 * write and counts as an edit.
 */
let systemWriteDepth = 0;

export function runAsSystemWrite<T>(fn: () => T): T {
  systemWriteDepth += 1;
  try {
    return fn();
  } finally {
    systemWriteDepth -= 1;
  }
}

/**
 * Advance the edit generation by one. Store-resident fields
 * advance it through the subscription below, never by calling
 * this directly; the export remains as the synchronous-advance
 * seam for any future field that must live outside this store.
 * A no-op inside a system-write scope.
 */
export function bumpEditGeneration(): void {
  if (systemWriteDepth > 0) return;
  useStore.setState((state) => ({
    editGeneration: state.editGeneration + 1,
  }));
}

// S96-2 F7: advance the edit generation SYNCHRONOUSLY with every
// recipe mutation. The S93-2 guard originally counted edits in a
// passive React effect in EditorExperience (a useEffect keyed on
// the recipe fields): an edit that landed after the hydration
// fetch started but before that effect ran left the generation
// unchanged, so the late response still passed the guard and
// overwrote the edit. Zustand notifies subscribers synchronously
// inside setState — before the mutating call returns — so a
// generation read at any later moment (including a fetch
// continuation, which can only run after the current synchronous
// stack unwinds) already includes every edit made so far. The
// window is closed by construction, for every write path: store
// actions, the draft restore's direct useStore.setState, and any
// future caller. The bump's own setState changes only
// editGeneration, so the listener observes no recipe-field change
// for it and does not recurse. System writes (above) are the one
// deliberate exception: they are initialization, not edits.
useStore.subscribe((state, prevState) => {
  if (systemWriteDepth > 0) return;
  for (const field of RECIPE_EDIT_FIELDS) {
    if (!Object.is(state[field], prevState[field])) {
      bumpEditGeneration();
      return;
    }
  }
  for (const field of INTENT_EDIT_FIELDS) {
    if (!Object.is(state[field], prevState[field])) {
      bumpEditGeneration();
      return;
    }
  }
});

let intensityDefaultsSeeded = false;

/**
 * Seed the intensity defaults for the editor variant in use, once
 * per page session. The store's initial values carry the quick
 * variant's defaults (cinematic mode at 70 — the variant mounted
 * in production); the driving useEditorLogic instance calls this
 * on mount with its own variant's default so the full variant
 * still starts at 50 without every hook instance re-imposing its
 * own initial values on mount (audit B-04). A system write:
 * seeding is initialization, not an edit.
 */
export function seedEditorIntensityDefaults(value: number): void {
  if (intensityDefaultsSeeded) return;
  intensityDefaultsSeeded = true;
  if (
    useStore.getState().intensity === value &&
    useStore.getState().intensityDisplay === value
  ) {
    return;
  }
  runAsSystemWrite(() => {
    useStore.setState({ intensity: value, intensityDisplay: value });
  });
}

// Expose store globally for testing/export scripts in development
if (typeof window !== "undefined" && process.env.NODE_ENV !== "production") {
  (window as unknown as { __ZUSTAND_STORE__: typeof useStore }).__ZUSTAND_STORE__ = useStore;
}
