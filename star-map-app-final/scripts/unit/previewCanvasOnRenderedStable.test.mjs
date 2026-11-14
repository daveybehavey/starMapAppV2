/**
 * Editor render performance: base-sky paint must not depend on onRendered
 * callback identity.
 *
 * Attribution: docs/EDITOR_RENDER_PERFORMANCE.md hot-path #1
 * (PR #613 memo). EditorExperience passes an inline onRendered; listing it
 * in the base useEffect deps forced a full sky redraw on every parent
 * re-render (including caption keystrokes), defeating the dual-canvas
 * split. The fix keeps the latest callback in a ref — same pattern as
 * onTextOverflowChangeRef — and removes onRendered from paint deps.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("../../src/components/PreviewCanvas.tsx", import.meta.url), "utf8");

test("wiring: onRendered is mirrored through a ref like onTextOverflowChange", () => {
  assert.match(source, /const onRenderedRef = useRef\(onRendered\)/);
  assert.match(
    source,
    /onRenderedRef\.current = onRendered/,
  );
  assert.match(source, /onRenderedRef\.current\?\.\(\)/);
});

test("wiring: base-sky effect does not list onRendered as a paint dependency", () => {
  // Isolate the base-sky effect: it calls renderStarMap with includeText: false.
  const marker = "includeText: false";
  const idx = source.indexOf(marker);
  assert.ok(idx > 0, "base-sky renderStarMap call present");
  const after = source.slice(idx, idx + 1200);
  // Dependency array that closes this effect must not include bare onRendered.
  const depsMatch = after.match(/\}, \[([^\]]+)\]\);/);
  assert.ok(depsMatch, "base-sky effect dependency array found after includeText:false");
  const deps = depsMatch[1];
  assert.doesNotMatch(
    deps,
    /(?:^|[\s,])onRendered(?:[\s,]|$)/,
    `onRendered must not be a base-sky paint dep; got: [${deps}]`,
  );
  assert.match(deps, /baseRecipe/);
  assert.match(deps, /workerSky/);
});

test("fence: textBoxes stay out of the base recipe so caption edits stay on the overlay", () => {
  // Pre-existing dual-canvas contract — keep it pinned next to the onRendered fix.
  assert.match(
    source,
    /textBoxes:\s*\[\]/,
  );
  assert.match(
    source,
    /dragging\/editing text does not force full sky redraws/,
  );
});
