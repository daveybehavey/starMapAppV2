#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";

const DEFAULT_SITE = "https://starmapco.com";
const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_REPORT_PATH = "reports/live-smoke.json";

function parseArgs(argv) {
  const args = {
    site: DEFAULT_SITE,
    timeoutMs: DEFAULT_TIMEOUT_MS,
    out: DEFAULT_REPORT_PATH,
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
    if (token === "--out" && next) {
      args.out = next;
      i += 1;
      continue;
    }
    if (token === "-h" || token === "--help") {
      console.log(`Usage: node scripts/live-smoke.mjs [--site <url>] [--timeout-ms <n>] [--out <file>]

Lightweight post-deploy live checks for core UX + API routes.`);
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

async function ensureDirFor(filePath) {
  await fs.mkdir(path.dirname(path.resolve(process.cwd(), filePath)), { recursive: true });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const checks = [];
  const runCheck = (name, passed, details) => {
    checks.push({ name, passed, details });
    const prefix = passed ? "PASS" : "FAIL";
    console.log(`[${prefix}] ${name}${details ? ` — ${details}` : ""}`);
  };
  const site = args.site;
  let failed = false;

  console.log(`Live smoke target: ${site}`);

  try {
    const homeRes = await fetchWithTimeout(`${site}/`, { cache: "no-store" }, args.timeoutMs);
    const homeHtml = await homeRes.text();
    const homeStatus = homeRes.status;
    runCheck("Homepage responds 200", homeStatus === 200, `status=${homeStatus}`);
    runCheck(
      "Homepage title includes StarMapCo",
      /<title>[^<]*StarMapCo[^<]*<\/title>/i.test(homeHtml),
      "title check",
    );
    runCheck(
      "Homepage footer includes social links",
      homeHtml.includes("https://www.facebook.com/profile.php?id=61584233102201") &&
        homeHtml.includes("https://ca.pinterest.com/StarMapCo/") &&
        homeHtml.includes("https://x.com/StarMapCo") &&
        homeHtml.includes("https://www.tiktok.com/@starmapco"),
      "facebook+pinterest+x+tiktok",
    );
    runCheck(
      "Homepage footer includes shipping policy link",
      homeHtml.includes('href="/shipping"') || homeHtml.includes("href='/shipping'"),
      "footer /shipping link",
    );
    runCheck(
      "Homepage includes Pinterest domain verify meta",
      homeHtml.includes('name="p:domain_verify"'),
      "meta tag present",
    );
    runCheck(
      "Homepage surfaces print and framed checkout options",
      homeHtml.includes("Print-ready exports") &&
        homeHtml.includes("/how-to-print-star-map"),
      "print visibility",
    );
    runCheck(
      "Homepage print CTAs enter print checkout flow",
      homeHtml.includes('source=home-delivery-print-unframed&checkout=print&print_variant=poster_unframed') &&
        homeHtml.includes('source=home-delivery-print-framed&checkout=print&print_variant=poster_framed'),
      "checkout=print links present",
    );
  } catch (error) {
    failed = true;
    runCheck("Homepage checks", false, error instanceof Error ? error.message : String(error));
  }

  try {
    const shippingRes = await fetchWithTimeout(`${site}/shipping`, { cache: "no-store" }, args.timeoutMs);
    const shippingHtml = await shippingRes.text();
    const hasShippingTableHeading =
      shippingHtml.includes("Shipping rates by country") ||
      shippingHtml.includes("Physical print countries");
    const hasShippingTableHeaders =
      /Country/i.test(shippingHtml) &&
      /Framed shipping/i.test(shippingHtml) &&
      /Unframed shipping/i.test(shippingHtml);
    runCheck("Shipping page responds 200", shippingRes.status === 200, `status=${shippingRes.status}`);
    runCheck(
      "Shipping page includes per-country table",
      hasShippingTableHeading && hasShippingTableHeaders,
      "shipping content",
    );
  } catch (error) {
    failed = true;
    runCheck("Shipping page checks", false, error instanceof Error ? error.message : String(error));
  }

  try {
    const personalizedRes = await fetchWithTimeout(`${site}/personalized-star-map`, { cache: "no-store" }, args.timeoutMs);
    const personalizedHtml = await personalizedRes.text();
    runCheck("Personalized page responds 200", personalizedRes.status === 200, `status=${personalizedRes.status}`);
    runCheck(
      "Personalized page references physical print checkout",
      /unframed print/i.test(personalizedHtml) &&
        /framed print/i.test(personalizedHtml) &&
        /shipping is added at checkout|shipping shows before payment/i.test(personalizedHtml),
      "print intent copy",
    );
  } catch (error) {
    failed = true;
    runCheck("Personalized page checks", false, error instanceof Error ? error.message : String(error));
  }

  try {
    const editorRes = await fetchWithTimeout(`${site}/editor`, { cache: "no-store" }, args.timeoutMs);
    const editorHtml = await editorRes.text();
    runCheck("Editor responds 200", editorRes.status === 200, `status=${editorRes.status}`);
    runCheck(
      "Editor route has noindex",
      /<meta name="robots" content="noindex, nofollow"/i.test(editorHtml),
      "robots meta",
    );
    const myDownloadsRes = await fetchWithTimeout(`${site}/my-downloads`, { cache: "no-store" }, args.timeoutMs);
    const myDownloadsHtml = await myDownloadsRes.text();
    runCheck("My Downloads responds 200", myDownloadsRes.status === 200, `status=${myDownloadsRes.status}`);
    runCheck(
      "My Downloads route has noindex",
      /<meta name="robots" content="noindex, nofollow"/i.test(myDownloadsHtml),
      "robots meta",
    );
  } catch (error) {
    failed = true;
    runCheck("Editor/My Downloads checks", false, error instanceof Error ? error.message : String(error));
  }

  try {
    const premiumRes = await fetchWithTimeout(`${site}/api/premium`, { cache: "no-store" }, args.timeoutMs);
    const premiumJson = await premiumRes.json();
    const hasPaidBoolean = typeof premiumJson?.paid === "boolean";
    runCheck("Premium endpoint responds 200", premiumRes.status === 200, `status=${premiumRes.status}`);
    runCheck("Premium payload has paid boolean", hasPaidBoolean, JSON.stringify(premiumJson));
  } catch (error) {
    failed = true;
    runCheck("Premium endpoint checks", false, error instanceof Error ? error.message : String(error));
  }

  try {
    const referralStatusRes = await fetchWithTimeout(
      `${site}/api/referrals/status`,
      { cache: "no-store" },
      args.timeoutMs,
    );
    runCheck(
      "Referral status endpoint blocks unauthenticated access",
      referralStatusRes.status === 401,
      `status=${referralStatusRes.status}`,
    );

    const referralLinkRes = await fetchWithTimeout(
      `${site}/api/referrals/link`,
      { method: "POST", cache: "no-store" },
      args.timeoutMs,
    );
    runCheck(
      "Referral link endpoint blocks unauthenticated access",
      referralLinkRes.status === 401,
      `status=${referralLinkRes.status}`,
    );

    const referralVisitRes = await fetchWithTimeout(
      `${site}/api/referrals/visit`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code: "not-valid!!" }),
        cache: "no-store",
      },
      args.timeoutMs,
    );
    runCheck(
      "Referral visit endpoint validates payload",
      referralVisitRes.status === 400,
      `status=${referralVisitRes.status}`,
    );

    const referralAttributionRes = await fetchWithTimeout(
      `${site}/api/referrals/attribution`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code: "not-valid!!" }),
        cache: "no-store",
      },
      args.timeoutMs,
    );
    runCheck(
      "Referral attribution endpoint validates payload",
      referralAttributionRes.status === 400,
      `status=${referralAttributionRes.status}`,
    );
  } catch (error) {
    failed = true;
    runCheck("Referral endpoint checks", false, error instanceof Error ? error.message : String(error));
  }

  try {
    const printStatusAdminRes = await fetchWithTimeout(
      `${site}/api/print/orders/status?session_id=test`,
      { cache: "no-store" },
      args.timeoutMs,
    );
    runCheck(
      "Print admin status endpoint requires auth",
      printStatusAdminRes.status === 401,
      `status=${printStatusAdminRes.status}`,
    );

    const printRetryAdminRes = await fetchWithTimeout(
      `${site}/api/print/orders/retry`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sessionId: "test" }),
        cache: "no-store",
      },
      args.timeoutMs,
    );
    runCheck(
      "Print admin retry endpoint requires auth",
      printRetryAdminRes.status === 401,
      `status=${printRetryAdminRes.status}`,
    );
  } catch (error) {
    failed = true;
    runCheck("Print admin endpoint checks", false, error instanceof Error ? error.message : String(error));
  }

  try {
    const funnelReconcileRes = await fetchWithTimeout(
      `${site}/api/analytics/funnel/reconcile`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ days: 14 }),
        cache: "no-store",
      },
      args.timeoutMs,
    );
    runCheck(
      "Funnel reconcile endpoint requires auth",
      funnelReconcileRes.status === 401,
      `status=${funnelReconcileRes.status}`,
    );
  } catch (error) {
    failed = true;
    runCheck("Funnel reconcile endpoint checks", false, error instanceof Error ? error.message : String(error));
  }

  try {
    const accountSessionsRes = await fetchWithTimeout(
      `${site}/api/account/sessions?email=test@example.com`,
      { cache: "no-store" },
      args.timeoutMs,
    );
    runCheck(
      "Account sessions endpoint requires auth",
      accountSessionsRes.status === 401,
      `status=${accountSessionsRes.status}`,
    );
  } catch (error) {
    failed = true;
    runCheck("Account sessions endpoint checks", false, error instanceof Error ? error.message : String(error));
  }

  try {
    const accountRecoverRes = await fetchWithTimeout(
      `${site}/api/account/recover`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: "not-an-email" }),
        cache: "no-store",
      },
      args.timeoutMs,
    );
    runCheck(
      "Account recovery endpoint validates email input",
      accountRecoverRes.status === 400,
      `status=${accountRecoverRes.status}`,
    );
  } catch (error) {
    failed = true;
    runCheck("Account recovery endpoint checks", false, error instanceof Error ? error.message : String(error));
  }

  try {
    const accountMySessionsRes = await fetchWithTimeout(
      `${site}/api/account/my-sessions`,
      { cache: "no-store" },
      args.timeoutMs,
    );
    runCheck(
      "Account my-sessions endpoint requires auth",
      accountMySessionsRes.status === 401,
      `status=${accountMySessionsRes.status}`,
    );
  } catch (error) {
    failed = true;
    runCheck("Account my-sessions endpoint checks", false, error instanceof Error ? error.message : String(error));
  }

  try {
    const accountAccessEmailRes = await fetchWithTimeout(
      `${site}/api/account/access-email`,
      {
        method: "POST",
        cache: "no-store",
      },
      args.timeoutMs,
    );
    runCheck(
      "Account access-email endpoint requires auth",
      accountAccessEmailRes.status === 401,
      `status=${accountAccessEmailRes.status}`,
    );
  } catch (error) {
    failed = true;
    runCheck("Account access-email endpoint checks", false, error instanceof Error ? error.message : String(error));
  }

  try {
    const accountMagicClaimRes = await fetchWithTimeout(
      `${site}/api/account/magic/claim`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token: "invalid" }),
        cache: "no-store",
      },
      args.timeoutMs,
    );
    runCheck(
      "Account magic claim endpoint rejects invalid token",
      accountMagicClaimRes.status === 404,
      `status=${accountMagicClaimRes.status}`,
    );
  } catch (error) {
    failed = true;
    runCheck("Account magic claim endpoint checks", false, error instanceof Error ? error.message : String(error));
  }

  try {
    const printDisabledRes = await fetchWithTimeout(
      `${site}/api/checkout`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          orderType: "print",
          printVariant: "poster_unframed",
        }),
        cache: "no-store",
      },
      args.timeoutMs,
    );
    const printDisabledJson = await printDisabledRes.json().catch(() => ({}));
    const printStatusOk = [400, 503].includes(printDisabledRes.status);
    runCheck("Print checkout safety gate responds safely", printStatusOk, `status=${printDisabledRes.status}`);
    runCheck(
      "Print checkout returns expected error code",
      printDisabledJson?.code === "print_checkout_disabled" || printDisabledJson?.code === "missing_print_asset",
      JSON.stringify(printDisabledJson),
    );
  } catch (error) {
    failed = true;
    runCheck("Print checkout safety checks", false, error instanceof Error ? error.message : String(error));
  }

  try {
    const mapCreateRes = await fetchWithTimeout(
      `${site}/api/maps`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          version: 1,
          seed: "live-smoke-checkout",
          datetimeISO: "2024-06-15T12:00:00.000Z",
          location: {
            name: "New York, NY, USA",
            latitude: 40.7128,
            longitude: -74.006,
            timezone: "America/New_York",
          },
          selectedStyle: "navyGold",
          aspectRatio: "square",
          shape: "rectangle",
          textBoxes: [
            {
              id: "title",
              label: "Title",
              text: "Live Smoke Map",
              fontFamily: "cinzel",
              color: "#d7b56c",
              size: 40,
              align: "center",
            },
          ],
          renderOptions: {
            visualMode: "enhanced",
            starIntensity: "normal",
            starGlow: true,
            constellationLines: "thin",
            constellationLabels: false,
            showGrid: false,
            showPlanets: true,
            premiumStars: "off",
            premiumPlanets: "off",
            planetEmphasis: "highlighted",
            showMoon: true,
            moonSize: "large",
            shapeMask: "rectangle",
            frameEnabled: true,
          },
        }),
        cache: "no-store",
      },
      args.timeoutMs,
    );
    const mapCreateJson = await mapCreateRes.json().catch(() => ({}));
    const mapId = typeof mapCreateJson?.id === "string" ? mapCreateJson.id.trim() : "";
    runCheck("Map save endpoint responds 200", mapCreateRes.status === 200, `status=${mapCreateRes.status}`);
    runCheck("Map save returns map id", /^[0-9a-f-]{36}$/i.test(mapId), mapId || "missing id");

    const checkoutRes = await fetchWithTimeout(
      `${site}/api/checkout`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ plan: "single", mapId }),
        cache: "no-store",
      },
      args.timeoutMs,
    );
    const checkoutJson = await checkoutRes.json().catch(() => ({}));
    const checkoutUrl = typeof checkoutJson?.url === "string" ? checkoutJson.url : "";
    runCheck("Digital checkout endpoint responds 200", checkoutRes.status === 200, `status=${checkoutRes.status}`);
    runCheck(
      "Digital checkout returns Stripe URL",
      /^https:\/\/checkout\.stripe\.com\//.test(checkoutUrl),
      checkoutUrl ? checkoutUrl.slice(0, 80) : "missing url",
    );
  } catch (error) {
    failed = true;
    runCheck("Digital checkout checks", false, error instanceof Error ? error.message : String(error));
  }

  try {
    const sitemapRes = await fetchWithTimeout(`${site}/sitemap.xml`, { cache: "no-store" }, args.timeoutMs);
    const sitemapXml = await sitemapRes.text();
    runCheck("Sitemap responds 200", sitemapRes.status === 200, `status=${sitemapRes.status}`);
    runCheck("Sitemap has urlset", /<urlset/i.test(sitemapXml), "xml format");
  } catch (error) {
    failed = true;
    runCheck("Sitemap checks", false, error instanceof Error ? error.message : String(error));
  }

  const summary = {
    generatedAt: new Date().toISOString(),
    site,
    timeoutMs: args.timeoutMs,
    passed: checks.every((item) => item.passed) && !failed,
    checks,
  };

  await ensureDirFor(args.out);
  await fs.writeFile(path.resolve(process.cwd(), args.out), `${JSON.stringify(summary, null, 2)}\n`, "utf8");
  console.log(`Report written: ${args.out}`);

  if (!summary.passed) {
    process.exitCode = 1;
    console.error("Live smoke result: FAILED");
    return;
  }

  console.log("Live smoke result: PASSED");
}

main().catch((error) => {
  console.error("Live smoke failed:", error instanceof Error ? error.message : String(error));
  process.exit(1);
});
