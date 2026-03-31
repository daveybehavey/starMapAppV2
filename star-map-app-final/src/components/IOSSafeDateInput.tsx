"use client";

import { useEffect, useState } from "react";

import type { InputHTMLAttributes } from "react";
import type { ChangeEvent, FocusEvent, FormEvent } from "react";
import {
  DATE_INPUT_ERROR_MESSAGE,
  detectIOSDateInputFallback,
  getDateInputPlaceholder,
  isValidIsoDateInput,
  normalizeFlexibleDateInput,
} from "@/lib/dateInput";

type IOSSafeDateInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type">;

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

  const [useTextFallback, setUseTextFallback] = useState(false);
  const [textValue, setTextValue] = useState(initialTextValue);
  const [isInvalid, setIsInvalid] = useState(false);

  useEffect(() => {
    setUseTextFallback(detectIOSDateInputFallback());
  }, []);

  useEffect(() => {
    if (useTextFallback && typeof valueProp === "string") {
      setTextValue(valueProp);
    }
  }, [useTextFallback, valueProp]);

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    if (useTextFallback) {
      const normalized = normalizeFlexibleDateInput(event.currentTarget.value.trim());
      setTextValue(normalized);
      if (event.currentTarget.value !== normalized) {
        event.currentTarget.value = normalized;
      }
      const shouldValidate = normalized.length === 10;
      const valid = shouldValidate ? isValidIsoDateInput(normalized) : true;
      event.currentTarget.setCustomValidity(valid ? "" : DATE_INPUT_ERROR_MESSAGE);
      setIsInvalid(!valid);
    }
    onChange?.(event);
  };

  const handleInput = (event: FormEvent<HTMLInputElement>) => {
    if (!useTextFallback) return;
    const target = event.currentTarget;
    const normalized = normalizeFlexibleDateInput(target.value.trim());
    if (target.value !== normalized) {
      target.value = normalized;
    }
    setTextValue(normalized);
    const shouldValidate = normalized.length === 10;
    const valid = shouldValidate ? isValidIsoDateInput(normalized) : true;
    target.setCustomValidity(valid ? "" : DATE_INPUT_ERROR_MESSAGE);
    setIsInvalid(!valid);
  };

  const handleBlur = (event: FocusEvent<HTMLInputElement>) => {
    if (useTextFallback) {
      const normalized = normalizeFlexibleDateInput(event.currentTarget.value.trim());
      setTextValue(normalized);
      event.currentTarget.value = normalized;
      const valid = !normalized || isValidIsoDateInput(normalized);
      event.currentTarget.setCustomValidity(valid ? "" : DATE_INPUT_ERROR_MESSAGE);
      setIsInvalid(!valid);
    }
    onBlur?.(event);
  };

  if (useTextFallback) {
    const valueProps =
      typeof valueProp === "string" ? { value: textValue } : { defaultValue: textValue };
    return (
      <input
        {...inputProps}
        type="text"
        {...valueProps}
        inputMode="numeric"
        autoCapitalize="off"
        autoCorrect="off"
        autoComplete={inputProps.autoComplete ?? "off"}
        maxLength={10}
        pattern={undefined}
        placeholder={getDateInputPlaceholder(inputProps.placeholder, true)}
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
