import type { LocationState, TextBox } from "./store";

type DemoPreset = {
  dateTimeISO: string;
  location: Partial<LocationState>;
  textBoxes?: TextBox[];
  style?: string;
  shape?: string;
};

export const demoPresets: Record<string, DemoPreset> = {
  default: {
    dateTimeISO: "2025-01-01T00:00:00.000Z",
    location: {
      name: "New York, USA",
      latitude: 40.7128,
      longitude: -74.006,
      timezone: "America/New_York",
    },
    textBoxes: [
      {
        id: "title",
        label: "Title",
        text: "Demo Anniversary",
        fontFamily: "playfair",
        color: "#d9b56f",
        size: 40,
        align: "center",
        textShadow: false,
        textGlow: false,
        position: { x: 0.5, y: 0.12 },
      },
      {
        id: "subtitle",
        label: "Subtitle",
        text: "A Special Night",
        fontFamily: "cinzel",
        color: "#c7a35a",
        size: 26,
        align: "center",
        textShadow: false,
        textGlow: false,
        position: { x: 0.5, y: 0.18 },
      },
      {
        id: "dedication",
        label: "Dedication",
        text: "Stars over Manhattan",
        fontFamily: "script",
        color: "#b8893f",
        size: 24,
        align: "center",
        textShadow: false,
        textGlow: false,
        position: { x: 0.5, y: 0.9 },
      },
    ],
    style: "navyGold",
    shape: "rectangle",
  },
};
