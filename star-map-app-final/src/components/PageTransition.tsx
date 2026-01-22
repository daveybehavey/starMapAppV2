"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";

interface PageTransitionProps {
  children: ReactNode;
}

export function PageTransition({ children }: PageTransitionProps) {
  const pathname = usePathname();
  const [isVisible, setIsVisible] = useState(true);
  const [displayChildren, setDisplayChildren] = useState(children);

  useEffect(() => {
    // When pathname changes, trigger exit animation then swap content
    setIsVisible(false);
    const timer = setTimeout(() => {
      setDisplayChildren(children);
      setIsVisible(true);
    }, 150); // Match exit animation duration

    return () => clearTimeout(timer);
  }, [pathname, children]);

  return (
    <div
      className={`transition-all duration-200 ease-out ${
        isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2"
      }`}
    >
      {displayChildren}
    </div>
  );
}
