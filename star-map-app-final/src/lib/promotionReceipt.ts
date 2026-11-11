/** Stage A receipt core. No transport, worker, URL issuance, or provider imports.
 * Delivery remains parked pending U4 and separate activation permission. */
import { createHash } from "node:crypto";
import { resolvePromotionDisclosure, type PromotionCapture } from "./promotionDisclosure";

export type PromotionReceiptJob = {
  jobId: string;
  providerIdempotencyKey: string;
  eventRef: string;
  generation: number;
  serverAt: number;
  emailHash: string;
  capture: PromotionCapture | null;
  classification: "transactional";
  quota: "transactional_provider";
  promotionalBudget: false;
  deliveryHold: "stage_a_no_send";
  status: "pending" | "accepted" | "failed" | "blocked";
  attempts: number;
  nextAttemptAt: number | null;
  terminal: { status: "accepted" | "failed" | "blocked"; at: number } | null;
  incidents: { at: number; reason: string }[];
};
export function assertPromotionCapture(capture: PromotionCapture, emailHash: string) {
  const artifact = resolvePromotionDisclosure(capture.disclosureVersion);
  if (
    !artifact ||
    artifact.hash !== capture.disclosureHash ||
    createHash("sha256").update(artifact.text, "utf8").digest("hex") !== artifact.hash ||
    capture.affirmativeAction !== "checkbox_and_submit" ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(capture.email) ||
    capture.email !== capture.email.trim().toLowerCase() ||
    createHash("sha256").update(capture.email).digest("base64url").slice(0, 40) !== emailHash
  ) {
    throw new Error("incomplete_or_mismatched_rd_k_capture");
  }
  return artifact;
}
export function createPromotionReceiptJob(input: {
  emailHash: string;
  generation: number;
  serverAt: number;
  capture?: PromotionCapture;
}): PromotionReceiptJob {
  if (input.capture) assertPromotionCapture(input.capture, input.emailHash);
  const jobId = `promotion:receipt:${input.emailHash}:${input.generation}`;
  // A reference identifies an event; it never authorizes record access.
  const eventRef = createHash("sha256").update(jobId).digest("hex");
  const blocked = !input.capture;
  return {
    jobId,
    providerIdempotencyKey: jobId,
    eventRef,
    generation: input.generation,
    serverAt: input.serverAt,
    emailHash: input.emailHash,
    capture: input.capture ? { ...input.capture } : null,
    classification: "transactional",
    quota: "transactional_provider",
    promotionalBudget: false,
    deliveryHold: "stage_a_no_send",
    status: blocked ? "blocked" : "pending",
    attempts: 0,
    nextAttemptAt: null,
    terminal: blocked ? { status: "blocked", at: input.serverAt } : null,
    incidents: blocked ? [{ at: input.serverAt, reason: "pre_rd_k_missing_capture_no_reconstruction" }] : [],
  };
}

export type ReceiptControls = {
  recordUrl: string;
  unsubscribeUrl: string;
  withdrawalEmail: string;
  senderIdentity: string;
};
const escapeHtml = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!
  );
export function renderPromotionReceipt(job: PromotionReceiptJob, controls: ReceiptControls) {
  if (!job.capture) throw new Error("receipt_capture_unavailable");
  const artifact = assertPromotionCapture(job.capture, job.emailHash);
  // URLs must be holder controls supplied by the later credential/unsubscribe owners.
  // No generic recovery URL is substituted for the required receipt credential.
  for (const raw of [controls.recordUrl, controls.unsubscribeUrl]) {
    const url = new URL(raw);
    if (url.protocol !== "https:" || url.username || url.password) throw new Error("invalid_receipt_control");
  }
  if (
    !controls.senderIdentity.startsWith("StarMapCo") ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(controls.withdrawalEmail)
  )
    throw new Error("receipt_identity_unconfigured");
  const lines = [
    `Address: ${job.capture.email}`,
    `Consent confirmed: ${new Date(job.serverAt).toISOString()}`,
    `Scope: ${artifact.scope}`,
    `Disclosure (${artifact.version}): ${artifact.text}`,
    `Sender: ${controls.senderIdentity}`,
    `View your subscription record: ${controls.recordUrl}`,
    `Unsubscribe: ${controls.unsubscribeUrl}`,
    `You can also unsubscribe by emailing ${controls.withdrawalEmail}.`,
  ];
  return Object.freeze({
    subject: "Your StarMapCo consent receipt",
    text: lines.join("\n"),
    html: lines
      .map((line) => {
        let html = escapeHtml(line);
        for (const raw of [controls.recordUrl, controls.unsubscribeUrl]) {
          html = html.replace(escapeHtml(raw), `<a href="${escapeHtml(raw)}">${escapeHtml(raw)}</a>`);
        }
        if (line.includes(controls.withdrawalEmail)) {
          html = html.replace(
            escapeHtml(controls.withdrawalEmail),
            `<a href="mailto:${escapeHtml(controls.withdrawalEmail)}">${escapeHtml(controls.withdrawalEmail)}</a>`
          );
        }
        return `<p>${html}</p>`;
      })
      .join(""),
  });
}

/** Pure outcome reducer for fault-injected harness/provider results. Does not send.
 * Definitive failures retry at most three times. Ambiguity blocks for operator
 * resolution rather than risking duplicates. Terminal jobs are immutable. */
export type PromotionReceiptOutcomeInput = {
  now: number;
  attemptNumber: number;
  outcome: "accepted" | "definitive_failure" | "ambiguous";
};
export function recordPromotionReceiptOutcome(
  job: PromotionReceiptJob,
  input: PromotionReceiptOutcomeInput
): PromotionReceiptJob {
  if (
    !["accepted", "definitive_failure", "ambiguous"].includes(input.outcome) ||
    !Number.isFinite(input.now) ||
    input.now < job.serverAt ||
    input.attemptNumber !== job.attempts + 1 ||
    job.terminal ||
    (job.nextAttemptAt !== null && input.now < job.nextAttemptAt)
  )
    return job;
  const attempts = job.attempts + 1;
  const status =
    input.outcome === "accepted"
      ? "accepted"
      : input.outcome === "ambiguous"
        ? "blocked"
        : attempts >= 3
          ? "failed"
          : "pending";
  return {
    ...job,
    attempts,
    status,
    nextAttemptAt: status === "pending" ? input.now + 5 * 60_000 : null,
    terminal: status === "pending" ? null : { status, at: input.now },
    incidents:
      input.outcome === "accepted"
        ? job.incidents
        : [...job.incidents, { at: input.now, reason: `receipt_delivery_${input.outcome}` }],
  };
}
