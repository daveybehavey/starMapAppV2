"use client";

import { useEffect, useId, useRef, useState } from "react";

interface EditorDrawerProps {
  children: React.ReactNode;
  defaultOpen?: boolean;
  /**
   * Persistent footer rendered inside the dialog subtree (e.g. Unlock HD).
   * Stays visible while the drawer is mounted, including when details are collapsed.
   */
  footer?: React.ReactNode;
  onOpenChange?: (open: boolean) => void;
}

export function EditorDrawer({ children, defaultOpen = false, footer, onOpenChange }: EditorDrawerProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const handleRef = useRef<HTMLButtonElement>(null);
  const contentId = useId();

  const setOpen = (next: boolean) => {
    setIsOpen(next);
    onOpenChange?.(next);
  };

  // Escape collapses details only; footer purchase actions remain in the dialog.
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsOpen(false);
        onOpenChange?.(false);
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onOpenChange]);

  // Place focus on the drawer handle when the sheet first mounts open.
  useEffect(() => {
    if (!defaultOpen) return;
    const frame = requestAnimationFrame(() => {
      handleRef.current?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [defaultOpen]);

  return (
    <div className="md:hidden">
      {/* Backdrop */}
      {isOpen && (
        <div className="fixed inset-0 z-40 bg-black/40" onClick={() => setOpen(false)} aria-hidden="true" />
      )}

      {/*
        Bottom sheet + purchase footer share one dialog subtree so aria-modal
        remains truthful while Unlock HD / Less options stay reachable.
      */}
      <div
        className="fixed inset-x-0 bottom-0 z-50 flex flex-col rounded-t-2xl bg-[#0b0f24] shadow-2xl"
        role="dialog"
        aria-modal={isOpen}
        aria-label="Date and details editor"
      >
        {/* Handle bar */}
        <button
          ref={handleRef}
          type="button"
          onClick={() => setOpen(!isOpen)}
          className="flex w-full flex-col items-center justify-center gap-2 p-4 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-300/70"
          aria-expanded={isOpen}
          aria-controls={contentId}
          aria-label={isOpen ? "Collapse date and details panel" : "Expand date and details panel"}
        >
          <div className="h-1 w-12 rounded-full bg-white/30" aria-hidden="true" />
          <span className="text-xs font-medium text-white">{isOpen ? "Hide details" : "Date & Details"}</span>
        </button>

        {/* Scrollable details — hidden when collapsed; footer stays mounted */}
        <div
          id={contentId}
          className="overflow-y-auto px-4 pb-4"
          style={{
            maxHeight: isOpen
              ? "min(70vh, calc(100dvh - 9.5rem - env(safe-area-inset-bottom, 0px)))"
              : undefined,
          }}
          hidden={!isOpen}
        >
          {children}
        </div>

        {footer ? (
          <div
            data-testid="mobile-purchase-action-bar"
            className="border-t border-amber-200/35 bg-[#0b0f24]/95 px-3 pt-2 shadow-[0_-8px_24px_rgba(0,0,0,0.35)]"
            style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom, 0px))" }}
          >
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  );
}
