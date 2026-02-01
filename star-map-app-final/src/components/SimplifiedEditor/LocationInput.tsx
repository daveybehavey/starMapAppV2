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
};

export function LocationInput({ disabled, onLocationChange }: LocationInputProps) {
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
  const controllerRef = useRef<AbortController | null>(null);
  const optionRefs = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => {
    setQuery(location.name);
  }, [location.name]);

  useEffect(() => {
    if (disabled || query.trim().length < 3) {
      setResults([]);
      setDropdownOpen(false);
      return;
    }

    setLoading(true);
    if (controllerRef.current) {
      controllerRef.current.abort();
    }
    const controller = new AbortController();
    controllerRef.current = controller;

    let mounted = true;
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/geocode?q=${encodeURIComponent(query)}`, {
          signal: controller.signal,
        });
        if (!res.ok) throw new Error("Search failed");
        const data = (await res.json()) as GeocodeResult[];
        if (!mounted) return;
        setResults(data);
        if (isFocused && data.length > 0) setDropdownOpen(true);
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        if (!mounted) return;
        setResults([]);
      } finally {
        if (mounted) setLoading(false);
      }
    }, 250);

    return () => {
      mounted = false;
      clearTimeout(timer);
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
    if (trimmed.length < 3) return;

    if (results.length > 0) {
      applyLocation(results[0]);
      return;
    }

    try {
      setLoading(true);
      const res = await fetch(`/api/geocode?q=${encodeURIComponent(trimmed)}`);
      if (!res.ok) return;
      const data = (await res.json()) as GeocodeResult[];
      if (data.length > 0) {
        applyLocation(data[0]);
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

  return (
    <div className="relative">
      <input
        type="text"
        value={query}
        placeholder="Search for a city..."
        disabled={disabled}
        onChange={(e) => {
          setQuery(e.target.value);
          setDropdownOpen(true);
        }}
        onBlur={() => {
          setIsFocused(false);
          void applyTypedLocation();
          // Delay closing to allow click on dropdown
          setTimeout(() => setDropdownOpen(false), 150);
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
          highlightedIndex >= 0 ? `${listId}-option-${highlightedIndex}` : undefined
        }
        className="w-full rounded-lg border border-white/20 bg-white/10 px-3 py-2.5 text-sm text-white placeholder:text-white/40 focus:border-amber-400/50 focus:outline-none focus:ring-1 focus:ring-amber-400/30 disabled:cursor-not-allowed disabled:opacity-50"
      />

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
