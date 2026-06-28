export type PrintfulFileStatusRow = {
  item: string;
  type: string;
  status: string;
};

export type PrintfulOrderFileReview = {
  orderId: string | number;
  orderStatus?: string;
  dashboardUrl?: string;
  fileStatuses: PrintfulFileStatusRow[];
  failedFiles: PrintfulFileStatusRow[];
};

function getPrintfulApiConfig() {
  const token = process.env.PRINTFUL_API_TOKEN?.trim();
  const baseUrl = process.env.PRINTFUL_API_BASE_URL?.trim() || "https://api.printful.com";
  return token ? { token, baseUrl } : null;
}

export function collectPrintfulFileFailures(fileStatuses: PrintfulFileStatusRow[]): PrintfulFileStatusRow[] {
  return fileStatuses.filter((row) => row.status && row.status.trim().toLowerCase() !== "ok");
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
