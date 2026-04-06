#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const PROOF_CONSENT_PREFIX = "proof:consent:map:";
const PROOF_CONSENT_SESSION_PREFIX = "proof:consent:session:";
const STAR_MAP_KV_BINDING = "STAR_MAP_KV";
const VALID_REVIEW_STATUSES = new Set(["new", "contacted", "approved", "published", "rejected"]);

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
    if (
      (value.startsWith("\"") && value.endsWith("\"")) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) {
      process.env[key] = value;
    }
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
  node scripts/proof-consent-report.mjs
  node scripts/proof-consent-report.mjs --all
  node scripts/proof-consent-report.mjs --json
  node scripts/proof-consent-report.mjs --limit 100
  node scripts/proof-consent-report.mjs --status contacted
  node scripts/proof-consent-report.mjs --set-status approved --map <mapId>
  node scripts/proof-consent-report.mjs --set-status published --session <checkout_session_id>

Options:
  --all                 Include records where permission was removed
  --json                Output raw JSON
  --limit <n>           Max records to fetch (default: 50, max: 500)
  --status <value>      Filter report by review status
  --set-status <value>  Update a record to new|contacted|approved|published|rejected
  --map <id>            Map id for status updates
  --session <id>        Checkout session id for status updates
`);
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
    if (char === "\"") {
      return value;
    }
    value += char;
  }

  return value;
}

function readWranglerConfig(rootDir) {
  const wranglerPath = path.join(rootDir, "wrangler.toml");
  const content = fs.readFileSync(wranglerPath, "utf8");
  const lines = content.split(/\r?\n/);

  let accountId = "";
  let currentKvBinding = null;
  let currentKvId = null;
  let namespaceId = "";

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    if (line.startsWith("account_id")) {
      const [, rawValue] = line.split("=", 2);
      accountId = parseQuotedValue(rawValue || "");
      continue;
    }

    if (line === "[[kv_namespaces]]") {
      currentKvBinding = null;
      currentKvId = null;
      continue;
    }

    const bindingMatch = line.match(/^binding\s*=\s*(.+)$/);
    if (bindingMatch) {
      currentKvBinding = parseQuotedValue(bindingMatch[1]);
      if (currentKvBinding === STAR_MAP_KV_BINDING && currentKvId) {
        namespaceId = currentKvId;
      }
      continue;
    }

    const idMatch = line.match(/^id\s*=\s*(.+)$/);
    if (idMatch) {
      currentKvId = parseQuotedValue(idMatch[1]);
      if (currentKvBinding === STAR_MAP_KV_BINDING) {
        namespaceId = currentKvId;
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

async function listProofConsentKeys({ accountId, namespaceId, limit, headers }) {
  let cursor = undefined;
  const keys = [];

  while (keys.length < limit) {
    const remaining = Math.max(10, Math.min(1000, limit - keys.length));
    const url = new URL(`https://api.cloudflare.com/client/v4/accounts/${accountId}/storage/kv/namespaces/${namespaceId}/keys`);
    url.searchParams.set("prefix", PROOF_CONSENT_PREFIX);
    url.searchParams.set("limit", String(remaining));
    if (cursor) url.searchParams.set("cursor", cursor);

    const data = await cfJson(url.toString(), headers);
    const page = Array.isArray(data?.result) ? data.result : [];
    keys.push(...page.map((entry) => entry.name).filter(Boolean));
    const resultInfo = data?.result_info || {};
    cursor = resultInfo.cursor;
    if (!cursor || page.length === 0) break;
  }

  return keys.slice(0, limit);
}

async function getProofConsentRecord({ accountId, namespaceId, key, headers }) {
  const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/storage/kv/namespaces/${namespaceId}/values/${encodeURIComponent(key)}`;
  const response = await fetch(url, { headers });
  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error(`Cloudflare KV value request failed for ${key}: ${response.status} ${response.statusText}`);
  }
  return response.json();
}

async function putProofConsentRecord({ accountId, namespaceId, key, headers, record }) {
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

function formatDate(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toISOString().slice(0, 19).replace("T", " ");
}

function printTable(records) {
  if (!records.length) {
    console.log("No proof-review consent records found.");
    return;
  }

  const rows = records.map((record) => ({
    updated: formatDate(record.reviewUpdatedAt || record.updatedAt),
    status: record.reviewStatus || "new",
    source: record.source || "-",
    order: record.orderType || "-",
    plan: record.plan || "-",
    variant: record.printVariant || "-",
    context: record.buyerContext || "-",
    note: record.buyerNote ? `${record.buyerNote.slice(0, 48)}${record.buyerNote.length > 48 ? "..." : ""}` : "-",
    mapId: record.mapId || "-",
    sessionId: record.sessionId || "-",
    consent: record.websiteUsageAllowed ? "allowed" : "removed",
  }));

  const widths = Object.keys(rows[0]).reduce((acc, key) => {
    const maxRow = Math.max(...rows.map((row) => String(row[key]).length));
    acc[key] = Math.max(key.length, maxRow);
    return acc;
  }, {});

  const keys = Object.keys(rows[0]);
  const header = keys.map((key) => key.padEnd(widths[key])).join("  ");
  const divider = keys.map((key) => "-".repeat(widths[key])).join("  ");

  console.log(header);
  console.log(divider);
  for (const row of rows) {
    console.log(keys.map((key) => String(row[key]).padEnd(widths[key])).join("  "));
  }
}

async function main() {
  const rootDir = process.cwd();
  loadEnvFile(path.join(rootDir, ".env.local"));
  const args = parseArgs(process.argv.slice(2));

  if (args.help === "true" || args.h === "true") {
    usage();
    process.exit(0);
  }

  const limit = Math.max(1, Math.min(500, Number.parseInt(String(args.limit || "50"), 10) || 50));
  const includeRemoved = args.all === "true";
  const json = args.json === "true";
  const statusFilter = typeof args.status === "string" ? args.status.trim().toLowerCase() : "";
  const setStatus = typeof args["set-status"] === "string" ? args["set-status"].trim().toLowerCase() : "";
  const headers = getCloudflareAuthHeaders();
  const { accountId, namespaceId } = readWranglerConfig(rootDir);

  if (!accountId) {
    throw new Error("Missing Cloudflare account_id. Set CLOUDFLARE_ACCOUNT_ID or configure wrangler.toml.");
  }
  if (!namespaceId) {
    throw new Error("Missing STAR_MAP_KV namespace id. Set STAR_MAP_KV_NAMESPACE_ID or configure wrangler.toml.");
  }

  if (statusFilter && !VALID_REVIEW_STATUSES.has(statusFilter)) {
    throw new Error(`Invalid --status value: ${statusFilter}`);
  }

  if (setStatus) {
    if (!VALID_REVIEW_STATUSES.has(setStatus)) {
      throw new Error(`Invalid --set-status value: ${setStatus}`);
    }

    const mapId = typeof args.map === "string" ? args.map.trim() : "";
    const sessionId = typeof args.session === "string" ? args.session.trim() : "";
    if (!mapId && !sessionId) {
      throw new Error("Status updates require --map <mapId> or --session <checkout_session_id>.");
    }

    const lookupKey = mapId
      ? `${PROOF_CONSENT_PREFIX}${mapId}`
      : `${PROOF_CONSENT_SESSION_PREFIX}${sessionId}`;
    const record = await getProofConsentRecord({ accountId, namespaceId, key: lookupKey, headers });
    if (!record) {
      throw new Error("Proof-consent record not found.");
    }

    const updated = {
      ...record,
      reviewStatus: setStatus,
      reviewUpdatedAt: new Date().toISOString(),
    };

    await putProofConsentRecord({
      accountId,
      namespaceId,
      key: `${PROOF_CONSENT_PREFIX}${updated.mapId}`,
      headers,
      record: updated,
    });
    await putProofConsentRecord({
      accountId,
      namespaceId,
      key: `${PROOF_CONSENT_SESSION_PREFIX}${updated.sessionId}`,
      headers,
      record: updated,
    });

    if (json) {
      console.log(JSON.stringify(updated, null, 2));
      return;
    }

    console.log(`Updated proof-review status to '${setStatus}' for map ${updated.mapId}.`);
    return;
  }

  const keys = await listProofConsentKeys({ accountId, namespaceId, limit, headers });
  const records = [];

  for (const key of keys) {
    const record = await getProofConsentRecord({ accountId, namespaceId, key, headers });
    if (!record) continue;
    if (!includeRemoved && !record.websiteUsageAllowed) continue;
    if (statusFilter && (record.reviewStatus || "new") !== statusFilter) continue;
    records.push(record);
  }

  records.sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")));

  if (json) {
    console.log(JSON.stringify(records, null, 2));
    return;
  }

  console.log(`Proof-review consent records: ${records.length}${includeRemoved ? " (including removed)" : ""}`);
  printTable(records);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
