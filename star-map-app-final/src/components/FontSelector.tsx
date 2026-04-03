"use client";

import { useEffect, useRef, useState } from "react";
import type { TextBox } from "@/lib/store";
import { FONT_STACKS } from "@/lib/fonts";

interface FontSelectorProps {
  value: TextBox["fontFamily"];
  onChange: (fontId: TextBox["fontFamily"]) => void;
  fontOptions: Array<{ id: TextBox["fontFamily"]; label: string; premium?: boolean }>;
  paid: boolean;
  onPremiumClick: () => void;
}

export default function FontSelector({
  value,
  onChange,
  fontOptions,
  paid,
  onPremiumClick,
}: FontSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedOption = fontOptions.find((opt) => opt.id === value);

  // Click outside to close
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  // Keyboard navigation
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
        return;
      }

      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        const currentIndex = fontOptions.findIndex((opt) => opt.id === value);
        const direction = event.key === "ArrowDown" ? 1 : -1;
        let newIndex = currentIndex + direction;

        // Wrap around
        if (newIndex < 0) newIndex = fontOptions.length - 1;
        if (newIndex >= fontOptions.length) newIndex = 0;

        const newOption = fontOptions[newIndex];
        if (newOption.premium && !paid) {
          onPremiumClick();
        } else {
          onChange(newOption.id);
        }
      }

      if (event.key === "Enter") {
        setIsOpen(false);
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, value, fontOptions, paid, onChange, onPremiumClick]);

  const handleOptionClick = (option: typeof fontOptions[0]) => {
    if (option.premium && !paid) {
      onPremiumClick();
    } else {
      onChange(option.id);
    }
    setIsOpen(false);
  };

  return (
    <div ref={containerRef} className="relative">
      {/* Button (closed state) */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex h-9 w-24 flex-shrink-0 items-center truncate rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-left text-sm text-white shadow-inner shadow-black/20 outline-none transition focus:border-amber-400 focus:ring-2 focus:ring-amber-400/30 sm:w-28 md:w-32"
        style={{ fontFamily: FONT_STACKS[value] }}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
      >
        {selectedOption?.label || value}
      </button>

      {/* Dropdown (open state) */}
      {isOpen && (
        <div
          className="absolute left-0 top-full z-50 mt-1 max-h-60 w-56 overflow-y-auto rounded-xl border border-white/20 bg-[#11182d]/98 p-1 shadow-xl shadow-black/35 backdrop-blur sm:w-60"
          role="listbox"
        >
          {fontOptions.map((option) => {
            const isLocked = option.premium && !paid;
            const isSelected = option.id === value;

            return (
              <button
                key={option.id}
                type="button"
                onClick={() => handleOptionClick(option)}
                className={`block w-full rounded-lg px-3 py-2 text-left text-sm transition ${
                  isSelected
                    ? "bg-amber-300/18 text-white"
                    : isLocked
                    ? "cursor-not-allowed text-white/45"
                    : "text-white/85 hover:bg-white/8 hover:text-white"
                }`}
                style={{
                  fontFamily: FONT_STACKS[option.id],
                }}
                role="option"
                aria-selected={isSelected}
                disabled={isLocked}
              >
                <span className="flex items-center justify-between gap-2">
                  <span>{option.label}</span>
                  {isLocked ? (
                    <span className="rounded-full border border-white/10 bg-white/8 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-white/55">
                      Premium
                    </span>
                  ) : null}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
