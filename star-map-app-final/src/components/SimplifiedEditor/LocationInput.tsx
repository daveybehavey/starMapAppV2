"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import tzLookup from "tz-lookup";
import { useStore } from "@/lib/store";
import { useShallow } from "zustand/react/shallow";

type GeocodeResult = {
  id: number;
  name: string;
  latitude: number;
  longitude: number;
};

type LocationInputProps = {
  disabled?: boolean;
  onLocationChange?: () => void;
  inputId?: string;
};

export function LocationInput({ disabled, onLocationChange, inputId }: LocationInputProps) {
  const { location, setLocation } = useStore(
    useShallow((state) => ({
      location: state.location,
      setLocation: state.setLocation,
    }))
  );
  const listId = useId();

  const [query, setQuery] = useState(location.name);
  const [results, setResults] = useState<GeocodeResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const optionRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const blurTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    setQuery(location.name);
  }, [location.name]);

  useEffect(() => {
    if (disabled) {
      setResults([]);
      setDropdownOpen(false);
      setErrorMessage(null);
      return;
    }
    if (query.trim().length < 3) {
      setResults([]);
      setDropdownOpen(false);
      if (!query.trim()) {
        setErrorMessage(null);
      }
      return;
    }

    setLoading(true);
    setErrorMessage(null);
    if (controllerRef.current) {
      controllerRef.current.abort();
    }
    const controller = new AbortController();
    controllerRef.current = controller;

    let mounted = true;
    let requestTimeout: number | null = null;
    let timedOut = false;
    const timer = setTimeout(async () => {
      try {
        requestTimeout = window.setTimeout(() => {
          timedOut = true;
          controller.abort();
        }, 30000);
        const res = await fetch(`/api/geocode?q=${encodeURIComponent(query)}`, {
          signal: controller.signal,
        });
        if (!res.ok) throw new Error("Search failed");
        const data = (await res.json()) as GeocodeResult[];
        if (!mounted) return;
        setResults(data);
        if (isFocused && data.length > 0) setDropdownOpen(true);
      } catch (err) {
        if ((err as Error).name === "AbortError") {
          if (timedOut && mounted) {
            setErrorMessage("Location search timed out. Please try again.");
          }
          return;
        }
        if (!mounted) return;
        setResults([]);
        setErrorMessage("Location search failed. Please try again.");
      } finally {
        if (requestTimeout) {
          window.clearTimeout(requestTimeout);
        }
        if (mounted) setLoading(false);
      }
    }, 250);

    return () => {
      mounted = false;
      clearTimeout(timer);
      if (requestTimeout) {
        window.clearTimeout(requestTimeout);
      }
      controller.abort();
    };
  }, [query, isFocused, disabled]);

  const applyLocation = useCallback(
    (result: GeocodeResult) => {
      const { latitude, longitude } = result;
      let timezone = location.timezone;
      try {
        timezone = tzLookup(latitude, longitude);
      } catch {
        timezone = location.timezone || "UTC";
      }
      setLocation({
        name: result.name,
        latitude,
        longitude,
        timezone,
      });
      setErrorMessage(null);
      onLocationChange?.();
      setDropdownOpen(false);
      setHighlightedIndex(-1);
    },
    [location.timezone, onLocationChange, setLocation]
  );

  useEffect(() => {
    setHighlightedIndex(-1);
  }, [results]);

  useEffect(() => {
    if (highlightedIndex >= 0 && optionRefs.current[highlightedIndex]) {
      optionRefs.current[highlightedIndex]?.scrollIntoView({
        block: "nearest",
        behavior: "smooth",
      });
    }
  }, [highlightedIndex]);

  const applyTypedLocation = useCallback(async () => {
    const trimmed = query.trim();
    if (trimmed.length < 3) {
      setErrorMessage("Enter at least 3 characters.");
      return;
    }

    if (results.length > 0) {
      applyLocation(results[0]);
      return;
    }

    try {
      setLoading(true);
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), 30000);
      const res = await fetch(`/api/geocode?q=${encodeURIComponent(trimmed)}`, {
        signal: controller.signal,
      });
      window.clearTimeout(timeout);
      if (!res.ok) {
        setErrorMessage("Location search failed. Please try again.");
        return;
      }
      const data = (await res.json()) as GeocodeResult[];
      if (data.length > 0) {
        applyLocation(data[0]);
      } else {
        setErrorMessage("No matches found. Try another name.");
      }
    } catch (err) {
      if ((err as Error).name === "AbortError") {
        setErrorMessage("Location search timed out. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  }, [query, results, applyLocation]);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (!dropdownOpen || results.length === 0) {
        if (event.key === "Enter") {
          event.preventDefault();
          void applyTypedLocation();
        }
        return;
      }

      switch (event.key) {
        case "ArrowDown":
          event.preventDefault();
          setHighlightedIndex((prev) =>
            prev < results.length - 1 ? prev + 1 : 0
          );
          break;
        case "ArrowUp":
          event.preventDefault();
          setHighlightedIndex((prev) =>
            prev > 0 ? prev - 1 : results.length - 1
          );
          break;
        case "Enter":
          event.preventDefault();
          if (highlightedIndex >= 0 && results[highlightedIndex]) {
            applyLocation(results[highlightedIndex]);
          } else if (results.length > 0) {
            applyLocation(results[0]);
          }
          break;
        case "Escape":
          event.preventDefault();
          setDropdownOpen(false);
          setHighlightedIndex(-1);
          break;
        case "Tab":
          setDropdownOpen(false);
          setHighlightedIndex(-1);
          break;
      }
    },
    [dropdownOpen, results, highlightedIndex, applyLocation, applyTypedLocation]
  );

  const hasResults = results.length > 0;

  useEffect(() => {
    return () => {
      if (blurTimeoutRef.current) {
        window.clearTimeout(blurTimeoutRef.current);
      }
    };
  }, []);

  return (
    <div className="relative">
      <input
        id={inputId}
        type="text"
        value={query}
        placeholder="Search for a city..."
        disabled={disabled}
        onChange={(e) => {
          setQuery(e.target.value);
          setDropdownOpen(true);
          setErrorMessage(null);
        }}
        onBlur={() => {
          setIsFocused(false);
          void applyTypedLocation();
          // Delay closing to allow click on dropdown
          if (blurTimeoutRef.current) {
            window.clearTimeout(blurTimeoutRef.current);
          }
          blurTimeoutRef.current = window.setTimeout(() => setDropdownOpen(false), 150);
        }}
        onKeyDown={handleKeyDown}
        onFocus={() => {
          setIsFocused(true);
          if (hasResults) setDropdownOpen(true);
        }}
        role="combobox"
        aria-haspopup="listbox"
        aria-autocomplete="list"
        aria-expanded={dropdownOpen}
        aria-controls={dropdownOpen ? listId : undefined}
        aria-activedescendant={
          highlightedIndex >= 0 ? `${listId}-option-${highlightedIndex}` : ""
        }
        aria-label="Location search"
        aria-invalid={Boolean(errorMessage)}
        aria-describedby={errorMessage ? `${listId}-error` : undefined}
        className="input-glow w-full rounded-lg border border-white/30 bg-white/10 px-3 py-3 text-base text-white placeholder:text-white/40 transition-all focus:border-amber-400/50 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
      />
      {errorMessage && (
        <p id={`${listId}-error`} className="mt-1 text-[10px] text-red-300">
          {errorMessage}
        </p>
      )}

      {loading && !disabled && (
        <div className="absolute inset-y-0 right-3 flex items-center">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/20 border-t-amber-400" />
        </div>
      )}

      {dropdownOpen && !disabled && (
        <div
          id={listId}
          role="listbox"
          className="absolute z-30 mt-1 max-h-48 w-full overflow-auto rounded-xl border border-white/20 bg-[#1a1f35] shadow-xl"
        >
          {!loading && !hasResults && (
            <div className="px-3 py-2 text-sm text-white/50">
              No matches found. Try another name.
            </div>
          )}
          {results.map((result, index) => {
            const isHighlighted = index === highlightedIndex;
            const isSelected = result.name === location.name;
            return (
              <button
                key={result.id}
                ref={(el) => {
                  optionRefs.current[index] = el;
                }}
                id={`${listId}-option-${index}`}
                type="button"
                onClick={() => applyLocation(result)}
                onMouseEnter={() => setHighlightedIndex(index)}
                role="option"
                aria-selected={isSelected}
                className={`block w-full px-3 py-2 text-left text-sm transition ${
                  isHighlighted
                    ? "bg-amber-400/20 text-white"
                    : isSelected
                      ? "bg-amber-400/10 text-white"
                      : "text-white/80 hover:bg-white/10"
                }`}
              >
                <div className="font-medium">{result.name}</div>
                <div className="text-xs text-white/50">
                  {result.latitude.toFixed(2)}°, {result.longitude.toFixed(2)}°
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default LocationInput;
