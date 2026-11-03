"use client";

import { useId } from "react";
import type { RenderOptions, StyleId } from "@/lib/store";

export function StarColorControl({ selectedStyle, renderOptions, setRenderOptions }: {
  selectedStyle: StyleId;
  renderOptions: RenderOptions;
  setRenderOptions: (next: Partial<RenderOptions>) => void;
}) {
  const id = useId();
  const parchment = selectedStyle === "parchmentScroll";
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="text-[11px] font-semibold text-neutral-100">Star colours</label>
      <select
        id={id}
        value={parchment ? "fixed" : renderOptions.starColorMode ?? ""}
        disabled={parchment}
        aria-describedby={`${id}-help`}
        onChange={(event) => setRenderOptions({ starColorMode: event.target.value === "" ? undefined : event.target.value as "fixed" | "spectral" })}
        className="w-full rounded-md border border-white/15 bg-[#0a1024] px-2 py-2 text-xs text-white disabled:opacity-60"
      >
        <option value="">Style default</option>
        <option value="fixed">Fixed palette colour</option>
        <option value="spectral">Spectral star colours</option>
      </select>
      <p id={`${id}-help`} className="text-[11px] text-neutral-300">
        {parchment
          ? "Parchment uses fixed dark ink for contrast. Your colour choice resumes with other styles."
          : "Fixed uses the style's star palette; spectral uses star colour data where available. Style default keeps the original look."}
      </p>
    </div>
  );
}
