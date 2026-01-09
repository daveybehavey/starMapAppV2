"use client";

import { useEffect, useState, type ReactNode } from "react";

/**
 * Only renders children on the client side, not during SSR
 * Prevents hydration mismatches for responsive components
 */
export function ClientOnly({ children }: { children: ReactNode }) {
  const [hasMounted, setHasMounted] = useState(false);

  useEffect(() => {
    setHasMounted(true);
  }, []);

  if (!hasMounted) {
    return null;
  }

  return <>{children}</>;
}
