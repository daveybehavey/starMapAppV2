import type { CheckoutPlan } from "@/lib/pricing";

export type BlobDownloadTriggerResult = { ok: true } | { ok: false; error: string };

export function createHdConsumeToken(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

/** Trigger a browser file download without consuming entitlement credits. */
export function triggerBlobDownload(blob: Blob, filename: string): BlobDownloadTriggerResult {
  if (typeof document === "undefined") {
    return { ok: false, error: "Browser unavailable" };
  }
  try {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.download = filename;
    link.href = url;
    link.rel = "noopener";
    link.style.display = "none";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Download trigger failed",
    };
  }
}

export function formatHdExportFailedMessage(creditPreserved = true) {
  if (creditPreserved) {
    return "We couldn't complete the HD export. Your credit was not used — please try again.";
  }
  return "We couldn't complete the HD export. If your file isn't in Downloads, use Restore my credit below or contact support.";
}

export function formatHdExportConsumeFailedMessage() {
  return "Your download should have started, but we couldn't update your credit balance. Check Downloads first — your credit should still be available if the file didn't save.";
}

export type HdConsumeResult = {
  ok: true;
  creditsRemaining?: number | null;
  plan?: CheckoutPlan | null;
  consumeToken: string;
};

export async function postHdCreditConsume(consumeToken: string): Promise<HdConsumeResult | false> {
  try {
    const res = await fetch("/api/entitlements/consume", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: consumeToken }),
    });
    if (!res.ok) return false;
    const data = (await res.json()) as {
      ok?: boolean;
      creditsRemaining?: number | null;
      plan?: CheckoutPlan | null;
    };
    if (data.ok === false) return false;
    return {
      ok: true,
      creditsRemaining: data.creditsRemaining ?? null,
      plan: data.plan ?? null,
      consumeToken,
    };
  } catch {
    return false;
  }
}

export async function postHdCreditCompensate(token: string): Promise<{
  ok: boolean;
  creditsRemaining?: number | null;
  plan?: CheckoutPlan | null;
  error?: string;
}> {
  try {
    const res = await fetch("/api/entitlements/compensate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    });
    const data = (await res.json().catch(() => null)) as {
      ok?: boolean;
      creditsRemaining?: number | null;
      plan?: CheckoutPlan | null;
      error?: string;
    };
    if (!res.ok || !data?.ok) {
      return { ok: false, error: data?.error ?? "compensate_failed" };
    }
    return {
      ok: true,
      creditsRemaining: data.creditsRemaining ?? null,
      plan: data.plan ?? null,
    };
  } catch {
    return { ok: false, error: "compensate_failed" };
  }
}

export async function verifyStripeSessionForDownload(sessionId: string): Promise<{
  ok: boolean;
  creditsRemaining?: number | null;
  plan?: CheckoutPlan | null;
}> {
  try {
    const res = await fetch(`/api/stripe/verify?session_id=${encodeURIComponent(sessionId)}`, {
      cache: "no-store",
    });
    if (!res.ok) return { ok: false };
    const data = (await res.json()) as {
      paid?: boolean;
      creditsRemaining?: number | null;
      plan?: CheckoutPlan | null;
    };
    const ok = Boolean(data.paid) || (typeof data.creditsRemaining === "number" && data.creditsRemaining > 0);
    if (!ok) return { ok: false };
    return {
      ok: true,
      creditsRemaining: typeof data.creditsRemaining === "number" ? data.creditsRemaining : null,
      plan:
        data.plan === "single" || data.plan === "pack3" || data.plan === "subscription" ? data.plan : null,
    };
  } catch {
    return { ok: false };
  }
}
