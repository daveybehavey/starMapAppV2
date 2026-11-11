/** v1 has no body signature: a webhook is only a hint to read current provider state. */
export type VerifiedPrintfulShipment = {
  tracking_number: string | null;
  tracking_url: string | null;
  carrier: string | null;
  service: string | null;
};

export type VerifiedPrintfulEvent = {
  type: string;
  data: {
    order: { id: string; external_id: string; status: string };
    reason: null;
    shipment: VerifiedPrintfulShipment | null;
  };
};

type Verification =
  | { ok: true; payload: VerifiedPrintfulEvent }
  | { ok: false; reason: string };

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function orderId(value: unknown): string {
  const id = typeof value === "number" && Number.isSafeInteger(value) ? String(value) : text(value);
  return /^[1-9]\d*$/.test(id) ? id : "";
}

export async function verifyPrintfulWebhookEvent(
  eventType: string,
  hint: { id?: unknown; external_id?: unknown } | null | undefined,
  hintTrackingNumber?: unknown,
): Promise<Verification> {
  const id = orderId(hint?.id);
  const externalId = text(hint?.external_id);
  if ((!id && !externalId) || (hint?.id != null && !id)) {
    return { ok: false, reason: "invalid_order_identity" };
  }
  const token = process.env.PRINTFUL_API_TOKEN?.trim();
  if (!token) return { ok: false, reason: "api_not_configured" };
  const base = (process.env.PRINTFUL_API_BASE_URL?.trim() || "https://api.printful.com").replace(/\/$/, "");
  try {
    const storeId = process.env.PRINTFUL_STORE_ID?.trim();
    const query = new URLSearchParams();
    if (storeId) query.set("store_id", storeId);
    const orderUrl = `${base}/orders/${encodeURIComponent(id || `@${externalId}`)}${storeId ? `?${query.toString()}` : ""}`;
    const response = await fetch(orderUrl, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) return { ok: false, reason: "api_http_error" };
    const body = await response.json() as {
      code?: unknown;
      result?: {
        id?: unknown;
        external_id?: unknown;
        status?: unknown;
        shipments?: unknown;
      };
    } | null;
    const order = body?.result;
    const confirmedId = orderId(order?.id);
    const confirmedExternalId = text(order?.external_id);
    if (body?.code !== 200 || !confirmedId) return { ok: false, reason: "invalid_api_order" };
    if ((id && id !== confirmedId) || (externalId && externalId !== confirmedExternalId)) {
      return { ok: false, reason: "order_identity_mismatch" };
    }
    if (!order) return { ok: false, reason: "invalid_api_order" };
    const status = text(order.status);
    let shipment: VerifiedPrintfulShipment | null = null;
    if (eventType === "package_shipped") {
      // The hint only selects an API shipment; all payload fields come from that record.
      const shipments = Array.isArray(order.shipments) ? order.shipments : [];
      const tracked = shipments.filter((row: { tracking_number?: unknown } | null) => text(row?.tracking_number));
      const hintTracking = typeof hintTrackingNumber === "string" ? hintTrackingNumber : "";
      const matched = hintTracking.trim()
        ? tracked.find((row: { tracking_number?: unknown }) => row.tracking_number === hintTracking)
        : undefined;
      if (!matched && tracked.length > 1) return { ok: false, reason: "shipment_ambiguous" };
      const shipped = matched || tracked[0];
      if (!shipped) return { ok: false, reason: "shipment_not_confirmed" };
      shipment = {
        tracking_number: text(shipped.tracking_number) || null,
        tracking_url: text(shipped.tracking_url) || null,
        carrier: text(shipped.carrier) || null,
        service: text(shipped.service) || null,
      };
    } else {
      const expected: Record<string, string> = {
        order_failed: "failed",
        order_canceled: "canceled",
        order_put_hold: "onhold",
      };
      if (!expected[eventType] || status !== expected[eventType]) {
        return { ok: false, reason: "order_state_mismatch" };
      }
    }
    return {
      ok: true,
      payload: {
        type: eventType,
        // v1 order reads do not provide the webhook's free-text reason. Never trust that hint.
        data: { order: { id: confirmedId, external_id: confirmedExternalId, status }, reason: null, shipment },
      },
    };
  } catch {
    // Never log the exception: fetch/parse errors can contain URLs or response bodies.
    return { ok: false, reason: "api_unavailable" };
  }
}
