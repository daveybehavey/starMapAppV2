"use client";

import { useEffect, useState } from "react";

import type { InputHTMLAttributes } from "react";
import type { ChangeEvent, FocusEvent, FormEvent } from "react";

type IOSSafeDateInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type">;
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const DATE_ERROR_MESSAGE = "Use a real date in YYYYMMDD, YYYY-MM-DD, or MM/DD/YYYY format.";

function detectIOS() {
  if (typeof navigator === "undefined" || typeof document === "undefined") return false;
  const ua = navigator.userAgent || "";
  const platform = navigator.platform || "";
  const maxTouchPoints = navigator.maxTouchPoints || 0;
  const iosUA = /iPad|iPhone|iPod/.test(ua);
  const ipadDesktopUA = /Macintosh|MacIntel/.test(platform || ua) && maxTouchPoints > 1;
  const iosWebkitShell = /AppleWebKit/i.test(ua) && /Mobile/i.test(ua) && !/Android/i.test(ua);
  return iosUA || ipadDesktopUA || iosWebkitShell;
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
  const trimmed = value.trim();
  if (!trimmed) return "";

  const yearFirst = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/.exec(trimmed);
  if (yearFirst) {
    const [, y, m, d] = yearFirst;
    const candidate = `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
    if (isValidIsoDate(candidate)) return candidate;
  }

  const monthFirst = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/.exec(trimmed);
  if (monthFirst) {
    const [, m, d, y] = monthFirst;
    const candidate = `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
    if (isValidIsoDate(candidate)) return candidate;
  }

  const digits = trimmed.replace(/\D/g, "").slice(0, 8);
  if (digits.length === 8) {
    const startYear = Number(digits.slice(0, 4));
    const endYear = Number(digits.slice(4, 8));
    if (startYear >= 1900 && startYear <= 2100) {
      return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`;
    }
    // Support MMDDYYYY typing on numeric-only keyboards (common on mobile/iOS).
    if (endYear >= 1900 && endYear <= 2100) {
      return `${digits.slice(4, 8)}-${digits.slice(0, 2)}-${digits.slice(2, 4)}`;
    }
  }
  if (digits.length <= 4) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 4)}-${digits.slice(4)}`;
  return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6)}`;
}

export default function IOSSafeDateInput(props: IOSSafeDateInputProps) {
  const {
    onChange,
    onBlur,
    value: valueProp,
    defaultValue,
    ...inputProps
  } = props;
  const initialTextValue =
    typeof valueProp === "string"
      ? valueProp
      : (typeof defaultValue === "string" ? defaultValue : "");

  const [useTextFallback] = useState(() => detectIOS());
  const [textValue, setTextValue] = useState(initialTextValue);
  const [isInvalid, setIsInvalid] = useState(false);

  useEffect(() => {
    if (useTextFallback && typeof valueProp === "string") {
      setTextValue(valueProp);
    }
  }, [useTextFallback, valueProp]);

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    if (useTextFallback) {
      const normalized = normalizeIsoDateInput(event.currentTarget.value.trim());
      setTextValue(normalized);
      if (event.currentTarget.value !== normalized) {
        event.currentTarget.value = normalized;
      }
      const shouldValidate = normalized.length === 10;
      const valid = shouldValidate ? isValidIsoDate(normalized) : true;
      event.currentTarget.setCustomValidity(valid ? "" : DATE_ERROR_MESSAGE);
      setIsInvalid(!valid);
    }
    onChange?.(event);
  };

  const handleInput = (event: FormEvent<HTMLInputElement>) => {
    if (!useTextFallback) return;
    const target = event.currentTarget;
    const normalized = normalizeIsoDateInput(target.value.trim());
    if (target.value !== normalized) {
      target.value = normalized;
    }
    setTextValue(normalized);
    const shouldValidate = normalized.length === 10;
    const valid = shouldValidate ? isValidIsoDate(normalized) : true;
    target.setCustomValidity(valid ? "" : DATE_ERROR_MESSAGE);
    setIsInvalid(!valid);
  };

  const handleBlur = (event: FocusEvent<HTMLInputElement>) => {
    if (useTextFallback) {
      const normalized = normalizeIsoDateInput(event.currentTarget.value.trim());
      setTextValue(normalized);
      event.currentTarget.value = normalized;
      const valid = !normalized || isValidIsoDate(normalized);
      event.currentTarget.setCustomValidity(valid ? "" : DATE_ERROR_MESSAGE);
      setIsInvalid(!valid);
    }
    onBlur?.(event);
  };

  if (useTextFallback) {
    return (
      <input
        {...inputProps}
        type="text"
        value={textValue}
        inputMode="numeric"
        autoCapitalize="off"
        autoCorrect="off"
        autoComplete={inputProps.autoComplete ?? "off"}
        maxLength={10}
        pattern={undefined}
        placeholder={inputProps.placeholder ?? "YYYY-MM-DD"}
        aria-invalid={isInvalid ? "true" : inputProps["aria-invalid"]}
        onInput={handleInput}
        onChange={handleChange}
        onBlur={handleBlur}
      />
    );
  }

  return (
    <input
      {...inputProps}
      type="date"
      value={valueProp}
      defaultValue={valueProp === undefined ? defaultValue : undefined}
      onChange={handleChange}
      onBlur={handleBlur}
    />
  );
}
