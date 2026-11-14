"use client";

import { useEffect, useLayoutEffect, useRef, type ReactNode } from "react";
import { useFocusTrap } from "./ui/useFocusTrap";

export function FullscreenPreview({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  const containerRef = useRef<HTMLDivElement>(null);

  const isolated = useRef<Array<{ element: HTMLElement; inert: boolean }>>([]);
  // Restore background in layout cleanup, before the trap's passive focus return.
  useLayoutEffect(() => () => {
    for (const { element, inert } of isolated.current) element.inert = inert;
    isolated.current = [];
  }, []);

  useFocusTrap(true, containerRef);

  // Isolate siblings at every ancestor level without hiding the dialog itself.
  // Run after the trap has captured the opener and moved focus into the dialog.
  useEffect(() => {
    const previous: Array<{ element: HTMLElement; inert: boolean }> = [];
    let branch: HTMLElement | null = containerRef.current;
    while (branch?.parentElement) {
      for (const sibling of Array.from(branch.parentElement.children)) {
        if (sibling !== branch && sibling instanceof HTMLElement) {
          previous.push({ element: sibling, inert: sibling.inert });
          sibling.inert = true;
        }
      }
      if (branch.parentElement === document.body) break;
      branch = branch.parentElement;
    }
    isolated.current = previous;
  }, []);

  // Match ui/Modal's Escape handling and share the existing button close path.
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div
      ref={containerRef}
      role="dialog"
      aria-modal="true"
      aria-label="Fullscreen preview"
      tabIndex={-1}
      className="fixed inset-0 z-50 flex items-center justify-center bg-gradient-to-b from-[#0b1a30] via-[#050b18] to-[#0b1a30]"
    >
      <button
        type="button"
        onClick={onClose}
        className="focus:ring-gold absolute top-4 left-4 z-10 rounded-full border border-amber-200 bg-[rgba(247,241,227,0.95)] px-4 py-2 text-sm font-semibold text-neutral-800 shadow transition hover:-translate-y-[1px] hover:shadow-lg focus:ring-2 focus:ring-offset-2 focus:ring-offset-[#0b1a30] focus:outline-none sm:top-6 sm:left-6"
        aria-label="Exit fullscreen"
      >
        ⤡ Exit fullscreen
      </button>
      <div className="relative flex h-[95vh] max-h-[95vh] w-[95vw] max-w-[95vw] items-center justify-center">
        {children}
      </div>
    </div>
  );
}
