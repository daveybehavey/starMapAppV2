"use client";

import type { AspectRatio } from "@/lib/types";
import { getPosterAspectMismatchMessage } from "@/lib/printGiftDecisionCopy";

type Props = {
  aspectRatio: AspectRatio;
  className?: string;
};

export function PrintAspectMismatchNotice({ aspectRatio, className = "" }: Props) {
  const message = getPosterAspectMismatchMessage(aspectRatio);
  if (!message) return null;

  return (
    <p
      className={`rounded-lg border border-amber-400/40 bg-amber-500/15 px-3 py-2 text-[11px] font-semibold text-amber-50 ${className}`.trim()}
      role="note"
    >
      {message}
    </p>
  );
}
