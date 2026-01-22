"use client";

import { useEffect, useRef, useState } from "react";

interface UseInViewOptions extends IntersectionObserverInit {
  triggerOnce?: boolean;
}

export function useInView(options: UseInViewOptions = {}) {
  const { triggerOnce = true, threshold = 0.15, rootMargin = "0px", root } = options;
  const ref = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    // Skip if already visible and triggerOnce is true
    if (isVisible && triggerOnce) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          if (triggerOnce) {
            observer.disconnect();
          }
        } else if (!triggerOnce) {
          setIsVisible(false);
        }
      },
      { threshold, rootMargin, root }
    );

    observer.observe(element);
    return () => observer.disconnect();
  }, [isVisible, triggerOnce, threshold, rootMargin, root]);

  return { ref, isVisible };
}
