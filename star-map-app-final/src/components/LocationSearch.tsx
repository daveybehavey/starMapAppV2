"use client";

import { useEffect, useId, useRef, useState } from "react";
import tzLookup from "tz-lookup";
import { useStore } from "@/lib/store";
import { useShallow } from "zustand/react/shallow";

type GeocodeResult = {
  id: number;
  name: string;
  latitude: number;
  longitude: number;
  category?: string;
  type?: string;
};

const cache = new Map<string, GeocodeResult[]>();

export default function LocationSearch() {
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
  const [showExact, setShowExact] = useState(false);
  const controllerRef = useRef<AbortController | null>(null);

  const [manualLat, setManualLat] = useState(location.latitude.toString());
  const [manualLon, setManualLon] = useState(location.longitude.toString());

  useEffect(() => {
    setQuery(location.name);
    setManualLat(location.latitude.toString());
    setManualLon(location.longitude.toString());
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
      setDropdownOpen(true);
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

    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/geocode?q=${encodeURIComponent(query)}`, {
          signal: controller.signal,
        });
        if (!res.ok) {
          throw new Error("Search failed");
        }
        const data = (await res.json()) as GeocodeResult[];
        cache.set(key, data);
        setResults(data);
        setDropdownOpen(true);
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        setError("Could not search that place. Try again.");
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 250);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  const applyLocation = (result: GeocodeResult) => {
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
    setDropdownOpen(false);
  };

  const applyTypedLocation = async () => {
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
  };

  const handleManualLat = (value: string) => {
    const num = Number.parseFloat(value);
    if (!Number.isFinite(num)) return;
    const timezone = safeLookupTz(num, location.longitude, location.timezone);
    setLocation({ latitude: num, timezone });
  };

  const handleManualLon = (value: string) => {
    const num = Number.parseFloat(value);
    if (!Number.isFinite(num)) return;
    const timezone = safeLookupTz(location.latitude, num, location.timezone);
    setLocation({ longitude: num, timezone });
  };

  const hasResults = results.length > 0;

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
            // If the user clicks away without selecting, still apply the typed location.
            void applyTypedLocation();
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              applyTypedLocation();
            }
          }}
          onFocus={() => hasResults && setDropdownOpen(true)}
          role="combobox"
          aria-haspopup="listbox"
          className="mt-1 w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-sm shadow-inner shadow-black/5 outline-none transition focus:border-gold focus:ring-2 focus:ring-gold/30"
          aria-autocomplete="list"
          aria-expanded={dropdownOpen}
          aria-controls={dropdownOpen ? listId : undefined}
        />
        {loading && (
          <div className="absolute inset-y-0 right-3 flex items-center text-[11px] uppercase tracking-wide text-neutral-500">
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
              <div className="px-3 py-2 text-sm text-neutral-500">No results yet.</div>
            )}
            {!error &&
              results.map((result) => (
                <button
                  key={result.id}
                  type="button"
                  onClick={() => applyLocation(result)}
                  role="option"
                  aria-selected={result.name === location.name}
                  className="block w-full px-3 py-2 text-left text-sm text-neutral-800 transition hover:bg-amber-50"
                >
                  <div className="font-semibold">{result.name}</div>
                  <div className="text-xs text-neutral-500">
                    {result.latitude.toFixed(4)}, {result.longitude.toFixed(4)}
                  </div>
                </button>
              ))}
          </div>
        )}
      </div>

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
                onChange={(e) => setManualLat(e.target.value)}
                onBlur={(e) => handleManualLat(e.target.value)}
                className="mt-1 w-full rounded-md border border-black/10 bg-white px-3 py-2 text-sm shadow-inner shadow-black/5 outline-none transition focus:border-gold focus:ring-2 focus:ring-gold/30"
              />
            </div>
            <div>
              <label className="text-xs font-semibold uppercase tracking-wide text-neutral-600">
                Longitude
              </label>
              <input
                type="number"
                step="0.0001"
                value={manualLon}
                onChange={(e) => setManualLon(e.target.value)}
                onBlur={(e) => handleManualLon(e.target.value)}
                className="mt-1 w-full rounded-md border border-black/10 bg-white px-3 py-2 text-sm shadow-inner shadow-black/5 outline-none transition focus:border-gold focus:ring-2 focus:ring-gold/30"
              />
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
