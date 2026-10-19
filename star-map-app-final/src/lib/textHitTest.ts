/**
 * Editor preview text-box hit testing.
 *
 * The overlay records one rect per text box in CSS pixels (see drawText in
 * renderSky.ts): the glyph box itself — centre (position × canvas) by the
 * measured text width and fontSize × 1.2 height. Hit testing adds a generous
 * touch target around each rect.
 *
 * The previous implementation (fleet observation A, coordination PR #17)
 * expanded every rect by a fixed 18 CSS px and returned the first match in
 * reverse insertion order — so wherever padded rects overlapped, the LAST
 * box in the array always won, no matter which box's glyphs were under the
 * point. On the Diamond default rows (title 0.42 / subtitle 0.485, only
 * 0.065 apart) at a mobile preview size, the subtitle's padded rect reaches
 * up over the title's own centre — pressing the visible title dragged the
 * subtitle. The padding is proportionally fixed while text rects shrink with
 * the canvas, so this also affects other shapes' close rows on small
 * canvases (e.g. rectangle 0.12/0.18), not just Diamond.
 *
 * Selection rule:
 *  1. A press inside a box's EXACT (unpadded) glyph rect always selects
 *     that box — exact glyph hits beat padded ones.
 *  2. Within the same tier, the nearest rect centre wins. An exact
 *     distance tie (e.g. two boxes dragged to identical centres) keeps
 *     the first-inserted box — deterministic, pinned by test.
 *  3. If only padded rects contain the point, the nearest-centre box
 *     wins — the generous touch target is preserved.
 */

export type TextBoxBounds = {
  x: number;
  y: number;
  width: number;
  height: number;
};

/** Touch-target expansion around each glyph rect, in CSS px. Unchanged. */
export const TEXT_HIT_PADDING_PX = 18;

export type TextHit = {
  id: string;
  centerX: number;
  centerY: number;
};

type Candidate = TextHit & { distSq: number; exact: boolean };

export function hitTestText(
  bounds: Map<string, TextBoxBounds>,
  x: number,
  y: number,
): TextHit | null {
  let best: Candidate | null = null;
  for (const [id, rect] of bounds.entries()) {
    const centerX = rect.x + rect.width / 2;
    const centerY = rect.y + rect.height / 2;
    const exact =
      x >= rect.x &&
      x <= rect.x + rect.width &&
      y >= rect.y &&
      y <= rect.y + rect.height;
    const padded =
      x >= rect.x - TEXT_HIT_PADDING_PX &&
      x <= rect.x + rect.width + TEXT_HIT_PADDING_PX &&
      y >= rect.y - TEXT_HIT_PADDING_PX &&
      y <= rect.y + rect.height + TEXT_HIT_PADDING_PX;
    if (!exact && !padded) continue;
    const distSq = (x - centerX) * (x - centerX) + (y - centerY) * (y - centerY);
    // Exact glyph hits outrank padded ones; within a tier, the nearest
    // centre wins.
    if (
      best === null ||
      (exact && !best.exact) ||
      (exact === best.exact && distSq < best.distSq)
    ) {
      best = { id, centerX, centerY, distSq, exact };
    }
  }
  return best === null
    ? null
    : { id: best.id, centerX: best.centerX, centerY: best.centerY };
}
