/**
 * Pure Printful file-status classification helpers for unit tests.
 */

export function normalizePrintfulFileStatus(status) {
  return status.trim().toLowerCase();
}

export function classifyPrintfulFileStatus(status) {
  const normalized = normalizePrintfulFileStatus(status);
  if (!normalized) return "empty";
  if (normalized === "ok") return "ok";
  if (normalized === "waiting") return "waiting";
  if (normalized === "failed") return "failed";
  return "unknown";
}

export function collectPrintfulFileFailures(fileStatuses) {
  return fileStatuses.filter((row) => classifyPrintfulFileStatus(row.status) === "failed");
}

export function collectPrintfulPendingFiles(fileStatuses) {
  return fileStatuses.filter((row) => {
    const kind = classifyPrintfulFileStatus(row.status);
    return kind === "waiting" || kind === "unknown";
  });
}

export function resolvePrintfulFileReviewOutcome(review) {
  if (review.failedFiles.length > 0) return "failed";
  if (review.pendingFiles.length > 0) return "pending";
  return "ok";
}

export async function resolvePrintfulPostSubmitFileOutcome(input) {
  const maxAttempts = Math.max(1, input.maxAttempts ?? 3);
  const delays = input.retryDelaysMs ?? [750, 1500];
  const sleep = input.sleep ?? (async () => undefined);
  const preservePendingOnUnavailable = Boolean(input.preservePendingOnUnavailable);

  let review = null;
  let outcome = preservePendingOnUnavailable ? "pending" : "ok";
  let attempts = 0;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    if (attempt > 1) {
      const delay = delays[attempt - 2] ?? delays[delays.length - 1] ?? 0;
      if (delay > 0) await sleep(delay);
    }
    review = await input.reviewPrintfulOrderFiles(input.printfulOrderId);
    attempts = attempt;
    if (!review) {
      if (outcome === "pending" || preservePendingOnUnavailable) {
        outcome = "pending";
        continue;
      }
      return { outcome: "ok", review: null, attempts };
    }
    outcome = resolvePrintfulFileReviewOutcome(review);
    if (outcome !== "pending") {
      return { outcome, review, attempts };
    }
  }
  return { outcome: "pending", review, attempts };
}
