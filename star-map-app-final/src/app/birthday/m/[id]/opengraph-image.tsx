import { ImageResponse } from "next/og";

export const runtime = "nodejs";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Simple, worker-compatible OG image (placeholder) to avoid native canvas.
export default function Image() {
  const { width, height } = size;
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "radial-gradient(circle at 30% 30%, #1d2030, #0a0c14 70%)",
          color: "#f5f7ff",
          fontSize: 72,
          fontWeight: 700,
          letterSpacing: "-0.02em",
          padding: "80px",
          textAlign: "center",
        }}
      >
        StarMap
      </div>
    ),
    {
      width,
      height,
    }
  );
}
