/**
 * Checkout-path resilience helpers: correlation IDs, soft analytics, and
 * structured non-PII failure diagnostics. Keep customer responses generic.
 */

export type CheckoutFailureLogFields = {
  correlationId: string;
  stage: string;
  normalizedReason: string;
  stripeErrorType: string | null;
  stripeErrorCode: string | null;
  httpStatus: number | null;
  mapIdPresent: boolean;
  checkoutKind: string;
  /** Non-secret error message for Workers logs (never returned raw to clients). */
  errorMessage?: string | null;
  sessionId?: string | null;
};

/** Safe normalized reason tokens returned on `unknown_error` responses (no Stripe secrets). */
export type UnknownCheckoutFailureResponse = {
  error: "Checkout failed";
  code: "unknown_error";
  reason: string;
  diagnosticId: string;
};

export function normalizeFailureReasonToken(raw: string, maxLen = 80): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, maxLen);
}

export function buildUnknownCheckoutFailureResponse(
  correlationId: string,
  reason: string,
): UnknownCheckoutFailureResponse {
  const safeReason = normalizeFailureReasonToken(reason) || "stripe_error";
  return {
    error: "Checkout failed",
    code: "unknown_error",
    reason: safeReason,
    diagnosticId: correlationId,
  };
}

const CORRELATION_ID_RE = /^[a-zA-Z0-9_-]{8,64}$/;

export function resolveCheckoutCorrelationId(headerValue: string | null | undefined): string {
  const trimmed = typeof headerValue === "string" ? headerValue.trim() : "";
  if (CORRELATION_ID_RE.test(trimmed)) return trimmed;
  return crypto.randomUUID();
}

export function extractStripeErrorDiagnostics(err: unknown): {
  stripeErrorType: string | null;
  stripeErrorCode: string | null;
  httpStatus: number | null;
} {
  if (!err || typeof err !== "object") {
    return { stripeErrorType: null, stripeErrorCode: null, httpStatus: null };
  }
  const anyErr = err as Record<string, unknown>;
  const raw = anyErr.raw as Record<string, unknown> | null | undefined;
  const stripeErrorType =
    (typeof anyErr.type === "string" ? anyErr.type : null) ??
    (typeof raw?.type === "string" ? raw.type : null);
  const stripeErrorCode =
    (typeof anyErr.code === "string" ? anyErr.code : null) ??
    (typeof raw?.code === "string" ? raw.code : null);
  const httpStatus =
    (typeof anyErr.statusCode === "number" ? anyErr.statusCode : null) ??
    (typeof anyErr.status === "number" ? anyErr.status : null);
  return { stripeErrorType, stripeErrorCode, httpStatus };
}

/**
 * Best-effort side effect for funnel / diagnostics / idempotency cache.
 * Never throws — analytics must not break a valid checkout.
 */
export async function bestEffortCheckoutSideEffect(input: {
  correlationId: string;
  stage: string;
  run: () => Promise<void>;
}): Promise<void> {
  try {
    await input.run();
  } catch (error) {
    const stripe = extractStripeErrorDiagnostics(error);
    const message = error instanceof Error ? error.message : "unknown";
    const normalizedReason = message
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 80);
    console.warn("checkout_side_effect_failed", {
      correlationId: input.correlationId,
      stage: input.stage,
      normalizedReason: normalizedReason || "side_effect_failed",
      stripeErrorType: stripe.stripeErrorType,
      stripeErrorCode: stripe.stripeErrorCode,
      httpStatus: stripe.httpStatus,
    });
  }
}

export function logCheckoutFailure(fields: CheckoutFailureLogFields): void {
  const errorMessage =
    typeof fields.errorMessage === "string" && fields.errorMessage.trim()
      ? fields.errorMessage.trim().slice(0, 280)
      : null;
  console.error("checkout_failed", {
    correlationId: fields.correlationId,
    stage: fields.stage,
    normalizedReason: fields.normalizedReason,
    stripeErrorType: fields.stripeErrorType,
    stripeErrorCode: fields.stripeErrorCode,
    httpStatus: fields.httpStatus,
    mapIdPresent: fields.mapIdPresent,
    checkoutKind: fields.checkoutKind,
    errorMessage,
    sessionId: typeof fields.sessionId === "string" ? fields.sessionId : null,
  });
}

/**
 * Extract a safe, non-secret failure reason for logs + client `reason` field.
 * Prefer Stripe code/type; fall back to a sanitized Error.message (e.g. invalid_stripe_checkout_url).
 */
export function resolveCheckoutFailureReason(err: unknown, fallbackStatus = 500): {
  reason: string;
  status: number;
  errorMessage: string | null;
} {
  const errorMessage = err instanceof Error ? err.message : typeof err === "string" ? err : null;

  if (errorMessage?.toLowerCase().includes("stripe not configured")) {
    return { reason: "stripe_not_configured", status: 503, errorMessage };
  }

  if (!err || typeof err !== "object") {
    const fromMessage = errorMessage ? normalizeFailureReasonToken(errorMessage) : "";
    return {
      reason: fromMessage || "stripe_error",
      status: fallbackStatus,
      errorMessage,
    };
  }

  const anyErr = err as Record<string, unknown>;
  const rawErr = anyErr.raw as unknown;
  const stripeCode =
    (typeof anyErr.code === "string" ? anyErr.code : null) ??
    (typeof (rawErr as { code?: unknown } | null)?.code === "string"
      ? String((rawErr as { code?: unknown }).code)
      : null);
  const stripeType = typeof anyErr.type === "string" ? String(anyErr.type) : null;
  const statusCandidate =
    (typeof anyErr.statusCode === "number" ? anyErr.statusCode : null) ??
    (typeof anyErr.status === "number" ? anyErr.status : null);
  const status =
    typeof statusCandidate === "number" && Number.isFinite(statusCandidate)
      ? statusCandidate
      : fallbackStatus;

  if (stripeCode) {
    return {
      reason: normalizeFailureReasonToken(`stripe_${stripeCode}`) || "stripe_error",
      status,
      errorMessage,
    };
  }
  if (stripeType) {
    return {
      reason: normalizeFailureReasonToken(`stripe_${stripeType}`) || "stripe_error",
      status,
      errorMessage,
    };
  }

  // Plain Error (e.g. invalid_stripe_checkout_url) — use message, not name "Error".
  if (errorMessage) {
    const fromMessage = normalizeFailureReasonToken(errorMessage);
    if (fromMessage && fromMessage !== "error") {
      return { reason: fromMessage, status, errorMessage };
    }
  }

  const name = typeof anyErr.name === "string" ? anyErr.name : null;
  if (name && name !== "Error") {
    return {
      reason: normalizeFailureReasonToken(`stripe_${name}`) || "stripe_error",
      status,
      errorMessage,
    };
  }

  return { reason: "stripe_error", status, errorMessage };
}

/**
 * Simulate Stripe Checkout Session create with network retries + stable idempotency key.
 * Mirrors Stripe SDK maxNetworkRetries behavior for unit tests (no live Stripe).
 */
export async function createCheckoutSessionWithNetworkRetries<T>(input: {
  maxNetworkRetries: number;
  idempotencyKey?: string;
  create: (opts: { idempotencyKey?: string; attempt: number }) => Promise<T>;
  isRetryableNetworkError: (error: unknown) => boolean;
}): Promise<T> {
  const maxAttempts = Math.max(1, input.maxNetworkRetries + 1);
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await input.create({
        idempotencyKey: input.idempotencyKey,
        attempt,
      });
    } catch (error) {
      lastError = error;
      const canRetry = attempt < maxAttempts && input.isRetryableNetworkError(error);
      if (!canRetry) throw error;
    }
  }
  throw lastError;
}

export function isStripeRetryableNetworkError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const anyErr = error as Record<string, unknown>;
  const type = typeof anyErr.type === "string" ? anyErr.type : "";
  const code = typeof anyErr.code === "string" ? anyErr.code : "";
  if (type === "StripeConnectionError") return true;
  if (code === "ECONNRESET" || code === "ETIMEDOUT" || code === "ENOTFOUND") return true;
  const message = typeof anyErr.message === "string" ? anyErr.message.toLowerCase() : "";
  if (message.includes("connection") && message.includes("reset")) return true;
  if (message.includes("network") || message.includes("timeout")) return true;
  return false;
}
