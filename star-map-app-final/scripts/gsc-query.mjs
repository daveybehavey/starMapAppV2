#!/usr/bin/env node

import { createSign } from "node:crypto";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { seedEnv } from "./merchant-shipping-common.mjs";

const SCOPE = "https://www.googleapis.com/auth/webmasters.readonly";

function base64UrlEncode(input) {
  return Buffer.from(input)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function loadServiceAccountJson() {
  const inlineJson = process.env.GOOGLE_SEARCH_CONSOLE_SERVICE_ACCOUNT_JSON?.trim();
  if (inlineJson) return JSON.parse(inlineJson);

  const configuredPath =
    process.env.GOOGLE_SEARCH_CONSOLE_SERVICE_ACCOUNT_JSON_PATH?.trim() ||
    process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim();
  if (!configuredPath) {
    throw new Error(
      "Missing Google Search Console service account credentials. Set GOOGLE_SEARCH_CONSOLE_SERVICE_ACCOUNT_JSON_PATH, GOOGLE_APPLICATION_CREDENTIALS, or GOOGLE_SEARCH_CONSOLE_SERVICE_ACCOUNT_JSON.",
    );
  }

  return JSON.parse(readFileSync(configuredPath, "utf8"));
}

async function getAccessToken() {
  await seedEnv();
  const serviceAccount = loadServiceAccountJson();
  const clientEmail = String(serviceAccount.client_email || "").trim();
  const privateKey = String(serviceAccount.private_key || "").trim();
  if (!clientEmail || !privateKey) {
    throw new Error("Service account JSON is missing client_email or private_key");
  }

  const header = { alg: "RS256", typ: "JWT" };
  const issuedAt = Math.floor(Date.now() / 1000);
  const claimSet = {
    iss: clientEmail,
    scope: SCOPE,
    aud: "https://oauth2.googleapis.com/token",
    exp: issuedAt + 3600,
    iat: issuedAt,
  };

  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedClaimSet = base64UrlEncode(JSON.stringify(claimSet));
  const unsignedJwt = `${encodedHeader}.${encodedClaimSet}`;

  const signer = createSign("RSA-SHA256");
  signer.update(unsignedJwt);
  signer.end();
  const signature = signer.sign(privateKey);
  const assertion = `${unsignedJwt}.${base64UrlEncode(signature)}`;

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });

  const payload = await response.json();
  if (!response.ok) {
    throw new Error(`Failed to obtain Google access token: HTTP ${response.status} ${JSON.stringify(payload)}`);
  }

  const token = String(payload.access_token || "").trim();
  if (!token) throw new Error("Google token response missing access_token");
  return token;
}

function parseArgs(argv) {
  const args = new Map();
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i];
    if (!key.startsWith("--")) continue;
    const name = key.slice(2);
    const value = argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : "true";
    if (value !== "true") i++;
    args.set(name, value);
  }
  return args;
}

function requireIsoDate(value, name) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`${name} must be YYYY-MM-DD`);
  }
  return value;
}

function isoTodayUtc() {
  return new Date().toISOString().slice(0, 10);
}

/** `end` is inclusive; returns a date `days` before `end` (UTC calendar days). */
function isoDaysBefore(endIso, days) {
  const d = new Date(`${endIso}T12:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

function writeReport(relativePath, payload) {
  const outputPath = path.resolve(process.cwd(), relativePath);
  mkdirSync(path.dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  return outputPath;
}

const args = parseArgs(process.argv.slice(2));
await seedEnv();

const siteUrl = String(
  args.get("site") ||
    process.env.GOOGLE_SEARCH_CONSOLE_SITE_URL ||
    process.env.GSC_SITE_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    "",
).trim();
if (!siteUrl) {
  throw new Error("Missing --site or GOOGLE_SEARCH_CONSOLE_SITE_URL or GSC_SITE_URL");
}

const endDate = args.get("end") ? requireIsoDate(String(args.get("end")), "--end") : isoTodayUtc();
const startDate = args.get("start")
  ? requireIsoDate(String(args.get("start")), "--start")
  : isoDaysBefore(endDate, 28);
if (startDate > endDate) {
  throw new Error("--start must be on or before --end");
}
const dimensions = String(args.get("dimensions") || "query,page")
  .split(",")
  .map((v) => v.trim())
  .filter(Boolean);
const rowLimit = Math.min(25_000, Math.max(1, Number.parseInt(String(args.get("limit") || "250"), 10) || 250));

const token = await getAccessToken();
const response = await fetch(
  `https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`,
  {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      accept: "application/json",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      startDate,
      endDate,
      dimensions: dimensions.length ? dimensions : undefined,
      rowLimit,
      searchType: "web",
    }),
  },
);

const text = await response.text();
if (!response.ok) {
  throw new Error(`Search Console API request failed: HTTP ${response.status} ${text || ""}`);
}

const data = text ? JSON.parse(text) : null;
const reportPath = writeReport("reports/search-console.query.json", {
  siteUrl,
  startDate,
  endDate,
  rowLimit,
  dimensions,
  data,
});

console.log(`OK. Report written: ${reportPath}`);

