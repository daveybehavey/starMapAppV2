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
 * changed since the fetch started (the store's edit-generation
 * counter). ANY intervening change defeats hydration — the safe
 * direction, since the user's in-flight work is never worth less
 * than the URL recipe, and the autosave keeps their version as
 * the draft.
 *
 * The counter's timing is part of the guarantee (S96-2 F7): it
 * advances synchronously inside the store's mutation path (see
 * src/lib/store.ts) — including the recipe-intent setters
 * (renderMode, intensity, intensityDisplay), which count from the
 * moment the user acts, not when their derived renderOptions
 * write lands (audit B-05) — and never in a passive effect. The
 * component reads it via useStore.getState() at fetch start and
 * at response time, so an edit made at any moment after the fetch
 * starts — even one whose React commit/effects have not run yet —
 * is already counted when the response is checked.
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
  /**
   * The edit generation captured when the draft restore completed
   * (audit B-01). The restore, the URL prefill and the visual
   * initialization all run inside the store's system-write scope,
   * so this value is the generation of the initialized state
   * itself — no automatic write can move it. Optional: callers
   * that do not track it keep the legacy table below.
   */
  editGenerationAtRestore?: number | null;
  /** The edit generation at the moment this check runs. */
  editGenerationNow?: number;
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
 * Audit B-01 (2026-11-03) found the remaining hole in that
 * sequencing: it protected only edits made AFTER the fetch
 * started. A user edit that landed after the restore but before
 * the ~150 ms initialization (fast hands, slow device) was swept
 * into the fetch-start baseline and then overwritten by the
 * response. The fix anchors a second baseline at restore
 * completion: initialization writes run inside the store's
 * system-write scope and never advance the generation, so ANY
 * advance between restore and this check is user work, and the
 * fetch must not start at all. (Refusing to start also leaves the
 * handled-once ref unset; the generation can never return to the
 * baseline, so hydration stays refused for the mount — the same
 * safe direction as the apply-guard.)
 *
 * Pure and dependency-free, like the guard above.
 */
export function shouldStartMapHydration(
  input: MapHydrationStartInput,
): boolean {
  if (!input.restored) return false;
  if (!input.visualOptionsInitialized) return false;
  if (input.alreadyHandled) return false;
  if (!input.mapId) return false;
  if (
    input.editGenerationAtRestore != null &&
    input.editGenerationNow != null &&
    input.editGenerationNow !== input.editGenerationAtRestore
  ) {
    return false;
  }
  return true;
}

export type LinkedMapLoadResult =
  | { status: "applied"; data: unknown }
  | {
      status: "failed";
      reason: "http-error" | "invalid-recipe" | "fetch-failed";
    }
  | { status: "defeated" };

/**
 * One map-link hydration attempt, classified (S4 sweep A2).
 *
 * The hydration effect used to run this sequence inline and
 * return silently from every failure branch — non-OK HTTP, an
 * unparseable body, a payload that is not a recipe, a rejected
 * fetch — so the editor continued with the local draft and the
 * user could not tell the linked design had never loaded, and
 * had no way to retry. The attempt now reports its outcome:
 *
 * - `applied`: the recipe arrived and the caller's apply fence
 *   (shouldApplyHydratedMapRecipe, via `shouldApply`) allowed it.
 * - `failed`: the load itself failed. The caller surfaces an
 *   explicit load-failed state with a retry action — a failed
 *   load is never silent again.
 * - `defeated`: the recipe arrived but the fence refused it (the
 *   user edited during the flight, the effect was cleaned up, or
 *   the URL moved on). That is the fence working as designed —
 *   NOT a load failure, and the caller must not surface it as
 *   one.
 *
 * The fetch and the recipe-shape check are injected so the
 * classification is testable without a network or a component.
 */
export async function loadLinkedMapRecipe(input: {
  mapId: string;
  fetchRecipe: (mapId: string) => Promise<{
    ok: boolean;
    json: () => Promise<unknown>;
  }>;
  isHydratable: (data: unknown) => boolean;
  shouldApply: () => boolean;
}): Promise<LinkedMapLoadResult> {
  let data: unknown;
  try {
    const res = await input.fetchRecipe(input.mapId);
    if (!res.ok) return { status: "failed", reason: "http-error" };
    data = await res.json();
  } catch {
    return { status: "failed", reason: "fetch-failed" };
  }
  if (!input.isHydratable(data)) {
    return { status: "failed", reason: "invalid-recipe" };
  }
  if (!input.shouldApply()) return { status: "defeated" };
  return { status: "applied", data };
}
