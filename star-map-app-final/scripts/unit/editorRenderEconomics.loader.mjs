// Test-only TSX compilation and render-entry counters; production is unchanged.
import fs from "node:fs";
import ts from "typescript";
import { resolve as resolveAliases } from "./tsAliasLoader.mjs";
export async function resolve(specifier, context, nextResolve) {
  if (specifier === "next/image") {
    const image = new URL("../../node_modules/next/image.js", import.meta.url).href;
    const source = `import Image from ${JSON.stringify(image)}; export default Image.default ?? Image;`;
    return { url: `data:text/javascript,${encodeURIComponent(source)}`, shortCircuit: true };
  }
  return resolveAliases(specifier, context, nextResolve);
}
import { load as loadAliases } from "./tsAliasLoader.mjs";

export async function load(url, context, nextLoad) {
  if (!url.endsWith(".tsx")) return loadAliases(url, context, nextLoad);
  const names = new Set(["DateTimeControls", "LocationSearch", "ProPresetsPanel"]);
  const source = ts.transpileModule(fs.readFileSync(new URL(url), "utf8"), {
    compilerOptions: {
      jsx: ts.JsxEmit.ReactJSX,
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
    transformers: {
      before: [
        (ctx) => (root) => {
          const visit = (node) => {
            if (ts.isFunctionDeclaration(node) && names.has(node.name?.text) && node.body) {
              const counter = ts.factory.createExpressionStatement(
                ts.factory.createCallExpression(
                  ts.factory.createPropertyAccessExpression(
                    ts.factory.createIdentifier("globalThis"),
                    "__editorRenderEntry"
                  ),
                  undefined,
                  [ts.factory.createStringLiteral(node.name.text)]
                )
              );
              return ts.factory.updateFunctionDeclaration(
                node,
                node.modifiers,
                node.asteriskToken,
                node.name,
                node.typeParameters,
                node.parameters,
                node.type,
                ts.factory.updateBlock(node.body, [counter, ...node.body.statements])
              );
            }
            return ts.visitEachChild(node, visit, ctx);
          };
          return ts.visitNode(root, visit);
        },
      ],
    },
  }).outputText;
  return { format: "module", source, shortCircuit: true };
}
