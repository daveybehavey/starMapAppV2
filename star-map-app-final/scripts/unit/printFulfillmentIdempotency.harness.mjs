/**
 * Keep behavior helpers aligned with:
 * - src/lib/printOrders.ts (persist outcomes / assertPrintOrderRetained)
 * - src/lib/printful.ts (OR-1 reconcile, never mint second external id)
 */
import crypto from "node:crypto";

export function classifyPrintOrderUnretainableReason(createdAt) {
  if (typeof createdAt !== "number" || !Number.isFinite(createdAt)) {
    return "malformed_created_at";
  }
  return "expired_or_below_min_ttl";
}

export function buildPersistPrintOrderResult(plan, createdAt) {
  if (plan.action === "delete") {
    return {
      outcome: "deleted_unretainable",
      reason: classifyPrintOrderUnretainableReason(createdAt),
    };
  }
  return { outcome: "persisted", ttlSeconds: plan.ttlSeconds };
}

export class PrintOrderUnretainableError extends Error {
  constructor(reason) {
    super(`print_order_unretainable:${reason}`);
    this.name = "PrintOrderUnretainableError";
    this.code = "print_order_unretainable";
    this.reason = reason;
  }
}

export function assertPrintOrderRetained(result) {
  if (!result || result.outcome === "deleted_unretainable") {
    throw new PrintOrderUnretainableError(result?.reason || "expired_or_below_min_ttl");
  }
  return result;
}

export function normalizeExternalId(raw) {
  const trimmed = String(raw || "").trim();
  if (/^[A-Za-z0-9_-]{1,32}$/.test(trimmed)) return trimmed;
  const digest = crypto.createHash("sha256").update(trimmed).digest("hex").slice(0, 24);
  return `smc_${digest}`;
}

/**
 * Mirrors submitPrintfulOrder's non-editable branch: reconcile via GET /orders/@id,
 * never create a timestamp-suffixed second order.
 */
export async function submitPrintfulOrderWithFetch(fetchImpl, input) {
  const externalId = normalizeExternalId(input.externalId);
  const post = await fetchImpl(`https://api.printful.com/orders?update_existing=1&confirm=1`, {
    method: "POST",
    body: JSON.stringify({ external_id: externalId }),
  });
  const postRaw = await post.text();
  let postParsed = null;
  try {
    postParsed = postRaw ? JSON.parse(postRaw) : null;
  } catch {
    postParsed = null;
  }

  if (post.ok) {
    const id = postParsed?.result?.id;
    return { ok: true, status: post.status, orderId: id };
  }

  const apiCode = postParsed?.error?.api_error_code;
  const msg = String(postParsed?.error?.message || "").toLowerCase();
  const nonEditable = apiCode === "OR-1" || msg.includes("no longer editable");
  if (post.status === 400 && nonEditable) {
    const lookup = await fetchImpl(`https://api.printful.com/orders/@${encodeURIComponent(externalId)}`, {
      method: "GET",
    });
    if (lookup.ok) {
      const lookupRaw = await lookup.text();
      let lookupParsed = null;
      try {
        lookupParsed = lookupRaw ? JSON.parse(lookupRaw) : null;
      } catch {
        lookupParsed = null;
      }
      const existingId = lookupParsed?.result?.id;
      if (typeof existingId === "string" || typeof existingId === "number") {
        return { ok: true, status: 200, orderId: existingId, reconciled: true };
      }
    }
    return { ok: false, status: 409, error: "printful_order_exists_not_reconciled" };
  }

  return {
    ok: false,
    status: post.status,
    error: postParsed?.error?.message || "printful_order_failed",
  };
}

/**
 * Simulated webhook retry loop after provider success + durable sent-write failure.
 * Counts provider POST creates (update_existing=0) — must stay 0 after first accept.
 */
export async function simulateProviderSuccessThenDurableFailRetry(fetchImpl, externalId) {
  const calls = { post: 0, get: 0, createNew: 0 };
  const wrapped = async (url, init = {}) => {
    const method = (init.method || "GET").toUpperCase();
    if (method === "POST") {
      calls.post += 1;
      if (String(url).includes("update_existing=0")) calls.createNew += 1;
    }
    if (method === "GET") calls.get += 1;
    return fetchImpl(url, init);
  };

  const first = await submitPrintfulOrderWithFetch(wrapped, { externalId });
  // Durable persist fails after first provider accept — Stripe retries.
  const second = await submitPrintfulOrderWithFetch(wrapped, { externalId });
  return { first, second, calls };
}

/**
 * Mirrors submitPrintfulV2CatalogOrder: on conflict/timeout reconcile via GET
 * /v2/orders/@id — never mint a second external id.
 */
export async function submitPrintfulV2OrderWithFetch(fetchImpl, input) {
  const externalId = normalizeExternalId(input.externalId);
  const post = await fetchImpl(`https://api.printful.com/v2/orders`, {
    method: "POST",
    body: JSON.stringify({ external_id: externalId }),
  });
  const postRaw = await post.text();
  let postParsed = null;
  try {
    postParsed = postRaw ? JSON.parse(postRaw) : null;
  } catch {
    postParsed = null;
  }

  if (post.ok) {
    const id = postParsed?.data?.id;
    return { ok: true, status: post.status, orderId: id };
  }

  const msg = String(postParsed?.error?.message || postParsed?.error?.reason || "").toLowerCase();
  const conflict =
    post.status === 409 ||
    msg.includes("already exists") ||
    msg.includes("duplicate") ||
    msg.includes("conflict") ||
    msg.includes("no longer editable") ||
    ((msg.includes("external_id") || msg.includes("external id")) &&
      (msg.includes("exist") || msg.includes("unique") || msg.includes("taken") || msg.includes("duplicate")));

  if (conflict) {
    const lookup = await fetchImpl(
      `https://api.printful.com/v2/orders/@${encodeURIComponent(externalId)}`,
      { method: "GET" },
    );
    if (lookup.ok) {
      const lookupRaw = await lookup.text();
      let lookupParsed = null;
      try {
        lookupParsed = lookupRaw ? JSON.parse(lookupRaw) : null;
      } catch {
        lookupParsed = null;
      }
      const existingId = lookupParsed?.data?.id;
      if (typeof existingId === "string" || typeof existingId === "number") {
        return { ok: true, status: 200, orderId: existingId, reconciled: true };
      }
    }
    return { ok: false, status: 409, error: "printful_v2_order_exists_not_reconciled" };
  }

  return {
    ok: false,
    status: post.status,
    error: postParsed?.error?.message || "printful_v2_order_failed",
  };
}

export async function simulateV2ProviderSuccessThenDurableFailRetry(fetchImpl, externalId) {
  const calls = { post: 0, get: 0 };
  let accepted = false;
  const wrapped = async (url, init = {}) => {
    const method = (init.method || "GET").toUpperCase();
    if (method === "POST") {
      calls.post += 1;
      if (!accepted) {
        accepted = true;
        return fetchImpl(url, init);
      }
      // Retry after durable loss: provider reports existing external_id.
      return new Response(
        JSON.stringify({ error: { message: "Order with this external_id already exists" } }),
        { status: 409, headers: { "content-type": "application/json" } },
      );
    }
    if (method === "GET") {
      calls.get += 1;
      return fetchImpl(url, init);
    }
    return fetchImpl(url, init);
  };

  const first = await submitPrintfulV2OrderWithFetch(wrapped, { externalId });
  const second = await submitPrintfulV2OrderWithFetch(wrapped, { externalId });
  return { first, second, calls };
}

/**
 * Mirrors webhook finalize semantics for unretainable after provider accept:
 * write event dedupe before treating the delivery as successful.
 */
export async function finalizeUnretainableWebhookEvent({
  kvSet,
  eventDedupeKey,
  reason = "print_order_unretainable",
}) {
  try {
    await kvSet(eventDedupeKey, { received: true, reason }, { ex: 7 * 24 * 60 * 60 });
    return { finalized: true, retryable: false };
  } catch {
    return { finalized: false, retryable: true };
  }
}
