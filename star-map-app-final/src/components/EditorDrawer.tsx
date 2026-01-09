"use client";

import { useState } from "react";

interface EditorDrawerProps {
  children: React.ReactNode;
  defaultOpen?: boolean;
}

export function EditorDrawer({ children, defaultOpen = false }: EditorDrawerProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className="md:hidden">
      {/* Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-40"
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* Bottom sheet */}
      <div className={`
        fixed bottom-0 left-0 right-0 z-50
        bg-[#0b0f24] rounded-t-2xl shadow-2xl
        transform transition-transform duration-300
        ${isOpen ? 'translate-y-0' : 'translate-y-[calc(100%-60px)]'}
      `}>
        {/* Handle bar */}
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="w-full p-4 flex flex-col items-center justify-center gap-2"
        >
          <div className="w-12 h-1 bg-white/30 rounded-full" />
          <span className="text-white text-xs font-medium">
            {isOpen ? 'Hide details' : 'Date & Details'}
          </span>
        </button>

        {/* Content */}
        <div className="max-h-[70vh] overflow-y-auto px-4 pb-6">
          {children}
        </div>
      </div>
    </div>
  );
}
