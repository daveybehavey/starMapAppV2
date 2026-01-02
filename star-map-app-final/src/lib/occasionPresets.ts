import type { LocationState, TextBox } from "@/lib/store";
import type { RenderModeId } from "@/lib/renderModes";
import type { Shape } from "@/lib/types";
import type { StyleId } from "@/lib/store";

export type OccasionPreset = {
  id: "wedding" | "anniversary" | "birthday" | "birth" | "memorial" | "graduation";
  label: string;
  dateTimeISO: string;
  location: Partial<LocationState>;
  textBoxes: TextBox[];
  style: StyleId;
  shape: Shape;
  renderMode: RenderModeId;
  intensity: number;
};

const baseText = {
  title: {
    fontFamily: "playfair" as const,
    color: "#d9b56f",
    size: 40,
    align: "center" as const,
    textShadow: false,
    textGlow: false,
    position: { x: 0.5, y: 0.12 },
  },
  subtitle: {
    fontFamily: "cinzel" as const,
    color: "#c7a35a",
    size: 26,
    align: "center" as const,
    textShadow: false,
    textGlow: false,
    position: { x: 0.5, y: 0.18 },
  },
  footer: {
    fontFamily: "script" as const,
    color: "#b8893f",
    size: 24,
    align: "center" as const,
    textShadow: false,
    textGlow: false,
    position: { x: 0.5, y: 0.9 },
  },
};

export const occasionPresets: OccasionPreset[] = [
  {
    id: "wedding",
    label: "Wedding",
    dateTimeISO: "2024-06-01T18:00:00.000Z",
    location: {
      name: "Santorini, Greece",
      latitude: 36.3932,
      longitude: 25.4615,
      timezone: "Europe/Athens",
    },
    textBoxes: [
      { id: "title", label: "Title", text: "Under These Stars", ...baseText.title },
      { id: "subtitle", label: "Subtitle", text: "We Said “I Do”", ...baseText.subtitle },
      { id: "dedication", label: "Dedication", text: "June 1, 2024 • Santorini", ...baseText.footer },
    ],
    style: "navyGold",
    shape: "rectangle",
    renderMode: "classic",
    intensity: 0.45,
  },
  {
    id: "anniversary",
    label: "Anniversary",
    dateTimeISO: "2023-09-15T20:30:00.000Z",
    location: {
      name: "Paris, France",
      latitude: 48.8566,
      longitude: 2.3522,
      timezone: "Europe/Paris",
    },
    textBoxes: [
      { id: "title", label: "Title", text: "Our Night in Paris", ...baseText.title },
      { id: "subtitle", label: "Subtitle", text: "A Love Written in the Stars", ...baseText.subtitle },
      { id: "dedication", label: "Dedication", text: "Sept 15, 2023 • Paris", ...baseText.footer },
    ],
    style: "navyGold",
    shape: "circle",
    renderMode: "classic",
    intensity: 0.45,
  },
  {
    id: "birthday",
    label: "Birthday",
    dateTimeISO: "1998-03-22T04:15:00.000Z",
    location: {
      name: "New York, USA",
      latitude: 40.7128,
      longitude: -74.006,
      timezone: "America/New_York",
    },
    textBoxes: [
      { id: "title", label: "Title", text: "Born Under These Stars", ...baseText.title },
      { id: "subtitle", label: "Subtitle", text: "A Star is Born", ...baseText.subtitle },
      { id: "dedication", label: "Dedication", text: "March 22, 1998 • New York", ...baseText.footer },
    ],
    style: "parchmentScroll",
    shape: "rectangle",
    renderMode: "classic",
    intensity: 0.5,
  },
  {
    id: "birth",
    label: "Birth",
    dateTimeISO: "2024-02-10T06:45:00.000Z",
    location: {
      name: "Sydney, Australia",
      latitude: -33.8688,
      longitude: 151.2093,
      timezone: "Australia/Sydney",
    },
    textBoxes: [
      { id: "title", label: "Title", text: "Welcome Little One", ...baseText.title },
      { id: "subtitle", label: "Subtitle", text: "Your First Sky", ...baseText.subtitle },
      { id: "dedication", label: "Dedication", text: "Feb 10, 2024 • Sydney", ...baseText.footer },
    ],
    style: "midnightMinimal",
    shape: "star",
    renderMode: "classic",
    intensity: 0.5,
  },
  {
    id: "memorial",
    label: "Memorial",
    dateTimeISO: "2022-11-05T23:00:00.000Z",
    location: {
      name: "Vancouver, Canada",
      latitude: 49.2827,
      longitude: -123.1207,
      timezone: "America/Vancouver",
    },
    textBoxes: [
      { id: "title", label: "Title", text: "Forever in the Stars", ...baseText.title },
      { id: "subtitle", label: "Subtitle", text: "A Sky to Remember", ...baseText.subtitle },
      { id: "dedication", label: "Dedication", text: "Nov 5, 2022 • Vancouver", ...baseText.footer },
    ],
    style: "vintageEngraving",
    shape: "rectangle",
    renderMode: "classic",
    intensity: 0.35,
  },
  {
    id: "graduation",
    label: "Graduation",
    dateTimeISO: "2024-05-25T19:00:00.000Z",
    location: {
      name: "Boston, USA",
      latitude: 42.3601,
      longitude: -71.0589,
      timezone: "America/New_York",
    },
    textBoxes: [
      { id: "title", label: "Title", text: "Reach for the Stars", ...baseText.title },
      { id: "subtitle", label: "Subtitle", text: "Class of 2024", ...baseText.subtitle },
      { id: "dedication", label: "Dedication", text: "May 25, 2024 • Boston", ...baseText.footer },
    ],
    style: "navyGold",
    shape: "rectangle",
    renderMode: "classic",
    intensity: 0.4,
  },
];
