/**
 * X01 regression (coordination PR #25, fleet Christmas conversion walk):
 * on iOS the text-fallback date input ran the FULL normalizer on every
 * keystroke (onInput, then onChange on the already-shaped value). The
 * year-first branch padded a partial trailing day — typing 20190714
 * became 2019-07-01 at the seventh keystroke and maxLength={10} then
 * swallowed the real final digit, so the editor opened on the wrong
 * night. While typing, normalization must never complete a trailing
 * partial segment; padding settles at blur.
 *
 * The typing simulation below is faithful to IOSSafeDateInput: each
 * keystroke appends one char (blocked once the value is 10 chars, like
 * maxLength), then the typing-path normalization is applied TWICE —
 * handleInput's pass, then handleChange's pass on the shaped value.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  isValidIsoDateInput,
  normalizeFlexibleDateInput,
  shouldNotifyDateInputBlurValue,
} from "../../src/lib/dateInput.ts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const TYPING = { whileTyping: true };

function typeSequence(chars) {
  let value = "";
  const seen = [];
  for (const ch of chars) {
    if (value.length < 10) {
      value = normalizeFlexibleDateInput(value + ch, TYPING);
      value = normalizeFlexibleDateInput(value, TYPING);
    }
    seen.push(value);
  }
  return { value, seen };
}

test("X01: typing 20190714 char-by-char lands on 2019-07-14, never 2019-07-01", () => {
  const { value, seen } = typeSequence("20190714");
  assert.equal(value, "2019-07-14");
  assert.equal(seen[6], "2019-07-1"); // partial day survives the 7th keystroke
  assert.ok(!seen.includes("2019-07-01"));
});

test("X01: typing 2019-07-14 with dashes lands on 2019-07-14, never 2019-07-01", () => {
  const { value, seen } = typeSequence("2019-07-14");
  assert.equal(value, "2019-07-14");
  assert.ok(!seen.includes("2019-07-01"));
});

test("X01: typing 20231225 char-by-char lands on 2023-12-25, never 2023-12-02", () => {
  const { value, seen } = typeSequence("20231225");
  assert.equal(value, "2023-12-25");
  assert.equal(seen[6], "2023-12-2");
  assert.ok(!seen.includes("2023-12-02"));
});

test("X01: a single-digit day settles padded at blur (2019-7-4 -> 2019-07-04)", () => {
  // Entered in one event (paste / programmatic set): the typing pass
  // shapes it without completing the trailing day...
  const whileTyping = normalizeFlexibleDateInput("2019-7-4", TYPING);
  assert.equal(whileTyping, "2019-07-4");
  // ...and the blur pass applies full normalization.
  assert.equal(normalizeFlexibleDateInput(whileTyping), "2019-07-04");
  assert.equal(normalizeFlexibleDateInput("2019-7-4"), "2019-07-04");
});

test("typing normalization never pads the trailing day, and is idempotent under the double pass", () => {
  assert.equal(normalizeFlexibleDateInput("2019-07-1", TYPING), "2019-07-1");
  assert.equal(
    normalizeFlexibleDateInput(normalizeFlexibleDateInput("2019-07-1", TYPING), TYPING),
    "2019-07-1",
  );
  // Blur (default) semantics are unchanged: a settled lone day IS that day.
  assert.equal(normalizeFlexibleDateInput("2019-07-1"), "2019-07-01");
});

test("typing normalization leaves a partial month uncompleted but pads a closed month", () => {
  assert.equal(normalizeFlexibleDateInput("2019-1", TYPING), "2019-1");
  // Month closed by its separator may pad while the day is still partial.
  assert.equal(normalizeFlexibleDateInput("2019-7-14", TYPING), "2019-07-14");
  assert.equal(normalizeFlexibleDateInput("2019-7-1", TYPING), "2019-07-1");
});

test("month-first values normalize identically in typing and blur modes", () => {
  // The month-first branch's trailing segment is the 4-digit year, which
  // cannot match partially, so it has no trailing-completion bug.
  assert.equal(normalizeFlexibleDateInput("7/4/2019", TYPING), "2019-07-04");
  assert.equal(normalizeFlexibleDateInput("7/4/2019"), "2019-07-04");
  assert.equal(normalizeFlexibleDateInput("07/14/2019", TYPING), "2019-07-14");
  assert.equal(normalizeFlexibleDateInput("07/14/2019"), "2019-07-14");
});

test("complete and invalid values are untouched by typing mode", () => {
  assert.equal(normalizeFlexibleDateInput("2019-07-04", TYPING), "2019-07-04");
  assert.equal(normalizeFlexibleDateInput("2019-04-31", TYPING), "2019-04-31");
  assert.equal(normalizeFlexibleDateInput("2019-13-40"), "2019-13-40");
  assert.equal(normalizeFlexibleDateInput("", TYPING), "");
});

test("a date that only becomes valid at blur settling is notified to consumers", () => {
  // The Codex P2 on PR #347: consumers (DateTimeControls, SimplifiedEditor)
  // reject any onChange value that isValidIsoDateInput refuses, so the
  // as-typed 2019-07-4 never reaches their stored state. Blur settling
  // pads it to a valid date — that settled value must be notified, or the
  // displayed date silently diverges from the stored one.
  const asTyped = normalizeFlexibleDateInput("2019-7-4", TYPING);
  assert.equal(asTyped, "2019-07-4");
  assert.equal(isValidIsoDateInput(asTyped), false); // why consumers rejected it
  const settled = normalizeFlexibleDateInput(asTyped);
  assert.equal(settled, "2019-07-04");
  assert.equal(isValidIsoDateInput(settled), true); // what consumers accept
  assert.equal(shouldNotifyDateInputBlurValue(asTyped, settled), true);
});

test("blur notification fires only for a changed, valid settled value", () => {
  // Unchanged at blur (the ordinary two-digit typing flow): no notice.
  assert.equal(shouldNotifyDateInputBlurValue("2019-07-14", "2019-07-14"), false);
  // Invalid settled value: not notified; the field shows its error instead.
  assert.equal(shouldNotifyDateInputBlurValue("2019-04-3", "2019-04-31"), false);
  // U12 emptied-field restore: the settled (stored) date is re-notified;
  // controlled consumers already hold it, so the notice is a no-op there.
  assert.equal(shouldNotifyDateInputBlurValue("", "2026-10-19"), true);
  // Nothing typed, nothing controlled: nothing to notify.
  assert.equal(shouldNotifyDateInputBlurValue("", ""), false);
});

test("IOSSafeDateInput uses typing normalization on input/change and full normalization on blur", () => {
  const input = fs.readFileSync(
    path.join(ROOT, "src/components/IOSSafeDateInput.tsx"),
    "utf8",
  );
  assert.equal((input.match(/whileTyping: true/g) ?? []).length, 2);
  const blurBlock = input.slice(input.indexOf("const handleBlur"));
  assert.doesNotMatch(blurBlock, /whileTyping/);
  assert.match(blurBlock, /normalizeFlexibleDateInput\(valueBeforeBlur\.trim\(\)\)/);
  // Blur settling propagates the settled date to consumers.
  assert.match(blurBlock, /shouldNotifyDateInputBlurValue\(valueBeforeBlur, settled\)/);
  assert.match(blurBlock, /onChange\?\.\(event\)/);
});
