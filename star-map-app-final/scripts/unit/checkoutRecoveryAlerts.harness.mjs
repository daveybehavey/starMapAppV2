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
export const CHECKOUT_RECOVERY_ATTEMPT_TTL_SECONDS = CHECKOUT_RECOVERY_EMAIL_DELIVERED_TTL_SECONDS;

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
 * @param {string} attemptId
 */
export function checkoutRecoveryEmailAttemptKey(sessionId, attemptId) {
  return `stripe:checkout_recovery:attempt:${sessionId}:${attemptId}`;
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
 * @param {{
 *   attemptId: string;
 *   result: { delivered: boolean; provider: string; retryability: string; errorCode?: string; status?: number };
 *   eventId?: string;
 *   now?: number;
 * }} input
 */
export function buildCheckoutRecoveryAttemptRecord(input) {
  const now = input.now ?? Date.now();
  /** @type {Record<string, unknown>} */
  const record = {
    attemptId: input.attemptId,
    at: now,
    provider: input.result.provider,
    retryability: input.result.retryability,
    delivered: input.result.delivered === true,
  };
  if (input.result.errorCode) record.errorCode = input.result.errorCode;
  if (typeof input.result.status === "number" && Number.isFinite(input.result.status)) {
    record.status = input.result.status;
  }
  if (input.eventId) record.eventId = input.eventId;
  return record;
}

/**
 * @param {{ delivered: boolean; provider: string; retryability: string }} result
 * @param {number} [now]
 */
export function applyCheckoutRecoveryDeliveredSessionFields(result, now = Date.now()) {
  return {
    recoveryEmailSentAt: now,
    recoveryEmailProvider: result.provider,
    recoveryEmailError: undefined,
    recoveryEmailErrorCode: undefined,
    recoveryEmailRetryability: "delivered",
  };
}

/**
 * @param {string} [bodySnippet]
 * @returns {string | null}
 */
export function extractResendErrorName(bodySnippet) {
  if (typeof bodySnippet !== "string" || !bodySnippet.trim()) return null;
  try {
    const parsed = JSON.parse(bodySnippet);
    if (parsed && typeof parsed === "object" && typeof parsed.name === "string") {
      const name = parsed.name.trim();
      return name || null;
    }
  } catch {
    return null;
  }
  return null;
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
    const errorName = extractResendErrorName(bodySnippet);
    if (errorName === "concurrent_idempotent_requests") {
      return {
        delivered: false,
        provider,
        status,
        retryability: "retryable",
        errorCode: "concurrent_idempotent_requests",
      };
    }
    if (errorName === "invalid_idempotent_request") {
      return {
        delivered: false,
        provider,
        status,
        retryability: "terminal",
        errorCode: "invalid_idempotent_request",
      };
    }
    return {
      delivered: false,
      provider,
      status,
      retryability: "terminal",
      errorCode: "provider_conflict",
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
 * @deprecated Negative-control / historical helper — new failures use attempt records.
 * @param {{ recoveryEmailAttemptCount?: number; recoveryEmailSentAt?: number }} previous
 * @param {{ delivered: boolean; provider: string; retryability: string; errorCode?: string }} result
 * @param {number} [now]
 */
export function applyCheckoutRecoveryAlertToSessionFields(previous, result, now = Date.now()) {
  const attemptCount = (previous.recoveryEmailAttemptCount ?? 0) + 1;
  if (result.delivered) {
    return {
      ...applyCheckoutRecoveryDeliveredSessionFields(result, now),
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
 * Negative control: old same-session failure write that can clobber success.
 * @param {Record<string, unknown>} confirmedSession
 * @param {{ delivered: boolean; provider: string; retryability: string; errorCode?: string }} failureResult
 * @param {number} [now]
 */
export function naiveOverwriteConfirmedDeliveryWithFailure(
  confirmedSession,
  failureResult,
  now = Date.now()
) {
  return {
    ...confirmedSession,
    ...applyCheckoutRecoveryAlertToSessionFields(
      {
        recoveryEmailAttemptCount: 0,
        recoveryEmailSentAt: undefined,
      },
      failureResult,
      now
    ),
  };
}

/**
 * Negative control: aggregate Math.max attempt counting undercounts concurrent losers.
 * @param {number} winnerAttemptCount
 * @param {number} existingAttemptCount
 */
export function naiveMathMaxAttemptMerge(winnerAttemptCount, existingAttemptCount) {
  return Math.max(winnerAttemptCount, existingAttemptCount + 1);
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
 * @returns {Record<string, string>}
 */
export function buildSendgridRecoveryRequestHeaders() {
  return {
    Authorization: "Bearer test",
    "Content-Type": "application/json",
  };
}

/**
 * Negative control: stale pre-send earlySession write from a pre-delivery snapshot
 * erases a concurrent winner's confirmed success fields.
 * @param {Record<string, unknown>} winnerSession
 * @param {Record<string, unknown>} staleExisting
 * @param {Record<string, unknown>} expiredBase
 */
export function naiveStaleEarlySessionWrite(winnerSession, staleExisting, expiredBase) {
  return {
    ...winnerSession,
    ...staleExisting,
    ...expiredBase,
    recoveryEmailSentAt: staleExisting.recoveryEmailSentAt,
    recoveryEmailProvider: staleExisting.recoveryEmailProvider,
    recoveryEmailError: staleExisting.recoveryEmailError,
    recoveryEmailErrorCode: staleExisting.recoveryEmailErrorCode,
    recoveryEmailRetryability: staleExisting.recoveryEmailRetryability,
  };
}

/**
 * Negative control: marker-only stale repair overwrites a winner session with
 * undefined provider when latestSession lacked recoveryEmailProvider.
 * @param {Record<string, unknown> | null | undefined} latestSession
 * @param {Record<string, unknown>} expiredBase
 * @param {number} sentAtFromMarker
 */
export function naiveMarkerOnlyStaleRepair(latestSession, expiredBase, sentAtFromMarker) {
  return {
    ...latestSession,
    ...expiredBase,
    recoveryEmailSentAt: latestSession?.recoveryEmailSentAt ?? sentAtFromMarker,
    recoveryEmailProvider: latestSession?.recoveryEmailProvider,
    recoveryEmailError: undefined,
    recoveryEmailErrorCode: undefined,
    recoveryEmailRetryability: "delivered",
  };
}

/**
 * In-memory simulation of success-monotonic expired recovery + unique attempt records.
 * Canonical session writes occur only on confirmed provider delivery (before marker).
 * Already-delivered / observed-winner paths never rewrite sessionKey.
 *
 * @param {{
 *   store?: Map<string, unknown>;
 *   sessionId: string;
 *   eventId: string;
 *   attemptId?: string;
 *   recoveryUrl?: string | null;
 *   customerEmail?: string | null;
 *   existingSession?: Record<string, unknown>;
 *   send: () => Promise<{ delivered: boolean; provider: string; retryability: string; errorCode?: string; status?: number }>;
 *   now?: number;
 *   useLegacyPreSendLock?: boolean;
 *   assumePassedInitialDeliveryCheck?: boolean;
 *   afterInitialReadBeforeProvider?: (store: Map<string, unknown>) => void | Promise<void>;
 *   afterSendBeforePersist?: (store: Map<string, unknown>) => void | Promise<void>;
 * }} opts
 */
export async function simulateExpiredCheckoutRecoveryPass(opts) {
  const store = opts.store ?? new Map();
  const now = opts.now ?? 1_700_000_000_000;
  const sessionKey = `stripe:session:${opts.sessionId}`;
  const eventKey = `stripe:event:${opts.eventId}`;
  const deliveredKey = checkoutRecoveryEmailDeliveredKey(opts.sessionId);
  const legacyKey = checkoutRecoveryEmailLegacyPreSendKey(opts.sessionId);
  const attemptId = opts.attemptId ?? `attempt_${now}`;

  const existingEvent = store.get(eventKey);
  if (existingEvent) {
    return {
      httpStatus: 200,
      duplicate: true,
      providerCalls: 0,
      store,
      session: store.get(sessionKey) ?? null,
      deliveredMarker: store.get(deliveredKey) ?? null,
      attemptRecord: null,
      eventFinalized: true,
      legacyPreSendLock: store.get(legacyKey) ?? null,
    };
  }

  const fromStore = store.get(sessionKey) ?? {};
  const existing = { ...fromStore, ...(opts.existingSession ?? {}) };
  if (typeof fromStore.recoveryEmailSentAt === "number") {
    existing.recoveryEmailSentAt = fromStore.recoveryEmailSentAt;
    existing.recoveryEmailProvider = fromStore.recoveryEmailProvider;
  }
  /** @type {Record<string, unknown>} */
  const expiredBase = {
    paid: false,
    recoveryUrl: opts.recoveryUrl ?? null,
    customerEmail: opts.customerEmail ?? null,
    expiredAt: now,
  };

  if (opts.afterInitialReadBeforeProvider) {
    await opts.afterInitialReadBeforeProvider(store);
  }

  let providerCalls = 0;
  let recoveryOutcome = "skipped";
  /** @type {Record<string, unknown> | null} */
  let attemptRecord = null;
  let wroteSuccessSession = false;
  let wrotePreSendSession = false;
  let wroteSessionRepair = false;
  let backfilledMarkerOnly = false;
  const recoveryUrl = opts.recoveryUrl ?? null;
  const customerEmail = opts.customerEmail ?? null;
  const sessionSnapshotBefore = store.has(sessionKey) ? JSON.stringify(store.get(sessionKey)) : null;

  if (recoveryUrl && customerEmail) {
    const deliveredMarker = store.get(deliveredKey);
    const sessionAlreadySucceeded = Boolean(existing.recoveryEmailSentAt);
    const markerPresent = isCheckoutRecoveryDeliveredMarker(deliveredMarker);
    const alreadyDelivered =
      !opts.assumePassedInitialDeliveryCheck && (sessionAlreadySucceeded || markerPresent);

    if (alreadyDelivered) {
      recoveryOutcome = "already_delivered";
      if (sessionAlreadySucceeded && !markerPresent) {
        store.set(deliveredKey, {
          delivered: true,
          at: existing.recoveryEmailSentAt,
        });
        backfilledMarkerOnly = true;
      }
      // No canonical session rewrite.
    } else {
      if (opts.useLegacyPreSendLock) {
        const current = Number(store.get(legacyKey) ?? 0) + 1;
        store.set(legacyKey, current);
        if (current !== 1) {
          store.set(eventKey, { received: true });
          return {
            httpStatus: 200,
            duplicate: false,
            providerCalls: 0,
            store,
            session: store.get(sessionKey) ?? null,
            deliveredMarker: store.get(deliveredKey) ?? null,
            attemptRecord: null,
            eventFinalized: true,
            legacyPreSendLock: store.get(legacyKey),
            recoveryOutcome: "legacy_lock_blocked",
            blockedByLegacyPreSendLock: true,
            wrotePreSendSession: false,
            wroteSessionRepair: false,
            backfilledMarkerOnly: false,
          };
        }
      }

      providerCalls += 1;
      const alertResult = await opts.send();
      if (opts.afterSendBeforePersist) {
        await opts.afterSendBeforePersist(store);
      }

      attemptRecord = buildCheckoutRecoveryAttemptRecord({
        attemptId,
        result: alertResult,
        eventId: opts.eventId,
        now,
      });
      store.set(checkoutRecoveryEmailAttemptKey(opts.sessionId, attemptId), attemptRecord);

      if (alertResult.delivered) {
        recoveryOutcome = alertResult.retryability;
        const deliveredFields = applyCheckoutRecoveryDeliveredSessionFields(alertResult, now);
        // Session success before separate delivered marker.
        const latest = store.get(sessionKey) ?? existing;
        store.set(sessionKey, {
          ...latest,
          ...expiredBase,
          ...deliveredFields,
        });
        wroteSuccessSession = true;
        store.set(deliveredKey, { delivered: true, at: deliveredFields.recoveryEmailSentAt ?? now });
      } else {
        const latestMarker = store.get(deliveredKey);
        const latestSession = store.get(sessionKey) ?? null;
        const observedSessionSuccess = Boolean(latestSession?.recoveryEmailSentAt);
        const observedMarker = isCheckoutRecoveryDeliveredMarker(latestMarker);
        if (observedSessionSuccess || observedMarker) {
          recoveryOutcome = "already_delivered";
          if (observedSessionSuccess && !observedMarker) {
            store.set(deliveredKey, {
              delivered: true,
              at: latestSession.recoveryEmailSentAt,
            });
            backfilledMarkerOnly = true;
          }
          // No session rewrite on observed winner / marker-only.
        } else {
          recoveryOutcome = alertResult.retryability;
        }
      }
    }
  }

  const finalMarker = store.get(deliveredKey);
  const finalSession = store.get(sessionKey) ?? null;
  const deliveryVisible =
    wroteSuccessSession ||
    Boolean(finalSession?.recoveryEmailSentAt) ||
    isCheckoutRecoveryDeliveredMarker(finalMarker);

  const effectiveOutcome = deliveryVisible
    ? recoveryOutcome === "skipped"
      ? "skipped"
      : recoveryOutcome === "delivered"
        ? "delivered"
        : "already_delivered"
    : recoveryOutcome;
  const httpRetryable = !deliveryVisible && isCheckoutRecoveryWebhookRetryable(recoveryOutcome);
  if (!httpRetryable) {
    store.set(eventKey, { received: true });
  }

  const sessionSnapshotAfter = store.has(sessionKey) ? JSON.stringify(store.get(sessionKey)) : null;
  const sessionUnchanged = !wroteSuccessSession && sessionSnapshotBefore === sessionSnapshotAfter;

  return {
    httpStatus: httpRetryable ? 503 : 200,
    duplicate: false,
    providerCalls,
    store,
    session: store.get(sessionKey) ?? null,
    deliveredMarker: store.get(deliveredKey) ?? null,
    attemptRecord,
    attemptKey: checkoutRecoveryEmailAttemptKey(opts.sessionId, attemptId),
    eventFinalized: !httpRetryable,
    legacyPreSendLock: store.get(legacyKey) ?? null,
    recoveryOutcome: httpRetryable ? recoveryOutcome : effectiveOutcome,
    blockedByLegacyPreSendLock: false,
    idempotencyKey: buildCheckoutRecoveryResendIdempotencyKey(opts.sessionId),
    skippedSessionRewriteOnFailure: Boolean(attemptRecord && !wroteSuccessSession && !deliveryVisible),
    wrotePreSendSession,
    wroteSuccessSession,
    wroteSessionRepair,
    backfilledMarkerOnly,
    sessionUnchanged,
  };
}

export function listCheckoutRecoveryAttemptRecords(store, sessionId) {
  const prefix = `stripe:checkout_recovery:attempt:${sessionId}:`;
  /** @type {unknown[]} */
  const records = [];
  for (const [key, value] of store.entries()) {
    if (key.startsWith(prefix)) records.push(value);
  }
  return records;
}
