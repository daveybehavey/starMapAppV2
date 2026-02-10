"use client";

import { forwardRef, useId, type InputHTMLAttributes, type ReactNode } from "react";

export type InputVariant = "default" | "dark" | "light";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  variant?: InputVariant;
  label?: string;
  error?: string;
  hint?: string;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
}

const variantStyles: Record<InputVariant, string> = {
  default:
    "border-white/15 bg-white/10 text-white placeholder:text-white/50 shadow-inner shadow-black/20",
  dark:
    "border-black/10 bg-white text-neutral-800 placeholder:text-neutral-400 shadow-inner shadow-black/5",
  light:
    "border-amber-200/60 bg-white/80 text-midnight placeholder:text-neutral-400",
};

const focusStyles =
  "focus:border-amber-400 focus:ring-2 focus:ring-amber-400/30 focus:outline-none";

const baseStyles =
  "w-full rounded-lg border px-3 py-2 text-sm transition-all duration-200 appearance-none";

const errorStyles = "border-rose-400 bg-rose-50/10 focus:border-rose-400 focus:ring-rose-400/30";

export const Input = forwardRef<HTMLInputElement, InputProps>(
  (
    {
      variant = "default",
      label,
      error,
      hint,
      leftIcon,
      rightIcon,
      className = "",
      id,
      ...props
    },
    ref
  ) => {
    const generatedId = useId();
    const inputId = id || generatedId;
    const hasError = Boolean(error);

    return (
      <div className="space-y-1.5">
        {label && (
          <label
            htmlFor={inputId}
            className={`block text-xs font-semibold ${
              variant === "default" ? "text-white" : "text-neutral-700"
            }`}
          >
            {label}
          </label>
        )}
        <div className="relative">
          {leftIcon && (
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-current opacity-50">
              {leftIcon}
            </span>
          )}
          <input
            ref={ref}
            id={inputId}
            className={`
              ${baseStyles}
              ${hasError ? errorStyles : variantStyles[variant]}
              ${focusStyles}
              ${leftIcon ? "pl-9" : ""}
              ${rightIcon ? "pr-9" : ""}
              ${className}
            `.trim().replace(/\s+/g, " ")}
            aria-invalid={hasError}
            aria-describedby={error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined}
            {...props}
          />
          {rightIcon && (
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-current opacity-50">
              {rightIcon}
            </span>
          )}
        </div>
        {error && (
          <p id={`${inputId}-error`} className="text-xs text-rose-500" role="alert">
            {error}
          </p>
        )}
        {hint && !error && (
          <p
            id={`${inputId}-hint`}
            className={`text-xs ${variant === "default" ? "text-white/60" : "text-neutral-600"}`}
          >
            {hint}
          </p>
        )}
      </div>
    );
  }
);

Input.displayName = "Input";

// Number input variant with controlled step buttons
interface NumberInputProps extends Omit<InputProps, "type"> {
  min?: number;
  max?: number;
  step?: number;
}

export const NumberInput = forwardRef<HTMLInputElement, NumberInputProps>(
  ({ min, max, step = 1, ...props }, ref) => {
    return (
      <Input
        ref={ref}
        type="number"
        min={min}
        max={max}
        step={step}
        {...props}
      />
    );
  }
);

NumberInput.displayName = "NumberInput";
