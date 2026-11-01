/**
 * Whether a delayed `/api/maps` hydration response may still be
 * applied to the editor (S93-2 class 5).
 *
 * S93-2 proved the race from source: EditorExperience's hydration
 * effect marks the URL map handled and starts the fetch, but the
 * response is applied whenever it arrives — there was no cleanup,
 * no cancellation and no identity check — so a slow response
 * silently overwrote edits the user made while it was in flight
 * (a fast typist loses work non-deterministically and believes
 * they made the change).
 *
 * The rule is deliberately conservative: apply only when the
 * effect was never cleaned up, the response is still for the map
 * the URL currently names, and the editor's recipe state has not
 * changed since the fetch started (an edit-generation counter the
 * component bumps on every recipe-field change). ANY intervening
 * change defeats hydration — the safe direction, since the user's
 * in-flight work is never worth less than the URL recipe, and the
 * autosave keeps their version as the draft.
 *
 * Pure and dependency-free so the plain-Node unit runner can
 * import it directly.
 */
export type HydrationGuardInput = {
  /** The effect's cleanup ran (unmount or dependency change). */
  cancelled: boolean;
  /** The map id the fetch was started for. */
  requestedMapId: string | null;
  /** The map id the URL names when the response arrives. */
  currentMapId: string | null;
  /** Edit generation captured when the fetch started. */
  editGenerationAtFetchStart: number;
  /** Edit generation when the response arrives. */
  editGenerationNow: number;
};

export function shouldApplyHydratedMapRecipe(
  input: HydrationGuardInput,
): boolean {
  if (input.cancelled) return false;
  if (!input.requestedMapId) return false;
  if (input.requestedMapId !== input.currentMapId) return false;
  return input.editGenerationAtFetchStart === input.editGenerationNow;
}

export type MapHydrationStartInput = {
  /** The local draft restore has completed. */
  restored: boolean;
  /**
   * The editor's automatic visual-options initialization has
   * landed (the first applyVisualOptions application).
   */
  visualOptionsInitialized: boolean;
  /** A previous effect run already started (or finished) hydration. */
  alreadyHandled: boolean;
  /** The map id the URL names, if any. */
  mapId: string | null;
};

/**
 * Whether the `/api/maps` hydration fetch may START (fix round 1
 * on the class-5 guard, Codex P1).
 *
 * The generation rule above cannot by itself tell a user edit
 * apart from the editor's own automatic initialization:
 * useEditorLogic applies visual options on a ~150 ms timer after
 * mount, which writes renderOptions — a recipe field — so it both
 * bumps the edit generation and re-runs the hydration effect
 * (whose cleanup cancels the in-flight fetch). When /api/maps was
 * slower than that timer, opening a saved map silently cancelled
 * its own hydration even with no user edit, and the handled-once
 * ref prevented any retry: the user kept their previous draft
 * instead of the requested map.
 *
 * The separation is sequencing, not origin-sniffing: hydration may
 * only start once the automatic initialization has landed, so the
 * generation baseline captured at fetch start already includes
 * the initialization write. Any change after that — user edits,
 * including a render-mode/intensity change flowing through the
 * same applyVisualOptions path — still bumps the generation and
 * defeats application via shouldApplyHydratedMapRecipe.
 *
 * Pure and dependency-free, like the guard above.
 */
export function shouldStartMapHydration(
  input: MapHydrationStartInput,
): boolean {
  if (!input.restored) return false;
  if (!input.visualOptionsInitialized) return false;
  if (input.alreadyHandled) return false;
  return Boolean(input.mapId);
}
