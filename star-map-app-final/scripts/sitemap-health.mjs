#!/usr/bin/env node

import process from "node:process";

const DEFAULT_SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, "") || "https://starmapco.com";
const MAX_RETRIES = 3;
const RETRYABLE_STATUS_CODES = new Set([429, 500, 502, 503, 504]);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableStatus(status) {
  return RETRYABLE_STATUS_CODES.has(status);
}

function printHelp() {
  console.log(`Usage: node scripts/sitemap-health.mjs [options]

Options:
  --sitemap <url>         Sitemap URL to test (default: ${DEFAULT_SITE_URL}/sitemap.xml)
  --concurrency <n>       Parallel checks (default: 8)
  --timeout-ms <n>        Request timeout in ms (default: 15000)
  --skip-onpage           Skip canonical/noindex on-page checks
  --fail-on-redirect      Exit non-zero for 3xx responses
  -h, --help              Show this help
`);
}

function parseArgs(argv) {
  const config = {
    sitemapUrl: `${DEFAULT_SITE_URL}/sitemap.xml`,
    concurrency: 8,
    timeoutMs: 15_000,
    checkOnPage: true,
    failOnRedirect: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "-h" || arg === "--help") {
      printHelp();
      process.exit(0);
    }
    if (arg === "--fail-on-redirect") {
      config.failOnRedirect = true;
      continue;
    }
    if (arg === "--skip-onpage") {
      config.checkOnPage = false;
      continue;
    }
    if (arg === "--sitemap") {
      const value = argv[i + 1];
      if (!value) throw new Error("Missing value for --sitemap");
      config.sitemapUrl = value;
      i += 1;
      continue;
    }
    if (arg === "--concurrency") {
      const value = Number.parseInt(argv[i + 1] || "", 10);
      if (!Number.isFinite(value) || value < 1) {
        throw new Error("Invalid value for --concurrency");
      }
      config.concurrency = value;
      i += 1;
      continue;
    }
    if (arg === "--timeout-ms") {
      const value = Number.parseInt(argv[i + 1] || "", 10);
      if (!Number.isFinite(value) || value < 1000) {
        throw new Error("Invalid value for --timeout-ms (min 1000)");
      }
      config.timeoutMs = value;
      i += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  return config;
}

function decodeXmlEntities(value) {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", "\"")
    .replaceAll("&#39;", "'");
}

function parseSitemapUrls(xml) {
  const urls = new Set();
  const regex = /<loc>(.*?)<\/loc>/gims;
  let match = regex.exec(xml);
  while (match) {
    const value = decodeXmlEntities(match[1].trim());
    if (value) urls.add(value);
    match = regex.exec(xml);
  }
  return [...urls];
}

function readAttr(tag, attrName) {
  const regex = new RegExp(`\\b${attrName}\\s*=\\s*["']([^"']+)["']`, "i");
  const match = regex.exec(tag);
  return match ? decodeXmlEntities(match[1].trim()) : null;
}

function normalizeComparableUrl(raw) {
  try {
    const url = new URL(raw);
    url.hash = "";
    if ((url.protocol === "https:" && url.port === "443") || (url.protocol === "http:" && url.port === "80")) {
      url.port = "";
    }
    if (url.pathname !== "/") {
      url.pathname = url.pathname.replace(/\/+$/, "");
    }
    return `${url.protocol}//${url.host}${url.pathname}${url.search}`;
  } catch {
    return null;
  }
}

function extractCanonical(html) {
  const linkTags = html.match(/<link\b[^>]*>/gim) ?? [];
  for (const tag of linkTags) {
    const rel = readAttr(tag, "rel");
    if (!rel) continue;
    if (!rel.toLowerCase().split(/\s+/).includes("canonical")) continue;
    const href = readAttr(tag, "href");
    if (href) return href;
  }
  return null;
}

function extractRobotsContent(html) {
  const metaTags = html.match(/<meta\b[^>]*>/gim) ?? [];
  for (const tag of metaTags) {
    const name = readAttr(tag, "name");
    if (!name || name.toLowerCase() !== "robots") continue;
    const content = readAttr(tag, "content");
    if (content) return content;
  }
  return null;
}

async function inspectOnPage(url, timeoutMs) {
  const issues = [];
  try {
    let res = null;
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt += 1) {
      const current = await fetch(url, {
        method: "GET",
        redirect: "manual",
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!isRetryableStatus(current.status) || attempt === MAX_RETRIES) {
        res = current;
        break;
      }
      await sleep(150 * attempt);
    }

    if (!res) {
      return { canonical: null, robots: null, issues: ["on-page check failed (no response)"] };
    }

    if (!(res.status >= 200 && res.status < 300)) {
      return { canonical: null, robots: null, issues };
    }

    const contentType = (res.headers.get("content-type") || "").toLowerCase();
    if (!contentType.includes("text/html")) {
      return { canonical: null, robots: null, issues };
    }

    const html = await res.text();
    const canonicalRaw = extractCanonical(html);
    const robotsContent = extractRobotsContent(html);

    const normalizedExpected = normalizeComparableUrl(url);
    const canonicalAbsolute = canonicalRaw ? new URL(canonicalRaw, url).toString() : null;
    const normalizedCanonical = canonicalAbsolute ? normalizeComparableUrl(canonicalAbsolute) : null;

    if (!canonicalRaw) {
      issues.push("missing canonical");
    } else if (!normalizedCanonical || !normalizedExpected || normalizedCanonical !== normalizedExpected) {
      issues.push(`canonical mismatch (${canonicalAbsolute})`);
    }

    if (robotsContent && /\bnoindex\b/i.test(robotsContent)) {
      issues.push("robots meta contains noindex");
    }

    const xRobots = res.headers.get("x-robots-tag");
    if (xRobots && /\bnoindex\b/i.test(xRobots)) {
      issues.push("x-robots-tag contains noindex");
    }

    return {
      canonical: canonicalAbsolute,
      robots: robotsContent,
      issues,
    };
  } catch (error) {
    return {
      canonical: null,
      robots: null,
      issues: [`on-page check failed (${error instanceof Error ? error.message : String(error)})`],
    };
  }
}

async function fetchSitemap(sitemapUrl, timeoutMs) {
  const res = await fetch(sitemapUrl, {
    signal: AbortSignal.timeout(timeoutMs),
    redirect: "follow",
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch sitemap (${res.status})`);
  }
  return res.text();
}

async function probeUrl(url, timeoutMs, checkOnPage) {
  const startedAt = Date.now();
  try {
    let res = null;
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt += 1) {
      let current = await fetch(url, {
        method: "HEAD",
        redirect: "manual",
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (current.status === 405 || current.status === 501) {
        current = await fetch(url, {
          method: "GET",
          redirect: "manual",
          signal: AbortSignal.timeout(timeoutMs),
        });
      }
      if (!isRetryableStatus(current.status) || attempt === MAX_RETRIES) {
        res = current;
        break;
      }
      await sleep(150 * attempt);
    }

    if (!res) {
      return {
        url,
        status: 0,
        error: "no response",
        durationMs: Date.now() - startedAt,
      };
    }

    const result = {
      url,
      status: res.status,
      location: res.headers.get("location"),
      durationMs: Date.now() - startedAt,
    };

    if (checkOnPage && res.status >= 200 && res.status < 300) {
      result.onPage = await inspectOnPage(url, timeoutMs);
    }

    return result;
  } catch (error) {
    return {
      url,
      status: 0,
      error: error instanceof Error ? error.message : String(error),
      durationMs: Date.now() - startedAt,
    };
  }
}

async function runChecks(urls, concurrency, timeoutMs, checkOnPage) {
  const queue = [...urls];
  const results = [];
  let completed = 0;
  const total = queue.length;

  const workers = Array.from({ length: Math.min(concurrency, total) }, async () => {
    while (queue.length > 0) {
      const current = queue.shift();
      if (!current) break;
      const result = await probeUrl(current, timeoutMs, checkOnPage);
      results.push(result);
      completed += 1;
      if (completed % 25 === 0 || completed === total) {
        console.log(`Checked ${completed}/${total}`);
      }
    }
  });

  await Promise.all(workers);
  return results.sort((a, b) => a.url.localeCompare(b.url));
}

function printResults(results, failOnRedirect) {
  const ok = results.filter((row) => row.status >= 200 && row.status < 300);
  const redirects = results.filter((row) => row.status >= 300 && row.status < 400);
  const failures = results.filter((row) => row.status >= 400 || row.status === 0);
  const onPageIssues = results.filter(
    (row) => Array.isArray(row.onPage?.issues) && row.onPage.issues.length > 0,
  );

  console.log("");
  console.log(`Total URLs: ${results.length}`);
  console.log(`2xx: ${ok.length}`);
  console.log(`3xx: ${redirects.length}`);
  console.log(`4xx/5xx/errors: ${failures.length}`);
  console.log(`On-page issues: ${onPageIssues.length}`);

  if (redirects.length > 0) {
    console.log("");
    console.log("Redirects:");
    for (const row of redirects) {
      const target = row.location ? ` -> ${row.location}` : "";
      console.log(`- ${row.status} ${row.url}${target}`);
    }
  }

  if (failures.length > 0) {
    console.log("");
    console.log("Failures:");
    for (const row of failures) {
      const extra = row.error ? ` (${row.error})` : "";
      console.log(`- ${row.status} ${row.url}${extra}`);
    }
  }

  if (onPageIssues.length > 0) {
    console.log("");
    console.log("On-page issues:");
    for (const row of onPageIssues) {
      for (const issue of row.onPage.issues) {
        console.log(`- ${row.url}: ${issue}`);
      }
    }
  }

  const shouldFail =
    failures.length > 0 || onPageIssues.length > 0 || (failOnRedirect && redirects.length > 0);
  if (shouldFail) {
    process.exitCode = 1;
    console.log("");
    console.log("Result: FAILED");
    return;
  }

  console.log("");
  console.log("Result: PASSED");
}

async function main() {
  const config = parseArgs(process.argv.slice(2));
  console.log(`Sitemap: ${config.sitemapUrl}`);
  console.log(`Concurrency: ${config.concurrency}`);
  console.log(`Timeout: ${config.timeoutMs}ms`);
  console.log(`On-page checks: ${config.checkOnPage ? "enabled" : "skipped"}`);
  console.log(`Fail on redirect: ${config.failOnRedirect ? "yes" : "no"}`);

  const xml = await fetchSitemap(config.sitemapUrl, config.timeoutMs);
  const urls = parseSitemapUrls(xml);
  if (urls.length === 0) {
    throw new Error("No <loc> entries found in sitemap");
  }
  const queryUrls = urls.filter((url) => {
    try {
      const parsed = new URL(url);
      return parsed.search.length > 0;
    } catch {
      return false;
    }
  });
  if (queryUrls.length > 0) {
    console.log("");
    console.log("Sitemap contains parameterized URLs:");
    for (const url of queryUrls) {
      console.log(`- ${url}`);
    }
    process.exitCode = 1;
    return;
  }

  const results = await runChecks(urls, config.concurrency, config.timeoutMs, config.checkOnPage);
  printResults(results, config.failOnRedirect);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
