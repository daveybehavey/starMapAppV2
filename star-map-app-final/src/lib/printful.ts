import crypto from "node:crypto";
import type { PrintVariant } from "@/lib/pricing";

type PrintfulOrderRecipient = {
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

type SubmitPrintfulOrderInput = {
  externalId: string;
  variant: PrintVariant;
  fileUrl: string;
  recipient: PrintfulOrderRecipient;
};

export type SubmitPrintfulOrderResult = {
  ok: boolean;
  status: number;
  orderId?: string | number;
  error?: string;
};

function parseVariantId(raw: string | undefined): number | null {
  const parsed = raw ? Number.parseInt(raw.trim(), 10) : Number.NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function getVariantId(variant: PrintVariant) {
  const unframed = parseVariantId(process.env.PRINTFUL_VARIANT_ID_POSTER_UNFRAMED);
  const framed = parseVariantId(process.env.PRINTFUL_VARIANT_ID_POSTER_FRAMED);
  return variant === "poster_framed" ? framed : unframed;
}

function normalizeExternalId(raw: string) {
  const trimmed = raw.trim();
  if (/^[A-Za-z0-9_-]{1,32}$/.test(trimmed)) return trimmed;
  const digest = crypto.createHash("sha256").update(trimmed).digest("hex").slice(0, 24);
  return `smc_${digest}`;
}

export function isPrintfulConfigured() {
  const token = process.env.PRINTFUL_API_TOKEN?.trim();
  const unframed = parseVariantId(process.env.PRINTFUL_VARIANT_ID_POSTER_UNFRAMED);
  const framed = parseVariantId(process.env.PRINTFUL_VARIANT_ID_POSTER_FRAMED);
  return Boolean(token && unframed && framed);
}

export async function submitPrintfulOrder(input: SubmitPrintfulOrderInput): Promise<SubmitPrintfulOrderResult> {
  const token = process.env.PRINTFUL_API_TOKEN?.trim();
  if (!token) {
    return { ok: false, status: 503, error: "printful_token_missing" };
  }

  const variantId = getVariantId(input.variant);
  if (!variantId) {
    return { ok: false, status: 503, error: "printful_variant_not_configured" };
  }

  const baseUrl = process.env.PRINTFUL_API_BASE_URL?.trim() || "https://api.printful.com";
  const storeId = process.env.PRINTFUL_STORE_ID?.trim();
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
  if (storeId) {
    headers["X-PF-Store-Id"] = storeId;
  }

  const body = {
    external_id: normalizeExternalId(input.externalId),
    shipping: "STANDARD",
    recipient: input.recipient,
    items: [
      {
        variant_id: variantId,
        quantity: 1,
        files: [{ url: input.fileUrl }],
      },
    ],
  };

  const autoConfirmRaw = (process.env.PRINTFUL_AUTO_CONFIRM ?? "true").trim().toLowerCase();
  const autoConfirm = !(autoConfirmRaw === "0" || autoConfirmRaw === "false" || autoConfirmRaw === "no");
  const query = new URLSearchParams();
  if (storeId) {
    query.set("store_id", storeId);
  }
  // `update_existing=1` keeps retries idempotent when an external_id already exists.
  query.set("update_existing", "1");
  if (autoConfirm) {
    // Explicitly confirm API-created orders for fulfillment.
    query.set("confirm", "1");
  }
  const ordersUrl = `${baseUrl}/orders?${query.toString()}`;

  try {
    const response = await fetch(ordersUrl, {
      method: "POST",
      headers,
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
      let errorMessage = "printful_order_failed";
      if (parsed && typeof parsed === "object") {
        const record = parsed as {
          error?: {
            reason?: unknown;
          };
        };
        if (record.error && typeof record.error.reason === "string" && record.error.reason.trim()) {
          errorMessage = record.error.reason.trim();
        }
      } else if (raw.trim()) {
        errorMessage = raw.slice(0, 240);
      }
      return {
        ok: false,
        status: response.status,
        error: errorMessage,
      };
    }

    const result =
      parsed && typeof parsed === "object" && "result" in parsed
        ? (parsed as { result?: { id?: string | number } }).result
        : null;

    return {
      ok: true,
      status: response.status,
      orderId: result?.id,
    };
  } catch (error) {
    return {
      ok: false,
      status: 503,
      error: error instanceof Error ? error.message.slice(0, 240) : "printful_request_failed",
    };
  }
}
