import fs from "node:fs";
import ts from "typescript";
import { resolve as resolveAliases, load as loadAliases } from "./tsAliasLoader.mjs";
export const resolve = resolveAliases;
export async function load(url, context, nextLoad) {
  if (!url.endsWith(".tsx")) return loadAliases(url, context, nextLoad);
  return {
    format: "module", shortCircuit: true,
    source: ts.transpileModule(fs.readFileSync(new URL(url), "utf8"), {
      compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
    }).outputText,
  };
}
