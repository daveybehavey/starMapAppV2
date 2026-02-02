import { ImageResponse } from "next/og";
import { getPost } from "@/lib/blogPosts";

export const runtime = "nodejs";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

type Props = {
  params: Promise<{ slug: string }>;
};

function formatPublishedDate(date: string) {
  const parsed = new Date(`${date}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) return "StarMapCo Blog";
  return parsed.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

export default async function Image({ params }: Props) {
  const { slug } = await params;
  const post = getPost(slug);

  const title = post?.title ?? "StarMapCo Blog";
  const description = post?.description ?? "Guides and inspiration for custom star maps.";
  const dateLabel = post ? formatPublishedDate(post.date) : "StarMapCo";

  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        position: "relative",
        background: "linear-gradient(145deg, #050915 0%, #0d1d3b 55%, #1b3a72 100%)",
        color: "#f5f7ff",
        fontFamily: "ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif",
        padding: "58px 64px",
      }}
    >
      <div
        style={{
          position: "absolute",
          top: "38px",
          right: "48px",
          width: "320px",
          height: "320px",
          borderRadius: "999px",
          background: "radial-gradient(circle, rgba(255,204,112,0.35) 0%, rgba(255,204,112,0) 72%)",
        }}
      />

      <div
        style={{
          position: "absolute",
          inset: "0",
          background:
            "radial-gradient(circle at 15% 22%, rgba(255,255,255,0.24) 0%, rgba(255,255,255,0) 28%), radial-gradient(circle at 72% 62%, rgba(255,255,255,0.16) 0%, rgba(255,255,255,0) 18%)",
        }}
      />

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          width: "100%",
          border: "1px solid rgba(255,255,255,0.2)",
          borderRadius: "28px",
          padding: "36px",
          background: "linear-gradient(180deg, rgba(6,12,24,0.55) 0%, rgba(6,12,24,0.75) 100%)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "12px",
              fontSize: "22px",
              color: "#fdd78f",
              letterSpacing: "0.04em",
            }}
          >
            <span style={{ fontSize: "24px" }}>★</span>
            <span>StarMapCo Blog</span>
          </div>
          <div style={{ fontSize: "21px", color: "#dbe7ff" }}>{dateLabel}</div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "18px", maxWidth: "980px" }}>
          <div
            style={{
              fontSize: "56px",
              lineHeight: "1.12",
              fontWeight: 700,
              letterSpacing: "-0.03em",
            }}
          >
            {title}
          </div>
          <div
            style={{
              fontSize: "30px",
              lineHeight: "1.35",
              color: "#e8edff",
            }}
          >
            {description}
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", fontSize: "24px", color: "#cdd8f3" }}>
          <span>starmapco.com</span>
          <span>Custom Star Maps</span>
        </div>
      </div>
    </div>,
    size
  );
}
