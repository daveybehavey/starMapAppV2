"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";

interface PageTransitionProps {
  children: ReactNode;
}

export function PageTransition({ children }: PageTransitionProps) {
  const pathname = usePathname();
  const [isVisible, setIsVisible] = useState(true);
  const prevPathnameRef = useRef(pathname);

  useEffect(() => {
    // Only animate when pathname actually changes, not on initial mount or children updates
    if (prevPathnameRef.current !== pathname) {
      setIsVisible(false);
      const timer = setTimeout(() => {
        setIsVisible(true);
      }, 150); // Match exit animation duration
      prevPathnameRef.current = pathname;
      return () => clearTimeout(timer);
    }
  }, [pathname]);

  return (
    <div
      className={`transition-all duration-200 ease-out ${
        isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2"
      }`}
    >
      {children}
    </div>
  );
}
