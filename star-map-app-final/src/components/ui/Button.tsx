"use client";

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";

type ButtonVariant = "primary" | "secondary" | "ghost" | "outline" | "cta";
type ButtonSize = "sm" | "md" | "lg";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  isLoading?: boolean;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
  fullWidth?: boolean;
}

const variantStyles: Record<ButtonVariant, string> = {
  primary:
    "bg-amber-400 text-midnight hover:bg-amber-500 active:bg-amber-600 shadow-md hover:shadow-lg",
  secondary:
    "bg-white/10 text-white border border-white/20 hover:bg-white/15 active:bg-white/20 shadow-inner shadow-black/20",
  ghost:
    "bg-transparent text-white hover:bg-white/10 active:bg-white/15",
  outline:
    "bg-transparent text-white border border-white/20 hover:border-white/40 hover:bg-white/5 active:bg-white/10",
  cta:
    "bg-gradient-to-r from-[#d7b56c] via-[#e8c87d] to-[#d7b56c] bg-[length:200%_100%] text-[#201a0c] shadow-lg hover:shadow-[0_12px_40px_rgba(215,181,108,0.5)] hover:animate-[shimmer_2s_ease-in-out_infinite]",
};

const sizeStyles: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-xs gap-1.5 rounded-md",
  md: "h-10 px-4 text-sm gap-2 rounded-lg",
  lg: "h-12 px-6 text-base gap-2.5 rounded-xl",
};

const focusStyles =
  "focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/70 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent";

const baseStyles =
  "inline-flex items-center justify-center font-semibold transition-all duration-200 select-none disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98]";

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = "primary",
      size = "md",
      isLoading = false,
      leftIcon,
      rightIcon,
      fullWidth = false,
      className = "",
      disabled,
      children,
      ...props
    },
    ref
  ) => {
    return (
      <button
        ref={ref}
        disabled={disabled || isLoading}
        className={`
          ${baseStyles}
          ${variantStyles[variant]}
          ${sizeStyles[size]}
          ${focusStyles}
          ${fullWidth ? "w-full" : ""}
          ${className}
        `.trim().replace(/\s+/g, " ")}
        {...props}
      >
        {isLoading ? (
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
        ) : (
          <>
            {leftIcon && <span className="shrink-0">{leftIcon}</span>}
            {children}
            {rightIcon && <span className="shrink-0">{rightIcon}</span>}
          </>
        )}
      </button>
    );
  }
);

Button.displayName = "Button";

// Pill variant for preset/tag buttons
interface PillButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  isSelected?: boolean;
  isLocked?: boolean;
}

export const PillButton = forwardRef<HTMLButtonElement, PillButtonProps>(
  ({ isSelected = false, isLocked = false, className = "", children, disabled, ...props }, ref) => {
    return (
      <button
        ref={ref}
        disabled={disabled || isLocked}
        className={`
          inline-flex items-center justify-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold uppercase tracking-wide
          transition-all duration-200 select-none
          ${focusStyles}
          ${
            isSelected
              ? "bg-amber-400 text-midnight shadow-md btn-selected-glow"
              : isLocked
              ? "bg-white/5 text-neutral-400 border border-white/10 cursor-not-allowed"
              : "bg-white/10 text-white border border-white/15 hover:bg-white/15 hover:border-white/25 hover:-translate-y-[1px] active:scale-[0.98]"
          }
          ${className}
        `.trim().replace(/\s+/g, " ")}
        {...props}
      >
        {isLocked && <span className="text-[9px] uppercase tracking-[0.12em]">HD</span>}
        {children}
      </button>
    );
  }
);

PillButton.displayName = "PillButton";
