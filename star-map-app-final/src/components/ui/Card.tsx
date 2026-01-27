"use client";

import { forwardRef, type HTMLAttributes, type ReactNode } from "react";

type CardVariant = "dark" | "light" | "cosmic" | "glass";

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: CardVariant;
  padding?: "none" | "sm" | "md" | "lg";
  hoverable?: boolean;
  bordered?: boolean;
}

const variantStyles: Record<CardVariant, string> = {
  dark: "bg-white/5 border-white/10",
  light: "bg-[rgba(247,241,227,0.88)] border-amber-200/60",
  cosmic: "cosmic-panel border-amber-200/60",
  glass: "bg-white/10 backdrop-blur-sm border-white/20",
};

const paddingStyles: Record<NonNullable<CardProps["padding"]>, string> = {
  none: "",
  sm: "p-3",
  md: "p-4 sm:p-5",
  lg: "p-5 sm:p-7 lg:p-8",
};

const baseStyles = "rounded-2xl border transition-all duration-300";

const hoverStyles =
  "hover:-translate-y-1 hover:shadow-lg hover:border-amber-400/30";

export const Card = forwardRef<HTMLDivElement, CardProps>(
  (
    {
      variant = "dark",
      padding = "md",
      hoverable = false,
      bordered = true,
      className = "",
      children,
      ...props
    },
    ref
  ) => {
    return (
      <div
        ref={ref}
        className={`
          ${baseStyles}
          ${variantStyles[variant]}
          ${paddingStyles[padding]}
          ${hoverable ? hoverStyles : ""}
          ${!bordered ? "border-transparent" : ""}
          ${className}
        `.trim().replace(/\s+/g, " ")}
        {...props}
      >
        {children}
      </div>
    );
  }
);

Card.displayName = "Card";

// Collapsible card with header
interface CollapsibleCardProps extends Omit<CardProps, "children"> {
  title: string;
  subtitle?: string;
  icon?: ReactNode;
  isOpen?: boolean;
  onToggle?: () => void;
  children: ReactNode;
  headerAction?: ReactNode;
}

export const CollapsibleCard = forwardRef<HTMLDivElement, CollapsibleCardProps>(
  (
    {
      title,
      subtitle,
      icon,
      isOpen = true,
      onToggle,
      children,
      headerAction,
      variant = "dark",
      padding = "none",
      ...props
    },
    ref
  ) => {
    return (
      <Card ref={ref} variant={variant} padding={padding} {...props}>
        <button
          type="button"
          onClick={onToggle}
          className="flex w-full items-center justify-between p-3 text-left transition-colors hover:bg-white/5 rounded-t-2xl"
          aria-expanded={isOpen}
        >
          <div className="flex items-center gap-2">
            {icon && <span className="text-amber-400">{icon}</span>}
            <div>
              <h3 className={`text-sm font-semibold ${variant === "light" ? "text-midnight" : "text-white"}`}>
                {title}
              </h3>
              {subtitle && (
                <p className={`text-xs ${variant === "light" ? "text-neutral-600" : "text-neutral-400"}`}>
                  {subtitle}
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {headerAction}
            <svg
              className={`h-4 w-4 transition-transform duration-200 ${
                isOpen ? "rotate-180" : ""
              } ${variant === "light" ? "text-neutral-600" : "text-neutral-400"}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </button>
        {isOpen && (
          <div className="p-3 pt-0 animate-[accordion-open_0.3s_ease-out]">
            {children}
          </div>
        )}
      </Card>
    );
  }
);

CollapsibleCard.displayName = "CollapsibleCard";

// Feature card for landing pages
interface FeatureCardProps extends HTMLAttributes<HTMLDivElement> {
  title: string;
  description: string;
  icon?: ReactNode;
}

export const FeatureCard = forwardRef<HTMLDivElement, FeatureCardProps>(
  ({ title, description, icon, className = "", ...props }, ref) => {
    return (
      <Card
        ref={ref}
        variant="dark"
        padding="md"
        hoverable
        className={`tilt-card ${className}`}
        {...props}
      >
        {icon && <div className="mb-3 text-amber-400">{icon}</div>}
        <h3 className="text-lg font-semibold text-white">{title}</h3>
        <p className="mt-2 text-sm text-neutral-200">{description}</p>
      </Card>
    );
  }
);

FeatureCard.displayName = "FeatureCard";
