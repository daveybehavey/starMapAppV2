"use client";

import { track, trackFunnelStep } from "@/lib/analytics";
import type { ReactNode } from "react";

type HomeHeroCtaProps = {
  href: string;
  className: string;
  plan: string;
  placement: "primary" | "secondary";
  label: string;
  children: ReactNode;
};

export function HomeHeroCta({ href, className, plan, placement, label, children }: HomeHeroCtaProps) {
  return (
    <a
      href={href}
      className={className}
      onClick={() => {
        track("hero_cta_clicked", {
          source: "home-hero",
          placement,
          label,
        });
        trackFunnelStep("hero_plan_click", {
          source: "home-hero",
          plan,
        });
      }}
    >
      {children}
    </a>
  );
}
