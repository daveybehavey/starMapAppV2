"use client";

import { useEffect, useId, useRef, useState, useCallback } from "react";
import tzLookup from "tz-lookup";
import { useStore } from "@/lib/store";
import { useShallow } from "zustand/react/shallow";
import { LRUCache } from "@/lib/lruCache";

type GeocodeResult = {
  id: number;
  name: string;
  latitude: number;
  longitude: number;
  category?: string;
  type?: string;
  countryCode?: string;
  state?: string;
};

const cache = new LRUCache<string, GeocodeResult[]>(50);

type LocationSearchProps = {
  onLocationChange?: () => void;
};

export default function LocationSearch({ onLocationChange }: LocationSearchProps) {
  const { location, setLocation } = useStore(
    useShallow((state) => ({
      location: state.location,
      setLocation: state.setLocation,
    })),
  );
  const listId = useId();

  const [query, setQuery] = useState(location.name);
  const [results, setResults] = useState<GeocodeResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const [showExact, setShowExact] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const controllerRef = useRef<AbortController | null>(null);
  const optionRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const [manualLat, setManualLat] = useState(location.latitude.toString());
  const [manualLon, setManualLon] = useState(location.longitude.toString());
  const [latError, setLatError] = useState<string | null>(null);
  const [lonError, setLonError] = useState<string | null>(null);

  useEffect(() => {
    setQuery(location.name);
    setManualLat(location.latitude.toString());
    setManualLon(location.longitude.toString());
    setLatError(null);
    setLonError(null);
  }, [location.latitude, location.longitude, location.name]);

  useEffect(() => {
    if (query.trim().length < 3) {
      setResults([]);
      setDropdownOpen(false);
      setError(null);
      return;
    }

    const key = query.trim().toLowerCase();
    const cached = cache.get(key);
    if (cached) {
      setResults(cached);
      if (isFocused) setDropdownOpen(true);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);
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
        if (!res.ok) {
          throw new Error("Search failed");
        }
        const data = (await res.json()) as GeocodeResult[];
        if (!mounted) return;
        // Store in cache (LRU eviction handled automatically)
        cache.set(key, data);
        setResults(data);
        if (isFocused) setDropdownOpen(true);
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        if (!mounted) return;
        setError("Could not search that place. Try again.");
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
  }, [query, isFocused]);

  const applyLocation = useCallback((result: GeocodeResult) => {
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
  }, [location.timezone, onLocationChange, setLocation]);

  // Reset highlighted index when results change
  useEffect(() => {
    setHighlightedIndex(-1);
  }, [results]);

  // Scroll highlighted option into view
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
        cache.set(trimmed.toLowerCase(), data);
        applyLocation(data[0]);
      }
    } finally {
      setLoading(false);
    }
  }, [query, results, applyLocation]);

  const handleKeyDown = useCallback((event: React.KeyboardEvent<HTMLInputElement>) => {
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
  }, [dropdownOpen, results, highlightedIndex, applyLocation, applyTypedLocation]);

  const handleManualLat = (value: string) => {
    const num = Number.parseFloat(value);
    // Validate latitude bounds: -90 to 90
    if (!Number.isFinite(num) || num < -90 || num > 90) {
      setLatError("Latitude must be between -90 and 90.");
      return;
    }
    setLatError(null);
    const timezone = safeLookupTz(num, location.longitude, location.timezone);
    setLocation({ latitude: num, timezone });
    onLocationChange?.();
  };

  const handleManualLon = (value: string) => {
    const num = Number.parseFloat(value);
    // Validate longitude bounds: -180 to 180
    if (!Number.isFinite(num) || num < -180 || num > 180) {
      setLonError("Longitude must be between -180 and 180.");
      return;
    }
    setLonError(null);
    const timezone = safeLookupTz(location.latitude, num, location.timezone);
    setLocation({ longitude: num, timezone });
    onLocationChange?.();
  };

  const hasResults = results.length > 0;
  const isDefaultLocation =
    !location.name?.trim() && location.latitude === 0 && location.longitude === 0;

  return (
    <div className="space-y-2">
      <label className="text-sm font-medium text-neutral-800">Location</label>
      <div className="relative">
        <input
          type="text"
          value={query}
          placeholder="Search city, landmark, or address"
          onChange={(e) => {
            setQuery(e.target.value);
            setDropdownOpen(true);
          }}
          onBlur={() => {
            setIsFocused(false);
            // If the user clicks away without selecting, still apply the typed location.
            void applyTypedLocation();
            setDropdownOpen(false);
            setHighlightedIndex(-1);
          }}
          onKeyDown={handleKeyDown}
          onFocus={() => {
            setIsFocused(true);
            if (hasResults) setDropdownOpen(true);
          }}
          role="combobox"
          aria-haspopup="listbox"
          className="mt-1 w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-sm shadow-inner shadow-black/5 outline-none transition focus:border-amber-400 focus:ring-2 focus:ring-amber-400/30"
          aria-autocomplete="list"
          aria-expanded={dropdownOpen}
          aria-controls={dropdownOpen ? listId : undefined}
          aria-activedescendant={highlightedIndex >= 0 ? `${listId}-option-${highlightedIndex}` : undefined}
        />
        {loading && (
          <div className="absolute inset-y-0 right-3 flex items-center text-xs uppercase tracking-wide text-neutral-600">
            Searching…
          </div>
        )}

        {dropdownOpen && (
          <div
            id={listId}
            role="listbox"
            className="absolute z-20 mt-1 w-full overflow-hidden rounded-xl border border-black/10 bg-white shadow-lg shadow-black/10"
          >
            {error && (
              <div className="px-3 py-2 text-sm text-rose-600">
                {error} Use manual coordinates below.
              </div>
            )}
            {!error && !loading && !hasResults && (
              <div className="px-3 py-2 text-sm text-neutral-500">
                No matches found. Try another name or enter exact coordinates.
              </div>
            )}
            {!error &&
              results.map((result, index) => {
                const isHighlighted = index === highlightedIndex;
                const isSelected = result.name === location.name;
                return (
                  <button
                    key={result.id}
                    ref={(el) => { optionRefs.current[index] = el; }}
                    id={`${listId}-option-${index}`}
                    type="button"
                    onClick={() => applyLocation(result)}
                    onMouseEnter={() => setHighlightedIndex(index)}
                    role="option"
                    aria-selected={isSelected}
                    className={`block w-full px-3 py-2 text-left text-sm transition ${
                      isHighlighted
                        ? "bg-amber-100 text-neutral-900"
                        : isSelected
                        ? "bg-amber-50 text-neutral-800"
                        : "text-neutral-800 hover:bg-amber-50"
                    }`}
                  >
                    <div className="font-semibold">{result.name}</div>
                    <div className="text-xs text-neutral-500">
                      {result.latitude.toFixed(4)}, {result.longitude.toFixed(4)}
                    </div>
                  </button>
                );
              })}
          </div>
        )}
      </div>

      {isDefaultLocation && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          Using default coordinates (0, 0). Search for a city to get accurate stars.
        </div>
      )}

      <div className="flex items-center gap-2 text-xs text-neutral-500">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
        Timezone: <span className="font-semibold text-neutral-700">{location.timezone}</span>
      </div>

      <div className="space-y-2">
        <button
          type="button"
          onClick={() => setShowExact((prev) => !prev)}
          className="inline-flex items-center gap-2 rounded-full border border-black/10 bg-white px-3 py-2 text-xs font-semibold uppercase tracking-wide text-neutral-700 shadow-sm transition hover:-translate-y-[1px] hover:shadow"
          aria-pressed={showExact}
        >
          {showExact ? "Hide exact location" : "Exact location"}
        </button>
        {showExact && (
          <div className="grid grid-cols-2 gap-3 rounded-lg border border-dashed border-black/10 bg-neutral-50/70 p-3">
            <div>
              <label className="text-xs font-semibold uppercase tracking-wide text-neutral-600">
                Latitude
              </label>
              <input
                type="number"
                step="0.0001"
                value={manualLat}
                onChange={(e) => {
                  setManualLat(e.target.value);
                  setLatError(null);
                }}
                onBlur={(e) => handleManualLat(e.target.value)}
                className={`mt-1 w-full rounded-md border px-3 py-2 text-sm shadow-inner shadow-black/5 outline-none transition focus:border-amber-400 focus:ring-2 focus:ring-amber-400/30 ${
                  latError
                    ? "border-rose-300 bg-rose-50/70 text-rose-900"
                    : "border-black/10 bg-white"
                }`}
              />
              {latError && <div className="mt-1 text-xs text-rose-600 font-medium">{latError}</div>}
            </div>
            <div>
              <label className="text-xs font-semibold uppercase tracking-wide text-neutral-600">
                Longitude
              </label>
              <input
                type="number"
                step="0.0001"
                value={manualLon}
                onChange={(e) => {
                  setManualLon(e.target.value);
                  setLonError(null);
                }}
                onBlur={(e) => handleManualLon(e.target.value)}
                className={`mt-1 w-full rounded-md border px-3 py-2 text-sm shadow-inner shadow-black/5 outline-none transition focus:border-amber-400 focus:ring-2 focus:ring-amber-400/30 ${
                  lonError
                    ? "border-rose-300 bg-rose-50/70 text-rose-900"
                    : "border-black/10 bg-white"
                }`}
              />
              {lonError && <div className="mt-1 text-xs text-rose-600 font-medium">{lonError}</div>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function safeLookupTz(lat: number, lon: number, fallback: string) {
  try {
    return tzLookup(lat, lon);
  } catch {
    return fallback || "UTC";
  }
}
