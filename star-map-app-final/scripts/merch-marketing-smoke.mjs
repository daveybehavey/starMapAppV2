#!/usr/bin/env node

/**
 * Lightweight checks for merch marketing routes (shop section + editor deep link).
 * Does not call Stripe or Printful.
 *
 * Usage:
 *   node scripts/merch-marketing-smoke.mjs [--site http://localhost:3001] [--expect-merch-html]
 */

function parseArgs(argv) {
  const args = {
    site: "http://localhost:3001",
    timeoutMs: 15_000,
    expectMerchHtml: false,
  };

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
    if (token === "--expect-merch-html") {
      args.expectMerchHtml = true;
      continue;
    }
    if (token === "-h" || token === "--help") {
      console.log(`Usage: node scripts/merch-marketing-smoke.mjs [--site <url>] [--timeout-ms <n>] [--expect-merch-html]

Default site is http://localhost:3001. Use --expect-merch-html to require id="merch-beta" on /shop (needs merch env flags).`);
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

async function fetchWithTimeout(url, init, timeoutMs) {
  const { signal, cleanup } = createAbortSignal(timeoutMs);
  try {
    return await fetch(url, { ...init, signal });
  } finally {
    cleanup();
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const site = args.site;
  let failed = false;
  const run = (name, passed, details) => {
    console.log(`[${passed ? "PASS" : "FAIL"}] ${name}${details ? ` — ${details}` : ""}`);
    if (!passed) failed = true;
  };

  console.log(`Merch marketing smoke: ${site}`);

  try {
    const shopRes = await fetchWithTimeout(`${site}/shop`, { cache: "no-store" }, args.timeoutMs);
    const shopHtml = await shopRes.text();
    run("/shop responds 200", shopRes.status === 200, `status=${shopRes.status}`);

    if (args.expectMerchHtml) {
      run('/shop includes "Wearables & small merch" block', shopHtml.includes("Wearables & small merch"), "merch env flags");
      run('/shop includes id="merch-beta"', shopHtml.includes('id="merch-beta"'), "section anchor");
      run("/shop lists editor merch deep link", shopHtml.includes("merch_family="), "shop-merch href");
    }

    const editorUrl = `${site}/editor?mode=quick&source=smoke-merch&merch_family=sticker_kisscut`;
    const editorRes = await fetchWithTimeout(editorUrl, { cache: "no-store" }, args.timeoutMs);
    run("/editor with merch_family responds 200", editorRes.status === 200, `status=${editorRes.status}`);
  } catch (err) {
    console.error(err);
    failed = true;
  }

  process.exit(failed ? 1 : 0);
}

main().catch((error) => {
  console.error("Merch marketing smoke failed:", error instanceof Error ? error.message : String(error));
  process.exit(1);
});
