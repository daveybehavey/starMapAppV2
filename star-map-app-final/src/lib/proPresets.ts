/**
 * Pro Presets - Curated looks with balanced typography.
 * Shared between MobileCreate and EditorExperience components.
 */

import type { TextBox, StyleId, RenderOptions } from "./store";
import type { RenderModeId } from "./renderModes";
import type { AspectRatio, Shape } from "./types";

export interface ProPreset {
  id: string;
  label: string;
  note: string;
  thumbnail: string;
  style: StyleId;
  renderMode: RenderModeId;
  intensity: number;
  shape: Shape;
  aspectRatio: AspectRatio;
  renderOptions: Partial<RenderOptions>;
  textBoxes: TextBox[];
}

export const proPresets: ProPreset[] = [
  {
    id: "aurora",
    label: "Aurora Night",
    note: "Cinematic glow + gold",
    thumbnail: "/presets/preset-aurora.svg",
    style: "navyGold",
    renderMode: "cinematic",
    intensity: 85,
    shape: "circle",
    aspectRatio: "square",
    renderOptions: {
      frameEnabled: true,
      constellationLineScale: 1.2,
      showMoon: true,
    },
    textBoxes: [
      {
        id: "title",
        label: "Title",
        text: "The Aurora Sky",
        fontFamily: "cinzel",
        color: "#d7b56c",
        size: 48,
        align: "center",
        position: { x: 0.5, y: 0.12 },
      },
      {
        id: "subtitle",
        label: "Subtitle",
        text: "Reykjavik • 17.03.2024",
        fontFamily: "raleway",
        color: "#c8a662",
        size: 26,
        align: "center",
        position: { x: 0.5, y: 0.18 },
      },
      {
        id: "dedication",
        label: "Dedication",
        text: "A moment framed in starlight.",
        fontFamily: "script",
        color: "#b98a3d",
        size: 26,
        align: "center",
        position: { x: 0.5, y: 0.9 },
      },
    ],
  },
  {
    id: "noir",
    label: "Noir Minimal",
    note: "Clean, high contrast",
    thumbnail: "/presets/preset-noir.svg",
    style: "midnightMinimal",
    renderMode: "classic",
    intensity: 45,
    shape: "rectangle",
    aspectRatio: "4:5",
    renderOptions: {
      frameEnabled: true,
      constellationLineScale: 0.9,
      showMoon: false,
    },
    textBoxes: [
      {
        id: "title",
        label: "Title",
        text: "Midnight",
        fontFamily: "bebasNeue",
        color: "#e5eefb",
        size: 54,
        align: "center",
        position: { x: 0.5, y: 0.14 },
      },
      {
        id: "subtitle",
        label: "Subtitle",
        text: "New York • 11.12.2011",
        fontFamily: "montserrat",
        color: "#b6c7e6",
        size: 20,
        align: "center",
        position: { x: 0.5, y: 0.2 },
      },
      {
        id: "dedication",
        label: "Dedication",
        text: "Under a quiet sky.",
        fontFamily: "crimsonText",
        color: "#94a8c7",
        size: 22,
        align: "center",
        position: { x: 0.5, y: 0.9 },
      },
    ],
  },
  {
    id: "heirloom",
    label: "Heirloom",
    note: "Warm vintage glow",
    thumbnail: "/presets/preset-heirloom.svg",
    style: "parchmentScroll",
    renderMode: "luxe",
    intensity: 70,
    shape: "rectangle",
    aspectRatio: "square",
    renderOptions: {
      frameEnabled: true,
      constellationLineScale: 1.05,
      showMoon: true,
    },
    textBoxes: [
      {
        id: "title",
        label: "Title",
        text: "Forever",
        fontFamily: "abrilFatface",
        color: "#7b5c24",
        size: 46,
        align: "center",
        position: { x: 0.5, y: 0.14 },
      },
      {
        id: "subtitle",
        label: "Subtitle",
        text: "Florence • 02.09.1999",
        fontFamily: "cormorant",
        color: "#8c6b31",
        size: 24,
        align: "center",
        position: { x: 0.5, y: 0.2 },
      },
      {
        id: "dedication",
        label: "Dedication",
        text: "An heirloom in the making.",
        fontFamily: "parisienne",
        color: "#7b5c24",
        size: 26,
        align: "center",
        position: { x: 0.5, y: 0.88 },
      },
    ],
  },
  {
    id: "starlace",
    label: "Starlace",
    note: "Fine lines, airy text",
    thumbnail: "/presets/preset-starlace.svg",
    style: "vintageEngraving",
    renderMode: "blueprint",
    intensity: 60,
    shape: "circle",
    aspectRatio: "square",
    renderOptions: {
      frameEnabled: false,
      constellationLineScale: 1.4,
      showMoon: true,
    },
    textBoxes: [
      {
        id: "title",
        label: "Title",
        text: "Starlace",
        fontFamily: "playfair",
        color: "#d9d2c3",
        size: 42,
        align: "center",
        position: { x: 0.5, y: 0.12 },
      },
      {
        id: "subtitle",
        label: "Subtitle",
        text: "Oslo • 06.01.2020",
        fontFamily: "lora",
        color: "#c3b8a6",
        size: 20,
        align: "center",
        position: { x: 0.5, y: 0.18 },
      },
      {
        id: "dedication",
        label: "Dedication",
        text: "Fine lines, endless memories.",
        fontFamily: "crimsonText",
        color: "#b6ab98",
        size: 20,
        align: "center",
        position: { x: 0.5, y: 0.9 },
      },
    ],
  },
];
