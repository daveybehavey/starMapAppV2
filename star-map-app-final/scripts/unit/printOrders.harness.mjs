/** Keep in sync with src/lib/printOrders.ts phone + recipient helpers. */

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
