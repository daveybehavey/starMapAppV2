import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const src = fileURLToPath(new URL("../../src/", import.meta.url));
const realDependencies = new Set([
  "@/lib/blogPosts", "@/lib/businessProfile", "@/lib/occasionSeo",
  "@/data/seoLocations", "@/data/seoOccasions", "@/data/seoIndexing",
]);

// Execute the actual exports, with a private env and module cache per scenario.
// UI/service dependencies are never loaded; accessing them fails closed.
export function loadSeoExports(env = {}) {
  const cache = new Map();
  const blocked = (name) => new Proxy({}, {
    get(_target, key) {
      if (key === "__esModule") return true;
      throw new Error(`SEO harness unexpectedly used rendering/service dependency ${name}.${String(key)}`);
    },
  });
  function load(path) {
    const file = [path, `${path}.ts`, `${path}.tsx`].find(existsSync);
    assert.ok(file, `SEO module not found: ${path}`);
    if (cache.has(file)) return cache.get(file).exports;
    const loadedModule = { exports: {} };
    cache.set(file, loadedModule);
    const { outputText } = ts.transpileModule(readFileSync(file, "utf8"), {
      fileName: file,
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
    });
    runInNewContext(outputText, {
      module: loadedModule, exports: loadedModule.exports, URL, process: { env: { ...env } },
      require(name) {
        if (realDependencies.has(name)) return load(resolve(src, name.slice(2)));
        if (name === "next/font/google") return { Playfair_Display: () => ({ variable: "test-font" }) };
        if (name.endsWith(".css")) return {};
        if (name.startsWith(".")) throw new Error(`Unreviewed SEO dependency ${name} in ${dirname(file)}`);
        return blocked(name);
      },
    }, { filename: file, timeout: 5000 });
    return loadedModule.exports;
  }
  return (path) => load(resolve(src, path));
}

export function assertCanonical(value, origin, path, label = "canonical") {
  assert.equal(typeof value, "string", `${label}: expected an absolute URL`);
  let url;
  try { url = new URL(value); } catch { assert.fail(`${label}: malformed URL ${value}`); }
  assert.equal(url.origin, origin, `${label}: wrong canonical origin for ${value}`);
  assert.equal(url.pathname, path, `${label}: wrong canonical path for ${value}`);
  assert.equal(url.search + url.hash + url.username + url.password, "", `${label}: query, fragment or credentials in ${value}`);
  assert.equal(value, `${origin}${path}`, `${label}: URL must use canonical serialization`);
}

export function assertSitemap(entries, origin) {
  assert.ok(Array.isArray(entries) && entries.length > 0, "sitemap must contain entries");
  const seen = new Set();
  for (const [index, entry] of entries.entries()) {
    const label = `sitemap entry ${index} (${entry.url})`;
    assert.equal(typeof entry.url, "string", `${label}: expected URL string`);
    let url;
    try { url = new URL(entry.url); } catch { assert.fail(`${label}: malformed URL`); }
    assert.match(url.pathname, /^\/(?:[a-z0-9]+(?:-[a-z0-9]+)*(?:\/[a-z0-9]+(?:-[a-z0-9]+)*)*)?$/, `${label}: malformed URL path`);
    assertCanonical(entry.url, origin, url.pathname, label);
    assert.ok(!seen.has(entry.url), `${label}: duplicate URL`);
    seen.add(entry.url);
  }
  return seen;
}
