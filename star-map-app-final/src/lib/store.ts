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
  setStyle: (style: StyleId) => void;
  setPaid: (paid: boolean) => void;
}

const initialDate = new Date();

export const useStore = create<EditorState>((set) => ({
  dateTime: initialDate.toISOString(),
  location: {
    name: "San Francisco, CA",
    latitude: 37.7749,
    longitude: -122.4194,
    timezone: "America/Los_Angeles",
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
  setStyle: (selectedStyle) => set({ selectedStyle }),
  setPaid: (paid) => set({ paid }),
}));
