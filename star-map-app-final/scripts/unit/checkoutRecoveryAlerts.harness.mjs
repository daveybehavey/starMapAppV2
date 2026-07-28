/**
 * Pure helpers for checkout recovery email delivery-state tests.
 * Keep orchestration semantics aligned with:
 * - src/lib/checkoutRecoveryAlerts.ts
 * - src/app/api/stripe/webhook/route.ts (expired recovery path)
 */

import { createHash } from "node:crypto";

/** @param {string | null | undefined} variant */
function getVariantLabel(variant) {
  switch (variant) {
    case "poster_framed":
      return "Framed print";
    case "poster_unframed":
      return "Unframed print";
    case "canvas_wrap":
      return "Canvas wrap";
    default:
      return "Print";
  }
}

/**
 * @param {{ orderType: string; printVariant?: string | null; plan?: string | null; includesDigitalAddOn?: boolean }} input
 * @returns {string}
 */
export function getOfferLabel(input) {
  if (input.orderType === "print") {
    const printLabel = input.printVariant ? getVariantLabel(input.printVariant).toLowerCase() : "print";
    return input.includesDigitalAddOn ? `${printLabel} + HD download` : printLabel;
  }
  if (input.plan === "pack3") return "3 HD export credits";
  if (input.plan === "subscription") return "unlimited HD access";
  return "HD download";
}

/**
 * @param {{ orderType: string; printVariant?: string | null; plan?: string | null }} input
 * @returns {string}
 */
export function getSubject(input) {
  if (input.orderType === "print") {
    if (input.printVariant === "poster_framed") {
      return "Your framed star map design is saved — pick up where you left off";
    }
    if (input.printVariant === "poster_unframed") {
      return "Your star map print design is saved — pick up where you left off";
    }
    if (input.printVariant) {
      return `Your ${getVariantLabel(input.printVariant)} design is saved — pick up where you left off`;
    }
    return "Your star map design is saved — pick up where you left off";
  }
  if (input.plan === "subscription") return "Your StarMapCo subscription is one step away";
  return "Your star map download is waiting — complete in seconds";
}

/**
 * @param {{ orderType: string; printVariant?: string | null; includesDigitalAddOn?: boolean }} input
 * @returns {string[]}
 */
export function getIncludesBullets(input) {
  if (input.orderType !== "print") return [];
  const bullets = [];
  if (input.printVariant) {
    bullets.push(getVariantLabel(input.printVariant));
  } else {
    bullets.push("Printed star map");
  }
  if (input.includesDigitalAddOn) {
    bullets.push("HD digital download (unlocked instantly after payment)");
  }
  bullets.push("Your custom text, date, and location — all saved");
  return bullets;
}

export const CHECKOUT_RECOVERY_EMAIL_DELIVERED_TTL_SECONDS = 45 * 24 * 60 * 60;

export const SENDGRID_RECOVERY_CONCURRENCY_GUARANTEE = "best_effort_no_provider_idempotency";

/**
 * @param {string} sessionId
 */
export function buildCheckoutRecoveryResendIdempotencyKey(sessionId) {
  const digest = createHash("sha256")
    .update(`starmapco:checkout-recovery-email:v1:${sessionId}`)
    .digest("hex");
  return `cre_${digest.slice(0, 48)}`;
}

/**
 * @param {string} sessionId
 */
export function checkoutRecoveryEmailDeliveredKey(sessionId) {
  return `stripe:checkout_recovery:email_delivered:${sessionId}`;
}

/**
 * @param {string} sessionId
 */
export function checkoutRecoveryEmailLegacyPreSendKey(sessionId) {
  return `stripe:checkout_recovery:email:${sessionId}`;
}

/**
 * @param {unknown} value
 */
export function isCheckoutRecoveryDeliveredMarker(value) {
  return Boolean(value && typeof value === "object" && value.delivered === true);
}

/**
 * @param {"resend"|"sendgrid"} provider
 * @param {number} status
 * @param {string} [bodySnippet]
 */
export function classifyCheckoutRecoveryHttpResult(provider, status, bodySnippet) {
  if (status >= 200 && status < 300) {
    return { delivered: true, provider, status, retryability: "delivered" };
  }
  if (provider === "resend" && status === 409) {
    const concurrent =
      typeof bodySnippet === "string" && bodySnippet.includes("concurrent_idempotent_requests");
    return {
      delivered: false,
      provider,
      status,
      retryability: "retryable",
      errorCode: concurrent ? "concurrent_idempotent_requests" : "provider_conflict",
    };
  }
  if (status === 429) {
    return {
      delivered: false,
      provider,
      status,
      retryability: "retryable",
      errorCode: "provider_rate_limited",
    };
  }
  if (status >= 500) {
    return {
      delivered: false,
      provider,
      status,
      retryability: "retryable",
      errorCode: "provider_server_error",
    };
  }
  let errorCode = "provider_client_error";
  if (status === 401 || status === 403) errorCode = "provider_auth_error";
  else if (status === 422) errorCode = "provider_validation_error";
  return {
    delivered: false,
    provider,
    status,
    retryability: "terminal",
    errorCode,
  };
}

/**
 * @param {string} retryability
 */
export function isCheckoutRecoveryWebhookRetryable(retryability) {
  return retryability === "retryable";
}

/**
 * @param {{ recoveryEmailAttemptCount?: number; recoveryEmailSentAt?: number }} previous
 * @param {{ delivered: boolean; provider: string; retryability: string; errorCode?: string }} result
 * @param {number} [now]
 */
export function applyCheckoutRecoveryAlertToSessionFields(previous, result, now = Date.now()) {
  const attemptCount = (previous.recoveryEmailAttemptCount ?? 0) + 1;
  if (result.delivered) {
    return {
      recoveryEmailSentAt: now,
      recoveryEmailProvider: result.provider,
      recoveryEmailError: undefined,
      recoveryEmailErrorCode: undefined,
      recoveryEmailRetryability: "delivered",
      recoveryEmailLastAttemptAt: now,
      recoveryEmailAttemptCount: attemptCount,
    };
  }
  return {
    recoveryEmailSentAt: previous.recoveryEmailSentAt,
    recoveryEmailProvider: result.provider,
    recoveryEmailError: result.errorCode,
    recoveryEmailErrorCode: result.errorCode,
    recoveryEmailRetryability: result.retryability,
    recoveryEmailLastAttemptAt: now,
    recoveryEmailAttemptCount: attemptCount,
  };
}

/**
 * @param {string} sessionId
 */
export function buildResendRecoveryRequestHeaders(sessionId) {
  return {
    Authorization: "Bearer test",
    "Content-Type": "application/json",
    "Idempotency-Key": buildCheckoutRecoveryResendIdempotencyKey(sessionId),
  };
}

/**
 * SendGrid Mail Send has no provider idempotency key equivalent.
 * @returns {Record<string, string>}
 */
export function buildSendgridRecoveryRequestHeaders() {
  return {
    Authorization: "Bearer test",
    "Content-Type": "application/json",
  };
}

/**
 * In-memory simulation of the expired-checkout recovery email path + event dedupe.
 * Injectable send + store so tests stay deterministic without Stripe/provider calls.
 *
 * @param {{
 *   store?: Map<string, unknown>;
 *   sessionId: string;
 *   eventId: string;
 *   recoveryUrl?: string | null;
 *   customerEmail?: string | null;
 *   existingSession?: Record<string, unknown>;
 *   send: () => Promise<{ delivered: boolean; provider: string; retryability: string; errorCode?: string; status?: number }>;
 *   now?: number;
 *   useLegacyPreSendLock?: boolean;
 * }} opts
 */
export async function simulateExpiredCheckoutRecoveryPass(opts) {
  const store = opts.store ?? new Map();
  const now = opts.now ?? 1_700_000_000_000;
  const sessionKey = `stripe:session:${opts.sessionId}`;
  const eventKey = `stripe:event:${opts.eventId}`;
  const deliveredKey = checkoutRecoveryEmailDeliveredKey(opts.sessionId);
  const legacyKey = checkoutRecoveryEmailLegacyPreSendKey(opts.sessionId);

  const existingEvent = store.get(eventKey);
  if (existingEvent) {
    return {
      httpStatus: 200,
      duplicate: true,
      providerCalls: 0,
      store,
      session: store.get(sessionKey) ?? null,
      deliveredMarker: store.get(deliveredKey) ?? null,
      eventFinalized: true,
      legacyPreSendLock: store.get(legacyKey) ?? null,
    };
  }

  const existing = { ...(opts.existingSession ?? store.get(sessionKey) ?? {}) };
  /** @type {Record<string, unknown>} */
  const nextRecord = {
    ...existing,
    paid: false,
    recoveryUrl: opts.recoveryUrl ?? null,
    customerEmail: opts.customerEmail ?? null,
  };

  let providerCalls = 0;
  let recoveryOutcome = "skipped";
  const recoveryUrl = opts.recoveryUrl ?? null;
  const customerEmail = opts.customerEmail ?? null;

  if (recoveryUrl && customerEmail) {
    const deliveredMarker = store.get(deliveredKey);
    const alreadyDelivered =
      Boolean(existing.recoveryEmailSentAt) || isCheckoutRecoveryDeliveredMarker(deliveredMarker);

    if (alreadyDelivered) {
      recoveryOutcome = "already_delivered";
      if (!nextRecord.recoveryEmailSentAt) {
        nextRecord.recoveryEmailSentAt =
          existing.recoveryEmailSentAt ??
          (isCheckoutRecoveryDeliveredMarker(deliveredMarker) ? deliveredMarker.at : now);
      }
    } else {
      if (opts.useLegacyPreSendLock) {
        const current = Number(store.get(legacyKey) ?? 0) + 1;
        store.set(legacyKey, current);
        if (current !== 1) {
          store.set(sessionKey, nextRecord);
          store.set(eventKey, { received: true });
          return {
            httpStatus: 200,
            duplicate: false,
            providerCalls: 0,
            store,
            session: nextRecord,
            deliveredMarker: store.get(deliveredKey) ?? null,
            eventFinalized: true,
            legacyPreSendLock: store.get(legacyKey),
            recoveryOutcome: "legacy_lock_blocked",
            blockedByLegacyPreSendLock: true,
          };
        }
      }

      providerCalls += 1;
      const alertResult = await opts.send();
      recoveryOutcome = alertResult.retryability;
      Object.assign(
        nextRecord,
        applyCheckoutRecoveryAlertToSessionFields(
          {
            recoveryEmailAttemptCount: existing.recoveryEmailAttemptCount,
            recoveryEmailSentAt: existing.recoveryEmailSentAt,
          },
          alertResult,
          now
        )
      );
      if (alertResult.delivered) {
        store.set(deliveredKey, { delivered: true, at: nextRecord.recoveryEmailSentAt ?? now });
      }
    }
  }

  store.set(sessionKey, nextRecord);

  const retryable = isCheckoutRecoveryWebhookRetryable(recoveryOutcome);
  if (!retryable) {
    store.set(eventKey, { received: true });
  }

  return {
    httpStatus: retryable ? 503 : 200,
    duplicate: false,
    providerCalls,
    store,
    session: nextRecord,
    deliveredMarker: store.get(deliveredKey) ?? null,
    eventFinalized: !retryable,
    legacyPreSendLock: store.get(legacyKey) ?? null,
    recoveryOutcome,
    blockedByLegacyPreSendLock: false,
    idempotencyKey: buildCheckoutRecoveryResendIdempotencyKey(opts.sessionId),
  };
}
