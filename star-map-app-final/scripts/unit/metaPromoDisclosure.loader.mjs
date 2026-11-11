import fs from "node:fs";
import ts from "typescript";
import { resolve as resolveAliases } from "./tsAliasLoader.mjs";

export async function resolve(specifier, context, nextResolve) {
  // Render the real server landing page; isolate the unrelated interactive editor.
  if (specifier === "./EditorPageClient") return {
    url: "data:text/javascript," + encodeURIComponent(`import React from ${JSON.stringify(new URL("../../node_modules/react/index.js", import.meta.url).href)}; export default function Editor() { return React.createElement("button", null, "Editor purchase controls"); }`),
    shortCircuit: true,
  };
  return resolveAliases(specifier, context, nextResolve);
}

export async function load(url, context, nextLoad) {
  if (!url.endsWith(".tsx")) return nextLoad(url, context);
  const source = ts.transpileModule(fs.readFileSync(new URL(url), "utf8"), {
    compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  return { format: "module", source, shortCircuit: true };
}
