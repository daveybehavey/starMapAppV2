"use client";

import { useState } from "react";
import { clampTextBoxSize } from "@/lib/textBoxConstraints";

type TextBoxSizeInputProps = {
  id: string;
  /** Text-box label, used for the accessible name ("<label> size"). */
  label: string;
  value: number;
  onCommit: (size: number) => void;
  className?: string;
};

/**
 * Numeric text-size input (audit #516 E1, gate fix on PR #530).
 *
 * The typed string is held as a local draft while editing: partial entries
 * ("2" on the way to "24", or a cleared field) are never written to the
 * design. Values already inside the 10–64 range commit live so the slider
 * and preview stay in sync; anything else clamps via clampTextBoxSize on
 * blur/Enter. Clamping on every keystroke instead would write 10 back into
 * the controlled input on the first keystroke and make valid two-digit
 * sizes untypable.
 */
export function TextBoxSizeInput({ id, label, value, onCommit, className }: TextBoxSizeInputProps) {
  const [draft, setDraft] = useState<string | null>(null);

  const commitDraft = () => {
    if (draft === null) return;
    const parsed = Number(draft);
    setDraft(null);
    if (draft.trim() !== "" && Number.isFinite(parsed)) {
      onCommit(clampTextBoxSize(parsed));
    }
  };

  return (
    <input
      id={id}
      aria-label={`${label} size`}
      type="number"
      min={10}
      max={64}
      value={draft ?? String(value)}
      onFocus={() => setDraft(String(value))}
      onChange={(e) => {
        const next = e.target.value;
        setDraft(next);
        const parsed = Number(next);
        if (next.trim() !== "" && Number.isFinite(parsed) && parsed >= 10 && parsed <= 64) {
          onCommit(parsed);
        }
      }}
      onBlur={commitDraft}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          (e.target as HTMLInputElement).blur();
        }
      }}
      className={className}
    />
  );
}
