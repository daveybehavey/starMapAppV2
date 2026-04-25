#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const cwd = process.cwd();

function parseArgs(argv) {
  return {
    json: argv.includes("--json"),
  };
}

function isTruthy(value) {
  return /^(1|true|yes)$/i.test((value || "").trim());
}

function hasValue(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function readFile(relativePath) {
  return fs.readFileSync(path.join(cwd, relativePath), "utf8");
}

function pushCheck(checks, status, label, detail) {
  checks.push({ status, label, detail });
}

function printCheck(check) {
  const prefix =
    check.status === "pass" ? "PASS" :
    check.status === "warn" ? "WARN" :
    check.status === "fail" ? "FAIL" :
    "INFO";
  console.log(`[${prefix}] ${check.label}${check.detail ? ` — ${check.detail}` : ""}`);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const checks = [];

  const routeEnabled = isTruthy(process.env.BULK_EVENT_ORDERS_ENABLED || "");
  const alertTo =
    process.env.BULK_QUOTE_ALERT_TO?.trim() ||
    process.env.PROMOTION_EMAIL_REPLY_TO?.trim() ||
    process.env.NEXT_PUBLIC_SUPPORT_EMAIL?.trim() ||
    "support@starmapco.com";
  const alertFrom =
    process.env.BULK_QUOTE_ALERT_FROM?.trim() ||
    process.env.PROMOTION_EMAIL_FROM?.trim() ||
    process.env.PRINT_ORDER_ALERT_FROM?.trim() ||
    "";
  const provider =
    hasValue(process.env.RESEND_API_KEY) ? "resend" :
    hasValue(process.env.SENDGRID_API_KEY) ? "sendgrid" :
    "";

  const bulkPage = readFile("src/app/bulk-event-orders/page.tsx");
  const bulkApiRoute = readFile("src/app/api/bulk-quotes/route.ts");
  const sitemapFile = readFile("src/app/sitemap.ts");
  const packageJson = JSON.parse(readFile("package.json"));

  const robotsPublic = /robots:\s*\{\s*index:\s*true,\s*follow:\s*true\s*\}/.test(bulkPage);
  const robotsSoft = /robots:\s*\{\s*index:\s*false,\s*follow:\s*false\s*\}/.test(bulkPage);
  /** Sitemap lists bulk only when `bulkEnabled` is true (matches runtime flag). */
  const sitemapConditionalBulk =
    sitemapFile.includes("bulkEnabled") && sitemapFile.includes("bulk-event-orders");

  pushCheck(
    checks,
    "info",
    "Current bulk route state",
    routeEnabled ? "enabled" : "dark",
  );

  pushCheck(
    checks,
    bulkPage.includes("if (!isBulkOrdersEnabled())") ? "pass" : "fail",
    "Page route is gated by env",
    "bulk-event-orders/page.tsx",
  );

  pushCheck(
    checks,
    bulkApiRoute.includes("if (!isBulkOrdersEnabled())") ? "pass" : "fail",
    "Bulk quote API is gated by env",
    "api/bulk-quotes/route.ts",
  );

  /** Current product default: public launch (index + sitemap when flag on). Legacy soft = noindex + no sitemap ref. */
  const seoPosture =
    robotsPublic && sitemapConditionalBulk
      ? { status: "pass", label: "Bulk SEO posture (public launch)", detail: "indexable + conditional sitemap entry" }
      : robotsSoft && !sitemapFile.includes("bulk-event-orders")
        ? { status: "pass", label: "Bulk SEO posture (soft launch)", detail: "noindex + bulk omitted from sitemap source" }
        : robotsSoft && sitemapConditionalBulk
          ? {
              status: "warn",
              label: "Bulk SEO posture",
              detail: "noindex page but sitemap still has conditional bulk URL — align robots + sitemap intent",
            }
          : {
              status: "fail",
              label: "Bulk SEO posture",
              detail: "set robots to index:true/follow:true with conditional sitemap, or soft launch (noindex + no bulk in sitemap)",
            };
  pushCheck(checks, seoPosture.status, seoPosture.label, seoPosture.detail);

  pushCheck(
    checks,
    hasValue(alertTo) ? "pass" : "fail",
    "Alert recipient is configured",
    alertTo || "missing",
  );

  pushCheck(
    checks,
    hasValue(alertFrom) ? "pass" : "fail",
    "Alert sender is configured",
    alertFrom || "missing",
  );

  pushCheck(
    checks,
    hasValue(provider) ? "pass" : "fail",
    "Outbound email provider is configured",
    provider || "missing",
  );

  pushCheck(
    checks,
    packageJson.scripts?.["ops:bulk-quotes"] ? "pass" : "fail",
    "Bulk quote reporting command exists",
    "npm run ops:bulk-quotes",
  );

  const failed = checks.filter((check) => check.status === "fail");
  const launchReady = failed.length === 0;
  const summary = launchReady
    ? routeEnabled
      ? "Bulk lane is enabled and operationally ready."
      : "Bulk lane is off in env; code and ops checks look good for when you enable it."
    : "Bulk lane is not ready. Fix failed checks first.";

  if (args.json) {
    process.stdout.write(JSON.stringify({
      routeEnabled,
      launchReady,
      summary,
      checks,
    }, null, 2));
    process.stdout.write("\n");
    process.exit(launchReady ? 0 : 1);
  }

  console.log("Bulk launch readiness");
  console.log("");
  for (const check of checks) {
    printCheck(check);
  }
  console.log("");
  console.log(`Summary: ${summary}`);
  process.exit(launchReady ? 0 : 1);
}

main();
