#!/usr/bin/env node
/**
 * Fast GET checks that policy/support pages still expose required disclosures.
 * Keep fulfillment wording in sync with `src/lib/commerceFacts.ts`.
 */
import fs from "node:fs/promises";
import path from "node:path";

const DEFAULT_SITE = "https://starmapco.com";
const DEFAULT_TIMEOUT_MS = 15_000;

// Must match `PRINT_ORDER_FULFILLMENT_BUSINESS_DAYS` in commerceFacts.ts (Unicode en dash).
const FULFILLMENT_PHRASE = "2–5 business days";

function parseArgs(argv) {
  const args = { site: DEFAULT_SITE, timeoutMs: DEFAULT_TIMEOUT_MS };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    const next = argv[i + 1];
    if (token === "--site" && next) {
      args.site = next.replace(/\/+$/, "");
      i += 1;
      continue;
    }
    if (token === "--timeout-ms" && next) {
      const parsed = Number.parseInt(next, 10);
      if (Number.isFinite(parsed) && parsed > 0) args.timeoutMs = parsed;
      i += 1;
      continue;
    }
    if (token === "-h" || token === "--help") {
      console.log(`Usage: node scripts/policy-smoke.mjs [--site <url>] [--timeout-ms <n>]`);
      process.exit(0);
    }
    throw new Error(`Unknown arg: ${token}`);
  }
  return args;
}

function createAbortSignal(timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return {
    signal: controller.signal,
    cleanup() {
      clearTimeout(timer);
    },
  };
}

async function fetchWithTimeout(url, timeoutMs) {
  const { signal, cleanup } = createAbortSignal(timeoutMs);
  try {
    return await fetch(url, { cache: "no-store", signal });
  } finally {
    cleanup();
  }
}

async function readPolicyMetaIsoDates() {
  const filePath = path.join(process.cwd(), "src", "lib", "policyMeta.ts");
  const src = await fs.readFile(filePath, "utf8");
  const dates = {};
  for (const key of ["privacy", "terms", "shipping", "returns"]) {
    const re = new RegExp(`${key}\\s*:\\s*\"([0-9]{4}-[0-9]{2}-[0-9]{2})\"`);
    const m = src.match(re);
    if (!m) throw new Error(`Could not parse POLICY_LAST_UPDATED_ISO.${key} in policyMeta.ts`);
    dates[key] = m[1];
  }
  return dates;
}

function formatEnUsLong(iso) {
  const d = new Date(`${iso}T12:00:00.000Z`);
  return new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric" }).format(d);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const site = args.site;
  let failed = false;
  const run = (name, ok, detail) => {
    const prefix = ok ? "PASS" : "FAIL";
    console.log(`[${prefix}] ${name}${detail ? ` — ${detail}` : ""}`);
    if (!ok) failed = true;
  };

  const meta = await readPolicyMetaIsoDates();
  const expectLastUpdated = (html, page) => {
    const line = `Last updated: ${formatEnUsLong(meta[page])}`;
    return html.includes(line);
  };

  console.log(`Policy smoke target: ${site}`);

  try {
    const res = await fetchWithTimeout(`${site}/shipping`, args.timeoutMs);
    const html = await res.text();
    run("Shipping responds 200", res.status === 200, `status=${res.status}`);
    run(
      "Shipping table present",
      /Physical print countries/i.test(html) &&
        /Unframed shipping/i.test(html) &&
        /Framed shipping/i.test(html) &&
        /Delivery estimate/i.test(html),
      "table headings",
    );
    run("Shipping fulfillment phrase", html.includes(FULFILLMENT_PHRASE), FULFILLMENT_PHRASE);
    run("Shipping last updated line", expectLastUpdated(html, "shipping"), formatEnUsLong(meta.shipping));
    run("Shipping damaged-print 30-day window", /within\s+30\s+days/i.test(html), "delivery window");
  } catch (e) {
    failed = true;
    run("Shipping checks", false, e instanceof Error ? e.message : String(e));
  }

  try {
    const res = await fetchWithTimeout(`${site}/returns`, args.timeoutMs);
    const html = await res.text();
    run("Returns responds 200", res.status === 200, `status=${res.status}`);
    run(
      "Returns title present",
      /Returns\s*(?:&|&amp;)\s*Refunds\s*Policy/i.test(html),
      "h1 (& or &amp;)",
    );
    run("Returns change-of-mind clause", /change-of-mind/i.test(html), "copy");
    run("Returns 30-day window", /within\s+30\s+days/i.test(html), "delivery window");
    run("Returns last updated line", expectLastUpdated(html, "returns"), formatEnUsLong(meta.returns));
  } catch (e) {
    failed = true;
    run("Returns checks", false, e instanceof Error ? e.message : String(e));
  }

  try {
    const res = await fetchWithTimeout(`${site}/support`, args.timeoutMs);
    const html = await res.text();
    run("Support responds 200", res.status === 200, `status=${res.status}`);
    run("Support FAQ anchors", /id="faq-hd-download"/i.test(html), "faq-hd-download");
    run("Support FAQPage JSON-LD", html.includes('"@type":"FAQPage"'), "schema");
    run("Support damaged-print 30-day window", /within\s+30\s+days/i.test(html), "delivery window");
  } catch (e) {
    failed = true;
    run("Support checks", false, e instanceof Error ? e.message : String(e));
  }

  try {
    const res = await fetchWithTimeout(`${site}/terms`, args.timeoutMs);
    const html = await res.text();
    run("Terms responds 200", res.status === 200, `status=${res.status}`);
    run("Terms last updated line", expectLastUpdated(html, "terms"), formatEnUsLong(meta.terms));
  } catch (e) {
    failed = true;
    run("Terms checks", false, e instanceof Error ? e.message : String(e));
  }

  try {
    const res = await fetchWithTimeout(`${site}/privacy`, args.timeoutMs);
    const html = await res.text();
    run("Privacy responds 200", res.status === 200, `status=${res.status}`);
    run("Privacy last updated line", expectLastUpdated(html, "privacy"), formatEnUsLong(meta.privacy));
  } catch (e) {
    failed = true;
    run("Privacy checks", false, e instanceof Error ? e.message : String(e));
  }

  if (failed) {
    console.error("\nPolicy smoke failed.");
    process.exit(1);
  }
  console.log("\nPolicy smoke passed.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
