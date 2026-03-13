"use client";

import { useEffect, useRef } from "react";
import { track, trackViewItemList } from "@/lib/analytics";

type GiftFormatsTelemetryProps = {
  source: string;
};

export default function GiftFormatsTelemetry({ source }: GiftFormatsTelemetryProps) {
  const trackedRef = useRef(false);

  useEffect(() => {
    if (trackedRef.current) return;
    trackedRef.current = true;

    track("gift_formats_catalog_view", { source });

    trackViewItemList({
      itemListId: "gift_formats_live_options",
      itemListName: "Gift formats live options",
      items: [
        { plan: "single", orderType: "digital", index: 0 },
        { plan: "single", orderType: "print", printVariant: "poster_framed", index: 1 },
        { plan: "single", orderType: "print", printVariant: "poster_unframed", index: 2 },
      ],
    });
  }, [source]);

  return null;
}
