"use client";

import { useEffect, useRef } from "react";
import type { TextBox } from "@/lib/store";

const DEFAULT_SUBTITLE_TEXT = "Under the vintage stars";
const DEFAULT_DEDICATION_TEXT = "Celebrating our constellation of moments.";

type SuggestedMomentText = {
  subtitle: string;
  dedication: string;
};

function formatMomentDate(dateTime: string, timeZone?: string) {
  const date = new Date(dateTime);
  if (!Number.isFinite(date.getTime())) return null;
  return new Intl.DateTimeFormat("en-US", {
    timeZone: timeZone || "UTC",
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function buildSuggestedMomentText(dateTime: string, locationName: string, timeZone?: string): SuggestedMomentText {
  const trimmedLocation = locationName.trim();
  return {
    subtitle: trimmedLocation || DEFAULT_SUBTITLE_TEXT,
    dedication: formatMomentDate(dateTime, timeZone) || DEFAULT_DEDICATION_TEXT,
  };
}

function shouldUpdateAutoText(currentText: string, fallbackText: string, previousAutoText?: string) {
  const trimmed = currentText.trim();
  return trimmed.length === 0 || trimmed === fallbackText || trimmed === previousAutoText;
}

export function useAutoMomentText({
  dateTime,
  locationName,
  timeZone,
  textBoxes,
  setTextBoxes,
}: {
  dateTime: string;
  locationName: string;
  timeZone?: string;
  textBoxes: TextBox[];
  setTextBoxes: (boxes: TextBox[]) => void;
}) {
  const lastAppliedRef = useRef<SuggestedMomentText | null>(null);

  useEffect(() => {
    const nextSuggested = buildSuggestedMomentText(dateTime, locationName, timeZone);
    const previousSuggested = lastAppliedRef.current;
    let changed = false;

    const nextBoxes = textBoxes.map((box) => {
      if (box.id === "subtitle") {
        if (!shouldUpdateAutoText(box.text, DEFAULT_SUBTITLE_TEXT, previousSuggested?.subtitle)) {
          return box;
        }
        if (box.text === nextSuggested.subtitle) return box;
        changed = true;
        return { ...box, text: nextSuggested.subtitle };
      }

      if (box.id === "dedication") {
        if (!shouldUpdateAutoText(box.text, DEFAULT_DEDICATION_TEXT, previousSuggested?.dedication)) {
          return box;
        }
        if (box.text === nextSuggested.dedication) return box;
        changed = true;
        return { ...box, text: nextSuggested.dedication };
      }

      return box;
    });

    lastAppliedRef.current = nextSuggested;
    if (changed) {
      setTextBoxes(nextBoxes);
    }
  }, [dateTime, locationName, setTextBoxes, textBoxes, timeZone]);
}
