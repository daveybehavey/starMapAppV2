/**
 * Mobile merch parity pins (fleet re-walk Oct 2026, coordination PR #33).
 *
 * The fleet found merch purchasable on desktop but absent on mobile:
 * EditorExperience owns all merch state, and its viewport branch rendered
 * MobileCreate with print/digital props only — MobileCreate contained zero
 * merch code, so a phone shopper from a /shop merch card got a print-only
 * editor and the merch_family param was silently dropped.
 *
 * The fix shares one panel: MerchPurchasePanel is rendered by the desktop
 * editor AND by MobileCreate, with state still owned by EditorExperience
 * and passed via props (the onStartPrintCheckout pattern). These are
 * source-construction pins, the repo's pattern for client surfaces the
 * plain Node suite cannot mount.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { MERCH_FAMILIES, isApparelMerchFamily } from "../../src/lib/merchCatalog.ts";

const read = (rel) => readFileSync(new URL(rel, import.meta.url), "utf8");

// Pin the complete guarded expressions: their false branches are the original
// non-apparel defaults. A first-size fallback in either apparel branch must fail.
test("IA-1c: the catalogue apparel rule covers exactly the tee and hoodie", () => {
  assert.deepEqual(MERCH_FAMILIES.filter((f) => isApparelMerchFamily(f.id)).map((f) => f.id), [
    "tee_unisex_bc3001", "hoodie_unisex_g18500",
  ]);
  for (const id of ["sticker_kisscut", "magnet_diecut", "pins_set"]) {
    assert.equal(isApparelMerchFamily(id), false);
  }
});

test("IA-1c: apparel checkout requires a size alongside the existing gates", () => {
  const panel = read("../../src/components/MerchPurchasePanel.tsx");
  assert.ok(panel.includes("const isApparel = isApparelMerchFamily(familyId);"));
  assert.ok(panel.includes("const apparelSizeMissing = isApparel && !size;"));
  assert.ok(panel.includes("disabled={checkoutInFlight || shippingCountryMissing || apparelSizeMissing}"));
});

test("IA-1c: requested-family seeding clears apparel size and preserves dimension defaults", () => {
  const editor = read("../../src/components/EditorExperience.tsx");
  assert.ok(editor.includes('const [selectedMerchSize, setSelectedMerchSize] = useState<string>("");'));
  assert.deepEqual(editor.match(/setSelectedMerchSize\([^;]+;/g), [
    'setSelectedMerchSize(isApparelMerchFamily(id) ? "" : fam.options.size?.[0] ?? "");',
  ]);
  assert.match(editor, /onSizeChange=\{setSelectedMerchSize\}/);
  assert.match(editor, /onMerchSizeChange=\{setSelectedMerchSize\}/);
});

test("IA-1c: family changes clear apparel size and preserve dimension defaults", () => {
  const panel = read("../../src/components/MerchPurchasePanel.tsx");
  assert.deepEqual(panel.match(/onSizeChange\([^\r\n]+/g), [
    'onSizeChange(isApparelMerchFamily(next) ? "" : nextFamily?.options.size?.[0] ?? "");',
    'onSizeChange(event.target.value)}',
  ]);
});

test("IA-1c: size select shows the apparel placeholder and preserves dimension defaults", () => {
  const panel = read("../../src/components/MerchPurchasePanel.tsx");
  const select = panel.match(/<select\s+id="merch-size-select"[\s\S]*?<\/select>/)?.[0];
  assert.ok(select);
  assert.ok(select.includes('value={isApparel ? size : size || family.options.size[0] || ""}'));
  assert.ok(select.includes('onChange={(event) => onSizeChange(event.target.value)}'));
  assert.ok(select.includes('<option value="">Select…</option>'));
});

test("IA-1c: checkout payload never substitutes apparel size and preserves dimension defaults", () => {
  const panel = read("../../src/components/MerchPurchasePanel.tsx");
  assert.ok(panel.includes('size: isApparel ? size : size || families.find((f) => f.id === familyId)?.options.size?.[0] || undefined,'));
});

test("IA-1c: colour seeding display and payload remain unchanged", () => {
  const editor = read("../../src/components/EditorExperience.tsx");
  const panel = read("../../src/components/MerchPurchasePanel.tsx");
  assert.ok(editor.includes('setSelectedMerchColor(fam.options.color?.[0] ?? "");'));
  assert.ok(panel.includes('onColorChange(nextFamily?.options.color?.[0] ?? "");'));
  assert.ok(panel.includes('value={color || family.options.color[0] || ""}'));
  assert.ok(panel.includes('color: color || families.find((f) => f.id === familyId)?.options.color?.[0] || undefined,'));
});

test("parity: the shared merch panel carries the full purchase path", () => {
  const panel = read("../../src/components/MerchPurchasePanel.tsx");
  assert.match(panel, /Checkout selected merch/, "panel has the merch checkout button");
  assert.match(panel, /<MerchSizeGuidePanel/, "panel renders the size guide");
  assert.match(panel, /getMerchSizeGuide/, "panel gates the size guide per family");
  assert.match(panel, /\{MERCH_POLICY_LINE\}/, "panel shows the merch policy line");
  assert.match(panel, /onCheckout/, "panel checks out via the shared callback");
  assert.match(panel, /checkoutError\?: string \| null/, "panel accepts an optional checkout error");
  assert.match(panel, /\{checkoutError \? \(/, "panel renders a passed checkout error");
});

test("parity: desktop editor renders the shared panel (no inline duplicate)", () => {
  const editor = read("../../src/components/EditorExperience.tsx");
  assert.match(editor, /<MerchPurchasePanel/, "desktop renders MerchPurchasePanel");
  assert.match(editor, /families=\{enabledMerchFamilies\}/, "desktop passes the enabled families");
});

test("parity: EditorExperience wires merch into MobileCreate", () => {
  const editor = read("../../src/components/EditorExperience.tsx");
  assert.match(editor, /merchFamilies=\{enabledMerchFamilies\}/, "mobile receives the enabled families");
  assert.match(editor, /onStartMerchCheckout=\{startMerchCheckout\}/, "mobile receives the merch checkout handler");
  assert.match(editor, /requestedMerchFamilyLabel=\{requestedMerchFamily/, "mobile receives the requested family label");
});

test("parity: MobileCreate renders the shared panel and names a merch-led product", () => {
  const mobile = read("../../src/app/MobileCreate.tsx");
  assert.match(mobile, /import \{ MerchPurchasePanel \}/, "MobileCreate imports the shared panel");
  assert.match(mobile, /<MerchPurchasePanel/, "MobileCreate renders the shared panel");
  assert.match(mobile, /Designing your \$\{requestedMerchFamilyLabel\.toLowerCase\(\)\}/, "merch-led landings name the product on mobile");
});

test("parity: mobile merch panel honors the print-checkout gate and surfaces checkout errors", () => {
  const editor = read("../../src/components/EditorExperience.tsx");
  const mobile = read("../../src/app/MobileCreate.tsx");
  assert.match(editor, /merchCheckoutError=\{checkoutError\}/, "EditorExperience passes its checkout error into MobileCreate");
  assert.match(mobile, /merchCheckoutError\?: string \| null/, "MobileCreate accepts the merch checkout error");
  assert.match(mobile, /checkoutError=\{merchCheckoutError\}/, "MobileCreate forwards the error to the shared merch panel");
  assert.match(
    mobile,
    /printCheckoutEnabled &&\s+merchFamilies\.length > 0/,
    "mobile merch panel stays hidden while print checkout is disabled"
  );
});
