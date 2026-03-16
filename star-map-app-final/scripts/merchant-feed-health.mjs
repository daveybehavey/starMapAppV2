#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { seedEnv } from "./merchant-shipping-common.mjs";

await seedEnv();

const DEFAULT_SITE = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, "") || "https://starmapco.com";
const DEFAULT_FEED_URL = `${DEFAULT_SITE}/merchant-feed.xml`;
const HARD_EXCLUDED_COUNTRIES = new Set(["KR"]);

function parseArgs(argv) {
  const args = {
    feed: DEFAULT_FEED_URL,
    file: "",
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--feed") {
      const next = argv[i + 1];
      if (!next) throw new Error("Missing value for --feed");
      args.feed = next;
      i += 1;
      continue;
    }
    if (token === "--file") {
      const next = argv[i + 1];
      if (!next) throw new Error("Missing value for --file");
      args.file = next;
      i += 1;
      continue;
    }
    if (token === "-h" || token === "--help") {
      console.log(`Usage: node scripts/merchant-feed-health.mjs [--feed <url> | --file <path>]

Checks live Google Merchant feed health:
  - feed URL responds 200 (or local file is readable)
  - XML contains expected item blocks
  - item image URLs resolve to images
  - shipping countries align with configured target countries`);
      process.exit(0);
    }
    throw new Error(`Unknown arg: ${token}`);
  }

  return args;
}

function parseCountryListEnv(names, fallback = ["US"]) {
  const keys = Array.isArray(names) ? names : [names];
  for (const key of keys) {
    const raw = process.env[key];
    if (!raw) continue;
    const parsed = raw
      .split(",")
      .map((value) => value.trim().toUpperCase())
      .filter((value) => /^[A-Z]{2}$/.test(value));
    if (parsed.length) return parsed;
  }
  return fallback;
}

function parseBooleanEnv(names, fallback = false) {
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

function uniqueCountries(countries) {
  return Array.from(new Set(countries.filter((value) => /^[A-Z]{2}$/.test(value))));
}

function extractTagValue(segment, tagName) {
  const regex = new RegExp(`<${tagName}>([\\s\\S]*?)<\\/${tagName}>`, "i");
  return regex.exec(segment)?.[1]?.trim() || "";
}

function extractTagValues(segment, tagName) {
  const regex = new RegExp(`<${tagName}>([\\s\\S]*?)<\\/${tagName}>`, "gi");
  const values = [];
  let match = regex.exec(segment);
  while (match) {
    values.push(match[1].trim());
    match = regex.exec(segment);
  }
  return values;
}

function splitItems(xml) {
  const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
  const items = [];
  let match = itemRegex.exec(xml);
  while (match) {
    items.push(match[1]);
    match = itemRegex.exec(xml);
  }
  return items;
}

async function fetchText(url) {
  const response = await fetch(url, {
    method: "GET",
    redirect: "follow",
    headers: { "user-agent": "starmapco-merchant-feed-health/1.0" },
  });
  const text = await response.text();
  return { response, text };
}

async function checkImage(url) {
  const response = await fetch(url, {
    method: "GET",
    redirect: "follow",
    headers: { "user-agent": "starmapco-merchant-feed-health/1.0" },
  });
  const contentType = response.headers.get("content-type") || "";
  return {
    ok: response.ok && /^image\//i.test(contentType),
    status: response.status,
    contentType,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  let mapCountries = [];
  try {
    const shippingRaw = readFileSync(resolve(process.cwd(), "data", "printful-shipping.json"), "utf8");
    const shippingMap = JSON.parse(shippingRaw);
    if (Array.isArray(shippingMap?.countries)) {
      mapCountries = shippingMap.countries
        .map((value) => String(value || "").trim().toUpperCase())
        .filter((value) => /^[A-Z]{2}$/.test(value));
    }
  } catch {
    mapCountries = [];
  }

  const configuredFeedCountries = parseCountryListEnv(
    ["MERCHANT_FEED_COUNTRIES", "PRINT_ALLOWED_COUNTRIES", "NEXT_PUBLIC_PRINT_ALLOWED_COUNTRIES"],
    mapCountries.length ? mapCountries : ["US"],
  );
  const includeRestrictedCountries = parseBooleanEnv("MERCHANT_FEED_INCLUDE_RESTRICTED", false);
  const restrictedCountries = includeRestrictedCountries
    ? []
    : parseCountryListEnv("MERCHANT_FEED_EXCLUDED_COUNTRIES", ["KR"]);
  const restrictedSet = new Set([...restrictedCountries, ...HARD_EXCLUDED_COUNTRIES]);
  const expectedCountries = uniqueCountries(
    configuredFeedCountries.filter((country) => !restrictedSet.has(country)),
  );
  if (!expectedCountries.length) expectedCountries.push("US");

  const sourceLabel = args.file
    ? `Merchant feed file: ${resolve(process.cwd(), args.file)}`
    : `Merchant feed URL: ${args.feed}`;
  console.log(sourceLabel);
  console.log(`Expected shipping countries: ${expectedCountries.join(", ")}`);
  if (restrictedCountries.length && !includeRestrictedCountries) {
    console.log(`Excluded countries: ${restrictedCountries.join(", ")}`);
  }

  let feedText = "";
  if (args.file) {
    feedText = readFileSync(resolve(process.cwd(), args.file), "utf8");
  } else {
    const feed = await fetchText(args.feed);
    if (!feed.response.ok) {
      throw new Error(`Feed request failed: HTTP ${feed.response.status}`);
    }
    feedText = feed.text;
  }

  if (!feedText.includes("<rss") || !feedText.includes("<channel>")) {
    throw new Error("Feed XML does not contain expected RSS/channel tags.");
  }

  const items = splitItems(feedText);
  if (items.length === 0) {
    throw new Error("Feed contains zero <item> entries.");
  }

  const issues = [];
  const imageChecks = [];

  for (const item of items) {
    const id = extractTagValue(item, "g:id") || "(unknown)";
    const title = extractTagValue(item, "g:title");
    const price = extractTagValue(item, "g:price");
    const imageLink = extractTagValue(item, "g:image_link");
    const additionalImageLinks = extractTagValues(item, "g:additional_image_link");
    const shippingLabel = extractTagValue(item, "g:shipping_label");
    const shippingBlocks = extractTagValues(item, "g:shipping");
    const shippingCountries = shippingBlocks
      .map((block) => extractTagValue(block, "g:country"))
      .filter(Boolean)
      .map((country) => country.toUpperCase());

    if (!title) issues.push(`${id}: missing g:title`);
    if (!price || !/\s[A-Z]{3}$/.test(price)) issues.push(`${id}: missing/invalid g:price (${price || "empty"})`);
    if (!imageLink) issues.push(`${id}: missing g:image_link`);
    if (id === "print_poster_unframed" && shippingLabel !== "print_unframed") {
      issues.push(
        `${id}: expected g:shipping_label=print_unframed (received ${shippingLabel || "empty"})`,
      );
    }
    if (id === "print_poster_framed" && shippingLabel !== "print_framed") {
      issues.push(
        `${id}: expected g:shipping_label=print_framed (received ${shippingLabel || "empty"})`,
      );
    }
    if (id.startsWith("digital_") && shippingLabel !== "digital") {
      issues.push(`${id}: expected g:shipping_label=digital (received ${shippingLabel || "empty"})`);
    }
    if (id.startsWith("print_") && additionalImageLinks.length === 0) {
      issues.push(`${id}: missing g:additional_image_link`);
    }

    if (shippingCountries.length === 0) {
      issues.push(`${id}: missing shipping countries`);
    } else {
      const missingCountries = expectedCountries.filter((country) => !shippingCountries.includes(country));
      if (missingCountries.length) {
        issues.push(`${id}: missing expected countries (${missingCountries.join(", ")})`);
      }
    }

    if (imageLink) {
      imageChecks.push({ id, imageLink });
    }
    for (const extraImage of additionalImageLinks) {
      imageChecks.push({ id: `${id} (additional_image_link)`, imageLink: extraImage });
    }
  }

  for (const check of imageChecks) {
    const result = await checkImage(check.imageLink);
    if (!result.ok) {
      issues.push(
        `${check.id}: image check failed (${check.imageLink}) status=${result.status} contentType=${result.contentType || "n/a"}`,
      );
    }
  }

  if (issues.length) {
    console.error("Merchant feed issues:");
    for (const issue of issues) {
      console.error(`- ${issue}`);
    }
    throw new Error(`Merchant feed health failed (${issues.length} issue${issues.length === 1 ? "" : "s"}).`);
  }

  console.log(`PASS: ${items.length} items validated, ${imageChecks.length} image URLs healthy.`);
}

main().catch((error) => {
  console.error(`FAIL: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
