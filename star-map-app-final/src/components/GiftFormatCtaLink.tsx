"use client";

import Link from "next/link";
import { track, trackFunnelStep, trackSelectItem } from "@/lib/analytics";
import type { CheckoutOrderType, CheckoutPlan, PrintVariant } from "@/lib/pricing";
import type { ReactNode } from "react";

type GiftFormatCtaLinkProps = {
  href: string;
  className: string;
  source: string;
  plan?: CheckoutPlan;
  orderType?: CheckoutOrderType;
  printVariant?: PrintVariant;
  listId?: string;
  listName?: string;
  index?: number;
  children: ReactNode;
};

export default function GiftFormatCtaLink({
  href,
  className,
  source,
  plan,
  orderType,
  printVariant,
  listId,
  listName,
  index,
  children,
}: GiftFormatCtaLinkProps) {
  const handleClick = () => {
    track("gift_format_cta_click", {
      source,
      plan,
      orderType,
      printVariant,
      index,
    });

    trackFunnelStep("hero_plan_click", {
      source,
      plan: plan ?? (orderType === "print" ? `print_${printVariant ?? "unknown"}` : undefined),
    });

    if (listId && orderType) {
      trackSelectItem({
        itemListId: listId,
        itemListName: listName,
        item: {
          plan,
          orderType,
          printVariant,
          index,
        },
      });
    }
  };

  return (
    <Link href={href} prefetch={false} className={className} onClick={handleClick}>
      {children}
    </Link>
  );
}
