"use client";

import { useEffect, useRef, type RefObject } from "react";

const FOCUSABLE_SELECTORS = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

export function useFocusTrap<T extends HTMLElement>(
  isActive: boolean,
  containerRef?: RefObject<T | null>
): RefObject<T> {
  const internalRef = useRef<T>(null);
  const ref = containerRef ?? internalRef;
  const previousActiveElement = useRef<Element | null>(null);

  useEffect(() => {
    if (!isActive) return;

    const container = ref.current;
    if (!container) return;

    // Store the currently focused element to restore later
    previousActiveElement.current = document.activeElement;

    // Focus the first focusable element in the container
    const focusableElements = container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTORS);
    const firstFocusable = focusableElements[0];
    const lastFocusable = focusableElements[focusableElements.length - 1];

    if (firstFocusable) {
      firstFocusable.focus();
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return;

      const currentFocusableElements = container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTORS);
      const first = currentFocusableElements[0];
      const last = currentFocusableElements[currentFocusableElements.length - 1];

      if (!first || !last) return;

      // Shift + Tab on first element -> go to last
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
        return;
      }

      // Tab on last element -> go to first
      if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);

      // Restore focus to the previously focused element
      if (previousActiveElement.current && previousActiveElement.current instanceof HTMLElement) {
        previousActiveElement.current.focus();
      }
    };
  }, [isActive, ref]);

  return ref as RefObject<T>;
}
