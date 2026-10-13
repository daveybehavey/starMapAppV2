"use client";

import { useEffect, useState } from "react";
import { isAndroidAppModeClient } from "@/lib/androidAppMode";

export function useAndroidAppMode(): boolean {
  const [appMode, setAppMode] = useState(false);
  useEffect(() => {
    setAppMode(isAndroidAppModeClient());
  }, []);
  return appMode;
}
