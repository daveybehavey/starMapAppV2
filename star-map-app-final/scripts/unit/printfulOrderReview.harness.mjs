/** Keep in sync with src/lib/printfulOrderReview.ts */

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

export function formatPrintfulFileFailureError(review) {
  if (review.failedFiles.length === 0) return "";
  const summary = review.failedFiles
    .slice(0, 4)
    .map((row) => `${row.item}:${row.type}=${row.status}`)
    .join("|");
  return `printful_files_failed:${summary}`;
}

export function buildPrintfulOrderFileReview(orderId, fileStatuses) {
  return {
    orderId,
    fileStatuses,
    failedFiles: collectPrintfulFileFailures(fileStatuses),
    pendingFiles: collectPrintfulPendingFiles(fileStatuses),
  };
}
