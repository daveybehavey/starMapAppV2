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
          className="fixed inset-0 bg-black/40 z-40"
          onClick={() => setIsOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Bottom sheet */}
      <div
        className={`
          fixed bottom-0 left-0 right-0 z-50
          bg-[#0b0f24] rounded-t-2xl shadow-2xl
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
          className="w-full p-4 flex flex-col items-center justify-center gap-2"
          aria-expanded={isOpen}
          aria-controls="editor-drawer-content"
          aria-label={isOpen ? 'Collapse date and details panel' : 'Expand date and details panel'}
        >
          <div className="w-12 h-1 bg-white/30 rounded-full" aria-hidden="true" />
          <span className="text-white text-xs font-medium">
            {isOpen ? 'Hide details' : 'Date & Details'}
          </span>
        </button>

        {/* Content */}
        <div
          id="editor-drawer-content"
          className="max-h-[70vh] overflow-y-auto px-4 pb-6"
        >
          {children}
        </div>
      </div>
    </div>
  );
}
