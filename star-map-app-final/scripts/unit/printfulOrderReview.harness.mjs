/** Keep in sync with src/lib/printfulOrderReview.ts classification helpers. */

export function classifyPrintfulFileStatus(status) {
  const normalized = typeof status === "string" ? status.trim().toLowerCase() : "";
  if (normalized === "ok") return "healthy";
  if (normalized === "failed") return "failed";
  return "pending";
}

export function collectPrintfulFileFailures(fileStatuses) {
  return fileStatuses.filter((row) => classifyPrintfulFileStatus(row.status) === "failed");
}

export function collectPrintfulFilePending(fileStatuses) {
  return fileStatuses.filter((row) => classifyPrintfulFileStatus(row.status) === "pending");
}

export function summarizePrintfulFileReview(review) {
  if (!review) return "unavailable";
  if (review.failedFiles.length > 0) return "failed";
  if (review.fileStatuses.length === 0) return "pending";
  if (review.pendingFiles.length > 0) return "pending";
  return "healthy";
}

export function formatPrintfulFileFailureError(review) {
  if (review.failedFiles.length === 0) return "";
  const summary = review.failedFiles
    .slice(0, 4)
    .map((row) => `${row.item}:${row.type}=${row.status}`)
    .join("|");
  return `printful_files_failed:${summary}`;
}

export function buildReviewFromStatuses(fileStatuses) {
  return {
    orderId: 1001,
    fileStatuses,
    failedFiles: collectPrintfulFileFailures(fileStatuses),
    pendingFiles: collectPrintfulFilePending(fileStatuses),
  };
}
