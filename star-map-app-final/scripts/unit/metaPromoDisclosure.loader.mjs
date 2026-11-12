import fs from "node:fs";
import ts from "typescript";
import { resolve as resolveAliases } from "./tsAliasLoader.mjs";

export async function resolve(specifier, context, nextResolve) {
  // Keep cookie validation and the real disclosure/resolver; isolate the rest of the editor.
  if (specifier === "./EditorPageClient") return {
    url: "data:text/javascript," + encodeURIComponent(`
      import React from ${JSON.stringify(new URL("../../node_modules/react/index.js", import.meta.url).href)};
      import Notice from ${JSON.stringify(new URL("../../src/components/MetaPromoDisclosure.tsx", import.meta.url).href)};
      import { resolveEditorCheckoutPromoCode } from ${JSON.stringify(new URL("../../src/lib/checkoutPromotions.ts", import.meta.url).href)};
      export default function Editor({ metaCarry }) {
        const { source, storedPromoCode } = globalThis.metaPromoTestState;
        const effectivePromoCode = resolveEditorCheckoutPromoCode({
          fieldValue: "", fieldEdited: false,
          queryPromoCode: metaCarry.promoCode ?? null, storedPromoCode,
        });
        return React.createElement(React.Fragment, null,
          React.createElement(Notice, { source, couponDropped: metaCarry.couponDropped, effectivePromoCode }),
          React.createElement("button", null, "Editor purchase controls"));
      }
    `),
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
