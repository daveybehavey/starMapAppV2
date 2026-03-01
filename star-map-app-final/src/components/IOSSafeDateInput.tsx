"use client";

import { useEffect, useState } from "react";

import type { InputHTMLAttributes } from "react";

type IOSSafeDateInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type">;

function detectIOS() {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  const platform = navigator.platform || "";
  const maxTouchPoints = navigator.maxTouchPoints || 0;
  return /iPad|iPhone|iPod/.test(ua) || (platform === "MacIntel" && maxTouchPoints > 1);
}

export default function IOSSafeDateInput(props: IOSSafeDateInputProps) {
  const [useTextFallback, setUseTextFallback] = useState(false);

  useEffect(() => {
    setUseTextFallback(detectIOS());
  }, []);

  if (useTextFallback) {
    return (
      <input
        {...props}
        type="text"
        inputMode="numeric"
        placeholder={props.placeholder ?? "YYYY-MM-DD"}
        pattern="\\d{4}-\\d{2}-\\d{2}"
        title="Use YYYY-MM-DD format"
      />
    );
  }

  return <input {...props} type="date" />;
}
