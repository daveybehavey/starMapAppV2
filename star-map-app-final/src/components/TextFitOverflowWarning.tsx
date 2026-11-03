"use client";

/**
 * #555 (audit #516, E4 residual): the per-row warning shown when the
 * text-fit report (resolveTextLineLayout's `overflow` verdict, surfaced
 * by the renderer through PreviewCanvas) says a line does not fit its
 * shape-aware bound even at the MIN_TEXT_FIT_SCALE floor. The renderer
 * still paints the line — bounded, centred spill — so this warns and
 * never blocks: editing, saving and checkout all proceed exactly as
 * before. Presentation follows PrintAspectMismatchNotice, the editor's
 * existing amber notice.
 */
export function TextFitOverflowWarning({ className = "" }: { className?: string }) {
  return (
    <p
      role="note"
      className={`rounded-lg border border-amber-400/40 bg-amber-500/15 px-3 py-2 text-[11px] font-semibold text-amber-50 ${className}`.trim()}
    >
      This line doesn&rsquo;t fit at its current size &mdash; even at the smallest fit
      size it extends past the edge of the design. Shorten the line or reduce its
      size.
    </p>
  );
}
