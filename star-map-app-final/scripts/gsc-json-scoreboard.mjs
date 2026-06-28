#!/usr/bin/env node
/**
 * Build a B5 SEO snapshot from company-os GSC JSON pulls.
 *   npm run seo:gsc-snapshot
 */
import fs from "node:fs/promises";
import path from "node:path";

const CANDIDATE_DATA_DIRS = [
  path.resolve(process.cwd(), "..", "company-os", ".data"),
  path.resolve("C:/Users/david/dev/starMapAppV2/company-os/.data"),
];

async function resolveDataDir(explicit) {
  if (explicit) return path.resolve(explicit);
  for (const candidate of CANDIDATE_DATA_DIRS) {
    try {
      await fs.access(path.join(candidate, "gsc-queries-28d.json"));
      return candidate;
    } catch {
      // try next
    }
  }
  throw new Error(
    `GSC JSON not found. Run company-os data:pull or pass --data-dir (tried: ${CANDIDATE_DATA_DIRS.join(", ")})`,
  );
}

function parseArgs(argv) {
  const args = { dataDir: process.env.GSC_JSON_DIR || null, out: "reports/b5-gsc-snapshot.md", top: 15 };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    const next = argv[i + 1];
    if (token === "--data-dir" && next) {
      args.dataDir = path.resolve(next);
      i += 1;
      continue;
    }
    if (token === "--out" && next) {
      args.out = next;
      i += 1;
      continue;
    }
    if (token === "--top" && next) {
      args.top = Number.parseInt(next, 10) || 15;
      i += 1;
    }
  }
  return args;
}

function normalizePath(url) {
  try {
    return new URL(url).pathname;
  } catch {
    return String(url || "");
  }
}

function table(rows, columns) {
  const header = `| ${columns.map((c) => c.label).join(" | ")} |`;
  const sep = `| ${columns.map(() => "---:").join(" | ")} |`;
  const body = rows.map((row) => `| ${columns.map((c) => c.format(row)).join(" | ")} |`);
  return [header, sep, ...body].join("\n");
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const dataDir = await resolveDataDir(args.dataDir);
  const queriesPath = path.join(dataDir, "gsc-queries-28d.json");
  const pagesPath = path.join(dataDir, "gsc-pages-28d.json");

  const queriesJson = JSON.parse(await fs.readFile(queriesPath, "utf8"));
  const pagesJson = JSON.parse(await fs.readFile(pagesPath, "utf8"));

  const queries = [...(queriesJson.rows || [])].sort((a, b) => b.impressions - a.impressions).slice(0, args.top);
  const pages = [...(pagesJson.rows || [])]
    .map((row) => ({ ...row, path: normalizePath(row.key) }))
    .sort((a, b) => b.impressions - a.impressions)
    .slice(0, args.top);

  const tuneCandidates = queries.filter(
    (row) => row.impressions >= 5 && row.position > 40 && /generator|personalized|gift|star map/i.test(row.key),
  );

  const markdown = [
    "# B5 GSC snapshot",
    "",
    `Generated: ${new Date().toISOString()}`,
    `Source: \`${dataDir}\``,
    "",
    "## Top queries (28d impressions)",
    "",
    table(queries, [
      { label: "Query", format: (r) => r.key },
      { label: "Impr", format: (r) => r.impressions },
      { label: "Clicks", format: (r) => r.clicks },
      { label: "Pos", format: (r) => r.position.toFixed(1) },
    ]),
    "",
    "## Top pages (28d impressions)",
    "",
    table(pages, [
      { label: "Path", format: (r) => r.path },
      { label: "Impr", format: (r) => r.impressions },
      { label: "Clicks", format: (r) => r.clicks },
      { label: "Pos", format: (r) => r.position.toFixed(1) },
    ]),
    "",
    "## Title/H1 tune candidates",
    "",
    tuneCandidates.length
      ? tuneCandidates
          .map(
            (row) =>
              `- **${row.key}** — ${row.impressions} impr, pos ${row.position.toFixed(1)} → tune /star-map-generator, /personalized-star-map, or /wedding as relevant`,
          )
          .join("\n")
      : "- No high-impression mid-rank generator/gift queries in this window.",
    "",
    "## Recommended page focus this week",
    "",
    "- `/star-map-generator` — highest impression volume among tools pages",
    "- `/personalized-star-map` — matches gift-intent queries",
    "- `/wedding` — paid + organic gift wedge",
    "",
  ].join("\n");

  const outPath = path.resolve(process.cwd(), args.out);
  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await fs.writeFile(outPath, markdown, "utf8");
  console.log(`Wrote ${outPath}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
