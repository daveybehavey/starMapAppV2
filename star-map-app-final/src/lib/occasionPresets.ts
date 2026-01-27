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
  /** Intensity level on 0-100 scale (consistent with Pro presets) */
  intensity: number;
};

const baseText = {
  title: {
    fontFamily: "playfair" as const,
    color: "#d9b56f",
    size: 52,
    align: "center" as const,
    textShadow: false,
    textGlow: false,
    position: { x: 0.5, y: 0.12 },
  },
  subtitle: {
    fontFamily: "cinzel" as const,
    color: "#c7a35a",
    size: 36,
    align: "center" as const,
    textShadow: false,
    textGlow: false,
    position: { x: 0.5, y: 0.18 },
  },
  footer: {
    fontFamily: "script" as const,
    color: "#b8893f",
    size: 32,
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
      { id: "title", label: "Title", text: "The Night We Became One", ...baseText.title },
      { id: "subtitle", label: "Subtitle", text: "Santorini, Greece", ...baseText.subtitle },
      { id: "dedication", label: "Dedication", text: "June 1, 2024", ...baseText.footer },
    ],
    style: "navyGold",
    shape: "rectangle",
    renderMode: "cinematic",
    intensity: 55,
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
      { id: "title", label: "Title", text: "Under Parisian Stars", ...baseText.title },
      { id: "subtitle", label: "Subtitle", text: "An Evening to Remember", ...baseText.subtitle },
      { id: "dedication", label: "Dedication", text: "September 15, 2023", ...baseText.footer },
    ],
    style: "navyGold",
    shape: "circle",
    renderMode: "cinematic",
    intensity: 55,
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
      { id: "title", label: "Title", text: "A Star Was Born", ...baseText.title },
      { id: "subtitle", label: "Subtitle", text: "New York City", ...baseText.subtitle },
      { id: "dedication", label: "Dedication", text: "March 22, 1998", ...baseText.footer },
    ],
    style: "parchmentScroll",
    shape: "rectangle",
    renderMode: "cinematic",
    intensity: 58,
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
      { id: "title", label: "Title", text: "Welcome to the World", ...baseText.title },
      { id: "subtitle", label: "Subtitle", text: "Sydney, Australia", ...baseText.subtitle },
      { id: "dedication", label: "Dedication", text: "February 10, 2024", ...baseText.footer },
    ],
    style: "midnightMinimal",
    shape: "star",
    renderMode: "cinematic",
    intensity: 58,
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
      { id: "title", label: "Title", text: "Forever Among the Stars", ...baseText.title },
      { id: "subtitle", label: "Subtitle", text: "Vancouver, Canada", ...baseText.subtitle },
      { id: "dedication", label: "Dedication", text: "November 5, 2022", ...baseText.footer },
    ],
    style: "vintageEngraving",
    shape: "rectangle",
    renderMode: "cinematic",
    intensity: 48,
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
      { id: "title", label: "Title", text: "The Sky's the Limit", ...baseText.title },
      { id: "subtitle", label: "Subtitle", text: "Class of 2024", ...baseText.subtitle },
      { id: "dedication", label: "Dedication", text: "May 25, 2024", ...baseText.footer },
    ],
    style: "navyGold",
    shape: "rectangle",
    renderMode: "cinematic",
    intensity: 55,
  },
];
