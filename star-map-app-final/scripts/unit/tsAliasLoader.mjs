/**
 * tsAliasLoader.mjs — ESM resolve hooks for unit tests that import REAL
 * src/lib modules whose runtime imports use the repo's "@/..." alias (and,
 * defensively, extensionless sibling paths inside src/).
 *
 * Why this exists: the plain-Node test runner cannot resolve the Next.js
 * "@/..." alias, and src files cannot use ".ts"-suffixed specifiers
 * (tsconfig has no allowImportingTsExtensions — TS5097). The established
 * alternatives are hand-copied "*.harness.mjs" mirrors, which test a copy
 * instead of the code. Registering these hooks lets a test import the real
 * module and its real dependency graph:
 *
 *   import { register } from "node:module";
 *   register("./tsAliasLoader.mjs", import.meta.url);
 *   const engine = await import("../../src/lib/reviewRequests.ts");
 *
 * (Static imports are hoisted ahead of register(), so aliased modules must
 * be pulled in with dynamic import after registration.)
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const UNIT_DIR = path.dirname(fileURLToPath(import.meta.url));
const APP_ROOT = path.resolve(UNIT_DIR, "../..");
const SRC_ROOT = path.join(APP_ROOT, "src");

function existingTsFile(basePath) {
  for (const candidate of [`${basePath}.ts`, `${basePath}.tsx`, path.join(basePath, "index.ts")]) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith("@/")) {
    const target = existingTsFile(path.join(SRC_ROOT, specifier.slice(2)));
    if (target) {
      return { url: pathToFileURL(target).href, shortCircuit: true };
    }
  }
  if (
    (specifier.startsWith("./") || specifier.startsWith("../")) &&
    context.parentURL &&
    context.parentURL.startsWith(pathToFileURL(SRC_ROOT).href) &&
    !/\.(ts|tsx|mjs|js|json)$/.test(specifier)
  ) {
    const parentPath = fileURLToPath(context.parentURL);
    const target = existingTsFile(path.resolve(path.dirname(parentPath), specifier));
    if (target) {
      return { url: pathToFileURL(target).href, shortCircuit: true };
    }
  }
  return nextResolve(specifier, context);
}

/**
 * Load hook: serve `.json` imports directly. Plain-Node ESM requires an
 * import attribute (`with { type: "json" }`) that src files cannot carry
 * (they are written for the bundler), so any src module importing catalog
 * JSON (e.g. lib/astronomy.ts → data/stars.json) fails to load in the unit
 * runner without this. Only `.json` URLs are intercepted; everything else
 * defers to the default loader. No previously-loadable graph changes:
 * a JSON import without an attribute never loaded before this hook.
 */
export async function load(url, context, nextLoad) {
  if (url.endsWith(".json")) {
    const source = fs.readFileSync(fileURLToPath(url), "utf8");
    return { format: "json", source, shortCircuit: true };
  }
  return nextLoad(url, context);
}
