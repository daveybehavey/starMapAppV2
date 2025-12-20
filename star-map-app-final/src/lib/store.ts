"use client";

import { create } from "zustand";

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
  fontFamily: "playfair" | "cinzel" | "script";
  color: string;
  size: number;
  align: TextAlign;
}

export interface LocationState {
  name: string;
  latitude: number;
  longitude: number;
  timezone: string;
}

export interface EditorState {
  dateTime: string;
  location: LocationState;
  textBoxes: TextBox[];
  selectedStyle: StyleId;
  paid: boolean;
  setDateTime: (dateTime: string) => void;
  setLocation: (location: Partial<LocationState>) => void;
  updateTextBox: (id: string, payload: Partial<TextBox>) => void;
  removeTextBox: (id: string) => void;
  addTextBox: () => void;
  setStyle: (style: StyleId) => void;
  setPaid: (paid: boolean) => void;
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
  textBoxes: [
    {
      id: "title",
      label: "Title",
      text: "Our Night Sky",
      fontFamily: "playfair",
      color: "#0c1021",
      size: 28,
      align: "center",
    },
    {
      id: "subtitle",
      label: "Subtitle",
      text: "Under the vintage stars",
      fontFamily: "cinzel",
      color: "#4b5563",
      size: 16,
      align: "center",
    },
    {
      id: "dedication",
      label: "Dedication",
      text: "Celebrating our constellation of moments.",
      fontFamily: "script",
      color: "#8a6a2f",
      size: 18,
      align: "center",
    },
  ],
  selectedStyle: "navyGold",
  paid: false,
  setDateTime: (dateTime) => set({ dateTime }),
  setLocation: (location) =>
    set((state) => ({ location: { ...state.location, ...location } })),
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
      };
      return { textBoxes: [...state.textBoxes, newBox] };
    }),
  setStyle: (selectedStyle) => set({ selectedStyle }),
  setPaid: (paid) => set({ paid }),
}));
