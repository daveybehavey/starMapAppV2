/** Keep in sync with src/lib/printOrders.ts phone + recipient + operator sanitization helpers. */

export const DEFAULT_PRINT_ORDER_RETENTION_DAYS = 60;
export const CLOUDFLARE_KV_MIN_EXPIRATION_TTL_SECONDS = 60;
const SECONDS_PER_DAY = 24 * 60 * 60;

export function normalizeCheckoutPhone(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

export function extractCheckoutPhoneFromStripeSession(session) {
  return (
    normalizeCheckoutPhone(session?.customer_details?.phone) ??
    normalizeCheckoutPhone(session?.shipping_details?.phone)
  );
}

export function getPrintOrderRetentionSeconds({
  createdAt,
  now = Date.now(),
  env = process.env,
} = {}) {
  if (typeof createdAt !== "number" || !Number.isFinite(createdAt)) return 0;
  const raw = typeof env.PRINT_ORDER_RETENTION_DAYS === "string" ? env.PRINT_ORDER_RETENTION_DAYS.trim() : "";
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
 * Persist only when remaining TTL is Workers-KV-valid (>=60). Otherwise delete.
 * Never extends past the creation-anchored deadline.
 */
export function resolvePrintOrderKvWrite({ createdAt, now = Date.now(), env = process.env } = {}) {
  const remainingSeconds = getPrintOrderRetentionSeconds({ createdAt, now, env });
  if (remainingSeconds < CLOUDFLARE_KV_MIN_EXPIRATION_TTL_SECONDS) {
    return { action: "delete" };
  }
  return { action: "persist", ttlSeconds: remainingSeconds };
}

/**
 * Brand-new print orders get `now`. Prior records keep createdAt exactly
 * (including malformed) so retention can fail closed.
 */
export function resolvePrintOrderCreatedAt(existing, now = Date.now()) {
  if (!existing) return now;
  return existing.createdAt;
}

export function sanitizePrintOrderForOperatorResponse(record) {
  const hasCheckoutPhone = Boolean(
    normalizeCheckoutPhone(record.customerPhone) || normalizeCheckoutPhone(record.shippingDetails?.phone),
  );
  const { customerPhone: _customerPhone, shippingDetails, ...rest } = record;
  let safeShippingDetails = shippingDetails ?? null;
  if (shippingDetails && typeof shippingDetails === "object") {
    const { phone: _phone, ...shippingRest } = shippingDetails;
    safeShippingDetails = shippingRest;
  }
  return {
    ...rest,
    shippingDetails: safeShippingDetails,
    hasCheckoutPhone,
  };
}

/**
 * Defense-in-depth for operator CLI output that prints status/retry JSON bodies.
 * Keep in sync with scripts/retry-print-order.mjs.
 */
export function redactPrintOrderApiResponseText(text) {
  if (typeof text !== "string" || !text) return text;
  try {
    const parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== "object" || !parsed.order || typeof parsed.order !== "object") {
      return text;
    }
    return JSON.stringify({
      ...parsed,
      order: sanitizePrintOrderForOperatorResponse(parsed.order),
    });
  } catch {
    return text
      .replace(/"customerPhone"\s*:\s*"[^"]*"/g, '"customerPhone":"[redacted]"')
      .replace(/"phone"\s*:\s*"[^"]*"/g, '"phone":"[redacted]"');
  }
}

export function getPrintRecipient(record) {
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

/**
 * Keep in sync with buildAlternateFulfillmentWebhookPayload in src/lib/printOrders.ts.
 * Omits phone from generic alternate fulfillment webhook payloads.
 */
export function buildAlternateFulfillmentWebhookPayload(record, extras) {
  const sanitizedRecord = sanitizePrintOrderForOperatorResponse(record);
  const orderWithoutPhoneFlag = { ...sanitizedRecord };
  delete orderWithoutPhoneFlag.hasCheckoutPhone;
  const recipientWithoutPhone = { ...extras.recipient };
  delete recipientWithoutPhone.phone;
  return {
    ...orderWithoutPhoneFlag,
    ...(extras.printAssetUrl ? { printAssetUrl: extras.printAssetUrl } : {}),
    ...(extras.cardPrintAssetUrl ? { cardPrintAssetUrl: extras.cardPrintAssetUrl } : {}),
    recipient: recipientWithoutPhone,
  };
}

/**
 * Mirrors operator-alert destination / log-safe fields (printOrderAlerts.formatDestination).
 * Must never include phone, email, or street address.
 */
export function getPrintOrderOpsSafeSummary(record) {
  const address = record.shippingDetails?.address;
  return {
    sessionId: record.sessionId,
    status: record.status,
    printVariant: record.printVariant,
    destination: [address?.city, address?.state, address?.country].filter(Boolean).join(", ") || null,
    hasCheckoutPhone: Boolean(
      normalizeCheckoutPhone(record.customerPhone) ||
        normalizeCheckoutPhone(record.shippingDetails?.phone),
    ),
  };
}

export function basePrintOrder(overrides = {}) {
  return {
    status: "pending",
    sessionId: "cs_test_phone_recipient_fixture",
    printVariant: "poster_framed",
    includesDigitalAddOn: false,
    attempts: 1,
    createdAt: 1_700_000_000_000,
    customerName: "Test Buyer",
    customerEmail: "buyer@example.test",
    shippingDetails: {
      name: "Test Buyer",
      address: {
        line1: "123 Example St",
        line2: null,
        city: "Austin",
        state: "TX",
        postal_code: "78701",
        country: "US",
      },
    },
    ...overrides,
  };
}
