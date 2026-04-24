import React from "react";

/**
 * Minimal informational page.
 * Avoid claiming an interactive generator that isn't implemented here.
 */
export default function ConstellationGenerator() {
  return (
    <main
      style={{
        maxWidth: 760,
        margin: "48px auto",
        padding: "0 16px",
        fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
        lineHeight: 1.6,
        color: "#0b1726",
      }}
    >
      <h1>Constellation Map</h1>
      <p>
        Use a constellation map to recognize familiar star patterns on a personalized star map for a specific date and
        location.
      </p>
      <p>
        <a href="/constellation-map">Open the constellation map</a>
      </p>
    </main>
  );
}

