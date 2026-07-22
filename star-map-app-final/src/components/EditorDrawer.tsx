"use client";

import { useEffect, useId, useRef, useState } from "react";

interface EditorDrawerProps {
  children: React.ReactNode;
  defaultOpen?: boolean;
  /** Lifts the sheet above a sticky action bar (e.g. Unlock HD). */
  bottomOffset?: string;
  onOpenChange?: (open: boolean) => void;
}

export function EditorDrawer({
  children,
  defaultOpen = false,
  bottomOffset = "0px",
  onOpenChange,
}: EditorDrawerProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const handleRef = useRef<HTMLButtonElement>(null);
  const contentId = useId();

  const setOpen = (next: boolean) => {
    setIsOpen(next);
    onOpenChange?.(next);
  };

  // Handle Escape key to close drawer (sheet only; sticky purchase actions remain).
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
        <div
          className="fixed inset-0 z-40 bg-black/40"
          style={{ bottom: bottomOffset }}
          onClick={() => setOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Bottom sheet */}
      <div
        className={`
          fixed right-0 left-0 z-50
          rounded-t-2xl bg-[#0b0f24] shadow-2xl
          transform transition-transform duration-300
          ${isOpen ? "translate-y-0" : "translate-y-[calc(100%-60px)]"}
        `}
        style={{ bottom: bottomOffset }}
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
          <span className="text-xs font-medium text-white">
            {isOpen ? "Hide details" : "Date & Details"}
          </span>
        </button>

        {/* Content */}
        <div
          id={contentId}
          className="overflow-y-auto px-4 pb-6"
          style={{
            maxHeight: isOpen
              ? `min(70vh, calc(100dvh - ${bottomOffset} - 5.5rem))`
              : undefined,
          }}
          hidden={!isOpen}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
