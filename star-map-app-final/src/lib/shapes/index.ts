export const SHAPE_PATHS: Record<string, string> = {
  circle: "M50 0 A50 50 0 1 1 49.999 0 Z",
  diamond: "M50 0 L100 50 L50 100 L0 50 Z",
  heart:
    "M50 90 C20 70 0 50 0 30 C0 15 12 0 30 0 C40 0 50 6 50 18 C50 6 60 0 70 0 C88 0 100 15 100 30 C100 50 80 70 50 90 Z",
  ring:
    "M50 5 A45 45 0 1 1 49.999 5 Z M50 25 A25 25 0 1 0 50.001 25 Z", // even-odd creates ring
};
