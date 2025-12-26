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
  fontFamily: "playfair" | "cinzel" | "script" | "cormorant" | "montserrat";
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
  showPlanets: boolean;
  planetEmphasis: "normal" | "highlighted";
  showMoon: boolean;
  moonSize: "normal" | "large";
  colorTheme: "night" | "midnight" | "vintage" | "emerald";
  typography: "classic" | "elegant" | "script";
  textLayout: "center" | "top" | "bottom";
  shapeMask: "none" | "circle" | "heart" | "diamond" | "ring";
  backgroundColor?: string;
}

export interface EditorState {
  dateTime: string;
  location: LocationState;
  textBoxes: TextBox[];
  selectedStyle: StyleId;
  aspectRatio: AspectRatio;
  shape: Shape;
  renderOptions: RenderOptions;
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
  setPaid: (paid: boolean) => void;
  setRevealed: (revealed: boolean) => void;
}

const initialDate = (() => {
  const now = new Date();
  now.setHours(23, 59, 59, 0);
  return now;
})();

export const useStore = create<EditorState>((set) => ({
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
      fontFamily: "playfair",
      color: "#d9b56f", // warm gold for main title
      size: 40,
      align: "center",
      textShadow: false,
      textGlow: false,
      position: { x: 0.5, y: 0.12 },
    },
    {
      id: "subtitle",
      label: "Subtitle",
      text: "Under the vintage stars",
      fontFamily: "cinzel",
      color: "#c7a35a", // softer gold accent for subtitle
      size: 24,
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
      color: "#b8893f", // deeper gold tone for dedication line
      size: 26,
      align: "center",
      textShadow: false,
      textGlow: false,
      position: { x: 0.5, y: 0.9 },
    },
  ],
  selectedStyle: "navyGold",
  renderOptions: {
    visualMode: "enhanced",
    starIntensity: "normal",
    starGlow: false,
    constellationLines: "thin",
    constellationLabels: false,
    showPlanets: true,
    planetEmphasis: "normal",
    showMoon: true,
    moonSize: "normal",
    colorTheme: "night",
    typography: "classic",
    textLayout: "center",
    shapeMask: "circle",
    backgroundColor: "",
  },
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
        size: 18,
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
  setPaid: (paid) => set({ paid }),
  setRevealed: (revealed) => set({ revealed }),
}));
