import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env" });

const token = process.env.PRINTFUL_API_TOKEN?.trim() || "";
const storeId = process.env.PRINTFUL_STORE_ID?.trim() || "";
const unframedRaw = process.env.PRINTFUL_VARIANT_ID_POSTER_UNFRAMED?.trim() || "";
const framedRaw = process.env.PRINTFUL_VARIANT_ID_POSTER_FRAMED?.trim() || "";
const apiBase = process.env.PRINTFUL_API_BASE_URL?.trim() || "https://api.printful.com";

const missing = [];
if (!token) missing.push("PRINTFUL_API_TOKEN");
if (!storeId) missing.push("PRINTFUL_STORE_ID");
if (!unframedRaw) missing.push("PRINTFUL_VARIANT_ID_POSTER_UNFRAMED");
if (!framedRaw) missing.push("PRINTFUL_VARIANT_ID_POSTER_FRAMED");

if (missing.length) {
  console.error("Missing required Printful env vars:");
  for (const key of missing) console.error(`- ${key}`);
  process.exit(1);
}

const unframedId = Number.parseInt(unframedRaw, 10);
const framedId = Number.parseInt(framedRaw, 10);
if (!Number.isFinite(unframedId) || unframedId <= 0 || !Number.isFinite(framedId) || framedId <= 0) {
  console.error("Variant IDs must be positive integers.");
  process.exit(1);
}

async function fetchJson(pathname) {
  const response = await fetch(`${apiBase}${pathname}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      "User-Agent": "starmapco-printful-verify",
    },
  });
  const text = await response.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = null;
  }
  if (!response.ok) {
    const detail =
      body && typeof body === "object" && body.error && typeof body.error.message === "string"
        ? body.error.message
        : text.slice(0, 260);
    throw new Error(`${pathname} -> ${response.status} ${detail}`);
  }
  return body;
}

async function main() {
  const store = await fetchJson(`/store?store_id=${encodeURIComponent(storeId)}`);
  const storeName = store?.result?.name ?? "(unknown)";
  const storeType = store?.result?.type ?? "(unknown)";

  const unframed = await fetchJson(`/products/variant/${unframedId}`);
  const framed = await fetchJson(`/products/variant/${framedId}`);

  const unframedName = unframed?.result?.variant?.name ?? "(unknown)";
  const framedName = framed?.result?.variant?.name ?? "(unknown)";
  const unframedPrice = unframed?.result?.variant?.price ?? "?";
  const framedPrice = framed?.result?.variant?.price ?? "?";

  console.log("Printful verification passed.");
  console.log(`Store: ${storeName} (id=${storeId}, type=${storeType})`);
  console.log(`Unframed variant: ${unframedId} -> ${unframedName} ($${unframedPrice})`);
  console.log(`Framed variant: ${framedId} -> ${framedName} ($${framedPrice})`);
}

main().catch((error) => {
  console.error("Printful verification failed.");
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});

