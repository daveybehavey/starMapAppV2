"use client";

interface SkeletonProps {
  className?: string;
  variant?: "text" | "button" | "card" | "circle" | "custom";
  width?: string | number;
  height?: string | number;
  style?: React.CSSProperties;
}

export function Skeleton({ className = "", variant = "custom", width, height, style: styleProp }: SkeletonProps) {
  const variantClasses = {
    text: "skeleton skeleton-text",
    button: "skeleton skeleton-button",
    card: "skeleton skeleton-card",
    circle: "skeleton rounded-full",
    custom: "skeleton",
  };

  const computedStyle: React.CSSProperties = { ...styleProp };
  if (width) computedStyle.width = typeof width === "number" ? `${width}px` : width;
  if (height) computedStyle.height = typeof height === "number" ? `${height}px` : height;

  return (
    <div
      className={`${variantClasses[variant]} ${className}`}
      style={computedStyle}
      aria-hidden="true"
    />
  );
}

interface EditorSkeletonProps {
  showPresets?: boolean;
  showDateLocation?: boolean;
  showPreview?: boolean;
}

export function EditorSkeleton({
  showPresets = true,
  showDateLocation = true,
  showPreview = true,
}: EditorSkeletonProps) {
  return (
    <div className="space-y-4 animate-pulse">
      {/* Header skeleton */}
      <div className="space-y-2">
        <Skeleton variant="text" width="40%" />
        <Skeleton variant="text" width="70%" height={28} />
        <Skeleton variant="text" width="90%" />
      </div>

      {/* Presets skeleton */}
      {showPresets && (
        <div className="rounded-xl border border-white/10 bg-white/5 p-3">
          <Skeleton variant="text" width="30%" className="mb-3" />
          <div className="flex flex-wrap gap-2">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <Skeleton key={i} variant="button" width={80} height={32} className="rounded-full" />
            ))}
          </div>
        </div>
      )}

      {/* Date & Location skeleton */}
      {showDateLocation && (
        <div className="rounded-xl border border-white/10 bg-white/5 p-3 space-y-3">
          <Skeleton variant="text" width="25%" />
          <Skeleton variant="custom" height={40} className="rounded-md" />
          <Skeleton variant="custom" height={40} className="rounded-md" />
        </div>
      )}

      {/* Preview skeleton */}
      {showPreview && (
        <div className="rounded-xl border border-white/10 bg-[#0b0f24]/90 p-3">
          <Skeleton variant="text" width="20%" className="mb-3" />
          <Skeleton variant="custom" className="rounded-2xl" style={{ aspectRatio: "1 / 1" }} />
        </div>
      )}

      {/* Action buttons skeleton */}
      <div className="flex gap-2">
        <Skeleton variant="button" className="flex-1" />
        <Skeleton variant="button" className="flex-1" />
      </div>
    </div>
  );
}

export function PreviewSkeleton() {
  return (
    <div className="relative w-full aspect-square rounded-2xl overflow-hidden">
      <div className="absolute inset-0 skeleton" />
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="space-y-3 text-center">
          <div className="mx-auto h-8 w-8 rounded-full border-2 border-amber-400/30 border-t-amber-400 animate-spin" />
          <p className="text-xs text-neutral-400">Loading preview...</p>
        </div>
      </div>
    </div>
  );
}
