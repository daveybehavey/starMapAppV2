"use client";

import { forwardRef, useEffect, type HTMLAttributes, type ReactNode } from "react";
import { useFocusTrap } from "./useFocusTrap";

interface ModalProps extends HTMLAttributes<HTMLDivElement> {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  titleClassName?: string;
  descriptionClassName?: string;
  size?: "sm" | "md" | "lg";
  showCloseButton?: boolean;
  closeOnOverlayClick?: boolean;
  closeOnEscape?: boolean;
  children: ReactNode;
}

const sizeStyles = {
  sm: "max-w-sm",
  md: "max-w-md",
  lg: "max-w-lg",
};

export const Modal = forwardRef<HTMLDivElement, ModalProps>(
  (
    {
      isOpen,
      onClose,
      title,
      description,
      titleClassName = "",
      descriptionClassName = "",
      size = "md",
      showCloseButton = true,
      closeOnOverlayClick = true,
      closeOnEscape = true,
      children,
      className = "",
      ...props
    },
    ref
  ) => {
    const containerRef = useFocusTrap<HTMLDivElement>(isOpen);
    void ref;

    // Handle Escape key
    useEffect(() => {
      if (!isOpen || !closeOnEscape) return;

      const handleKeyDown = (event: KeyboardEvent) => {
        if (event.key === "Escape") {
          onClose();
        }
      };

      document.addEventListener("keydown", handleKeyDown);
      return () => document.removeEventListener("keydown", handleKeyDown);
    }, [isOpen, closeOnEscape, onClose]);

    // Prevent body scroll when modal is open
    useEffect(() => {
      if (isOpen) {
        const originalOverflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        return () => {
          document.body.style.overflow = originalOverflow;
        };
      }
    }, [isOpen]);

    if (!isOpen) return null;

    const handleOverlayClick = (event: React.MouseEvent) => {
      if (closeOnOverlayClick && event.target === event.currentTarget) {
        onClose();
      }
    };

    return (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 backdrop-blur-sm"
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? "modal-title" : undefined}
        aria-describedby={description ? "modal-description" : undefined}
        onClick={handleOverlayClick}
      >
        <div
          ref={containerRef}
          className={`
            relative w-full ${sizeStyles[size]} animate-[scale-in_0.3s_ease-out]
            rounded-3xl border border-white/20 bg-gradient-to-br from-[#0f1f3a] via-[#0a1427] to-[#050915]
            p-6 text-white shadow-2xl shadow-black/50
            ${className}
          `.trim().replace(/\s+/g, " ")}
          {...props}
        >
          {showCloseButton && (
            <button
              onClick={onClose}
              className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-white/70 transition-colors hover:bg-white/20 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/70"
              aria-label="Close modal"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}

          {title && (
            <h2
              id="modal-title"
              className={`mb-2 pr-8 text-xl font-bold text-current sm:text-2xl ${titleClassName}`}
            >
              {title}
            </h2>
          )}

          {description && (
            <p
              id="modal-description"
              className={`mb-4 text-sm text-current opacity-80 ${descriptionClassName}`}
            >
              {description}
            </p>
          )}

          {children}
        </div>
      </div>
    );
  }
);

Modal.displayName = "Modal";

// Light variant for promo/success modals
interface LightModalProps extends ModalProps {}

export const LightModal = forwardRef<HTMLDivElement, LightModalProps>(
  ({ className = "", children, ...props }, ref) => {
    return (
      <Modal
        ref={ref}
        titleClassName="!text-neutral-900"
        descriptionClassName="!text-neutral-700"
        className={`
          !border-amber-400 !bg-gradient-to-br !from-amber-50 !via-white !to-amber-50 !text-neutral-900
          [&>button]:!bg-amber-100 [&>button]:!text-amber-900
          [&>button:hover]:!bg-amber-200 [&>button:hover]:!text-amber-950
          ${className}
        `.trim().replace(/\s+/g, " ")}
        {...props}
      >
        {children}
      </Modal>
    );
  }
);

LightModal.displayName = "LightModal";
