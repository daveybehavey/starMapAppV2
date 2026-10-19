"use client";

import { useEffect, useId, useMemo, useRef, useState, useCallback } from "react";
import { fetchGeocodeResults, getCachedGeocodeResults, type GeocodeResult } from "@/lib/geocodeSearch";
import type { PickedPreviewLocation } from "@/lib/previewStartLocation";

type LocationTypeaheadProps = {
  id: string;
  /** Form field name — the value submitted as `location`. */
  name: string;
  value: string;
  onValueChange: (value: string) => void;
  /** Fired when the visitor picks a suggestion (a coordinate-resolved place). */
  onPick: (picked: PickedPreviewLocation) => void;
  placeholder?: string;
  autoComplete?: string;
  className?: string;
  /** Name of the currently picked place, when the text still matches it. */
  selectedName?: string;
};

/**
 * Search-as-you-type location field for the quick-start forms, sharing the
 * editor LocationSearch's geocode endpoint, cache, debounce, and keyboard
 * model (see lib/geocodeSearch). Picking a suggestion resolves the place
 * (name + coordinates + timezone); typing free text keeps the form's
 * historical name-only submission.
 *
 * Form-context differences from the editor field: Enter only intercepts
 * when a suggestion can be picked (otherwise the native form submit the
 * visitor expects still happens), and suggestions are picked on mousedown
 * so the input's blur cannot close the list before the pick registers.
 */
export default function LocationTypeahead({
  id,
  name,
  value,
  onValueChange,
  onPick,
  placeholder,
  autoComplete,
  className,
  selectedName,
}: LocationTypeaheadProps) {
  const listId = useId();
  const [results, setResults] = useState<GeocodeResult[]>([]);
  // The exact text `results` was loaded for. Results count as current
  // only while this still equals the field's text (see currentResults
  // below): editing the text invalidates the previous query's list the
  // moment it changes, not whenever the next fetch happens to land.
  const [resultsQuery, setResultsQuery] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const controllerRef = useRef<AbortController | null>(null);
  const optionRefs = useRef<(HTMLButtonElement | null)[]>([]);
  // The exact text of the most recent pick. While the field still holds
  // it, searches stay suppressed (see the effect below); any manual edit
  // clears it (see the input's onChange).
  const suppressedValueRef = useRef<string | null>(null);

  useEffect(() => {
    // A just-picked value re-enters this effect as `value`, and the
    // cache-hit and fetch-success paths below would reopen the dropdown
    // while the input is still focused — Enter would then pick another
    // suggestion instead of submitting the form. A picked place stays
    // picked: keep the list closed and empty until the visitor edits.
    if (suppressedValueRef.current !== null && value === suppressedValueRef.current) {
      setResults([]);
      setResultsQuery(null);
      setDropdownOpen(false);
      setError(null);
      setLoading(false);
      return;
    }

    if (value.trim().length < 3) {
      setResults([]);
      setResultsQuery(null);
      setDropdownOpen(false);
      setError(null);
      return;
    }

    const cached = getCachedGeocodeResults(value);
    if (cached) {
      setResults(cached);
      setResultsQuery(value);
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
        const data = await fetchGeocodeResults(value, controller.signal);
        if (!mounted) return;
        setResults(data);
        setResultsQuery(value);
        if (isFocused) setDropdownOpen(true);
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        if (!mounted) return;
        setError("Could not search that place. Try again.");
        setResults([]);
        setResultsQuery(value);
      } finally {
        if (mounted) setLoading(false);
      }
    }, 250);

    return () => {
      mounted = false;
      clearTimeout(timer);
      controller.abort();
    };
  }, [value, isFocused]);

  // Only the results loaded for the text currently in the field may be
  // rendered or picked. While an edit is still debouncing or fetching,
  // the previous query's results remain in state but are stale: Enter
  // must fall through to the native submit (name-only, exactly like
  // free text) instead of picking a place for text no longer typed.
  const currentResults = useMemo(
    () => (resultsQuery === value ? results : []),
    [resultsQuery, value, results]
  );

  // Reset highlighted index when the current results change
  useEffect(() => {
    setHighlightedIndex(-1);
  }, [currentResults]);

  // Scroll highlighted option into view
  useEffect(() => {
    if (highlightedIndex >= 0 && optionRefs.current[highlightedIndex]) {
      optionRefs.current[highlightedIndex]?.scrollIntoView({
        block: "nearest",
        behavior: "smooth",
      });
    }
  }, [highlightedIndex]);

  const pickResult = useCallback(
    (result: GeocodeResult) => {
      // Close the list for good (until the next manual edit): the picked
      // name must not reopen the suggestions it was picked from.
      suppressedValueRef.current = result.name;
      setResults([]);
      setResultsQuery(null);
      setDropdownOpen(false);
      setHighlightedIndex(-1);
      setLoading(false);
      // Resolve the timezone lazily — tz-lookup is a large dataset and
      // this field also renders in the homepage hero, whose bundle is
      // kept lean on purpose — and publish the pick only once it has
      // resolved: the name and its coordinates land together, atomically.
      // Publishing the name first (the previous shape) opened a window
      // where a fast submit sent the picked name while the hidden
      // lat/lon/tz fields still reflected the previous pick (or none).
      // The import-failure path funnels into the same publish with the
      // UTC fallback, so it is atomic too.
      void import("@/lib/geocodeTimezone")
        .then(({ lookupGeocodeTimezone }) => lookupGeocodeTimezone(result.latitude, result.longitude, "UTC"))
        .catch(() => "UTC")
        .then((timezone) => {
          // The visitor kept typing while the lookup resolved: their
          // edit already cleared the suppression, so this pick no longer
          // applies — never clobber the newer text with it.
          if (suppressedValueRef.current !== result.name) return;
          onValueChange(result.name);
          onPick({
            name: result.name,
            latitude: result.latitude,
            longitude: result.longitude,
            timezone,
          });
        });
    },
    [onPick, onValueChange]
  );

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (!dropdownOpen || currentResults.length === 0) {
        // No current suggestion to pick (including while a new query's
        // search is still in flight): leave the event alone so Enter
        // submits the form, exactly like the previous plain text field.
        return;
      }

      switch (event.key) {
        case "ArrowDown":
          event.preventDefault();
          setHighlightedIndex((prev) => (prev < currentResults.length - 1 ? prev + 1 : 0));
          break;
        case "ArrowUp":
          event.preventDefault();
          setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : currentResults.length - 1));
          break;
        case "Enter":
          event.preventDefault();
          pickResult(currentResults[highlightedIndex >= 0 ? highlightedIndex : 0]);
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
    [dropdownOpen, currentResults, highlightedIndex, pickResult]
  );

  const hasResults = currentResults.length > 0;
  // "No matches" may only report on a search that has completed for the
  // text currently in the field. During a new query's debounce/fetch
  // window the tag still names the previous query, so no stale verdict
  // flashes for text whose search has not finished yet.
  const showNoMatches = !error && !loading && !hasResults && resultsQuery === value;

  return (
    <div className="relative">
      <input
        id={id}
        name={name}
        type="text"
        value={value}
        placeholder={placeholder}
        autoComplete={autoComplete}
        onChange={(event) => {
          const nextValue = event.currentTarget.value;
          // Any manual edit ends the post-pick suppression: the visitor
          // is searching again, so suggestions may reopen for the new
          // text. (A pick also flows through onValueChange, but not
          // through onChange, so it never clears its own suppression.)
          if (nextValue !== suppressedValueRef.current) {
            suppressedValueRef.current = null;
          }
          onValueChange(nextValue);
          setDropdownOpen(true);
        }}
        onBlur={() => {
          setIsFocused(false);
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
        aria-autocomplete="list"
        aria-expanded={dropdownOpen}
        aria-controls={dropdownOpen ? listId : undefined}
        aria-activedescendant={highlightedIndex >= 0 ? `${listId}-option-${highlightedIndex}` : undefined}
        className={className}
      />
      {loading && (
        <div className="absolute inset-y-0 right-3 flex items-center text-xs tracking-wide text-neutral-500 uppercase">
          Searching…
        </div>
      )}

      {dropdownOpen && (error || hasResults || showNoMatches) && (
        <div
          id={listId}
          role="listbox"
          className="absolute z-20 mt-1 w-full overflow-hidden rounded-xl border border-black/10 bg-white shadow-lg shadow-black/10"
        >
          {error && <div className="px-3 py-2 text-sm text-rose-600">{error}</div>}
          {showNoMatches && (
            <div className="px-3 py-2 text-sm text-neutral-600">No matches found. Try another name.</div>
          )}
          {!error &&
            currentResults.map((result, index) => {
              const isHighlighted = index === highlightedIndex;
              const isSelected = result.name === selectedName;
              return (
                <button
                  key={result.id}
                  ref={(el) => {
                    optionRefs.current[index] = el;
                  }}
                  id={`${listId}-option-${index}`}
                  type="button"
                  onMouseDown={(event) => {
                    // Mousedown (not click): fires before the input blurs,
                    // and preventDefault keeps focus from moving first.
                    event.preventDefault();
                    pickResult(result);
                  }}
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
                  <div className="text-xs text-neutral-600">
                    {result.latitude.toFixed(4)}, {result.longitude.toFixed(4)}
                  </div>
                </button>
              );
            })}
        </div>
      )}
    </div>
  );
}
