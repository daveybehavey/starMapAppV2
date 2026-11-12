/**
 * Dense reference scene for editor render profiling.
 * Used identically for every before/after timing in the 2026-11-08
 * editor-render-performance brief. Do not alter parameters between runs.
 *
 * Measured catalog (computeVisibleStars at 900×900):
 *   stars: 4407, planets: Mars+Jupiter, moon: yes,
 *   constellations: 41, lines: 376
 */
export const REFERENCE_SCENE = {
  id: "editor-render-perf-dense-v1",
  dateTime: "2024-12-14T02:00:00.000Z",
  location: {
    name: "Santorini, Greece",
    latitude: 36.3932,
    longitude: 25.4615,
    timezone: "Europe/Athens",
  },
  selectedStyle: "navyGold",
  aspectRatio: "square",
  shape: "rectangle",
  seed: "editor-render-perf-dense-v1",
  /** Preview canvas CSS size (editor viewport stand-in). */
  previewSize: { width: 900, height: 900 },
  /** Paid HD export width (getExportDimensions / EditorExperience uses 6000). */
  hdWidth: 6000,
  /** Preview PNG export width. */
  previewExportWidth: 1200,
  textBoxes: [
    {
      id: "title",
      label: "Title",
      text: "The Night We Became One",
      fontFamily: "cinzel",
      color: "#d7b56c",
      size: 48,
      align: "center",
      position: { x: 0.5, y: 0.12 },
    },
    {
      id: "subtitle",
      label: "Subtitle",
      text: "Santorini, Greece — under winter stars",
      fontFamily: "raleway",
      color: "#c8a662",
      size: 28,
      align: "center",
      position: { x: 0.5, y: 0.18 },
    },
    {
      id: "dedication",
      label: "Dedication",
      text: "December 14, 2024 · forever ours",
      fontFamily: "script",
      color: "#b98a3d",
      size: 26,
      align: "center",
      position: { x: 0.5, y: 0.9 },
    },
    {
      id: "quote",
      label: "Custom",
      text: "Look up — the sky remembers",
      fontFamily: "cinzel",
      color: "#e8d5a3",
      size: 18,
      align: "center",
      position: { x: 0.5, y: 0.84 },
    },
  ],
  /** Dense polished look: lines + labels + planets + glow + milky way. */
  renderOptions: {
    mapLookTier: "polished",
    visualMode: "illustrated",
    starIntensity: "normal",
    starGlow: true,
    constellationLines: "thin",
    constellationLabels: true,
    constellationLineScale: 1,
    planetLabels: true,
    showPlanets: true,
    showGrid: false,
    showTechnicalRing: true,
    frameEnabled: true,
    premiumStars: "off",
    premiumPlanets: "off",
    transparentBackground: false,
  },
};
