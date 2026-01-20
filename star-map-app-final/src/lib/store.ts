"use client";

import { create } from "zustand";
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

export interface RenderOptions {
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
  shapeMask: "none" | "circle" | "heart" | "diamond" | "ring";
  frameEnabled: boolean;
  backgroundColor?: string;
  constellationColor?: string;
  constellationLineScale?: number;
}

export interface EditorState {
  dateTime: string;
  location: LocationState;
  textBoxes: TextBox[];
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
  setStyle: (style: StyleId) => void;
  setAspectRatio: (aspectRatio: AspectRatio) => void;
  setShape: (shape: Shape) => void;
  setRenderOptions: (options: Partial<RenderOptions>) => void;
  setPreviewFidelity: (fidelity: EditorState["previewFidelity"]) => void;
  setPaid: (paid: boolean) => void;
  setRevealed: (revealed: boolean) => void;
}

const initialDate = (() => {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return now;
})();

const storeImpl = (set: (partial: Partial<EditorState> | ((state: EditorState) => Partial<EditorState>)) => void): EditorState => ({
  dateTime: initialDate.toISOString(),
  location: {
    name: "",
    latitude: 0,
    longitude: 0,
    timezone: "UTC",
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
  selectedStyle: "navyGold",
  renderOptions: {
    visualMode: "illustrated",
    starIntensity: "bold",
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
  setDateTime: (dateTime) => set({ dateTime }),
  setLocation: (location) =>
    set((state) => ({ location: { ...state.location, ...location } })),
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
if (typeof window !== "undefined") {
  (window as unknown as { __ZUSTAND_STORE__: typeof useStore }).__ZUSTAND_STORE__ = useStore;
}
