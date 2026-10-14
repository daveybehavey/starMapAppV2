"use client";

import { useEffect, useRef } from "react";
import { track, trackViewItemList } from "@/lib/analytics";
import { PAYWALL_PRINT_VARIANT_ORDER } from "@/lib/printCatalog";
import { isAndroidAppModeClient } from "@/lib/androidAppMode";

type GiftFormatsTelemetryProps = {
  source: string;
};

export default function GiftFormatsTelemetry({ source }: GiftFormatsTelemetryProps) {
  const trackedRef = useRef(false);

  useEffect(() => {
    if (trackedRef.current) return;
    trackedRef.current = true;

    track("gift_formats_catalog_view", { source });
    // Google Play app mode hides the digital card, so never report an impression for it.
    const appMode = isAndroidAppModeClient();

    trackViewItemList({
      itemListId: "gift_formats_live_options",
      itemListName: "Gift formats live options",
      items: [
        ...(appMode ? [] : [{ plan: "single" as const, orderType: "digital" as const, index: 0 }]),
        ...PAYWALL_PRINT_VARIANT_ORDER.map((printVariant, index) => ({
          plan: "single" as const,
          orderType: "print" as const,
          printVariant,
          index: appMode ? index : index + 1,
        })),
      ],
    });
  }, [source]);

  return null;
}
