import React from "react";

export default function ConstellationsGenerator() {
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
      <h1>Constellations on your star map</h1>
      <p>
        Constellations are recognizable star patterns. On StarMapCo, you can include constellation lines and labels on a
        personalized star map for a date and location.
      </p>
      <p>
        <a href="/constellation-map">Preview a constellation map</a>
      </p>
    </main>
  );
}

