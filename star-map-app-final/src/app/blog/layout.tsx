import React from "react";

type Props = {
  children: React.ReactNode;
};

export const revalidate = 60;

export default function BlogLayout({ children }: Props) {
  return (
    <div>
      <div style={{ maxWidth: 980, margin: "0 auto", padding: "24px" }}>
        <main>{children}</main>

        <aside
          style={{
            marginTop: 32,
            padding: "16px",
            borderTop: "1px solid #eee",
            color: "#333",
          }}
        >
          <h3 style={{ margin: "0 0 8px 0" }}>Create a star map</h3>
          <p style={{ margin: "0 0 8px 0" }}>
            Want to recreate the sky from a special moment? Try our{" "}
            <a href="/star-map-generator">Star Map Generator</a> to build a
            customizable star map for any date and location.
          </p>
          <p style={{ margin: 0 }}>
            Great for gifts — create a{" "}
            <a href="/birthday">Birthday</a> or{" "}
            <a href="/anniversary">Anniversary</a> map.
          </p>
        </aside>
      </div>
    </div>
  );
}
