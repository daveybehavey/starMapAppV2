#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const BULK_QUOTE_PREFIX = "bulk:quote:";
const STAR_MAP_KV_BINDING = "STAR_MAP_KV";
const VALID_STATUSES = new Set(["new", "contacted", "quoted", "won", "lost", "archived"]);

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const content = fs.readFileSync(filePath, "utf8");
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator < 0) continue;
    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

function parseQuotedValue(raw) {
  const trimmed = raw.trim();
  if (!trimmed.startsWith("\"")) return trimmed;

  let value = "";
  let escaped = false;
  for (let i = 1; i < trimmed.length; i += 1) {
    const char = trimmed[i];
    if (escaped) {
      value += char;
      escaped = false;
      continue;
    }
    if (char === "\\") {
      escaped = true;
      continue;
    }
    if (char === "\"") return value;
    value += char;
  }
  return value;
}

function readWranglerConfig(rootDir) {
  const wranglerPath = path.join(rootDir, "wrangler.toml");
  const content = fs.readFileSync(wranglerPath, "utf8");
  const lines = content.split(/\r?\n/);

  let accountId = "";
  let namespaceId = "";
  let currentBinding = null;
  let currentId = null;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    if (line.startsWith("account_id")) {
      const [, rawValue] = line.split("=", 2);
      accountId = parseQuotedValue(rawValue || "");
      continue;
    }

    if (line === "[[kv_namespaces]]") {
      currentBinding = null;
      currentId = null;
      continue;
    }

    const bindingMatch = line.match(/^binding\s*=\s*(.+)$/);
    if (bindingMatch) {
      currentBinding = parseQuotedValue(bindingMatch[1]);
      if (currentBinding === STAR_MAP_KV_BINDING && currentId) {
        namespaceId = currentId;
      }
      continue;
    }

    const idMatch = line.match(/^id\s*=\s*(.+)$/);
    if (idMatch) {
      currentId = parseQuotedValue(idMatch[1]);
      if (currentBinding === STAR_MAP_KV_BINDING) {
        namespaceId = currentId;
      }
    }
  }

  return {
    accountId: process.env.CLOUDFLARE_ACCOUNT_ID?.trim() || accountId,
    namespaceId: process.env.STAR_MAP_KV_NAMESPACE_ID?.trim() || namespaceId,
  };
}

function getCloudflareAuthHeaders() {
  const apiToken = process.env.CLOUDFLARE_API_TOKEN?.trim() || process.env.CF_API_TOKEN?.trim();
  if (apiToken) {
    return { Authorization: `Bearer ${apiToken}` };
  }

  const email = process.env.CLOUDFLARE_API_EMAIL?.trim();
  const globalKey = process.env.CLOUDFLARE_GLOBAL_API_KEY?.trim();
  if (email && globalKey) {
    return {
      "X-Auth-Email": email,
      "X-Auth-Key": globalKey,
    };
  }

  throw new Error("Missing Cloudflare credentials. Set CLOUDFLARE_API_TOKEN or CLOUDFLARE_API_EMAIL + CLOUDFLARE_GLOBAL_API_KEY.");
}

async function cfJson(url, headers) {
  const response = await fetch(url, { headers });
  const data = await response.json().catch(() => null);
  if (!response.ok || data?.success === false) {
    const firstError = Array.isArray(data?.errors) && data.errors[0]?.message ? data.errors[0].message : response.statusText;
    throw new Error(`Cloudflare API request failed: ${firstError}`);
  }
  return data;
}

async function listKeys({ accountId, namespaceId, headers, limit }) {
  let cursor = undefined;
  const keys = [];

  while (keys.length < limit) {
    const remaining = Math.max(10, Math.min(1000, limit - keys.length));
    const url = new URL(`https://api.cloudflare.com/client/v4/accounts/${accountId}/storage/kv/namespaces/${namespaceId}/keys`);
    url.searchParams.set("prefix", BULK_QUOTE_PREFIX);
    url.searchParams.set("limit", String(remaining));
    if (cursor) url.searchParams.set("cursor", cursor);

    const data = await cfJson(url.toString(), headers);
    const page = Array.isArray(data?.result) ? data.result : [];
    keys.push(...page.map((entry) => entry.name).filter(Boolean));
    cursor = data?.result_info?.cursor;
    if (!cursor || page.length === 0) break;
  }

  return keys.slice(0, limit);
}

async function getRecord({ accountId, namespaceId, key, headers }) {
  const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/storage/kv/namespaces/${namespaceId}/values/${encodeURIComponent(key)}`;
  const response = await fetch(url, { headers });
  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error(`Cloudflare KV value request failed for ${key}: ${response.status} ${response.statusText}`);
  }
  return response.json();
}

async function putRecord({ accountId, namespaceId, key, headers, record }) {
  const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/storage/kv/namespaces/${namespaceId}/values/${encodeURIComponent(key)}`;
  const response = await fetch(url, {
    method: "PUT",
    headers: {
      ...headers,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(record),
  });
  if (!response.ok) {
    throw new Error(`Cloudflare KV write failed for ${key}: ${response.status} ${response.statusText}`);
  }
}

function parseArgs(argv) {
  const result = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) {
      result[key] = "true";
      continue;
    }
    result[key] = next;
    i += 1;
  }
  return result;
}

function usage() {
  console.log(`Usage:
  node scripts/bulk-quote-report.mjs
  node scripts/bulk-quote-report.mjs --json
  node scripts/bulk-quote-report.mjs --limit 100
  node scripts/bulk-quote-report.mjs --status new
  node scripts/bulk-quote-report.mjs --set-status contacted --id <requestId>

Options:
  --json           Output raw JSON
  --limit <n>      Max records to fetch (default: 50, max: 500)
  --status <value> Filter by new|contacted|quoted|won|lost|archived
  --set-status     Update one request status
  --id <requestId> Request id for --set-status
`);
}

function formatDate(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toISOString().slice(0, 19).replace("T", " ");
}

async function main() {
  const rootDir = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
  loadEnvFile(path.join(rootDir, ".env.local"));

  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    usage();
    process.exit(0);
  }

  const limit = Math.max(1, Math.min(500, Number.parseInt(args.limit ?? "50", 10) || 50));
  const statusFilter = typeof args.status === "string" ? args.status.trim() : "";
  const setStatus = typeof args["set-status"] === "string" ? args["set-status"].trim() : "";
  const requestId = typeof args.id === "string" ? args.id.trim() : "";
  if (statusFilter && !VALID_STATUSES.has(statusFilter)) {
    throw new Error(`Invalid --status value: ${statusFilter}`);
  }
  if (setStatus && !VALID_STATUSES.has(setStatus)) {
    throw new Error(`Invalid --set-status value: ${setStatus}`);
  }
  if (setStatus && !requestId) {
    throw new Error("Missing --id for status update.");
  }

  const { accountId, namespaceId } = readWranglerConfig(rootDir);
  if (!accountId || !namespaceId) {
    throw new Error("Could not resolve Cloudflare account_id or STAR_MAP_KV namespace id.");
  }
  const headers = getCloudflareAuthHeaders();

  if (setStatus) {
    const key = `${BULK_QUOTE_PREFIX}${requestId}`;
    const record = await getRecord({ accountId, namespaceId, headers, key });
    if (!record) {
      throw new Error(`No bulk quote found for ${requestId}.`);
    }

    const nextRecord = {
      ...record,
      status: setStatus,
      updatedAt: new Date().toISOString(),
    };
    await putRecord({ accountId, namespaceId, headers, key, record: nextRecord });
    console.log(`Updated ${requestId} -> ${setStatus}`);
    return;
  }

  const keys = await listKeys({ accountId, namespaceId, headers, limit });
  const records = (await Promise.all(keys.map((key) => getRecord({ accountId, namespaceId, headers, key }))))
    .filter(Boolean)
    .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));

  const filtered = statusFilter ? records.filter((record) => record.status === statusFilter) : records;

  if (args.json === "true") {
    console.log(JSON.stringify({ total: filtered.length, records: filtered }, null, 2));
    return;
  }

  if (!filtered.length) {
    console.log("No bulk quote records found.");
    return;
  }

  console.log(`Bulk quote requests: ${filtered.length}`);
  console.log("");
  for (const record of filtered) {
    const summary = [
      record.id || "unknown",
      `${formatDate(record.createdAt)} | ${record.status || "new"} | ${record.quantity} pcs`,
      `${record.versionCount || 1} version${record.versionCount === 1 ? "" : "s"}`,
      record.organization || record.name || "Unknown",
      record.email || "",
    ]
      .filter(Boolean)
      .join(" | ");
    console.log(summary);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
