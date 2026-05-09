import crypto from "node:crypto";

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

export async function submitPrintfulV2CatalogOrder(
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

  const body = {
    external_id: normalizeExternalId(input.externalId),
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

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "X-PF-Store-Id": storeId,
      },
      body: JSON.stringify(body),
    });
    const raw = await response.text();
    let parsed: unknown = null;
    try {
      parsed = raw ? JSON.parse(raw) : null;
    } catch {
      parsed = null;
    }

    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        error: parseErrorMessage(raw, parsed),
      };
    }

    const data =
      parsed && typeof parsed === "object" && "data" in parsed ? (parsed as { data?: { id?: unknown } }).data : null;
    const orderId =
      typeof data?.id === "string" || typeof data?.id === "number" ? (data.id as string | number) : undefined;
    return { ok: true, status: response.status, orderId };
  } catch (error) {
    return {
      ok: false,
      status: 503,
      error: error instanceof Error ? error.message.slice(0, 240) : "printful_v2_request_failed",
    };
  }
}

