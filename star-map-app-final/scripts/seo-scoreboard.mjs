#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";

const DEFAULT_FOCUS_QUERIES = [
  "star map",
  "constellation map",
  "night sky map",
  "star map gift",
  "anniversary gift",
  "wedding gift",
  "birthday gift",
  "personalized star map",
];

const DEFAULT_FOCUS_PATHS = [
  "/",
  "/star-map-generator",
  "/constellation-map",
  "/custom-night-sky-map",
  "/star-map-poster",
  "/star-map-gift",
  "/night-sky-map-gift",
  "/personalized-star-map",
  "/how-to-print-star-map",
];

function parseArgs(argv) {
  const args = {
    current: null,
    previous: null,
    out: "reports/seo-weekly-scoreboard.md",
    site: "https://starmapco.com",
    top: 12,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    const next = argv[i + 1];

    if (token === "--current" && next) {
      args.current = next;
      i += 1;
      continue;
    }
    if (token === "--previous" && next) {
      args.previous = next;
      i += 1;
      continue;
    }
    if (token === "--out" && next) {
      args.out = next;
      i += 1;
      continue;
    }
    if (token === "--site" && next) {
      args.site = next.replace(/\/+$/, "");
      i += 1;
      continue;
    }
    if (token === "--top" && next) {
      const n = Number.parseInt(next, 10);
      if (Number.isFinite(n) && n > 0) args.top = n;
      i += 1;
      continue;
    }
    if (token === "--help" || token === "-h") {
      return { ...args, help: true };
    }
  }

  return args;
}

function parseCsvLine(line) {
  const cells = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    const next = line[i + 1];
    if (ch === '"' && inQuotes && next === '"') {
      current += '"';
      i += 1;
      continue;
    }
    if (ch === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (ch === "," && !inQuotes) {
      cells.push(current.trim());
      current = "";
      continue;
    }
    current += ch;
  }
  cells.push(current.trim());
  return cells;
}

function normalizeHeader(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^\w]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function parsePercent(value) {
  if (value == null) return NaN;
  const cleaned = String(value).replace("%", "").replace(",", "").trim();
  const n = Number.parseFloat(cleaned);
  if (!Number.isFinite(n)) return NaN;
  return n / 100;
}

function parseNumber(value) {
  if (value == null) return NaN;
  const cleaned = String(value).replace(/,/g, "").trim();
  const n = Number.parseFloat(cleaned);
  return Number.isFinite(n) ? n : NaN;
}

function buildRecord(headers, row) {
  const get = (aliases) => {
    for (const alias of aliases) {
      const idx = headers.indexOf(alias);
      if (idx !== -1) return row[idx];
    }
    return "";
  };

  const query = get(["query", "queries", "top_queries"]);
  const page = get(["page", "pages", "top_pages", "url", "landing_page"]);
  const clicks = parseNumber(get(["clicks"]));
  const impressions = parseNumber(get(["impressions"]));
  const ctrRaw = get(["ctr", "click_through_rate"]);
  const position = parseNumber(get(["position", "avg_position", "average_position"]));
  const ctrFromCsv = parsePercent(ctrRaw);
  const ctr = Number.isFinite(ctrFromCsv)
    ? ctrFromCsv
    : impressions > 0 && Number.isFinite(clicks)
      ? clicks / impressions
      : NaN;

  return {
    query: String(query || "").trim(),
    page: String(page || "").trim(),
    clicks: Number.isFinite(clicks) ? clicks : 0,
    impressions: Number.isFinite(impressions) ? impressions : 0,
    ctr: Number.isFinite(ctr) ? ctr : 0,
    position: Number.isFinite(position) ? position : 0,
  };
}

async function loadCsv(filePath) {
  const raw = await fs.readFile(filePath, "utf8");
  const lines = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (!lines.length) return [];

  const headers = parseCsvLine(lines[0]).map(normalizeHeader);
  const records = [];
  for (const line of lines.slice(1)) {
    const row = parseCsvLine(line);
    const rec = buildRecord(headers, row);
    if (rec.clicks === 0 && rec.impressions === 0 && !rec.query && !rec.page) continue;
    records.push(rec);
  }
  return records;
}

function summarize(records) {
  const totals = {
    clicks: 0,
    impressions: 0,
    ctr: 0,
    position: 0,
  };

  let weightedPosition = 0;
  for (const rec of records) {
    totals.clicks += rec.clicks;
    totals.impressions += rec.impressions;
    weightedPosition += rec.position * rec.impressions;
  }
  totals.ctr = totals.impressions > 0 ? totals.clicks / totals.impressions : 0;
  totals.position = totals.impressions > 0 ? weightedPosition / totals.impressions : 0;
  return totals;
}

function aggregateBy(records, key) {
  const map = new Map();
  for (const rec of records) {
    const value = String(rec[key] || "").trim();
    if (!value) continue;
    const existing = map.get(value) || { key: value, clicks: 0, impressions: 0, weightedPosition: 0 };
    existing.clicks += rec.clicks;
    existing.impressions += rec.impressions;
    existing.weightedPosition += rec.position * rec.impressions;
    map.set(value, existing);
  }

  return Array.from(map.values())
    .map((item) => ({
      key: item.key,
      clicks: item.clicks,
      impressions: item.impressions,
      ctr: item.impressions > 0 ? item.clicks / item.impressions : 0,
      position: item.impressions > 0 ? item.weightedPosition / item.impressions : 0,
    }))
    .sort((a, b) => b.impressions - a.impressions);
}

function asPercent(value) {
  return `${(value * 100).toFixed(2)}%`;
}

function asNumber(value) {
  return Number.isFinite(value) ? value.toLocaleString("en-US", { maximumFractionDigits: 0 }) : "0";
}

function asPosition(value) {
  return Number.isFinite(value) ? value.toFixed(2) : "-";
}

function delta(current, previous) {
  if (!Number.isFinite(previous) || previous === 0) return "n/a";
  const change = ((current - previous) / previous) * 100;
  const sign = change > 0 ? "+" : "";
  return `${sign}${change.toFixed(1)}%`;
}

function asAbsoluteDelta(current, previous) {
  if (!Number.isFinite(previous)) return "n/a";
  const change = current - previous;
  const sign = change > 0 ? "+" : "";
  return `${sign}${change.toFixed(2)}`;
}

function normalizePath(value, siteUrl) {
  if (!value) return "";
  try {
    const url = new URL(value, siteUrl);
    return url.pathname || "/";
  } catch {
    return String(value).trim() || "";
  }
}

function findFocusQueries(queryRows, terms) {
  return terms.map((term) => {
    const lower = term.toLowerCase();
    const matches = queryRows.filter((row) => row.key.toLowerCase().includes(lower));
    const clicks = matches.reduce((sum, row) => sum + row.clicks, 0);
    const impressions = matches.reduce((sum, row) => sum + row.impressions, 0);
    const weightedPos = matches.reduce((sum, row) => sum + row.position * row.impressions, 0);
    return {
      key: term,
      clicks,
      impressions,
      ctr: impressions > 0 ? clicks / impressions : 0,
      position: impressions > 0 ? weightedPos / impressions : 0,
    };
  });
}

function findFocusPaths(pageRows, paths, siteUrl) {
  const normalizedRows = pageRows.map((row) => ({
    ...row,
    normalizedPath: normalizePath(row.key, siteUrl),
  }));

  return paths.map((targetPath) => {
    const row = normalizedRows.find((item) => item.normalizedPath === targetPath);
    return {
      key: targetPath,
      clicks: row?.clicks ?? 0,
      impressions: row?.impressions ?? 0,
      ctr: row?.ctr ?? 0,
      position: row?.position ?? 0,
    };
  });
}

function toMap(rows) {
  const map = new Map();
  for (const row of rows) map.set(row.key, row);
  return map;
}

function renderTable(rows, previousMap, { isPosition = false } = {}) {
  const lines = ["| Item | Clicks | Impressions | CTR | Avg Position | Delta |", "| --- | ---: | ---: | ---: | ---: | ---: |"];
  for (const row of rows) {
    const prev = previousMap?.get(row.key);
    const rowDelta = prev
      ? isPosition
        ? asAbsoluteDelta(row.position, prev.position)
        : delta(row.impressions, prev.impressions)
      : "n/a";
    lines.push(
      `| ${row.key} | ${asNumber(row.clicks)} | ${asNumber(row.impressions)} | ${asPercent(row.ctr)} | ${asPosition(row.position)} | ${rowDelta} |`,
    );
  }
  return lines.join("\n");
}

function usage() {
  return `Usage:
  node scripts/seo-scoreboard.mjs --current <current.csv> [--previous <previous.csv>] [--out <file>] [--top <n>] [--site <url>]

Example:
  node scripts/seo-scoreboard.mjs \\
    --current data/gsc-last-7d.csv \\
    --previous data/gsc-prev-7d.csv \\
    --out reports/seo-weekly-scoreboard.md`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || !args.current) {
    console.log(usage());
    process.exit(args.help ? 0 : 1);
  }

  const currentRecords = await loadCsv(args.current);
  const previousRecords = args.previous ? await loadCsv(args.previous) : [];

  if (!currentRecords.length) {
    throw new Error(`No usable rows in current file: ${args.current}`);
  }

  const currentSummary = summarize(currentRecords);
  const previousSummary = previousRecords.length ? summarize(previousRecords) : null;
  const queryRowsCurrent = aggregateBy(currentRecords, "query");
  const pageRowsCurrent = aggregateBy(currentRecords, "page");
  const queryRowsPrevious = previousRecords.length ? aggregateBy(previousRecords, "query") : [];
  const pageRowsPrevious = previousRecords.length ? aggregateBy(previousRecords, "page") : [];

  const focusQueriesCurrent = findFocusQueries(queryRowsCurrent, DEFAULT_FOCUS_QUERIES);
  const focusQueriesPrevious = findFocusQueries(queryRowsPrevious, DEFAULT_FOCUS_QUERIES);
  const focusPagesCurrent = findFocusPaths(pageRowsCurrent, DEFAULT_FOCUS_PATHS, args.site);
  const focusPagesPrevious = findFocusPaths(pageRowsPrevious, DEFAULT_FOCUS_PATHS, args.site);

  const topQueries = queryRowsCurrent.slice(0, args.top);
  const topPages = pageRowsCurrent
    .map((row) => ({ ...row, key: normalizePath(row.key, args.site) }))
    .slice(0, args.top);
  const topQueriesPreviousMap = toMap(queryRowsPrevious);
  const topPagesPreviousMap = toMap(
    pageRowsPrevious.map((row) => ({ ...row, key: normalizePath(row.key, args.site) })),
  );

  const focusQueryPrevMap = toMap(focusQueriesPrevious);
  const focusPagesPrevMap = toMap(focusPagesPrevious);

  const generatedAt = new Date().toISOString();
  const markdown = [
    "# SEO Weekly Scoreboard",
    "",
    `Generated: ${generatedAt}`,
    `Site: ${args.site}`,
    "",
    "## Summary",
    "",
    "| Metric | Current | Previous | Delta |",
    "| --- | ---: | ---: | ---: |",
    `| Clicks | ${asNumber(currentSummary.clicks)} | ${previousSummary ? asNumber(previousSummary.clicks) : "n/a"} | ${
      previousSummary ? delta(currentSummary.clicks, previousSummary.clicks) : "n/a"
    } |`,
    `| Impressions | ${asNumber(currentSummary.impressions)} | ${
      previousSummary ? asNumber(previousSummary.impressions) : "n/a"
    } | ${previousSummary ? delta(currentSummary.impressions, previousSummary.impressions) : "n/a"} |`,
    `| CTR | ${asPercent(currentSummary.ctr)} | ${
      previousSummary ? asPercent(previousSummary.ctr) : "n/a"
    } | ${
      previousSummary ? asAbsoluteDelta(currentSummary.ctr * 100, previousSummary.ctr * 100) + "pp" : "n/a"
    } |`,
    `| Avg Position | ${asPosition(currentSummary.position)} | ${
      previousSummary ? asPosition(previousSummary.position) : "n/a"
    } | ${previousSummary ? asAbsoluteDelta(currentSummary.position, previousSummary.position) : "n/a"} |`,
    "",
    "## Focus Keyword Groups",
    "",
    renderTable(focusQueriesCurrent, focusQueryPrevMap),
    "",
    "## Focus Pages",
    "",
    renderTable(focusPagesCurrent, focusPagesPrevMap),
    "",
    `## Top ${args.top} Queries (by impressions)`,
    "",
    renderTable(topQueries, topQueriesPreviousMap),
    "",
    `## Top ${args.top} Pages (by impressions)`,
    "",
    renderTable(topPages, topPagesPreviousMap),
    "",
  ].join("\n");

  const outPath = path.resolve(process.cwd(), args.out);
  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await fs.writeFile(outPath, markdown, "utf8");

  console.log(`Wrote scoreboard to ${outPath}`);
}

main().catch((err) => {
  console.error("seo-scoreboard failed:", err.message);
  process.exit(1);
});
