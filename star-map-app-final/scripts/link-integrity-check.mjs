#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";

const ROUTES_ROOT = path.join(process.cwd(), "src", "app");
const SOURCE_ROOTS = [
  path.join(process.cwd(), "src"),
  path.join(process.cwd(), "public", "index.html"),
  path.join(process.cwd(), "public", "landing.html"),
];
const PUBLIC_ROOT = path.join(process.cwd(), "public");

const SOURCE_FILE_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".html"]);
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
  if (!rel.endsWith("/page.tsx")) return null;
  const withoutSuffix = rel.slice(0, -"/page.tsx".length);
  if (withoutSuffix === "") return "/";
  const parts = withoutSuffix
    .split("/")
    .map((segment) => normalizeRouteFolderSegment(segment))
    .filter(Boolean);
  return `/${parts.join("/")}`;
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

  const uniqueRoutes = Array.from(new Set(routes));
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
  for (const root of SOURCE_ROOTS) {
    const rootFiles = await walkFiles(root);
    for (const filePath of rootFiles) {
      if (!SOURCE_FILE_EXTENSIONS.has(path.extname(filePath))) continue;
      files.push(filePath);
    }
  }
  return files;
}

function matchesRoute(pathname, routeMatchers) {
  return routeMatchers.some((matcher) => matcher.regex.test(pathname));
}

function matchesPublicFile(pathname, publicPaths) {
  if (publicPaths.has(pathname)) return true;
  if (pathname === "/") return true;
  if (publicPaths.has(`${pathname}.html`)) return true;
  if (publicPaths.has(path.join(pathname, "index.html").replace(/\\/g, "/"))) return true;
  return false;
}

async function main() {
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
    console.log("Link integrity check passed.");
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
