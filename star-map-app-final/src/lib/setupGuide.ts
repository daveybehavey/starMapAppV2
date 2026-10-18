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
 * `hasPlace` means whatever the surface itself requires for place
 * (MobileCreate: a named place; EditorExperience: a confirmed place).
 */
export function getSetupGuideField(input: {
  hasDate: boolean;
  hasPlace: boolean;
}): SetupGuideField | null {
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
 * (e.g. the editor's date/location card was just expanded).
 */
export function scrollToSetupField(container: HTMLElement | null, field: SetupGuideField): void {
  if (!container) return;
  const target = container.querySelector<HTMLElement>(SETUP_FIELD_SELECTORS[field]);
  if (!target) {
    container.scrollIntoView({ behavior: "smooth", block: "start" });
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
