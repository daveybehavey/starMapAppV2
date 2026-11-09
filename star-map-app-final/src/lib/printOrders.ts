/**
 * Print order KV mirror (`print:order:{sessionId}`) and related pure helpers.
 *
 * Pipeline overview: `docs/print-fulfillment-pipeline.md`.
 * Authoritative bind/terminal lifecycle: PrintOrderAuthority DO
 * (`docs/print-order-authority-do.md`). This module’s KV records are a
 * non-authoritative projection plus retention/persist helpers.
 */
import type Stripe from "stripe";
import type { PrintVariant } from "@/lib/pricing";
import type { MerchFamilyId } from "@/lib/merchCatalog";
import { kv } from "@/lib/kv";

/** Explicit provider terminal provenance on a KV failure mirror (AG-086). */
export type PrintOrderTerminalEventType = "order_failed" | "order_canceled";

/**
 * S94-1 F9: dispatch marker for the alternate (generic webhook)
 * fulfilment destination. That destination has no provider-side
 * idempotency or order identity to bind the way Printful's externalId
 * + authority bind does, so the dispatch itself is made replay-safe
 * here: the marker is persisted in state "attempted" BEFORE the
 * outbound call, and any later pass that finds "attempted" must refuse
 * to dispatch again (the receiver may already hold the order — an
 * operator reconciles). "accepted" records the 2xx outcome.
 * "rejected" is a legacy state from the original classification,
 * which treated any non-2xx answer as proof the receiver did not
 * accept; gate fix round 1 (Codex P1-C on PR #477) no longer writes
 * it — a non-2xx answer does not prove rejection (the receiver may
 * have created the order before failing, or an intermediary may
 * have answered after acceptance, and the receiver's contract
 * defines no provably-rejecting status), so a non-2xx outcome now
 * stays "attempted" with the response facts recorded on the marker.
 * Gate fix round 2 (PR #477): records already carrying "rejected"
 * are governed by the same doctrine — the state encodes exactly an
 * ambiguous response, so it is never read as licence to redispatch:
 * both dispatch sites refuse on it exactly like "attempted" (see
 * alternateDispatchBlocksRedispatch) and an operator reconciles.
 * Gate fix round 3 (PR #477): the guard fails closed on ANY
 * present marker — including a persisted marker whose state is
 * missing or unrecognized, which the round-2 string comparison
 * let fall through to redispatch; see the helper's doc.
 * The dispatchId is stable per session and is sent as the payload's
 * dispatchId and the request's Idempotency-Key header so a
 * receiver that does honour idempotency can dedupe as well.
 */
export type AlternateFulfillmentDispatch = {
  dispatchId: string;
  state: "attempted" | "rejected" | "accepted";
  attemptedAt: number;
  respondedAt?: number;
  httpStatus?: number;
};

export function alternateFulfillmentDispatchId(sessionId: string) {
  return `alt-fulfillment:${sessionId}`;
}

/**
 * Fail closed (gate fix round 3, PR #477): a PRESENT marker blocks
 * any further dispatch until an operator reconciles, in EVERY
 * state — "attempted" (an outcome that was never durably
 * resolved), the legacy "rejected" (an ambiguous non-2xx answer,
 * which under the round-1 doctrine does not prove the receiver
 * refused the order), and "accepted" (which matches round 0's
 * design: when the post-acceptance "sent" write failed, the next
 * attempt must refuse, not redispatch — the "sent" early returns
 * at both sites handle the consistent accepted+sent records
 * before this guard is reached). The marker's state is never
 * trusted as licence to dispatch: persisted KV data is not
 * runtime-validated against the type above, so a marker whose
 * state is missing or unrecognized blocks identically. Outbound
 * dispatch is permitted only when NO marker exists — the
 * first-dispatch case.
 */
export function alternateDispatchBlocksRedispatch(
  dispatch?: AlternateFulfillmentDispatch | null,
): boolean {
  return dispatch != null;
}

export type PrintOrderRecord = {
  status: "pending" | "sent" | "failed";
  sessionId: string;
  mapId?: string;
  printVariant: PrintVariant;
  /**
   * Optional merch fulfillment fields (Printful v2 catalog orders).
   * When present, the physical item is resolved via catalog_variant_id, not legacy Printful variant_id.
   */
  merchFamily?: MerchFamilyId;
  merchCatalogVariantId?: number;
  merchSize?: string;
  merchColor?: string;
  includesDigitalAddOn: boolean;
  /** Bundled greeting card with framed print (C1). */
  includesCardAddOn?: boolean;
  /**
   * Second copy of the same print at 10% off (Lever A). Fulfilment is
   * quantity 2 on the main Printful item. Absent = false, so every
   * legacy record reads correctly. Mints NO digital entitlement: the
   * entitlement path keys off plan/credits metadata, which the copy
   * flag never sets.
   */
  includesSecondCopy?: boolean;
  amountTotal?: number | null;
  currency?: string | null;
  customerEmail?: string | null;
  customerName?: string | null;
  /**
   * Checkout phone from Stripe `customer_details.phone` (phone_number_collection).
   * Optional for Printful/carriers; null/absent means do not invent a fallback.
   * Persisted only for fulfillment/retry; never returned on operator API/script surfaces.
   */
  customerPhone?: string | null;
  shippingDetails?: Stripe.Checkout.Session.ShippingDetails | null;
  /** Captured at checkout creation for margin guard + ops. */
  shippingChargeCents?: number | null;
  printAssetId?: string;
  printAssetUrl?: string;
  cardPrintAssetId?: string;
  cardPrintAssetUrl?: string;
  printfulOrderId?: string | number;
  attempts: number;
  webhookStatus?: number;
  sentAt?: number;
  operatorAlertedAt?: number;
  operatorAlertProvider?: string;
  operatorAlertError?: string;
  operatorFailureAlertedAt?: number;
  operatorFailureAlertProvider?: string;
  operatorFailureAlertError?: string;
  /**
   * S96-1 F1: Printful placed this order on hold (`order_put_hold`).
   * The record stays `sent` — the order was submitted, but Printful
   * will not produce it until the hold is resolved there. First hold
   * wins for `providerHoldAt`; the reason/status track the latest hold
   * event. The hold fields are cleared when the order terminally
   * fails, ships, or an operator resolves it. The scheduled hold sweep
   * (printOrderHoldSweep.ts) retries a failed hold alert and escalates
   * holds that age past the configured threshold.
   */
  providerHoldAt?: number;
  providerHoldReason?: string;
  providerHoldOrderStatus?: string;
  operatorHoldAlertedAt?: number;
  operatorHoldAlertProvider?: string;
  operatorHoldAlertError?: string;
  operatorHoldEscalatedAt?: number;
  operatorHoldEscalationAlertError?: string;
  operatorResolvedAt?: number;
  operatorResolvedProvider?: "manual_printful" | "manual_other";
  operatorResolvedNote?: string;
  printConfirmationSentAt?: number;
  printConfirmationMessageId?: string;
  printConfirmationError?: string;
  shippingNotificationSentAt?: number;
  /**
   * When the package_shipped fact was first observed (ms epoch). Persisted
   * independently of the shipping-notification email outcome (see
   * shippingNotifications.ts) because the review-request engine anchors its
   * physical due window to the shipment fact, not to an email side effect.
   * First-write-wins: a reshipment never resets the clock.
   */
  shippedAt?: number;
  /**
   * S96-1 F3: post-submit Printful file-review state, stamped by every
   * applyPrintfulPostSubmitReview pass. "pending" means the review could
   * not resolve yet (files still processing, or the review unavailable)
   * — the scheduled review sweep (printOrderReviewSweep.ts) revisits
   * pending records until the review resolves "healthy" or "failed".
   * Absent on records written before these stamps existed; the sweep
   * derives candidacy for those from the submit age and alert stamps.
   */
  fileReviewState?: "pending" | "healthy" | "failed";
  fileReviewCheckedAt?: number;
  /** First time the current pending episode was observed (ms epoch). */
  fileReviewPendingSince?: number;
  /** One-shot operator alert for a review pending past the threshold. */
  fileReviewPendingAlertedAt?: number;
  fileReviewPendingAlertError?: string;
  /**
   * Buyer marked the order as a gift at checkout. Review requests are never
   * sent for gift orders. Written by the Stripe webhook from the checkout
   * session's `is_gift` metadata (see checkoutGiftFlag.ts); absent means
   * non-gift, which is also how pre-flag orders read.
   */
  isGift?: boolean;
  shippingNotificationProvider?: "resend";
  shippingNotificationTrackingNumber?: string;
  shippingNotificationMessageId?: string;
  shippingNotificationError?: string;
  error?: string;
  /** S94-1 F9: alternate-destination dispatch marker (see the type). */
  alternateDispatch?: AlternateFulfillmentDispatch;
  /**
   * Explicit failure provenance for authority seed (AG-086). Never infer from `error`.
   * - `"order_failed"` / `"order_canceled"`: true Printful terminal webhook
   * - `null`: explicitly known nonterminal / retryable failure
   * - absent/`undefined`: legacy ambiguous failed record — fail closed until operator resolution
   */
  terminalEventType?: PrintOrderTerminalEventType | null;
  createdAt: number;
};

export function isExplicitPrintOrderTerminalEventType(
  value: unknown,
): value is PrintOrderTerminalEventType {
  return value === "order_failed" || value === "order_canceled";
}

/**
 * Legacy failed KV mirrors lack `terminalEventType` entirely (not even `null`).
 * Must not auto-seed terminal or allow provider resubmit while DO is uninitialized.
 */
export function isLegacyAmbiguousPrintOrderFailure(
  record:
    | {
        status?: string | null;
        terminalEventType?: PrintOrderTerminalEventType | null;
      }
    | null
    | undefined,
): boolean {
  if (!record || record.status !== "failed") return false;
  return !Object.prototype.hasOwnProperty.call(record, "terminalEventType");
}

/**
 * Authority seed evidence from the explicit KV field only — never from `error` text.
 * Explicit terminal strings seed `terminal_failed`; explicit `null` and legacy absent
 * both yield no terminal evidence (callers must separately fail-closed on legacy).
 */
export function terminalEventTypeForAuthoritySeed(
  kvMirror:
    | {
        status?: PrintOrderRecord["status"] | null;
        terminalEventType?: PrintOrderTerminalEventType | null;
      }
    | null
    | undefined,
): PrintOrderTerminalEventType | null {
  if (kvMirror?.status !== "failed") return null;
  if (isExplicitPrintOrderTerminalEventType(kvMirror.terminalEventType)) {
    return kvMirror.terminalEventType;
  }
  return null;
}

/** Unbound KV self-check: only explicit nonterminal (`null`) may be overwritten. */
export function kvFailedMirrorBlocksNonterminalWrite(
  existing: Pick<PrintOrderRecord, "status" | "terminalEventType"> | null | undefined,
): boolean {
  if (!existing || existing.status !== "failed") return false;
  if (
    Object.prototype.hasOwnProperty.call(existing, "terminalEventType") &&
    existing.terminalEventType === null
  ) {
    return false;
  }
  return true;
}

export const printOrderKey = (sessionId: string) => `print:order:${sessionId}`;
const PRINT_CHECKOUT_SESSION_ID_REGEX = /^cs_(?:test|live)_[A-Za-z0-9_]+$/;
const DEFAULT_PRINT_MIN_CHARGE_CENTS = 100;
const SECONDS_PER_DAY = 24 * 60 * 60;
/** Fixed maximum retention from original order creation (fulfillment + short support window). */
export const DEFAULT_PRINT_ORDER_RETENTION_DAYS = 60;
/** Cloudflare Workers KV rejects expirationTtl below this value. */
export const CLOUDFLARE_KV_MIN_EXPIRATION_TTL_SECONDS = 60;

export function getPrintMinChargeCents() {
  const raw = process.env.PRINT_MIN_CHARGE_CENTS?.trim();
  if (!raw) return DEFAULT_PRINT_MIN_CHARGE_CENTS;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed)) return DEFAULT_PRINT_MIN_CHARGE_CENTS;
  return Math.max(0, parsed);
}

export function hasSufficientPrintCharge(amountTotal?: number | null) {
  return typeof amountTotal === "number" && Number.isFinite(amountTotal) && amountTotal >= getPrintMinChargeCents();
}

export function isValidPrintCheckoutSessionId(sessionId: string) {
  const trimmed = sessionId.trim();
  if (!trimmed || trimmed.length > 255) return false;
  return PRINT_CHECKOUT_SESSION_ID_REGEX.test(trimmed);
}

export function buildPrintAssetUrl(siteUrl: string, assetId: string) {
  const normalizedSite = siteUrl.replace(/\/+$/, "");
  return `${normalizedSite}/api/print/assets?id=${encodeURIComponent(assetId)}`;
}

/** Trim and keep non-empty checkout phone strings; otherwise null (no invented fallback). */
export function normalizeCheckoutPhone(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

/**
 * Trusted Stripe Checkout phone sources for print fulfillment.
 * Prefer `customer_details.phone` (phone_number_collection), then shipping phone if present.
 */
export function extractCheckoutPhoneFromStripeSession(session: {
  customer_details?: { phone?: string | null } | null;
  shipping_details?: { phone?: string | null } | null;
}): string | null {
  return (
    normalizeCheckoutPhone(session.customer_details?.phone) ??
    normalizeCheckoutPhone(session.shipping_details?.phone)
  );
}

/**
 * Remaining bounded KV retention for a print-order record, in whole seconds.
 * The deadline is anchored to the original `createdAt`: later webhook, retry,
 * shipping, or notification writes can never restart the retention window.
 * Configuration may shorten the default 60-day bound, but never extend it.
 * Malformed creation timestamps and already-elapsed windows return `0` so the
 * caller can fail closed (durable delete) instead of minting a sub-minute TTL.
 */
export function getPrintOrderRetentionSeconds(createdAt: unknown, now = Date.now()) {
  if (typeof createdAt !== "number" || !Number.isFinite(createdAt)) return 0;

  const raw = process.env.PRINT_ORDER_RETENTION_DAYS?.trim();
  const parsedDays = raw ? Number.parseInt(raw, 10) : Number.NaN;
  const configuredDays =
    Number.isFinite(parsedDays) && parsedDays > 0 ? parsedDays : DEFAULT_PRINT_ORDER_RETENTION_DAYS;
  const retentionDays = Math.min(configuredDays, DEFAULT_PRINT_ORDER_RETENTION_DAYS);
  const maxRetentionSeconds = retentionDays * SECONDS_PER_DAY;
  const safeNow = Number.isFinite(now) ? now : Date.now();
  const deadlineMs = createdAt + maxRetentionSeconds * 1000;
  const remainingSeconds = Math.ceil((deadlineMs - safeNow) / 1000);
  if (remainingSeconds <= 0) return 0;
  return Math.min(maxRetentionSeconds, remainingSeconds);
}

/**
 * Decide whether a print-order rewrite may use a provider-valid KV TTL, or must
 * durably delete. Never returns a sub-minute TTL and never extends past the
 * creation-anchored deadline.
 */
export function resolvePrintOrderKvWrite(
  createdAt: unknown,
  now = Date.now(),
): { action: "delete" } | { action: "persist"; ttlSeconds: number } {
  const remainingSeconds = getPrintOrderRetentionSeconds(createdAt, now);
  if (remainingSeconds < CLOUDFLARE_KV_MIN_EXPIRATION_TTL_SECONDS) {
    return { action: "delete" };
  }
  return { action: "persist", ttlSeconds: remainingSeconds };
}

export type PersistPrintOrderOptions = {
  /**
   * Explicit operator resolve/recover may clear a terminal failure mirror.
   * Ordinary nonterminal writers must leave this unset/false.
   */
  allowClearTerminalFailure?: boolean;
};

/** Explicit durable write outcome — callers must not treat delete as silent success. */
export type PersistPrintOrderResult =
  | { outcome: "persisted"; ttlSeconds: number }
  | { outcome: "deleted_unretainable"; reason: "malformed_created_at" | "expired_or_below_min_ttl" }
  | { outcome: "rejected_terminal_failure" };

export type PrintOrderUnretainableReason = Extract<
  PersistPrintOrderResult,
  { outcome: "deleted_unretainable" }
>["reason"];

/**
 * Fail-closed signal when a print-order key was durably removed (or could not be
 * retained) instead of rewritten. Must not continue into provider side effects,
 * and must not be treated as a Stripe-retryable KV outage (retry would remint a
 * fresh retention window and risk a duplicate Printful order).
 */
export class PrintOrderUnretainableError extends Error {
  readonly code = "print_order_unretainable";
  readonly reason: PrintOrderUnretainableReason;

  constructor(reason: PrintOrderUnretainableReason) {
    super(`print_order_unretainable:${reason}`);
    this.name = "PrintOrderUnretainableError";
    this.reason = reason;
  }
}

export function isPrintOrderUnretainableError(error: unknown): error is PrintOrderUnretainableError {
  return error instanceof PrintOrderUnretainableError;
}

export function classifyPrintOrderUnretainableReason(createdAt: unknown): PrintOrderUnretainableReason {
  if (typeof createdAt !== "number" || !Number.isFinite(createdAt)) {
    return "malformed_created_at";
  }
  return "expired_or_below_min_ttl";
}

/**
 * Require a successful durable rewrite. Deleted/unretainable outcomes throw so
 * webhook/retry callers abort before Printful (or alternate) submission.
 */
export function assertPrintOrderRetained(
  result: PersistPrintOrderResult,
): asserts result is Extract<PersistPrintOrderResult, { outcome: "persisted" }> {
  if (result.outcome === "persisted") return;
  if (result.outcome === "rejected_terminal_failure") {
    throw new Error("print_order_rejected_terminal_failure");
  }
  throw new PrintOrderUnretainableError(result.reason);
}

/**
 * Brand-new print orders get `now`. When a prior record exists (including
 * pending/failed duplicates), preserve its `createdAt` exactly — even when
 * null/missing/non-finite — so persistence can fail closed instead of minting
 * a fresh retention window.
 */
export function resolvePrintOrderCreatedAt(
  existing: { createdAt?: unknown } | null | undefined,
  now = Date.now(),
): number {
  if (!existing) return now;
  // Intentionally return malformed values unchanged for fail-closed retention.
  return existing.createdAt as number;
}

/**
 * Sync hold annotations from the LATEST stored record onto a pending
 * whole-record write. Hold state is owned by the stored record: it is
 * written by the Printful webhook handler (and cleared by the terminal,
 * operator-resolve, and shipment writers) on its own timeline, while
 * other writers (the post-submit identity/review persists) build their
 * records from snapshots that predate — or, after an earlier sync,
 * postdate — the latest hold state. Syncing in both directions is what
 * makes those writers safe: a hold recorded during their awaits is
 * carried onto the write instead of being erased, and a hold CLEARED
 * during their awaits is stripped from the write instead of being
 * resurrected from the snapshot. Callers must pass the freshest read
 * they can take immediately before persisting; the writers that
 * deliberately end a hold never use this helper.
 */
export function preserveLatestHoldAnnotations(
  next: PrintOrderRecord,
  latest: PrintOrderRecord | null | undefined,
): PrintOrderRecord {
  if (!latest) return next;
  if (!latest.providerHoldAt) {
    if (!next.providerHoldAt) return next;
    return {
      ...next,
      providerHoldAt: undefined,
      providerHoldReason: undefined,
      providerHoldOrderStatus: undefined,
      operatorHoldAlertedAt: undefined,
      operatorHoldAlertProvider: undefined,
      operatorHoldAlertError: undefined,
      operatorHoldEscalatedAt: undefined,
      operatorHoldEscalationAlertError: undefined,
    };
  }
  return {
    ...next,
    providerHoldAt: latest.providerHoldAt,
    providerHoldReason: latest.providerHoldReason,
    providerHoldOrderStatus: latest.providerHoldOrderStatus,
    operatorHoldAlertedAt: latest.operatorHoldAlertedAt,
    operatorHoldAlertProvider: latest.operatorHoldAlertProvider,
    operatorHoldAlertError: latest.operatorHoldAlertError,
    operatorHoldEscalatedAt: latest.operatorHoldEscalatedAt,
    operatorHoldEscalationAlertError: latest.operatorHoldEscalationAlertError,
  };
}

/**
 * S96 follow-up writer audit F-2: the concurrent-state fields a
 * whole-record writer built from a snapshot must never own. Hold
 * annotations are handled by preserveLatestHoldAnnotations above;
 * these are the remaining fields other writers land on their own
 * timelines — operator resolution (resolve route), the shipment fact
 * and its notification outcome (shipping writer), and the customer
 * confirmation outcome (confirmation writer). A snapshot write that
 * spreads its own stale values for any of them erases (or resurrects)
 * state that landed during its awaits: the shipment anchor the review
 * engine times from, the resolution an operator just recorded, the
 * confirmation stamp that prevents a duplicate customer email.
 */
const PRINT_ORDER_CONCURRENT_STATE_FIELDS = [
  "operatorResolvedAt",
  "operatorResolvedProvider",
  "operatorResolvedNote",
  "shippedAt",
  "shippingNotificationSentAt",
  "shippingNotificationProvider",
  "shippingNotificationTrackingNumber",
  "shippingNotificationMessageId",
  "shippingNotificationError",
  "printConfirmationSentAt",
  "printConfirmationMessageId",
  "printConfirmationError",
] as const satisfies readonly (keyof PrintOrderRecord)[];

/**
 * Generalized form of preserveLatestHoldAnnotations (S96 follow-up
 * writer audit F-2): sync the hold annotations AND every other
 * concurrent-state field from the LATEST stored record onto a pending
 * whole-record write, so the write keeps only the fields its caller
 * owns and everything that landed during the caller's awaits survives.
 * Fields named in `ownedFields` are the caller's own outcome fields
 * (e.g. the confirmation writer owns printConfirmation*) and are left
 * exactly as the caller set them. As with the hold sync, values are
 * taken from the latest record verbatim — a field cleared there is
 * cleared on the write, never resurrected from the snapshot.
 * Callers must pass the freshest read they can take immediately
 * before persisting.
 */
export function preserveLatestConcurrentState(
  next: PrintOrderRecord,
  latest: PrintOrderRecord | null | undefined,
  ownedFields?: ReadonlySet<keyof PrintOrderRecord>,
): PrintOrderRecord {
  if (!latest) return next;
  let out = preserveLatestHoldAnnotations(next, latest);
  for (const field of PRINT_ORDER_CONCURRENT_STATE_FIELDS) {
    if (ownedFields?.has(field)) continue;
    if (out[field] !== latest[field]) {
      if (out === next) out = { ...next };
      out = { ...out, [field]: latest[field] };
    }
  }
  return out;
}

/**
 * S96 follow-up writer audit: has the stored record advanced past the
 * snapshot a writer is holding — a status change, an operator
 * resolution, a shipment anchor, a hold-episode change, or a provider
 * identity change landing during the writer's awaits? Writers that
 * must not write over such advancement refuse when this returns true;
 * the final read-to-write gap that remains is the accepted doctrine
 * (KV has no CAS; the Durable-Object authority stays correct).
 */
export function printOrderAdvancedPastSnapshot(
  snapshot: PrintOrderRecord,
  latest: PrintOrderRecord | null | undefined,
  options?: { ignoreShippedAt?: boolean },
): boolean {
  if (!latest) return false;
  if (latest.status !== snapshot.status) return true;
  if (Boolean(latest.operatorResolvedAt) !== Boolean(snapshot.operatorResolvedAt)) return true;
  if (
    latest.operatorResolvedAt &&
    snapshot.operatorResolvedAt &&
    latest.operatorResolvedAt !== snapshot.operatorResolvedAt
  ) {
    return true;
  }
  if (!options?.ignoreShippedAt && Boolean(latest.shippedAt) !== Boolean(snapshot.shippedAt)) {
    return true;
  }
  if ((latest.providerHoldAt ?? null) !== (snapshot.providerHoldAt ?? null)) return true;
  const snapshotId = snapshot.printfulOrderId ? String(snapshot.printfulOrderId) : "";
  const latestId = latest.printfulOrderId ? String(latest.printfulOrderId) : "";
  if (snapshotId !== latestId) return true;
  return false;
}

export type AlternateDispatchCompletionPersistOutcome =
  | { persisted: true; record: PrintOrderRecord; result: PersistPrintOrderResult }
  | { persisted: false; record: PrintOrderRecord; reason: "completion_superseded" };

/**
 * S96 follow-up writer audit F-9: the alternate-dispatch "sent"
 * persist shared by the Stripe webhook and the admin retry. Both
 * sites built the sent record from a pre-fetch snapshot and persisted
 * it after the outbound fetch await, so a shipment anchored during
 * the fetch (an admin notify-shipping needs neither a Printful ID
 * nor a sent status) — or a resolution — was erased by the write.
 * This merge re-reads the latest record after the fetch and lands
 * ONLY the completion fields on it, preserving shipment,
 * notification, resolution, and hold state. It refuses when the
 * completion itself has been superseded: the authority reached a
 * terminal/bound/recovered lifecycle, an operator resolution landed,
 * or the stored dispatch marker belongs to a different (or already
 * accepted) dispatch episode.
 */
export async function persistAlternateDispatchCompletionLatestMerged(input: {
  sessionId: string;
  snapshot: PrintOrderRecord;
  completion: {
    webhookStatus?: number;
    sentAt: number;
    printAssetUrl?: string;
    alternateDispatch: AlternateFulfillmentDispatch;
  };
}): Promise<AlternateDispatchCompletionPersistOutcome> {
  const { sessionId, snapshot, completion } = input;
  const completionFields: Partial<PrintOrderRecord> = {
    status: "sent",
    webhookStatus: completion.webhookStatus,
    sentAt: completion.sentAt,
    printAssetUrl: completion.printAssetUrl,
    error: undefined,
    terminalEventType: null,
    alternateDispatch: completion.alternateDispatch,
  };
  const latest = await kv.get<PrintOrderRecord>(printOrderKey(sessionId));
  if (!latest) {
    const record: PrintOrderRecord = { ...snapshot, ...completionFields };
    const result = await persistPrintOrderRecord(sessionId, record);
    return { persisted: true, record, result };
  }
  const { readAuthorityLifecycleForMirrorGuard } = await import("@/lib/printOrderAuthority");
  const lifecycle = await readAuthorityLifecycleForMirrorGuard(sessionId);
  const markerMoved = Boolean(
    latest.alternateDispatch &&
      (latest.alternateDispatch.dispatchId !== completion.alternateDispatch.dispatchId ||
        (latest.alternateDispatch.state === "accepted" &&
          snapshot.alternateDispatch?.state !== "accepted")),
  );
  const superseded =
    lifecycle === "terminal_failed" ||
    lifecycle === "bound" ||
    lifecycle === "operator_recovered" ||
    Boolean(latest.operatorResolvedAt && !snapshot.operatorResolvedAt) ||
    markerMoved;
  if (superseded) {
    return { persisted: false, record: latest, reason: "completion_superseded" };
  }
  const record: PrintOrderRecord = {
    ...latest,
    ...completionFields,
    webhookStatus: completion.webhookStatus ?? latest.webhookStatus,
    printAssetUrl: completion.printAssetUrl ?? latest.printAssetUrl,
  };
  const result = await persistPrintOrderRecord(sessionId, record);
  return { persisted: true, record, result };
}

export async function persistPrintOrderRecord(
  sessionId: string,
  record: PrintOrderRecord,
  options?: PersistPrintOrderOptions,
): Promise<PersistPrintOrderResult> {
  const key = printOrderKey(sessionId);
  const plan = resolvePrintOrderKvWrite(record.createdAt);
  if (plan.action === "delete") {
    // Remaining window is below Workers KV's minimum valid TTL (or malformed /
    // already expired). Do not attempt an invalid expirationTtl and do not
    // extend retention to 60s past the original deadline — remove the PII key.
    // Callers MUST treat deleted_unretainable as fail-closed (no provider create).
    await kv.deleteDurable(key);
    return {
      outcome: "deleted_unretainable",
      reason: classifyPrintOrderUnretainableReason(record.createdAt),
    };
  }

  // Authority-backed guard: nonterminal KV mirrors must not clear terminal failure.
  // The Durable Object is authoritative; KV remains a projection.
  if (record.status !== "failed" && !options?.allowClearTerminalFailure) {
    const { readAuthorityLifecycleForMirrorGuard, shouldRejectNonterminalKvMirror } =
      await import("@/lib/printOrderAuthority");
    const lifecycle = await readAuthorityLifecycleForMirrorGuard(sessionId);
    if (shouldRejectNonterminalKvMirror(lifecycle)) {
      return { outcome: "rejected_terminal_failure" };
    }
    // Best-effort KV self-check when authority is still unbound: explicit
    // nonterminal failures (`terminalEventType: null`) may be overwritten by
    // retry/sent. Explicit terminal or legacy-absent provenance must not clear
    // without allowClearTerminalFailure (AG-086).
    if (lifecycle === "unbound") {
      const existing = await kv.get<PrintOrderRecord>(key);
      if (kvFailedMirrorBlocksNonterminalWrite(existing)) {
        return { outcome: "rejected_terminal_failure" };
      }
    }
  }

  // Provider-valid remaining TTL: use strict durable put so Cloudflare
  // binding/put failures propagate instead of silent local-only success.
  await kv.setDurable(key, record, { ex: plan.ttlSeconds });
  return { outcome: "persisted", ttlSeconds: plan.ttlSeconds };
}

/**
 * Operator/status/retry/script-safe order view: never include phone values.
 * Exposes only a boolean so ops can confirm presence without logging PII.
 */
export function sanitizePrintOrderForOperatorResponse(record: PrintOrderRecord) {
  const hasCheckoutPhone = Boolean(
    normalizeCheckoutPhone(record.customerPhone) || normalizeCheckoutPhone(record.shippingDetails?.phone),
  );
  const rest = { ...record };
  delete rest.customerPhone;
  let safeShippingDetails: PrintOrderRecord["shippingDetails"] = rest.shippingDetails ?? null;
  if (safeShippingDetails && typeof safeShippingDetails === "object") {
    const shippingRest = { ...safeShippingDetails };
    delete (shippingRest as { phone?: string | null }).phone;
    safeShippingDetails = shippingRest;
  }
  return {
    ...rest,
    shippingDetails: safeShippingDetails,
    hasCheckoutPhone,
  };
}

type PrintfulRecipient = NonNullable<ReturnType<typeof getPrintRecipient>>;

/**
 * Outbound payload for the optional generic `PRINT_FULFILLMENT_WEBHOOK_URL`.
 * Omits checkout phone from both top-level record fields and recipient —
 * phone is shared only with Printful. Does not mutate the stored record.
 */
export function buildAlternateFulfillmentWebhookPayload(
  record: PrintOrderRecord,
  extras: {
    printAssetUrl?: string;
    cardPrintAssetUrl?: string;
    recipient: PrintfulRecipient;
  },
) {
  const sanitizedRecord = sanitizePrintOrderForOperatorResponse(record);
  const orderWithoutPhoneFlag = { ...sanitizedRecord };
  delete (orderWithoutPhoneFlag as { hasCheckoutPhone?: boolean }).hasCheckoutPhone;
  const recipientWithoutPhone = { ...extras.recipient };
  delete (recipientWithoutPhone as { phone?: string }).phone;
  return {
    ...orderWithoutPhoneFlag,
    // S94-1 F9: the stable per-session dispatch identity, so a
    // receiver that tracks submissions can recognise a replay.
    dispatchId: alternateFulfillmentDispatchId(record.sessionId),
    ...(extras.printAssetUrl ? { printAssetUrl: extras.printAssetUrl } : {}),
    ...(extras.cardPrintAssetUrl ? { cardPrintAssetUrl: extras.cardPrintAssetUrl } : {}),
    recipient: recipientWithoutPhone,
  };
}

export function getPrintRecipient(record: PrintOrderRecord) {
  const shippingAddress = record.shippingDetails?.address;
  const shippingName = record.shippingDetails?.name?.trim() || record.customerName?.trim() || "";
  const email = record.customerEmail?.trim() || "";
  if (
    !shippingAddress ||
    !shippingName ||
    !shippingAddress.line1 ||
    !shippingAddress.city ||
    !shippingAddress.country ||
    !shippingAddress.postal_code
  ) {
    return null;
  }

  const phone =
    normalizeCheckoutPhone(record.customerPhone) ??
    normalizeCheckoutPhone(record.shippingDetails?.phone) ??
    undefined;

  return {
    name: shippingName,
    email: email || undefined,
    phone,
    address1: shippingAddress.line1,
    address2: shippingAddress.line2 || undefined,
    city: shippingAddress.city,
    state_code: shippingAddress.state || undefined,
    country_code: shippingAddress.country,
    zip: shippingAddress.postal_code,
  };
}
