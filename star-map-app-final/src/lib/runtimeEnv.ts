export function isProductionLikeRuntime() {
  return (
    (process.env.NODE_ENV || "").trim() === "production" ||
    (process.env.NEXTJS_ENV || "").trim() === "production"
  );
}
