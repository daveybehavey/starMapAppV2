import fs from "node:fs";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path, { resolve } from "node:path";
import { readWranglerVars } from "./wrangler-vars.mjs";

const HARD_EXCLUDED_COUNTRIES = new Set(["KR"]);
const MANAGED_LABELS = {
  poster_framed: "print_framed",
  poster_unframed: "print_unframed",
};

let envSeeded = false;

function loadEnvFile(filename) {
  const filePath = path.resolve(process.cwd(), filename);
  if (!fs.existsSync(filePath)) return;
  const raw = fs.readFileSync(filePath, "utf8");
  raw.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return;
    const idx = trimmed.indexOf("=");
    if (idx === -1) return;
    const key = trimmed.slice(0, idx).trim();
    let value = trimmed.slice(idx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined || process.env[key] === "") {
      process.env[key] = value;
    }
  });
}

export async function seedEnv() {
  if (envSeeded) return;
  loadEnvFile(".env.local");
  loadEnvFile(".env");
  const wranglerVars = await readWranglerVars(process.cwd());
  for (const [key, value] of Object.entries(wranglerVars)) {
    if (process.env[key] === undefined || process.env[key] === "") {
      process.env[key] = value;
    }
  }
  envSeeded = true;
}

export function parseCountryListEnv(names, fallback = ["US"]) {
  const keys = Array.isArray(names) ? names : [names];
  for (const key of keys) {
    const raw = process.env[key];
    if (!raw) continue;
    const parsed = raw
      .split(",")
      .map((value) => value.trim().toUpperCase())
      .filter((value) => /^[A-Z]{2}$/.test(value));
    if (parsed.length > 0) return parsed;
  }
  return fallback;
}

export function parseBooleanEnv(names, fallback = false) {
  const keys = Array.isArray(names) ? names : [names];
  for (const key of keys) {
    const raw = process.env[key];
    if (!raw || !raw.trim()) continue;
    const normalized = raw.trim().toLowerCase();
    if (["1", "true", "yes"].includes(normalized)) return true;
    if (["0", "false", "no"].includes(normalized)) return false;
  }
  return fallback;
}

export function uniqueCountries(countries) {
  return Array.from(new Set(countries.filter((value) => /^[A-Z]{2}$/.test(value))));
}

export function loadShippingMap() {
  return JSON.parse(readFileSync(resolve(process.cwd(), "data", "printful-shipping.json"), "utf8"));
}

export function getMerchantCurrency() {
  return String(process.env.NEXT_PUBLIC_CURRENCY || process.env.CURRENCY || "USD").trim().toUpperCase();
}

export function getMerchantAccountId() {
  const raw = String(process.env.GOOGLE_MERCHANT_ACCOUNT_ID || "").trim();
  if (!/^\d+$/.test(raw)) {
    throw new Error("GOOGLE_MERCHANT_ACCOUNT_ID is required and must be numeric");
  }
  return raw;
}

export function getMerchantServicePrefix() {
  return String(process.env.GOOGLE_MERCHANT_SHIPPING_SERVICE_PREFIX || "StarMapCo Print").trim() || "StarMapCo Print";
}

export function getMerchantTargetCountries(shippingMap) {
  const supportedCountriesFromMap = Array.isArray(shippingMap?.countries)
    ? shippingMap.countries
        .map((value) => String(value || "").trim().toUpperCase())
        .filter((value) => /^[A-Z]{2}$/.test(value))
    : [];

  const configuredFeedCountries = parseCountryListEnv(
    ["MERCHANT_FEED_COUNTRIES", "PRINT_ALLOWED_COUNTRIES", "NEXT_PUBLIC_PRINT_ALLOWED_COUNTRIES"],
    supportedCountriesFromMap.length ? supportedCountriesFromMap : ["US"],
  );
  const includeRestrictedCountries = parseBooleanEnv("MERCHANT_FEED_INCLUDE_RESTRICTED", false);
  const restrictedCountries = includeRestrictedCountries
    ? []
    : parseCountryListEnv("MERCHANT_FEED_EXCLUDED_COUNTRIES", ["KR"]);
  const restrictedSet = new Set([...restrictedCountries, ...HARD_EXCLUDED_COUNTRIES]);
  const countries = uniqueCountries(configuredFeedCountries.filter((country) => !restrictedSet.has(country)));
  return countries.length ? countries : ["US"];
}

function toAmountMicros(amount) {
  return String(Math.round(amount * 1_000_000));
}

function buildGroupKey(rate) {
  const shippingUsd = Number(rate.rate).toFixed(2);
  const minDays = typeof rate.min_delivery_days === "number" ? rate.min_delivery_days : "";
  const maxDays = typeof rate.max_delivery_days === "number" ? rate.max_delivery_days : "";
  return `${shippingUsd}|${minDays}|${maxDays}`;
}

function sortGroups(a, b) {
  const amountDelta = Number.parseFloat(a.shippingUsd) - Number.parseFloat(b.shippingUsd);
  if (amountDelta !== 0) return amountDelta;
  const minDelta = (a.minDeliveryDays ?? 0) - (b.minDeliveryDays ?? 0);
  if (minDelta !== 0) return minDelta;
  const maxDelta = (a.maxDeliveryDays ?? 0) - (b.maxDeliveryDays ?? 0);
  if (maxDelta !== 0) return maxDelta;
  return a.countries.join(",").localeCompare(b.countries.join(","));
}

export function buildVariantShippingGroups(variant, countries, shippingMap) {
  const variantRates = shippingMap?.[variant] || {};
  const groups = new Map();

  for (const country of countries) {
    const rate = variantRates[country];
    if (!rate || typeof rate.rate !== "number" || !Number.isFinite(rate.rate)) continue;

    const key = buildGroupKey(rate);
    if (!groups.has(key)) {
      groups.set(key, {
        variant,
        shippingLabel: MANAGED_LABELS[variant],
        shippingUsd: Number(rate.rate).toFixed(2),
        minDeliveryDays: typeof rate.min_delivery_days === "number" ? rate.min_delivery_days : null,
        maxDeliveryDays: typeof rate.max_delivery_days === "number" ? rate.max_delivery_days : null,
        countries: [],
      });
    }
    groups.get(key).countries.push(country);
  }

  return Array.from(groups.values())
    .map((group) => ({
      ...group,
      countries: group.countries.sort((a, b) => a.localeCompare(b)),
    }))
    .sort(sortGroups);
}

function buildServiceName(prefix, variant, group) {
  const variantName = variant === "poster_framed" ? "Framed" : "Unframed";
  const days =
    typeof group.minDeliveryDays === "number" && typeof group.maxDeliveryDays === "number"
      ? `${group.minDeliveryDays}-${group.maxDeliveryDays}d`
      : "varies";
  return `${prefix} ${variantName} ${group.shippingUsd} USD ${days}`;
}

function buildService(group, currency, prefix) {
  const flatRate = Number.parseFloat(group.shippingUsd);
  return {
    serviceName: buildServiceName(prefix, group.variant, group),
    active: true,
    deliveryCountries: group.countries,
    currencyCode: currency,
    shipmentType: "DELIVERY",
    deliveryTime: {
      ...(typeof group.minDeliveryDays === "number" ? { minTransitDays: group.minDeliveryDays } : {}),
      ...(typeof group.maxDeliveryDays === "number" ? { maxTransitDays: group.maxDeliveryDays } : {}),
    },
    rateGroups: [
      {
        name: group.shippingLabel,
        applicableShippingLabels: [group.shippingLabel],
        singleValue: {
          flatRate: {
            amountMicros: toAmountMicros(flatRate),
            currencyCode: currency,
          },
        },
      },
    ],
  };
}

export function buildManagedShippingServices({ shippingMap, countries, currency, prefix }) {
  const unframedGroups = buildVariantShippingGroups("poster_unframed", countries, shippingMap);
  const framedGroups = buildVariantShippingGroups("poster_framed", countries, shippingMap);

  return {
    groups: {
      poster_unframed: unframedGroups,
      poster_framed: framedGroups,
    },
    services: [...unframedGroups, ...framedGroups].map((group) => buildService(group, currency, prefix)),
  };
}

export function isManagedServiceName(serviceName, prefix) {
  return typeof serviceName === "string" && serviceName.startsWith(prefix);
}

export function summarizeServices(services) {
  return services.map((service) => ({
    serviceName: service.serviceName,
    shippingLabel: service.rateGroups?.[0]?.applicableShippingLabels?.join(",") || "",
    deliveryCountries: Array.isArray(service.deliveryCountries) ? service.deliveryCountries : [],
    flatRateMicros: service.rateGroups?.[0]?.singleValue?.flatRate?.amountMicros || null,
    currencyCode: service.currencyCode || "",
    minTransitDays: service.deliveryTime?.minTransitDays ?? null,
    maxTransitDays: service.deliveryTime?.maxTransitDays ?? null,
  }));
}

export function writeJsonReport(relativePath, payload) {
  const outputPath = resolve(process.cwd(), relativePath);
  mkdirSync(path.dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  return outputPath;
}

export function getManagedShippingLabel(variant) {
  return MANAGED_LABELS[variant];
}
