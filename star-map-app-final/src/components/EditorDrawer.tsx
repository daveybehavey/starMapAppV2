"use client";

import { useEffect, useState } from "react";

interface EditorDrawerProps {
  children: React.ReactNode;
  defaultOpen?: boolean;
}

export function EditorDrawer({ children, defaultOpen = false }: EditorDrawerProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  // Handle Escape key to close drawer
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsOpen(false);
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen]);

  return (
    <div className="md:hidden">
      {/* Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-[#020611]/65 backdrop-blur-[2px]"
          onClick={() => setIsOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Bottom sheet */}
      <div
        className={`
          fixed bottom-0 left-0 right-0 z-50
          rounded-t-[24px] border border-white/10 border-b-0
          bg-[linear-gradient(180deg,rgba(11,15,36,0.98),rgba(7,11,26,0.98))]
          shadow-[0_-18px_42px_rgba(0,0,0,0.42)]
          transform transition-transform duration-300
          ${isOpen ? 'translate-y-0' : 'translate-y-[calc(100%-60px)]'}
        `}
        role="dialog"
        aria-modal={isOpen}
        aria-label="Date and details editor"
      >
        {/* Handle bar */}
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="w-full border-b border-white/8 px-4 py-3 flex flex-col items-center justify-center gap-2"
          aria-expanded={isOpen}
          aria-controls="editor-drawer-content"
          aria-label={isOpen ? 'Collapse date and details panel' : 'Expand date and details panel'}
        >
          <div className="h-1 w-12 rounded-full bg-white/30" aria-hidden="true" />
          <div className="text-center">
            <span className="block text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-200/80">
              Editing controls
            </span>
            <span className="block text-xs font-medium text-white">
              {isOpen ? "Hide details" : "Open details"}
            </span>
          </div>
        </button>

        {/* Content */}
        <div
          id="editor-drawer-content"
          className="max-h-[72vh] overflow-y-auto px-4 pb-[calc(env(safe-area-inset-bottom,0px)+1.5rem)] pt-3"
        >
          {children}
        </div>
      </div>
    </div>
  );
}
