export type PrintfulFileStatusRow = {
  item: string;
  type: string;
  status: string;
};

/** Provider-aligned file status classes for post-submit review. */
export type PrintfulFileStatusClass = "ok" | "waiting" | "failed" | "unknown" | "empty";

/** Aggregated review outcome used by post-submit / ops paths. */
export type PrintfulFileReviewOutcome = "ok" | "failed" | "pending";

export type PrintfulOrderFileReview = {
  orderId: string | number;
  orderStatus?: string;
  dashboardUrl?: string;
  fileStatuses: PrintfulFileStatusRow[];
  /** Confirmed provider file-processing failures only (`failed`). */
  failedFiles: PrintfulFileStatusRow[];
  /** Transient (`waiting`) or unrecognized nonempty statuses — not confirmed failures. */
  pendingFiles: PrintfulFileStatusRow[];
};

function getPrintfulApiConfig() {
  const token = process.env.PRINTFUL_API_TOKEN?.trim();
  const baseUrl = process.env.PRINTFUL_API_BASE_URL?.trim() || "https://api.printful.com";
  return token ? { token, baseUrl } : null;
}

export function normalizePrintfulFileStatus(status: string): string {
  return status.trim().toLowerCase();
}

/**
 * Classify a Printful file status string.
 * - `ok` = accepted/healthy
 * - `waiting` = asynchronous processing (not failure)
 * - `failed` = confirmed file-processing failure
 * - `unknown` = nonempty unrecognized status (fail-safe: not confirmed failure)
 * - `empty` = blank/whitespace (ignored)
 */
export function classifyPrintfulFileStatus(status: string): PrintfulFileStatusClass {
  const normalized = normalizePrintfulFileStatus(status);
  if (!normalized) return "empty";
  if (normalized === "ok") return "ok";
  if (normalized === "waiting") return "waiting";
  if (normalized === "failed") return "failed";
  return "unknown";
}

/** Confirmed failures only — never includes `waiting` or unknown statuses. */
export function collectPrintfulFileFailures(fileStatuses: PrintfulFileStatusRow[]): PrintfulFileStatusRow[] {
  return fileStatuses.filter((row) => classifyPrintfulFileStatus(row.status) === "failed");
}

/**
 * Unresolved statuses that must not trigger confirmed-failure alerts
 * and must not be treated as final approval.
 */
export function collectPrintfulPendingFiles(fileStatuses: PrintfulFileStatusRow[]): PrintfulFileStatusRow[] {
  return fileStatuses.filter((row) => {
    const kind = classifyPrintfulFileStatus(row.status);
    return kind === "waiting" || kind === "unknown";
  });
}

export function resolvePrintfulFileReviewOutcome(
  review: Pick<PrintfulOrderFileReview, "failedFiles" | "pendingFiles">,
): PrintfulFileReviewOutcome {
  if (review.failedFiles.length > 0) return "failed";
  if (review.pendingFiles.length > 0) return "pending";
  return "ok";
}

export async function reviewPrintfulOrderFiles(orderId: string | number): Promise<PrintfulOrderFileReview | null> {
  const config = getPrintfulApiConfig();
  if (!config) return null;

  try {
    const response = await fetch(`${config.baseUrl}/orders/${encodeURIComponent(String(orderId))}`, {
      headers: { Authorization: `Bearer ${config.token}` },
    });
    const raw = await response.text();
    let parsed: unknown = null;
    try {
      parsed = raw ? JSON.parse(raw) : null;
    } catch {
      parsed = null;
    }
    if (!response.ok) return null;

    const result =
      parsed && typeof parsed === "object" && "result" in parsed
        ? (parsed as { result?: Record<string, unknown> }).result
        : null;
    if (!result) return null;

    const fileStatuses: PrintfulFileStatusRow[] = [];
    const items = Array.isArray(result.items) ? result.items : [];
    for (const item of items) {
      if (!item || typeof item !== "object") continue;
      const record = item as { name?: unknown; files?: unknown };
      const itemName = typeof record.name === "string" ? record.name : "item";
      const files = Array.isArray(record.files) ? record.files : [];
      for (const file of files) {
        if (!file || typeof file !== "object") continue;
        const fileRecord = file as { type?: unknown; status?: unknown };
        fileStatuses.push({
          item: itemName,
          type: typeof fileRecord.type === "string" ? fileRecord.type : "default",
          status: typeof fileRecord.status === "string" ? fileRecord.status : "unknown",
        });
      }
    }

    return {
      orderId,
      orderStatus: typeof result.status === "string" ? result.status : undefined,
      dashboardUrl: typeof result.dashboard_url === "string" ? result.dashboard_url : undefined,
      fileStatuses,
      failedFiles: collectPrintfulFileFailures(fileStatuses),
      pendingFiles: collectPrintfulPendingFiles(fileStatuses),
    };
  } catch {
    return null;
  }
}

export function formatPrintfulFileFailureError(review: PrintfulOrderFileReview): string {
  if (review.failedFiles.length === 0) return "";
  const summary = review.failedFiles
    .slice(0, 4)
    .map((row) => `${row.item}:${row.type}=${row.status}`)
    .join("|");
  return `printful_files_failed:${summary}`;
}
