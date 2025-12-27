export const SHAPE_PATHS: Record<string, { d: string; viewBox: [number, number, number, number] }> = {
  rectangle: { d: "", viewBox: [0, 0, 100, 100] }, // handled procedurally
  circle: { d: "M50 0 A50 50 0 1 1 50 100 A50 50 0 1 1 50 0 Z", viewBox: [0, 0, 100, 100] },
  diamond: { d: "M50 6 L94 50 L50 94 L6 50 Z", viewBox: [0, 0, 100, 100] },
  heart: {
    d: "M50 88 C24 70 8 52 8 34 C8 20 19 10 32 10 C41 10 48 14 50 20 C52 14 59 10 68 10 C81 10 92 20 92 34 C92 52 76 70 50 88 Z",
    viewBox: [0, 0, 100, 100],
  },
  star: { d: "M50 4 L61.8 35.1 L95 38.2 L69 59.9 L77.6 92 L50 74.5 L22.4 92 L31 59.9 L5 38.2 L38.2 35.1 Z", viewBox: [0, 0, 100, 100] },
  birthdaycake: {
    d: "M20 70 H80 V88 H20 Z M20 70 V55 Q30 50 40 55 T60 55 T80 55 V70 Z M32 55 V40 h4 V55 Z M52 55 V36 h4 V55 Z M72 55 V42 h4 V55 Z",
    viewBox: [0, 0, 100, 100],
  },
};
