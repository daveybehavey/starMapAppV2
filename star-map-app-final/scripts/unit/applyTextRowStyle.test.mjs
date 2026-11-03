import assert from "node:assert/strict";
import test from "node:test";
import { register } from "node:module";
register("./tsAliasLoader.mjs", import.meta.url);
const { applyTextRowStyle } = await import("../../src/lib/applyTextRowStyle.ts");
const { useStore } = await import("../../src/lib/store.ts");

const source = { id: "title", label: "Title", text: "Our night", fontFamily: "cinzel", size: 40, color: "#fff", align: "right", fontWeight: 700, textShadow: true, textGlow: false };
const target = { id: "subtitle", label: "Subtitle", text: "Keep these words", fontFamily: "lora", size: 20, color: "#000", align: "left", position: { x: 0.3, y: 0.8 }, textStyleBinding: { color: "automatic", fontFamily: "automatic", fontWeight: "automatic" } };

test("copies exactly styling, preserving target content/anchors and source without mutating inputs", () => {
  const boxes = [structuredClone(source), structuredClone(target)];
  const before = structuredClone(boxes);
  const result = applyTextRowStyle(boxes, "title");
  assert.deepEqual(boxes, before);
  assert.equal(result[0], boxes[0]);
  assert.deepEqual(result[1], { ...target, fontFamily: "cinzel", size: 40, color: "#fff", align: "right", fontWeight: 700, textShadow: true, textGlow: false, textStyleBinding: { color: "explicit", fontFamily: "explicit", fontWeight: "explicit" } });
});

test("absent optional styles clear prior effects and weights without adding persisted fields", () => {
  const { fontWeight, textGlow, textShadow, ...plain } = source;
  assert.equal(fontWeight, 700); assert.equal(textGlow, false); assert.equal(textShadow, true);
  const result = applyTextRowStyle([plain, { ...target, fontWeight: 400, textGlow: true, textShadow: true }], "title");
  for (const field of ["fontWeight", "textGlow", "textShadow"]) assert.equal(Object.hasOwn(result[1], field), false);
});

test("missing source and single row are no-ops", () => {
  const boxes = [source];
  assert.equal(applyTextRowStyle(boxes, "title"), boxes);
  assert.equal(applyTextRowStyle(boxes, "missing"), boxes);
});

test("store commit retains explicit copied typography and target anchors", () => {
  const original = useStore.getState();
  try {
    original.setTextBoxes([source, target]);
    const state = useStore.getState();
    state.setTextBoxes(applyTextRowStyle(state.textBoxes, "title"));
    assert.deepEqual(useStore.getState().textBoxes[1].textStyleBinding, { color: "explicit", fontFamily: "explicit", fontWeight: "explicit" });
    assert.deepEqual(useStore.getState().textBoxes[1].position, target.position);
  } finally { useStore.setState(original, true); }
});
