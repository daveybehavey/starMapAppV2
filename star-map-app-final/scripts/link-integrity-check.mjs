#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";

const PROJECT_ROOT = process.cwd();
const SOURCE_ROOT = path.join(PROJECT_ROOT, "src");
const ROUTES_ROOT = path.join(SOURCE_ROOT, "app");
const PUBLIC_ROOT = path.join(PROJECT_ROOT, "public");
const REQUIRED_DIRECTORIES = [
  { directory: SOURCE_ROOT, description: "application sources" },
  { directory: ROUTES_ROOT, description: "Next.js routes" },
  { directory: PUBLIC_ROOT, description: "public assets" },
];

const SOURCE_FILE_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".html"]);
const PAGE_FILE_REGEX = /^page\.(?:ts|tsx|js|jsx)$/;
const LINK_ATTR_REGEX =
  /(?:href|to)\s*=\s*(?:"([^"]+)"|'([^']+)'|\{\s*"([^"]+)"\s*\}|\{\s*'([^']+)'\s*\}|\{\s*`([^`]+)`\s*\})/g;

function escapeRegex(input) {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeRouteFolderSegment(segment) {
  if (!segment || segment.startsWith("(") && segment.endsWith(")")) {
    return null;
  }
  return segment;
}

function toRoutePath(filePath) {
  const rel = path.relative(ROUTES_ROOT, filePath).replace(/\\/g, "/");
  const parts = rel.split("/");
  const fileName = parts.pop();
  if (!fileName || !PAGE_FILE_REGEX.test(fileName)) return null;
  const routeParts = parts.map((segment) => normalizeRouteFolderSegment(segment)).filter(Boolean);
  return routeParts.length === 0 ? "/" : `/${routeParts.join("/")}`;
}

function routePathToRegex(routePath) {
  const normalized = routePath === "/" ? "/" : routePath.replace(/\/+$/, "");
  const parts = normalized.split("/").filter(Boolean);
  if (parts.length === 0) {
    return /^\/?$/;
  }
  const pattern = parts
    .map((segment) => {
      if (segment.startsWith("[[...") && segment.endsWith("]]")) return "(?:.+)?";
      if (segment.startsWith("[...") && segment.endsWith("]")) return ".+";
      if (segment.startsWith("[") && segment.endsWith("]")) return "[^/]+";
      return escapeRegex(segment);
    })
    .join("/");
  return new RegExp(`^/${pattern}/?$`);
}

async function walkFiles(startPath) {
  const stats = await fs.stat(startPath);
  if (stats.isFile()) return [startPath];
  const entries = await fs.readdir(startPath, { withFileTypes: true });
  entries.sort((left, right) => (left.name < right.name ? -1 : left.name > right.name ? 1 : 0));
  const files = [];
  for (const entry of entries) {
    const entryPath = path.join(startPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walkFiles(entryPath)));
      continue;
    }
    files.push(entryPath);
  }
  return files;
}

async function assertRequiredDirectories() {
  for (const { directory, description } of REQUIRED_DIRECTORIES) {
    let stats;
    try {
      stats = await fs.stat(directory);
    } catch (error) {
      if (error && typeof error === "object" && error.code === "ENOENT") {
        const relativePath = path.relative(PROJECT_ROOT, directory).replace(/\\/g, "/");
        throw new Error(`Required link-audit directory is missing: ${relativePath} (${description})`);
      }
      throw error;
    }
    if (!stats.isDirectory()) {
      const relativePath = path.relative(PROJECT_ROOT, directory).replace(/\\/g, "/");
      throw new Error(`Required link-audit path is not a directory: ${relativePath} (${description})`);
    }
  }
}

function stripQueryAndHash(link) {
  const queryIndex = link.indexOf("?");
  const hashIndex = link.indexOf("#");
  let cutIndex = -1;
  if (queryIndex >= 0 && hashIndex >= 0) cutIndex = Math.min(queryIndex, hashIndex);
  else if (queryIndex >= 0) cutIndex = queryIndex;
  else if (hashIndex >= 0) cutIndex = hashIndex;
  return cutIndex >= 0 ? link.slice(0, cutIndex) : link;
}

function normalizeLinkPath(rawLink) {
  if (!rawLink) return null;
  if (rawLink.startsWith("mailto:") || rawLink.startsWith("tel:")) return null;
  if (rawLink.startsWith("http://") || rawLink.startsWith("https://")) return null;
  if (rawLink.startsWith("//")) return null;
  if (!rawLink.startsWith("/")) return null;
  if (rawLink.startsWith("/api/")) return null;
  if (rawLink.includes("${")) return null;
  const stripped = stripQueryAndHash(rawLink).trim();
  if (!stripped) return "/";
  if (stripped === "/") return "/";
  return stripped.replace(/\/+$/, "");
}

function getLineNumber(content, index) {
  let line = 1;
  for (let i = 0; i < index; i += 1) {
    if (content.charCodeAt(i) === 10) line += 1;
  }
  return line;
}

async function loadRouteMatchers() {
  const allFiles = await walkFiles(ROUTES_ROOT);
  const routes = [];
  for (const filePath of allFiles) {
    const routePath = toRoutePath(filePath);
    if (!routePath) continue;
    routes.push(routePath);
  }

  const uniqueRoutes = Array.from(new Set(routes)).sort();
  if (uniqueRoutes.length === 0) {
    throw new Error("No Next.js page routes found under src/app.");
  }
  return uniqueRoutes.map((routePath) => ({
    routePath,
    regex: routePathToRegex(routePath),
  }));
}

async function loadPublicPaths() {
  const allFiles = await walkFiles(PUBLIC_ROOT);
  const filePaths = new Set();
  for (const filePath of allFiles) {
    const rel = path.relative(PUBLIC_ROOT, filePath).replace(/\\/g, "/");
    filePaths.add(`/${rel}`);
  }
  return filePaths;
}

async function collectSourceFiles() {
  const files = [];
  const rootFiles = await walkFiles(SOURCE_ROOT);
  for (const filePath of rootFiles) {
    if (!SOURCE_FILE_EXTENSIONS.has(path.extname(filePath))) continue;
    files.push(filePath);
  }
  return files;
}

function matchesRoute(pathname, routeMatchers) {
  return routeMatchers.some((matcher) => matcher.regex.test(pathname));
}

function matchesPublicFile(pathname, publicPaths) {
  if (pathname === "/") return false;
  if (publicPaths.has(pathname)) return true;
  if (publicPaths.has(`${pathname}.html`)) return true;
  if (publicPaths.has(path.join(pathname, "index.html").replace(/\\/g, "/"))) return true;
  return false;
}

async function main() {
  await assertRequiredDirectories();
  const [routeMatchers, publicPaths, sourceFiles] = await Promise.all([
    loadRouteMatchers(),
    loadPublicPaths(),
    collectSourceFiles(),
  ]);

  const issues = [];

  for (const filePath of sourceFiles) {
    const content = await fs.readFile(filePath, "utf8");
    LINK_ATTR_REGEX.lastIndex = 0;
    let match;
    while ((match = LINK_ATTR_REGEX.exec(content)) !== null) {
      const rawLink = match[1] ?? match[2] ?? match[3] ?? match[4] ?? match[5] ?? "";
      const normalized = normalizeLinkPath(rawLink);
      if (!normalized) continue;
      const isValid = matchesRoute(normalized, routeMatchers) || matchesPublicFile(normalized, publicPaths);
      if (isValid) continue;
      const line = getLineNumber(content, match.index);
      issues.push({
        file: path.relative(process.cwd(), filePath).replace(/\\/g, "/"),
        line,
        href: rawLink,
      });
    }
  }

  if (issues.length === 0) {
    const publicFileLabel = publicPaths.size === 1 ? "public file" : "public files";
    console.log(
      `Link integrity check passed. Audited ${sourceFiles.length} source files against ${routeMatchers.length} Next.js routes and ${publicPaths.size} ${publicFileLabel}.`,
    );
    return;
  }

  console.error(`Found ${issues.length} potential broken internal links:`);
  for (const issue of issues) {
    console.error(`- ${issue.file}:${issue.line} -> ${issue.href}`);
  }
  process.exit(1);
}

main().catch((error) => {
  console.error(`link-integrity-check failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
