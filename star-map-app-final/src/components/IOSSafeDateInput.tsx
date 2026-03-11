"use client";

import { useEffect, useState } from "react";

import type { InputHTMLAttributes } from "react";
import type { ChangeEvent, FocusEvent } from "react";

type IOSSafeDateInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type">;
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function detectIOS() {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  const platform = navigator.platform || "";
  const maxTouchPoints = navigator.maxTouchPoints || 0;
  return /iPad|iPhone|iPod/.test(ua) || (platform === "MacIntel" && maxTouchPoints > 1);
}

function isValidIsoDate(value: string) {
  if (!value) return true;
  if (!ISO_DATE_PATTERN.test(value)) return false;
  const [yearStr, monthStr, dayStr] = value.split("-");
  const year = Number(yearStr);
  const month = Number(monthStr);
  const day = Number(dayStr);
  if (!year || !month || !day) return false;
  const parsed = new Date(year, month - 1, day, 12, 0, 0, 0);
  return parsed.getFullYear() === year && parsed.getMonth() === month - 1 && parsed.getDate() === day;
}

function normalizeIsoDateInput(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 8);
  if (digits.length <= 4) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 4)}-${digits.slice(4)}`;
  return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6)}`;
}

export default function IOSSafeDateInput(props: IOSSafeDateInputProps) {
  // Start with text mode on first paint so iOS never flashes native date UI before detection.
  const [useTextFallback, setUseTextFallback] = useState(true);
  const [isInvalid, setIsInvalid] = useState(false);

  useEffect(() => {
    setUseTextFallback(detectIOS());
  }, []);

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    if (useTextFallback) {
      const normalized = normalizeIsoDateInput(event.currentTarget.value.trim());
      if (event.currentTarget.value !== normalized) {
        event.currentTarget.value = normalized;
      }
      const shouldValidate = normalized.length === 10;
      const valid = shouldValidate ? isValidIsoDate(normalized) : true;
      event.currentTarget.setCustomValidity(valid ? "" : "Use a real date in YYYY-MM-DD format.");
      setIsInvalid(!valid);
    }
    props.onChange?.(event);
  };

  const handleBlur = (event: FocusEvent<HTMLInputElement>) => {
    if (useTextFallback) {
      const normalized = normalizeIsoDateInput(event.currentTarget.value.trim());
      event.currentTarget.value = normalized;
      const valid = isValidIsoDate(normalized);
      event.currentTarget.setCustomValidity(valid ? "" : "Use a real date in YYYY-MM-DD format.");
      setIsInvalid(!valid);
    }
    props.onBlur?.(event);
  };

  if (useTextFallback) {
    return (
      <input
        {...props}
        type="text"
        inputMode="numeric"
        placeholder={props.placeholder ?? "YYYY-MM-DD"}
        pattern={ISO_DATE_PATTERN.source}
        title="Use YYYY-MM-DD format"
        aria-invalid={isInvalid ? "true" : props["aria-invalid"]}
        onChange={handleChange}
        onBlur={handleBlur}
      />
    );
  }

  return <input {...props} type="date" onChange={handleChange} onBlur={handleBlur} />;
}
