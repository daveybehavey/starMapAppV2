import crypto from "node:crypto";
import { evaluateMerchContribution, type MerchContributionInput } from "@/lib/merchContribution";

export type PrintfulV2Recipient = {
  name: string;
  email?: string;
  phone?: string;
  address1: string;
  address2?: string;
  city: string;
  state_code?: string;
  country_code: string;
  zip: string;
};

export type SubmitPrintfulV2CatalogOrderInput = {
  existingDraftOrderId?: string | number;
  contribution?: MerchContributionInput;
  externalId: string;
  catalogVariantId: number;
  fileUrl: string;
  recipient: PrintfulV2Recipient;
  /**
   * Catalog orders use placements; keep minimal + consistent.
   * Printful supports "front" placements for apparel, and some products may have "default".
   */
  placement: "front" | "default";
  technique: "dtg" | "digital";
  /**
   * Optional human-readable name for the order item (shows in Printful dashboard).
   * Keep it short.
   */
  itemName?: string;
};

export type SubmitPrintfulV2OrderResult = {
  ok: boolean;
  status: number;
  orderId?: string | number;
  error?: string;
  /** True when an existing order was reused instead of creating another. */
  reconciled?: boolean;
  providerState?: string;
};

function normalizeExternalId(raw: string) {
  const trimmed = raw.trim();
  if (/^[A-Za-z0-9_-]{1,32}$/.test(trimmed)) return trimmed;
  const digest = crypto.createHash("sha256").update(trimmed).digest("hex").slice(0, 24);
  return `smc_${digest}`;
}

function getPrintfulApiBase() {
  return (process.env.PRINTFUL_API_BASE_URL?.trim() || "https://api.printful.com").replace(/\/+$/, "");
}

function getToken() {
  return process.env.PRINTFUL_API_TOKEN?.trim() || "";
}

function getStoreId() {
  return process.env.PRINTFUL_STORE_ID?.trim() || "";
}

export function isPrintfulV2Configured() {
  return Boolean(getToken()) && Boolean(getStoreId());
}

function parseErrorMessage(raw: string, parsed: unknown) {
  if (parsed && typeof parsed === "object") {
    const record = parsed as { error?: { message?: unknown; reason?: unknown; code?: unknown } };
    const msg =
      (typeof record.error?.message === "string" && record.error.message.trim()) ||
      (typeof record.error?.reason === "string" && record.error.reason.trim()) ||
      "";
    const code = typeof record.error?.code === "string" ? record.error.code.trim() : "";
    return code ? `${msg} (${code})`.trim() : msg;
  }
  return raw.trim() ? raw.slice(0, 240) : "printful_v2_order_failed";
}

function extractV2OrderId(parsed: unknown): string | number | undefined {
  if (!parsed || typeof parsed !== "object") return undefined;
  const data =
    "data" in parsed ? (parsed as { data?: { id?: unknown } }).data : (parsed as { id?: unknown });
  const id = data && typeof data === "object" ? (data as { id?: unknown }).id : undefined;
  return typeof id === "string" || typeof id === "number" ? id : undefined;
}

/**
 * Detect duplicate / existing-external-id style provider responses.
 * Mirrors v1 OR-1 / non-editable intent for V2: never mint a second external id.
 */
function isExistingExternalIdConflict(status: number, parsed: unknown, raw: string): boolean {
  if (status === 409) return true;
  const msg = parseErrorMessage(raw, parsed).toLowerCase();
  if (!msg) return false;
  if (msg.includes("no longer editable") || msg.includes("not editable")) return true;
  if (msg.includes("already exists") || msg.includes("duplicate") || msg.includes("conflict")) {
    return true;
  }
  // e.g. "external_id must be unique" / "external id already taken"
  const mentionsExternal = msg.includes("external_id") || msg.includes("external id");
  if (
    mentionsExternal &&
    (msg.includes("exist") || msg.includes("unique") || msg.includes("taken") || msg.includes("duplicate"))
  ) {
    return true;
  }
  return false;
}

async function createPrintfulV2CatalogOrder(
  input: SubmitPrintfulV2CatalogOrderInput,
): Promise<SubmitPrintfulV2OrderResult> {
  const token = getToken();
  const storeId = getStoreId();
  if (!token) return { ok: false, status: 503, error: "printful_token_missing" };
  if (!storeId) return { ok: false, status: 503, error: "printful_store_id_missing" };
  if (!Number.isFinite(input.catalogVariantId) || input.catalogVariantId <= 0) {
    return { ok: false, status: 400, error: "printful_catalog_variant_invalid" };
  }

  const baseUrl = getPrintfulApiBase();
  const url = `${baseUrl}/v2/orders`;
  const normalizedExternalId = normalizeExternalId(input.externalId);

  const body = {
    external_id: normalizedExternalId,
    shipping: "STANDARD",
    recipient: input.recipient,
    order_items: [
      {
        source: "catalog",
        catalog_variant_id: input.catalogVariantId,
        external_id: normalizeExternalId(`${input.externalId}-item`),
        quantity: 1,
        name: input.itemName?.trim() ? input.itemName.trim().slice(0, 64) : "Custom Star Map",
        placements: [
          {
            placement: input.placement,
            technique: input.technique,
            print_area_type: "simple",
            layers: [
              {
                type: "file",
                url: input.fileUrl,
              },
            ],
            placement_options: [{ name: "unlimited_color", value: true }],
          },
        ],
      },
    ],
  };

  const PRINTFUL_API_TIMEOUT_MS = 15_000;
  const authHeaders = {
    Authorization: `Bearer ${token}`,
    "X-PF-Store-Id": storeId,
  };

  const lookupOrderIdByExternalId = async (): Promise<string | number | null> => {
    // V2 resolves external ids via /v2/orders/@{external_id} (same @ convention as v1).
    const lookupUrl = `${baseUrl}/v2/orders/@${encodeURIComponent(normalizedExternalId)}`;
    const response = await fetch(lookupUrl, {
      method: "GET",
      headers: authHeaders,
      signal: AbortSignal.timeout(PRINTFUL_API_TIMEOUT_MS),
    });
    if (!response.ok) return null;
    const raw = await response.text();
    let parsed: unknown = null;
    try {
      parsed = raw ? JSON.parse(raw) : null;
    } catch {
      parsed = null;
    }
    return extractV2OrderId(parsed) ?? null;
  };

  const reconcileExistingOrFail = async (): Promise<SubmitPrintfulV2OrderResult> => {
    try {
      const existingOrderId = await lookupOrderIdByExternalId();
      if (existingOrderId != null) {
        return {
          ok: true,
          status: 200,
          orderId: existingOrderId,
          reconciled: true,
        };
      }
    } catch {
      // Fall through — do not create a duplicate order.
    }
    return {
      ok: false,
      status: 409,
      error: "printful_v2_order_exists_not_reconciled",
    };
  };

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        ...authHeaders,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(PRINTFUL_API_TIMEOUT_MS),
    });
    const raw = await response.text();
    let parsed: unknown = null;
    try {
      parsed = raw ? JSON.parse(raw) : null;
    } catch {
      parsed = null;
    }

    if (!response.ok) {
      // Duplicate / existing external_id: reconcile — never invent a second external id.
      if (isExistingExternalIdConflict(response.status, parsed, raw)) {
        return await reconcileExistingOrFail();
      }

      return {
        ok: false,
        status: response.status,
        error: parseErrorMessage(raw, parsed),
      };
    }

    return {
      ok: true,
      status: response.status,
      orderId: extractV2OrderId(parsed),
    };
  } catch (error) {
    const isTimeout = error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError");
    // Ambiguous network/timeout: the POST may have been accepted. Prefer GET reconcile
    // over returning a blind failure that could later create a second order.
    try {
      const existingOrderId = await lookupOrderIdByExternalId();
      if (existingOrderId != null) {
        return {
          ok: true,
          status: 200,
          orderId: existingOrderId,
          reconciled: true,
        };
      }
    } catch {
      // Fall through to definitive failure — no order observed.
    }
    return {
      ok: false,
      status: 503,
      error: isTimeout
        ? "printful_v2_request_timeout"
        : error instanceof Error
          ? error.message.slice(0, 240)
          : "printful_v2_request_failed",
    };
  }
}

/** A draft is a durable provider identity, never evidence that production was confirmed. */
export async function submitPrintfulV2CatalogOrder(input: SubmitPrintfulV2CatalogOrderInput): Promise<SubmitPrintfulV2OrderResult> {
  if (!input.contribution || !evaluateMerchContribution(input.contribution).allowed) {
    return { ok: false, status: 409, error: "merch_margin_estimate_unavailable" };
  }
  const created: SubmitPrintfulV2OrderResult = input.existingDraftOrderId != null
    ? { ok: true, status: 200, orderId: input.existingDraftOrderId, reconciled: true }
    : await createPrintfulV2CatalogOrder(input);
  if (!created.ok || created.orderId == null) return { ...created, ok: false, error: created.error || "printful_v2_identity_missing" };
  const headers = { Authorization: `Bearer ${getToken()}`, "X-PF-Store-Id": getStoreId() };
  const url = `${getPrintfulApiBase()}/v2/orders/${encodeURIComponent(String(created.orderId))}`;
  type Order = { id?: string | number; external_id?: string; recipient?: PrintfulV2Recipient; status?: string; costs?: { calculation_status?: string; currency?: string; total?: string } };
  const read = async (): Promise<Order | null> => {
    const response = await fetch(url, { headers, signal: AbortSignal.timeout(15_000) });
    if (!response.ok) return null;
    const result = await response.json() as { data?: Order };
    return result.data && String(result.data.id) === String(created.orderId) && result.data.external_id === normalizeExternalId(input.externalId) ? result.data : null;
  };
  const confirmed = (order: Order | null) => Boolean(order && ["pending", "inprocess", "partial", "fulfilled"].includes(order.status || ""));
  const held = (error: string, state?: string): SubmitPrintfulV2OrderResult => ({ ...created, ok: false, status: 409, error, providerState: state || "unknown" });
  try {
    let order = await read();
    if (!order || order.external_id !== normalizeExternalId(input.externalId)) return held("printful_v2_intent_mismatch", order?.status);
    if (confirmed(order)) return { ...created, providerState: order!.status };
    if (!order || order.status !== "draft") return held("printful_v2_operator_review_required", order?.status);
    if (/^(0|false|no)$/i.test((process.env.PRINTFUL_AUTO_CONFIRM ?? "true").trim())) return held("printful_v2_manual_review_required", "draft");
    // Reconciled drafts may have been edited outside this application. Do not charge
    // them without an operator comparing the actual variant/artwork and destination.
    if (created.reconciled) return held("printful_v2_existing_draft_review_required", order.status);
    const expectedRecipient = input.recipient;
    if (!order.recipient || ["name", "country_code", "state_code", "address1", "address2", "city", "zip"].some(key =>
      (order!.recipient![key as keyof PrintfulV2Recipient] || "") !== (expectedRecipient[key as keyof PrintfulV2Recipient] || ""))) {
      return held("printful_v2_recipient_mismatch", order.status);
    }
    if (order.costs?.calculation_status !== "done") return held("printful_v2_costs_pending", "draft");
    const rawTotal = order.costs.total;
    if (order.costs.currency !== "USD" || typeof rawTotal !== "string" || !/^\d+(?:\.\d{1,2})?$/.test(rawTotal)) return held("printful_v2_costs_invalid", "draft");
    const margin = evaluateMerchContribution({ ...input.contribution, providerTotalUsdCents: Math.round(Number(rawTotal) * 100) });
    if (!margin.allowed) return held(margin.code, "draft");
    // One attempt only; a timeout may mean acceptance. Re-read, never create a replacement.
    try {
      await fetch(`${url}/confirmation`, { method: "POST", headers, signal: AbortSignal.timeout(15_000) });
    } catch { /* reconcile below */ }
    order = await read();
    return confirmed(order) ? { ...created, providerState: order!.status } : held("printful_v2_confirmation_unresolved", order?.status);
  } catch { return held("printful_v2_status_unavailable"); }
}
