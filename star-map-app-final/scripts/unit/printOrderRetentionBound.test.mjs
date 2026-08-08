import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(here, "../..");
const printOrdersSource = fs.readFileSync(path.join(appRoot, "src/lib/printOrders.ts"), "utf8");

const DAY_SECONDS = 24 * 60 * 60;
const DAY_MS = DAY_SECONDS * 1000;
const MAX_DAYS = 60;

function remainingRetentionSeconds({ createdAt, now, configuredDays = MAX_DAYS }) {
  const retentionDays = Math.min(
    Number.isFinite(configuredDays) && configuredDays > 0 ? configuredDays : MAX_DAYS,
    MAX_DAYS,
  );
  const maxSeconds = retentionDays * DAY_SECONDS;
  const deadlineMs = createdAt + maxSeconds * 1000;
  const remainingSeconds = Math.ceil((deadlineMs - now) / 1000);
  return Math.max(1, Math.min(maxSeconds, remainingSeconds));
}

test("print-order retention is anchored to creation and capped at 60 days", () => {
  const createdAt = 1_700_000_000_000;

  assert.equal(remainingRetentionSeconds({ createdAt, now: createdAt }), 60 * DAY_SECONDS);
  assert.equal(
    remainingRetentionSeconds({ createdAt, now: createdAt + 50 * DAY_MS }),
    10 * DAY_SECONDS,
  );
  assert.equal(remainingRetentionSeconds({ createdAt, now: createdAt + 61 * DAY_MS }), 1);
  assert.equal(
    remainingRetentionSeconds({ createdAt, now: createdAt, configuredDays: 90 }),
    60 * DAY_SECONDS,
  );
  assert.equal(
    remainingRetentionSeconds({ createdAt, now: createdAt, configuredDays: 30 }),
    30 * DAY_SECONDS,
  );
  assert.equal(
    remainingRetentionSeconds({ createdAt: createdAt + DAY_MS, now: createdAt }),
    60 * DAY_SECONDS,
  );
});

test("production persistence cannot restart or extend the retention window", () => {
  assert.match(
    printOrdersSource,
    /Math\.min\(configuredDays,\s*DEFAULT_PRINT_ORDER_RETENTION_DAYS\)/,
    "configured retention must be capped by the fixed 60-day maximum",
  );
  assert.match(
    printOrdersSource,
    /deadlineMs\s*=\s*safeCreatedAt\s*\+\s*maxRetentionSeconds\s*\*\s*1000/,
    "retention deadline must be derived from original creation time",
  );
  assert.match(
    printOrdersSource,
    /getPrintOrderRetentionSeconds\(record\.createdAt\)/,
    "every persistence write must derive TTL from the record's original createdAt",
  );
  assert.doesNotMatch(
    printOrdersSource,
    /ex:\s*getPrintOrderRetentionSeconds\(\)/,
    "persistence must not install a fresh full TTL on each write",
  );
});
