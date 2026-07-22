#!/usr/bin/env node

/**
 * Operator CLI for POST /api/analytics/funnel/reconcile.
 *
 * Default mode is dry-run / read-only. Apply/repair requires both `--apply`
 * and FUNNEL_RECONCILE_ALLOW_APPLY=1. Prints aggregate fields only.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadDotenv } from "./load-dotenv.mjs";

const DEFAULT_DAYS = 14;
const DEFAULT_LIMIT = 100;
const MIN_DAYS = 1;
const MAX_DAYS = 60;
const MIN_LIMIT = 1;
const MAX_LIMIT = 500;
const DEFAULT_TIMEOUT_MS = 30_000;
const APPLY_ACK_ENV = "FUNNEL_RECONCILE_ALLOW_APPLY";
const SITE_ENV_KEYS = ["FUNNEL_RECONCILE_SITE", "NEXT_PUBLIC_SITE_URL"];

export const FUNNEL_RECONCILE_CONTRACT = Object.freeze({
  endpointPath: "/api/analytics/funnel/reconcile",
  defaultDays: DEFAULT_DAYS,
  defaultLimit: DEFAULT_LIMIT,
  applyAckEnv: APPLY_ACK_ENV,
  siteEnvKeys: SITE_ENV_KEYS,
  tokenEnv: "PRINT_ADMIN_TOKEN",
});

function usage() {
  return `Usage: node scripts/funnel-reconcile.mjs [--site <origin>] [--days <1-60>] [--limit <1-500>] [--dry-run|--apply]

Calls authenticated POST /api/analytics/funnel/reconcile and prints aggregate totals only.

Defaults:
  --days ${DEFAULT_DAYS}
  --limit ${DEFAULT_LIMIT}
  dry-run / read-only (dryRun: true)

Flags:
  --site <origin>   Site origin (https://example.com). Overrides env.
  --days <n>        Lookback window 1-${MAX_DAYS} (default ${DEFAULT_DAYS})
  --limit <n>       Max eligible sessions 1-${MAX_LIMIT} (default ${DEFAULT_LIMIT})
  --dry-run         Explicit safe default (dryRun: true)
  --apply           Request dryRun: false (also requires ${APPLY_ACK_ENV}=1)
  -h, --help        Show this help

Required env:
  PRINT_ADMIN_TOKEN
  Site origin via --site or ${SITE_ENV_KEYS.join(" / ")}

Apply gate:
  ${APPLY_ACK_ENV}=1 must be set when using --apply; otherwise the CLI fails before any request.

Never prints tokens, Authorization headers, session IDs, customer data, or the API results array.
`;
}

function parsePositiveIntInRange(raw, label, min, max) {
  if (raw === undefined || raw === null || raw === "") {
    throw new Error(`Missing value for ${label}`);
  }
  const parsed = typeof raw === "number" ? raw : Number.parseInt(String(raw), 10);
  if (!Number.isFinite(parsed) || String(raw).trim() === "" || !/^-?\d+$/.test(String(raw).trim())) {
    throw new Error(`${label} must be an integer between ${min} and ${max}`);
  }
  if (parsed < min || parsed > max) {
    throw new Error(`${label} must be an integer between ${min} and ${max}`);
  }
  return parsed;
}

function normalizeOrigin(raw, label = "site origin") {
  const value = String(raw || "").trim();
  if (!value) {
    throw new Error(`Missing ${label}`);
  }
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`Malformed ${label}: expected http(s) origin like https://example.com`);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(`Malformed ${label}: protocol must be http or https`);
  }
  if (url.username || url.password) {
    throw new Error(`Malformed ${label}: credentials are not allowed in the origin`);
  }
  if (url.search || url.hash) {
    throw new Error(`Malformed ${label}: query/hash are not allowed`);
  }
  // Allow empty path or a single trailing slash only.
  if (url.pathname && url.pathname !== "/") {
    throw new Error(`Malformed ${label}: path is not allowed; pass an origin only`);
  }
  return `${url.protocol}//${url.host}`;
}

export function resolveSiteOrigin({ siteFlag, env = process.env } = {}) {
  if (siteFlag !== undefined && siteFlag !== null && String(siteFlag).trim() !== "") {
    return normalizeOrigin(siteFlag, "--site");
  }
  for (const key of SITE_ENV_KEYS) {
    const candidate = env[key]?.trim();
    if (candidate) {
      return normalizeOrigin(candidate, key);
    }
  }
  throw new Error(
    `Missing site origin. Pass --site <origin> or set ${SITE_ENV_KEYS.join(" or ")}.`,
  );
}

export function parseArgs(argv, env = process.env) {
  let siteFlag;
  let days = DEFAULT_DAYS;
  let limit = DEFAULT_LIMIT;
  let dryRunExplicit = false;
  let applyExplicit = false;

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "-h" || token === "--help") {
      return { help: true };
    }
    if (token === "--site") {
      const next = argv[i + 1];
      if (!next || next.startsWith("--")) throw new Error("Missing value for --site");
      siteFlag = next;
      i += 1;
      continue;
    }
    if (token === "--days") {
      const next = argv[i + 1];
      if (!next || next.startsWith("--")) throw new Error("Missing value for --days");
      days = parsePositiveIntInRange(next, "--days", MIN_DAYS, MAX_DAYS);
      i += 1;
      continue;
    }
    if (token === "--limit") {
      const next = argv[i + 1];
      if (!next || next.startsWith("--")) throw new Error("Missing value for --limit");
      limit = parsePositiveIntInRange(next, "--limit", MIN_LIMIT, MAX_LIMIT);
      i += 1;
      continue;
    }
    if (token === "--dry-run") {
      dryRunExplicit = true;
      continue;
    }
    if (token === "--apply") {
      applyExplicit = true;
      continue;
    }
    throw new Error(`Unknown arg: ${token}`);
  }

  if (dryRunExplicit && applyExplicit) {
    throw new Error("Conflicting flags: use either --dry-run or --apply, not both");
  }

  const apply = applyExplicit;
  const dryRun = !apply;
  const site = resolveSiteOrigin({ siteFlag, env });

  return {
    help: false,
    site,
    days,
    limit,
    dryRun,
    apply,
    dryRunExplicit,
    applyExplicit,
  };
}

export function assertApplyAllowed(args, env = process.env) {
  if (!args.apply) return;
  const ack = String(env[APPLY_ACK_ENV] || "").trim();
  if (ack !== "1") {
    throw new Error(
      `--apply requires ${APPLY_ACK_ENV}=1. Refusing to mutate. Re-run with the acknowledgement set, or omit --apply for dry-run.`,
    );
  }
}

function isAbortError(error) {
  if (!error || typeof error !== "object") return false;
  return error.name === "AbortError" || error.code === "ABORT_ERR";
}

export function formatAggregateReport(args, body) {
  const mode = args.dryRun ? "dry-run" : "apply";
  const repairLabel = args.dryRun ? "would_repair" : "repaired";
  const repairCount = Number(body?.repaired ?? 0);
  const lines = [
    "Funnel reconciliation",
    `site: ${args.site}`,
    `mode: ${mode}`,
    `days: ${args.days}`,
    `limit: ${args.limit}`,
    `scanned: ${Number(body?.scanned ?? 0)}`,
    `eligible: ${Number(body?.eligible ?? 0)}`,
    `already_recorded: ${Number(body?.alreadyRecorded ?? 0)}`,
    `${repairLabel}: ${repairCount}`,
  ];

  const sync = body?.sync;
  if (sync && typeof sync === "object") {
    const parts = [];
    if (typeof sync.previousWindowTotal === "number") {
      parts.push(`previous_window=${sync.previousWindowTotal}`);
    }
    if (typeof sync.nextWindowTotal === "number") {
      parts.push(`next_window=${sync.nextWindowTotal}`);
    }
    if (typeof sync.adjustedTotal === "number") {
      parts.push(`adjusted_total=${sync.adjustedTotal}`);
    }
    if (parts.length > 0) {
      lines.push(`sync: ${parts.join(" ")}`);
    }
  }

  return `${lines.join("\n")}\n`;
}

export function assertSafeOutput(text) {
  const blocked = [
    /authorization\s*:/i,
    /x-print-admin-token/i,
    /x-admin-token/i,
    /PRINT_ADMIN_TOKEN\s*=/i,
    /Bearer\s+[A-Za-z0-9._-]+/i,
    /"results"\s*:/,
    /\bcs_(test|live)_[A-Za-z0-9]+/i,
  ];
  for (const pattern of blocked) {
    if (pattern.test(text)) {
      throw new Error(`Refusing to print sensitive or detailed reconcile output matching ${pattern}`);
    }
  }
}

/**
 * Negative-control helper: an empty or no-op script must fail this check.
 */
export function assertScriptIsNotNoOp(scriptPath = fileURLToPath(import.meta.url)) {
  const absolute = path.resolve(scriptPath);
  if (!fs.existsSync(absolute)) {
    throw new Error(`Funnel reconcile script missing: ${absolute}`);
  }
  const bytes = fs.statSync(absolute).size;
  if (bytes <= 0) {
    throw new Error(`Funnel reconcile script is empty (0 bytes): ${absolute}`);
  }
  const source = fs.readFileSync(absolute, "utf8");
  if (!source.includes(FUNNEL_RECONCILE_CONTRACT.endpointPath)) {
    throw new Error("Funnel reconcile script does not reference the reconcile endpoint path");
  }
  if (!/dryRun\s*:\s*true/.test(source) && !/dryRun:\s*!apply/.test(source) && !source.includes("dryRun")) {
    throw new Error("Funnel reconcile script does not encode dry-run behavior");
  }
  return { bytes, absolute };
}

export async function runFunnelReconcile({
  argv = process.argv.slice(2),
  env = process.env,
  fetchImpl = globalThis.fetch,
  stdout = process.stdout,
  stderr = process.stderr,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  loadEnv = true,
} = {}) {
  if (loadEnv) {
    loadDotenv();
  }

  let args;
  try {
    args = parseArgs(argv, env);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    stderr.write(`${message}\n`);
    return 1;
  }

  if (args.help) {
    stdout.write(`${usage()}\n`);
    return 0;
  }

  try {
    assertApplyAllowed(args, env);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    stderr.write(`${message}\n`);
    return 1;
  }

  const token = String(env.PRINT_ADMIN_TOKEN || "").trim();
  if (!token) {
    stderr.write("Missing PRINT_ADMIN_TOKEN. Set it in the environment (never commit secrets).\n");
    return 1;
  }

  if (typeof fetchImpl !== "function") {
    stderr.write("fetch is unavailable in this runtime.\n");
    return 1;
  }

  const url = `${args.site}${FUNNEL_RECONCILE_CONTRACT.endpointPath}`;
  const requestBody = {
    days: args.days,
    limit: args.limit,
    dryRun: args.dryRun,
  };

  let response;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      response = await fetchImpl(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json",
          "x-print-admin-token": token,
        },
        body: JSON.stringify(requestBody),
        cache: "no-store",
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }
  } catch (error) {
    if (isAbortError(error)) {
      stderr.write(
        `Funnel reconcile timed out after ${timeoutMs}ms contacting ${args.site}${FUNNEL_RECONCILE_CONTRACT.endpointPath}. Check network connectivity and retry.\n`,
      );
      return 1;
    }
    const message = error instanceof Error ? error.message : String(error);
    stderr.write(
      `Funnel reconcile network failure contacting ${args.site}${FUNNEL_RECONCILE_CONTRACT.endpointPath}: ${message}\n`,
    );
    return 1;
  }

  const status = response.status;
  let text = "";
  try {
    text = await response.text();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    stderr.write(`Funnel reconcile failed reading response body (HTTP ${status}): ${message}\n`);
    return 1;
  }

  let body;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    stderr.write(
      `Funnel reconcile returned malformed JSON (HTTP ${status}). Check the site origin and that /api/analytics/funnel/reconcile is reachable.\n`,
    );
    return 1;
  }

  if (status === 401 || status === 403) {
    stderr.write(
      `Funnel reconcile unauthorized (HTTP ${status}). Verify PRINT_ADMIN_TOKEN matches the deployed admin token.\n`,
    );
    return 1;
  }
  if (status === 503) {
    const hint = typeof body?.error === "string" ? ` (${body.error})` : "";
    stderr.write(
      `Funnel reconcile unavailable (HTTP 503)${hint}. Stripe or dependent services may be unconfigured on the target site.\n`,
    );
    return 1;
  }
  if (status < 200 || status >= 300) {
    const hint = typeof body?.error === "string" ? `: ${body.error}` : "";
    stderr.write(`Funnel reconcile failed (HTTP ${status})${hint}\n`);
    return 1;
  }
  if (!body || body.ok !== true) {
    const hint = typeof body?.error === "string" ? `: ${body.error}` : "";
    stderr.write(`Funnel reconcile reported failure ({ ok: false })${hint}\n`);
    return 1;
  }

  const report = formatAggregateReport(args, body);
  try {
    assertSafeOutput(report);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    stderr.write(`${message}\n`);
    return 1;
  }
  stdout.write(report);
  return 0;
}

const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectRun) {
  runFunnelReconcile()
    .then((code) => {
      process.exitCode = code;
    })
    .catch((error) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    });
}
