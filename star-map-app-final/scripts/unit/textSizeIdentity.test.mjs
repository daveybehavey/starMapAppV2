import assert from "node:assert/strict";
import { register } from "node:module";
import test from "node:test";

register("./tsAliasLoader.mjs", import.meta.url);
const { useStore } = await import("../../src/lib/store.ts");
const { buildRecipeFromState } = await import("../../src/lib/renderSky.ts");

test("text size edits preserve recipe identity when returned to the saved size", () => {
  const original = useStore.getState();
  try {
    original.setTextBoxes([
      {
        id: "title", label: "Title", text: "Our Night", fontFamily: "cinzel",
        color: "#ffffff", size: 40, align: "center",
        position: { x: 0.5, y: 0.15 },
      },
    ]);
    const savedBox = structuredClone(useStore.getState().textBoxes[0]);
    const recipe = () => buildRecipeFromState({
      ...useStore.getState(),
      dateTime: "2026-11-02T21:00:00.000Z",
      location: { name: "Victoria", latitude: 48.4, longitude: -123.4, timezone: "UTC" },
    });
    const before = JSON.stringify(recipe());
    for (const size of [10, 64, 41, 40]) {
      useStore.getState().updateTextBox("title", { size });
      assert.deepEqual(useStore.getState().textBoxes[0], { ...savedBox, size });
      assert.equal(recipe().textBoxes[0].size, size);
    }
    assert.equal(JSON.stringify(recipe()), before);
  } finally {
    useStore.setState(original, true);
  }
});
