"use client";

import { useRef, useState } from "react";
import { useStore } from "@/lib/store";
import { applyTextRowStyle } from "@/lib/applyTextRowStyle";

export function ApplyTextRowStyle({ sourceId }: { sourceId: string }) {
  const boxes = useStore((state) => state.textBoxes);
  const [confirming, setConfirming] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const source = boxes.find((box) => box.id === sourceId);
  const count = boxes.length - 1;
  if (!source) return null;

  return (
    <div className="space-y-2 text-xs">
      <button
        ref={triggerRef}
        type="button"
        disabled={count < 1}
        aria-label={`Apply ${source.label} styling to all rows`}
        aria-expanded={confirming && count > 0}
        onClick={() => setConfirming((value) => !value)}
        className="rounded-md border border-white/20 px-3 py-2 text-amber-200 hover:bg-white/10 disabled:opacity-40"
      >
        Apply styling to all rows
      </button>
      {confirming && count > 0 && (
        <div role="group" aria-label={`Confirm applying ${source.label} styling`} className="space-y-2">
          <p className="text-neutral-300">
            Replace styling on {count} other {count === 1 ? "row" : "rows"} with {source.label}&apos;s styling?
            Text and positions stay the same.
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                const state = useStore.getState();
                const next = applyTextRowStyle(state.textBoxes, sourceId);
                if (next !== state.textBoxes) state.setTextBoxes(next);
                setConfirming(false);
                triggerRef.current?.focus();
              }}
              className="rounded-md bg-amber-300 px-3 py-2 font-semibold text-slate-950"
            >
              Apply styling
            </button>
            <button type="button" onClick={() => { setConfirming(false); triggerRef.current?.focus(); }} className="rounded-md border border-white/20 px-3 py-2 text-white">
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
