/**
 * DL-1 Slice 1 source pin (build plan §3.6(i), scoped to this slice).
 *
 * The editor's post-checkout auto-export was the only debit in the system
 * that fired with no customer action at all (DL-1 defect class (a)):
 * `handleExport` armed `localStorage["star-map-auto-export"]` before the
 * paywall, a restore read turned the flag into `autoExportPending` state,
 * and an effect fired from `requestAnimationFrame` once the canvas was
 * ready and the session read as paid — render the 6000px file, call the
 * synthetic `a.click()` download trigger, then consume the HD credit.
 * A programmatic click with no user activation is exactly what browsers
 * suppress, silently, while the credit was consumed anyway.
 *
 * Slice 1 deletes the mechanism outright: no token, no pending state, no
 * effect. Post-checkout delivery happens on `/download` behind an explicit
 * customer click (the Stripe-return hand-off is owned by the success page,
 * which already routes there via `buildDownloadPath`). Per the design, an
 * "auto" anything in the editor that triggers a download or a consume is a
 * DL-1 regression by definition — this pin guards that structure.
 * Behaviour is covered by the download-access Playwright spec and the
 * slice's recorded QA script; the pin guards structure only.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const UNIT_DIR = path.dirname(fileURLToPath(import.meta.url));
const APP_ROOT = path.resolve(UNIT_DIR, "../..");
const SRC_ROOT = path.join(APP_ROOT, "src");

function readSrc(relativePath) {
  return fs.readFileSync(path.join(SRC_ROOT, relativePath), "utf8");
}

test("DL-1 slice 1 pin: EditorExperience has no auto-export mechanism", () => {
  const editor = readSrc("components/EditorExperience.tsx");
  assert.ok(
    !editor.includes("star-map-auto-export"),
    "the star-map-auto-export localStorage token must not exist in the editor",
  );
  assert.ok(
    !editor.includes("AUTO_EXPORT_KEY"),
    "the AUTO_EXPORT_KEY constant must not exist in the editor",
  );
  assert.ok(
    !editor.includes("autoExportPending"),
    "the autoExportPending state must not exist in the editor",
  );
});

test("DL-1 slice 1 pin: the manual in-editor export paths survive", () => {
  const editor = readSrc("components/EditorExperience.tsx");
  // The gesture-driven export handler stays: its HD branch still consumes
  // only inside the click handler, and the preview branch still triggers a
  // download from the same handler. Slice 1 removes the automatic path
  // only; the manual button's behaviour is out of scope (plan R4).
  assert.match(editor, /const handleExport = useCallback\(/);
  assert.match(editor, /await consumeHdCredit\(\)/);
  assert.match(editor, /triggerDownload\(rendered\.blob, rendered\.filename\)/);
});
