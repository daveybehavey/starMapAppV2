import crypto from "node:crypto";
import type { PrintVariant } from "@/lib/pricing";
import { getPrintCatalogRow, PRINT_CATALOG } from "@/lib/printCatalog";

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
  /** Extra Printful line items (e.g. bundled greeting card). Same artwork URL. */
  additionalVariants?: PrintVariant[];
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

function getVariantId(variant: PrintVariant): number | null {
  const row = getPrintCatalogRow(variant);
  const envRaw = process.env[row.printfulVariantEnv]?.trim();
  const fromEnv = parseVariantId(envRaw);
  if (fromEnv) return fromEnv;
  return Number.isFinite(row.printfulVariantId) && row.printfulVariantId > 0 ? row.printfulVariantId : null;
}

function normalizeExternalId(raw: string) {
  const trimmed = raw.trim();
  if (/^[A-Za-z0-9_-]{1,32}$/.test(trimmed)) return trimmed;
  const digest = crypto.createHash("sha256").update(trimmed).digest("hex").slice(0, 24);
  return `smc_${digest}`;
}

export function isPrintfulConfigured() {
  const token = process.env.PRINTFUL_API_TOKEN?.trim();
  if (!token) return false;
  return PRINT_CATALOG.every((row) => getVariantId(row.id) !== null);
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

  const additionalVariants = Array.isArray(input.additionalVariants)
    ? input.additionalVariants.filter((v) => v !== input.variant)
    : [];
  const itemVariants = [input.variant, ...additionalVariants];
  const items = [];
  for (const itemVariant of itemVariants) {
    const itemVariantId = getVariantId(itemVariant);
    if (!itemVariantId) {
      return { ok: false, status: 503, error: `printful_variant_not_configured:${itemVariant}` };
    }
    items.push({
      variant_id: itemVariantId,
      quantity: 1,
      files: [{ url: input.fileUrl }],
    });
  }

  const body = {
    external_id: normalizeExternalId(input.externalId),
    shipping: "STANDARD",
    recipient: input.recipient,
    items,
  };

  const autoConfirmRaw = (process.env.PRINTFUL_AUTO_CONFIRM ?? "true").trim().toLowerCase();
  const autoConfirm = !(autoConfirmRaw === "0" || autoConfirmRaw === "false" || autoConfirmRaw === "no");

  const buildOrdersUrl = (options: { updateExisting: boolean }) => {
    const query = new URLSearchParams();
    if (storeId) {
      query.set("store_id", storeId);
    }
    query.set("update_existing", options.updateExisting ? "1" : "0");
    if (autoConfirm) {
      // Explicitly confirm API-created orders for fulfillment.
      query.set("confirm", "1");
    }
    return `${baseUrl}/orders?${query.toString()}`;
  };

  const parseErrorMessage = (raw: string, parsed: unknown) => {
    if (parsed && typeof parsed === "object") {
      const record = parsed as {
        result?: unknown;
        error?: { reason?: unknown; message?: unknown; api_error_code?: unknown };
      };
      const msg =
        (typeof record.error?.message === "string" && record.error.message.trim()) ||
        (typeof record.error?.reason === "string" && record.error.reason.trim()) ||
        (typeof record.result === "string" && record.result.trim()) ||
        "";
      const apiCode = typeof record.error?.api_error_code === "string" ? record.error.api_error_code.trim() : "";
      return apiCode ? `${msg} (${apiCode})`.trim() : msg;
    }
    return raw.trim() ? raw.slice(0, 240) : "printful_order_failed";
  };

  const isNonEditableOrderError = (parsed: unknown) => {
    if (!parsed || typeof parsed !== "object") return false;
    const record = parsed as { error?: { api_error_code?: unknown; message?: unknown }; result?: unknown };
    const apiCode = typeof record.error?.api_error_code === "string" ? record.error.api_error_code.trim() : "";
    if (apiCode === "OR-1") return true;
    const msg = typeof record.error?.message === "string" ? record.error.message.toLowerCase() : "";
    const resultMsg = typeof record.result === "string" ? record.result.toLowerCase() : "";
    return msg.includes("no longer editable") || resultMsg.includes("no longer editable");
  };

  try {
    const attempt = async (options: { updateExisting: boolean; externalId: string }) => {
      const response = await fetch(buildOrdersUrl({ updateExisting: options.updateExisting }), {
        method: "POST",
        headers,
        body: JSON.stringify({ ...body, external_id: normalizeExternalId(options.externalId) }),
      });
      const raw = await response.text();
      let parsed: unknown = null;
      try {
        parsed = raw ? JSON.parse(raw) : null;
      } catch {
        parsed = null;
      }
      return { response, raw, parsed };
    };

    // First try: idempotent update_existing=1 keyed off the session ID.
    const first = await attempt({ updateExisting: true, externalId: input.externalId });
    if (!first.response.ok) {
      // If the external_id exists but cannot be edited, create a new draft order instead.
      if (first.response.status === 400 && isNonEditableOrderError(first.parsed)) {
        const retryExternalId = `${input.externalId}#${Date.now()}`;
        const second = await attempt({ updateExisting: false, externalId: retryExternalId });
        if (!second.response.ok) {
          return {
            ok: false,
            status: second.response.status,
            error: parseErrorMessage(second.raw, second.parsed) || "printful_order_failed",
          };
        }
        const result =
          second.parsed && typeof second.parsed === "object" && "result" in second.parsed
            ? (second.parsed as { result?: { id?: string | number } }).result
            : null;
        return { ok: true, status: second.response.status, orderId: result?.id };
      }

      return {
        ok: false,
        status: first.response.status,
        error: parseErrorMessage(first.raw, first.parsed) || "printful_order_failed",
      };
    }

    const result =
      first.parsed && typeof first.parsed === "object" && "result" in first.parsed
        ? (first.parsed as { result?: { id?: string | number } }).result
        : null;

    return { ok: true, status: first.response.status, orderId: result?.id };
  } catch (error) {
    return {
      ok: false,
      status: 503,
      error: error instanceof Error ? error.message.slice(0, 240) : "printful_request_failed",
    };
  }
}
