/**
 * Honest autosave status for the editor surfaces (S4 sweep A1).
 *
 * writeEditorDraft (editorDraft.ts) already reports every write
 * outcome as a typed value — `saved`, `invalid`,
 * `storage-unavailable` — but the editor's autosave effect honoured
 * only `saved` and discarded the rest, while the UI kept showing
 * "Draft autosaves on this device" or a stale saved timestamp. A
 * failed write (storage denied, quota exhausted) therefore left
 * newer edits silently unprotected: the timestamp was evidence of
 * an earlier write, not of the latest state.
 *
 * This module is the single transition both editor surfaces route
 * every outcome through: a non-saved outcome moves the status to
 * `failed` (remembering the last successful save's label, if any),
 * and only a later successful write moves it back to `saved`.
 * Editing is never blocked by the failed state — it is a warning,
 * not a gate.
 *
 * Pure and dependency-free so the plain-Node unit runner can
 * import it directly (same pattern as editorHydrationGuard.ts).
 */

export type DraftSaveStatus =
  | { state: "idle" }
  | { state: "saved"; savedAtLabel: string }
  | { state: "failed"; lastSavedAtLabel: string | null };

export const INITIAL_DRAFT_SAVE_STATUS: DraftSaveStatus = { state: "idle" };

/**
 * The write outcome as the status transition consumes it. The
 * `saved` arm carries the display label the caller formatted from
 * the write's savedAt timestamp; the failure arms need nothing
 * else — `invalid` and `storage-unavailable` are indistinguishable
 * to the user, and both mean "this edit is not on this device".
 */
export type DraftSaveWriteOutcome =
  | { status: "saved"; savedAtLabel: string }
  | { status: "invalid" | "storage-unavailable" };

export function draftSaveStatusAfterWrite(
  prev: DraftSaveStatus,
  outcome: DraftSaveWriteOutcome,
): DraftSaveStatus {
  if (outcome.status === "saved") {
    return { state: "saved", savedAtLabel: outcome.savedAtLabel };
  }
  const lastSavedAtLabel =
    prev.state === "saved"
      ? prev.savedAtLabel
      : prev.state === "failed"
        ? prev.lastSavedAtLabel
        : null;
  return { state: "failed", lastSavedAtLabel };
}

/**
 * The failure line both surfaces render while the status is
 * `failed`. It never claims the latest edits were saved; when an
 * earlier save exists it says exactly when that save happened.
 */
export function draftSaveFailureText(
  status: Extract<DraftSaveStatus, { state: "failed" }>,
): string {
  return status.lastSavedAtLabel
    ? `Couldn't save your latest edits — last saved at ${status.lastSavedAtLabel}.`
    : "Couldn't save your edits on this device.";
}
