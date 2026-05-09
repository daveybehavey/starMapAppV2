type PrintfulV2ShippingRate = {
  rate: number;
  currency: string;
  min_delivery_days?: number;
  max_delivery_days?: number;
};

type ShippingRatesResponse = {
  data?: Array<{
    id?: string;
    shipping?: string;
    rate?: unknown;
    currency?: string;
    min_delivery_days?: unknown;
    max_delivery_days?: unknown;
  }>;
};

const API_PATH = "/v2/shipping-rates";

type ShippingRateOption = NonNullable<ShippingRatesResponse["data"]>[number];

function getPrintfulApiBase() {
  return (process.env.PRINTFUL_API_BASE_URL?.trim() || "https://api.printful.com").replace(/\/+$/, "");
}

function getToken() {
  return process.env.PRINTFUL_API_TOKEN?.trim() || "";
}

function getStoreId() {
  return process.env.PRINTFUL_STORE_ID?.trim() || "";
}

function parseRate(raw: unknown): number | null {
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw === "string") {
    const parsed = Number.parseFloat(raw);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function pickStandardOption(options: ShippingRateOption[]) {
  return options.find((opt) => opt.shipping === "STANDARD") ?? options[0] ?? null;
}

export async function fetchPrintfulV2ShippingRate(input: {
  catalogVariantId: number;
  countryCode: string;
  /**
   * Optional state code used for countries where Printful requires it for accurate quotes.
   * (Mirrors the existing script defaults.)
   */
  stateCode?: string;
}): Promise<PrintfulV2ShippingRate | null> {
  const token = getToken();
  const storeId = getStoreId();
  if (!token || !storeId) return null;

  const country = input.countryCode.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(country)) return null;

  const base = getPrintfulApiBase();
  const recipient: Record<string, string> = { country_code: country };
  if (input.stateCode && input.stateCode.trim()) {
    recipient.state_code = input.stateCode.trim();
  }

  const body = {
    recipient,
    order_items: [
      {
        source: "catalog",
        quantity: 1,
        catalog_variant_id: input.catalogVariantId,
      },
    ],
    currency: "USD",
  };

  const res = await fetch(`${base}${API_PATH}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "User-Agent": "starmapco-printful-shipping-v2",
      "X-PF-Store-Id": storeId,
    },
    body: JSON.stringify(body),
  });

  const text = await res.text();
  let json: ShippingRatesResponse | null = null;
  try {
    json = text ? (JSON.parse(text) as ShippingRatesResponse) : null;
  } catch {
    json = null;
  }

  if (!res.ok) return null;

  const options = Array.isArray(json?.data) ? json!.data : [];
  const standard = pickStandardOption(options);
  if (!standard) return null;

  const rate = parseRate(standard.rate);
  if (rate === null) return null;

  const minDays = typeof standard.min_delivery_days === "number" ? standard.min_delivery_days : undefined;
  const maxDays = typeof standard.max_delivery_days === "number" ? standard.max_delivery_days : undefined;

  return {
    rate,
    currency: standard.currency || "USD",
    min_delivery_days: minDays,
    max_delivery_days: maxDays,
  };
}

