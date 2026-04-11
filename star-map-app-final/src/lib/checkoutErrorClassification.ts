type StripeLikeError = {
  type?: unknown;
  code?: unknown;
  decline_code?: unknown;
  message?: unknown;
  statusCode?: unknown;
};

function normalizeToken(value: unknown) {
  if (typeof value !== "string") return "";
  return value
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase()
    .slice(0, 80);
}

function normalizeStripeType(value: unknown) {
  const normalized = normalizeToken(value);
  if (!normalized) return "";
  return normalized.startsWith("stripe_") ? normalized : `stripe_${normalized}`;
}

export function classifyUnexpectedCheckoutError(error: unknown) {
  if (!error || typeof error !== "object") return "unknown_error";
  const stripeLike = error as StripeLikeError;
  const type = normalizeStripeType(stripeLike.type);
  if (type) return type;

  const code = normalizeToken(stripeLike.code);
  if (code) return `stripe_code_${code}`.slice(0, 80);

  return "unknown_error";
}

export function describeCheckoutErrorForLog(error: unknown) {
  if (!error || typeof error !== "object") {
    return {
      reason: "unknown_error",
      type: null,
      code: null,
      declineCode: null,
      statusCode: null,
      message: error instanceof Error ? error.message : String(error ?? ""),
    };
  }

  const stripeLike = error as StripeLikeError;
  return {
    reason: classifyUnexpectedCheckoutError(error),
    type: normalizeStripeType(stripeLike.type) || null,
    code: normalizeToken(stripeLike.code) || null,
    declineCode: normalizeToken(stripeLike.decline_code) || null,
    statusCode:
      typeof stripeLike.statusCode === "number" && Number.isFinite(stripeLike.statusCode)
        ? stripeLike.statusCode
        : null,
    message: error instanceof Error ? error.message : String(stripeLike.message ?? ""),
  };
}
