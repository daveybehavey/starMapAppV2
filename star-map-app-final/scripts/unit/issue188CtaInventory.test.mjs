import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  EDITOR_DRAWER_MD_BREAKPOINT_PX,
  WIDTHS,
  assertInventoryComplete,
  expectedInventoryCaseCount,
  shouldAttemptStickyDrawer,
  stickyDialogExpected,
  writeInventoryEvidence,
} from "../issue-188-cta-inventory.mjs";

const SCRIPT_SOURCE = fs.readFileSync(
  fileURLToPath(new URL("../issue-188-cta-inventory.mjs", import.meta.url)),
  "utf8",
);

function makeInventory(states) {
  return {
    phase: "after",
    printEnabled: false,
    capturedAt: "2026-07-28T00:00:00.000Z",
    states,
  };
}

function completeStates(count = expectedInventoryCaseCount()) {
  return Array.from({ length: count }, (_, i) => ({
    viewport: WIDTHS[i % WIDTHS.length].width,
    force: "mobile",
    paid: false,
    postPreviewActions: [{ text: "Unlock HD", treatment: "gold-gradient-primary" }],
    customizeOpen: null,
  }));
}

test("sticky drawer path is only used below the Tailwind md breakpoint", () => {
  assert.equal(EDITOR_DRAWER_MD_BREAKPOINT_PX, 768);
  assert.equal(stickyDialogExpected(320), true);
  assert.equal(stickyDialogExpected(375), true);
  assert.equal(stickyDialogExpected(430), true);
  assert.equal(stickyDialogExpected(767), true);
  assert.equal(stickyDialogExpected(768), false);
  assert.equal(stickyDialogExpected(1280), false);
  assert.equal(stickyDialogExpected(1440), false);

  assert.equal(shouldAttemptStickyDrawer({ force: "mobile", width: 375 }), true);
  assert.equal(shouldAttemptStickyDrawer({ force: "mobile", width: 768 }), false);
  assert.equal(shouldAttemptStickyDrawer({ force: "desktop", width: 375 }), false);
  assert.equal(shouldAttemptStickyDrawer({ force: "desktop", width: 1280 }), false);
});

test("negative control: inclusive <=768 drawer predicate wrongly opens at md", () => {
  // Documents the Codex failure mode: treating md as mobile-drawer-capable.
  const brokenStickyDialogExpected = (width) => width <= 768;
  assert.equal(brokenStickyDialogExpected(768), true);
  assert.equal(stickyDialogExpected(768), false);
  assert.notEqual(brokenStickyDialogExpected(768), stickyDialogExpected(768));
  assert.match(SCRIPT_SOURCE, /Number\(width\) < EDITOR_DRAWER_MD_BREAKPOINT_PX/);
  assert.match(SCRIPT_SOURCE, /shouldAttemptStickyDrawer\(cfg\)/);
  assert.doesNotMatch(SCRIPT_SOURCE, /width\s*<=\s*768/);
});

test("expected inventory matrix includes mandatory 768 unpaid and paid cases", () => {
  assert.equal(expectedInventoryCaseCount(), 9);
  assertInventoryComplete(completeStates(9));
  assert.throws(() => assertInventoryComplete(completeStates(8)), /incomplete/);
  assert.throws(() => assertInventoryComplete([]), /incomplete/);
});

test("complete inventory writes atomic JSON/Markdown evidence", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "issue-188-inventory-"));
  const outDir = path.join(root, "artifacts");
  const docsDir = path.join(root, "docs");
  const inventory = makeInventory(completeStates());

  const written = writeInventoryEvidence({
    inventory,
    outDir,
    docsDir,
    phase: "after",
    printEnabled: false,
    complete: true,
  });

  assert.ok(fs.existsSync(written.artifactJson));
  assert.ok(fs.existsSync(written.docsJson));
  assert.ok(fs.existsSync(written.docsMd));
  const parsed = JSON.parse(fs.readFileSync(written.docsJson, "utf8"));
  assert.equal(parsed.states.length, 9);
  assert.match(fs.readFileSync(written.docsMd, "utf8"), /Issue #188 CTA inventory \(after/);
});

test("injected capture failure cannot replace valid evidence with a partial report", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "issue-188-inventory-"));
  const outDir = path.join(root, "artifacts");
  const docsDir = path.join(root, "docs");
  const canonical = path.join(docsDir, "inventory-after.json");
  const canonicalMd = path.join(docsDir, "inventory-after.md");

  const good = makeInventory(completeStates());
  writeInventoryEvidence({
    inventory: good,
    outDir,
    docsDir,
    phase: "after",
    printEnabled: false,
    complete: true,
  });
  const beforeJson = fs.readFileSync(canonical, "utf8");
  const beforeMd = fs.readFileSync(canonicalMd, "utf8");

  const partial = makeInventory(completeStates(3));
  assert.throws(
    () =>
      writeInventoryEvidence({
        inventory: partial,
        outDir,
        docsDir,
        phase: "after",
        printEnabled: false,
        complete: true,
      }),
    /incomplete/,
  );
  assert.throws(
    () =>
      writeInventoryEvidence({
        inventory: good,
        outDir,
        docsDir,
        phase: "after",
        printEnabled: false,
        complete: false,
      }),
    /Refusing to write/,
  );

  assert.equal(fs.readFileSync(canonical, "utf8"), beforeJson);
  assert.equal(fs.readFileSync(canonicalMd, "utf8"), beforeMd);
});

test("negative control: removing the completeness gate would overwrite with partial inventory", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "issue-188-inventory-"));
  const outDir = path.join(root, "artifacts");
  const docsDir = path.join(root, "docs");
  const canonical = path.join(docsDir, "inventory-after.json");

  writeInventoryEvidence({
    inventory: makeInventory(completeStates()),
    outDir,
    docsDir,
    phase: "after",
    printEnabled: false,
    complete: true,
  });
  const before = fs.readFileSync(canonical, "utf8");

  // Broken writer: ignores complete/count guards (the pre-fix Codex failure mode).
  const brokenWritePartial = (inventory) => {
    fs.mkdirSync(docsDir, { recursive: true });
    fs.writeFileSync(canonical, `${JSON.stringify(inventory, null, 2)}\n`);
  };
  brokenWritePartial(makeInventory(completeStates(2)));
  assert.notEqual(fs.readFileSync(canonical, "utf8"), before);

  // Restore via the guarded writer and prove the guard is still required in source.
  writeInventoryEvidence({
    inventory: makeInventory(completeStates()),
    outDir,
    docsDir,
    phase: "after",
    printEnabled: false,
    complete: true,
  });
  assert.equal(JSON.parse(fs.readFileSync(canonical, "utf8")).states.length, 9);
  assert.match(SCRIPT_SOURCE, /if \(!complete\)/);
  assert.match(SCRIPT_SOURCE, /assertInventoryComplete\(inventory\?\.states\)/);
  assert.match(SCRIPT_SOURCE, /writeFileAtomic/);
});
