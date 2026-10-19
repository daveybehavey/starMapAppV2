/**
 * "Guide to the first missing setup field" logic for the editors'
 * preview-unlock buttons (UX audit C2).
 *
 * While date/place are incomplete, the unlock button no longer renders
 * as a dead disabled control: tapping it scrolls to and focuses the
 * first missing field. Field priority is form order — date before
 * place — regardless of which one the visitor skipped.
 */

export type SetupGuideField = "date" | "place";

/**
 * The first incomplete setup field, or null when the setup is complete.
 * Both surfaces pass the confirmed-place predicate for `hasPlace`
 * (hasConfirmedEditorLocation — the same predicate that gates the
 * reveal), so the guide never disagrees with the unlock it sits on:
 * a name-only place guides to "place" instead of reading as complete.
 */
export function getSetupGuideField(input: { hasDate: boolean; hasPlace: boolean }): SetupGuideField | null {
  if (!input.hasDate) return "date";
  if (!input.hasPlace) return "place";
  return null;
}

const SETUP_FIELD_SELECTORS: Record<SetupGuideField, string> = {
  // DateTimeControls renders its date input with this stable id.
  date: "#star-date",
  // LocationSearch renders its search box as a combobox input.
  place: 'input[role="combobox"]',
};

/**
 * Scroll the target field into view and focus it. Falls back to
 * scrolling the section container when the field is not mounted yet
 * (e.g. the editor's date/location card was just expanded), and
 * re-queries once after a short delay in case the field mounts a beat
 * later than the expansion that revealed it.
 */
export function scrollToSetupField(container: HTMLElement | null, field: SetupGuideField): void {
  if (!container) return;
  const target = container.querySelector<HTMLElement>(SETUP_FIELD_SELECTORS[field]);
  if (!target) {
    container.scrollIntoView({ behavior: "smooth", block: "start" });
    // The caller may have expanded a collapsed card in the same tap
    // (EditorExperience's Date & Location card): React mounts the
    // inputs a beat after the state change, so the query above ran
    // before they existed. Retry the query once after a short delay
    // and scroll + focus if the field has appeared.
    window.setTimeout(() => {
      const lateTarget = container.querySelector<HTMLElement>(SETUP_FIELD_SELECTORS[field]);
      if (!lateTarget) return;
      lateTarget.scrollIntoView({ behavior: "smooth", block: "center" });
      lateTarget.focus({ preventScroll: true });
    }, 350);
    return;
  }
  target.scrollIntoView({ behavior: "smooth", block: "center" });
  const focusTarget = () => target.focus({ preventScroll: true });
  requestAnimationFrame(focusTarget);
  // One retry for surfaces whose fields mount a beat after an expand.
  window.setTimeout(() => {
    if (document.activeElement !== target) focusTarget();
  }, 350);
}
