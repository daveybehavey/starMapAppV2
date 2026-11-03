/** Exact source identity for pre-existing renderer profiles, themes and tier typography. */
import ts from "typescript";
import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";
const baseline = resolve(process.argv[2]);
const candidate = process.cwd();
const styles = ["navyGold", "vintageEngraving", "parchmentScroll", "midnightMinimal"];
const sha = (value) => createHash("sha256").update(value).digest("hex");
function table(tree, file, name) {
  const source = ts.createSourceFile(
    file,
    readFileSync(join(tree, file), "utf8"),
    ts.ScriptTarget.Latest,
    true
  );
  let result;
  function visit(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(source) === name) result = node.initializer;
    ts.forEachChild(node, visit);
  }
  visit(source);
  assert.ok(result, `${file}:${name}`);
  return { source, properties: result.properties };
}
const report = [];
for (const [file, name, nested] of [
  ["src/lib/renderSky.ts", "STYLE_THEME", false],
  ["src/lib/renderSky.ts", "STYLE_RENDER_PROFILES", false],
  ["src/lib/mapLookTiers.ts", "TIER_TYPOGRAPHY", true],
]) {
  const before = table(baseline, file, name),
    after = table(candidate, file, name);
  for (const tier of nested ? ["minimal", "polished"] : [null])
    for (const style of styles) {
      const entry = (t) => {
        const props = tier
          ? t.properties.find((p) => p.name.getText(t.source) === tier).initializer.properties
          : t.properties;
        return props.find((p) => p.name.getText(t.source) === style).getText(t.source);
      };
      const a = entry(before),
        b = entry(after);
      assert.equal(b, a, `${name}.${tier || ""}.${style}`);
      report.push({
        entry: [name, tier, style].filter(Boolean).join("."),
        baseline: sha(a),
        candidate: sha(b),
      });
    }
}
writeFileSync(process.argv[3], JSON.stringify(report, null, 2) + "\n");
console.log(`PASS: ${report.length} exact old theme/profile/typography source entries`);
