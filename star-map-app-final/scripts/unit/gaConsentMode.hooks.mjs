/**
 * ESM resolve hook for gaConsentMode.test.mjs: maps "@/..." specifiers that
 * name a literal file under src/ (e.g. "@/lib/commerceAnalyticsQa.mjs",
 * pulled in by analytics.ts's dependency graph) to that file. The shared
 * tsAliasLoader only tries .ts/.tsx/index.ts candidates, so explicit-.mjs
 * alias imports fall through to the package resolver and fail. Everything
 * else defers to the next resolver (tsAliasLoader).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const UNIT_DIR = path.dirname(fileURLToPath(import.meta.url));
const SRC_ROOT = path.resolve(UNIT_DIR, "..", "..", "src");

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith("@/")) {
    const target = path.join(SRC_ROOT, specifier.slice(2));
    if (fs.existsSync(target) && fs.statSync(target).isFile()) {
      return { url: pathToFileURL(target).href, shortCircuit: true };
    }
  }
  return nextResolve(specifier, context);
}
