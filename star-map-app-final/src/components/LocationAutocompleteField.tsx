"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import {
  fetchGeocodeSuggestions,
  inferTimezoneFromCoordinates,
  type GeocodeSuggestion,
} from "@/lib/locationSearch";

type LocationAutocompleteFieldProps = {
  id: string;
  name?: string;
  disabled?: boolean;
  placeholder?: string;
  autoComplete?: string;
  className?: string;
};

export default function LocationAutocompleteField({
  id,
  name = "location",
  disabled = false,
  placeholder = "City or address",
  autoComplete = "address-level2",
  className,
}: LocationAutocompleteFieldProps) {
  const listId = useId();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GeocodeSuggestion[]>([]);
  const [selected, setSelected] = useState<GeocodeSuggestion | null>(null);
  const [loading, setLoading] = useState(false);
  const controllerRef = useRef<AbortController | null>(null);

  const applySelection = useCallback((result: GeocodeSuggestion | null) => {
    setSelected(result);
    if (result) {
      setQuery(result.name);
    }
  }, []);

  useEffect(() => {
    if (disabled) {
      setResults([]);
      setSelected(null);
      return;
    }

    const trimmed = query.trim();
    if (trimmed.length < 3) {
      setResults([]);
      return;
    }

    if (controllerRef.current) {
      controllerRef.current.abort();
    }

    const controller = new AbortController();
    controllerRef.current = controller;
    const timer = window.setTimeout(async () => {
      try {
        setLoading(true);
        const nextResults = await fetchGeocodeSuggestions(trimmed, controller.signal);
        setResults(nextResults);
      } catch (error) {
        if ((error as Error).name !== "AbortError") {
          setResults([]);
        }
      } finally {
        setLoading(false);
      }
    }, 220);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [disabled, query]);

  const selectExactMatch = useCallback(() => {
    const trimmed = query.trim().toLowerCase();
    if (!trimmed) return;
    const exact = results.find((result) => result.name.toLowerCase() === trimmed);
    if (exact) {
      applySelection(exact);
    }
  }, [applySelection, query, results]);

  const timezone = selected
    ? inferTimezoneFromCoordinates(selected.latitude, selected.longitude)
    : "";

  return (
    <div className="relative min-w-0">
      <input
        id={id}
        name={name}
        type="text"
        value={query}
        list={listId}
        disabled={disabled}
        placeholder={placeholder}
        autoComplete={autoComplete}
        onChange={(event) => {
          const nextValue = event.target.value;
          setQuery(nextValue);
          if (!selected || selected.name !== nextValue) {
            setSelected(null);
          }
        }}
        onBlur={selectExactMatch}
        className={className}
      />
      <datalist id={listId}>
        {results.map((result) => (
          <option key={result.id} value={result.name} />
        ))}
      </datalist>
      <input type="hidden" name="latitude" value={selected ? String(selected.latitude) : ""} />
      <input type="hidden" name="longitude" value={selected ? String(selected.longitude) : ""} />
      <input type="hidden" name="timezone" value={timezone} />
      {loading && !disabled ? (
        <div className="pointer-events-none absolute inset-y-0 right-3 flex items-center">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/20 border-t-amber-400" />
        </div>
      ) : null}
    </div>
  );
}
