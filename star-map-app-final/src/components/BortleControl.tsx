"use client";

import { useId } from "react";
import type { RenderOptions } from "@/lib/store";

export function BortleControl({
  renderOptions,
  setRenderOptions,
}: {
  renderOptions: RenderOptions;
  setRenderOptions: (next: Partial<RenderOptions>) => void;
}) {
  const bortleId = useId();
  return (
    <div className="space-y-1">
      <label htmlFor={bortleId} className="text-[11px] font-semibold text-neutral-100">
        Sky darkness (Bortle class): {renderOptions.bortleClass ?? 4.5}
      </label>
      <input
        id={bortleId}
        type="range"
        min={1}
        max={9}
        step={0.5}
        value={renderOptions.bortleClass ?? 4.5}
        onChange={(event) => setRenderOptions({ bortleClass: Number(event.target.value) })}
        aria-describedby={`${bortleId}-help`}
        className="w-full accent-amber-300"
      />
      <p id={`${bortleId}-help`} className="text-[11px] text-neutral-200">
        Bortle measures light pollution: 1 is the darkest rural sky; 9 is a bright city sky. Default: 4.5.
        Changes the background only; stars keep their positions and sizes.
      </p>
    </div>
  );
}
