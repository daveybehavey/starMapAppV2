import React, { useEffect, useState } from "react";

// Lightweight landing page optimized for conversions:
// - Clear above-the-fold value proposition + single primary CTA
// - Trust badges, social proof, money-back guarantee
// - Simple conversion form with minimal inputs
// - Urgency countdown & sticky CTA

const containerStyle = {
  fontFamily: "Inter, system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial",
  color: "#0b1221",
  lineHeight: 1.45,
  padding: "0",
  margin: "0",
};

const heroStyle = {
  background: "linear-gradient(180deg,#081229 0%, #031126 60%)",
  color: "white",
  padding: "48px 20px",
  textAlign: "center",
};

const cardStyle = {
  background: "white",
  borderRadius: 12,
  boxShadow: "0 6px 30px rgba(6,20,40,0.12)",
  padding: 24,
  maxWidth: 980,
  margin: " -60px auto 40px",
};

const heroInner = {
  maxWidth: 980,
  margin: "0 auto",
};

const primaryBtn = {
  background: "#ffb400",
  border: "none",
  padding: "12px 20px",
  borderRadius: 8,
  fontWeight: 700,
  color: "#081229",
  cursor: "pointer",
  fontSize: 16,
  marginTop: 12,
};

const secondaryBtn = {
  background: "transparent",
  border: "1px solid rgba(255,255,255,0.25)",
  color: "white",
  padding: "10px 16px",
  borderRadius: 8,
  cursor: "pointer",
  marginLeft: 12,
};

const grid = {
  display: "grid",
  gridTemplateColumns: "1fr",
  gap: 20,
};

function formatTime(ms) {
  if (ms <= 0) return "00:00:00";
  const totalSec = Math.floor(ms / 1000);
  const hrs = String(Math.floor(totalSec / 3600)).padStart(2, "0");
  const mins = String(Math.floor((totalSec % 3600) / 60)).padStart(2, "0");
  const secs = String(totalSec % 60).padStart(2, "0");
  return `${hrs}:${mins}:${secs}`;
}

export default function BestPersonalizedStarMapGift() {
  const [countdown, setCountdown] = useState("");
  const [timeLeftMs, setTimeLeftMs] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    name: "",
    email: "",
    date: "",
    message: "",
  });

  // Urgency window: next 36 hours (for display only)
  useEffect(() => {
    const end = Date.now() + 36 * 3600 * 1000;
    const t = setInterval(() => {
      const left = end - Date.now();
      setTimeLeftMs(left);
      setCountdown(formatTime(left));
    }, 1000);
    return () => clearInterval(t);
  }, []);

  function handleChange(e) {
    const { name, value } = e.target;
    setForm((s) => ({ ...s, [name]: value }));
  }

  function handleSubmit(e) {
    e.preventDefault();
    // Minimal client-side validation
    if (!form.email || !form.date) {
      alert("Please provide at least an email and the special date to create your star map.");
      return;
    }
    setSubmitting(true);
    // For landing conversion tracking we simply simulate submit and navigate user to customization:
    setTimeout(() => {
      setSubmitting(false);
      // In a real flow, this would create a lead and redirect to the customization flow.
      // For now, navigate to a sensible route if available.
      if (typeof window !== "undefined") {
        window.location.href = "/create"; // best-effort redirect to creation flow
      }
    }, 900);
  }

  return (
    <div style={containerStyle}>
      <head>
        <title>Best Personalized Star Map Gift — StarMapCo</title>
        <meta name="description" content="Design the best personalized star map gift — custom star charts of the night your special moment happened. Quick creation, beautiful prints, and a 30-day guarantee." />
        <meta name="robots" content="index,follow" />
      </head>

      <section style={heroStyle}>
        <div style={heroInner}>
          <div style={{ display: "flex", justifyContent: "center", gap: 12, alignItems: "center", marginBottom: 14 }}>
            <img src="/icons/star-emoji.png" alt="star" style={{ width: 44, height: 44 }} onError={(e) => (e.currentTarget.style.display = "none")} />
            <span style={{ fontSize: 13, color: "#b6d3ff", fontWeight: 600 }}>Best Personalized Star Map Gift</span>
          </div>
          <h1 style={{ fontSize: 36, margin: 0, fontWeight: 800 }}>Create a meaningful, custom star map they’ll cherish</h1>
          <p style={{ color: "#cbe0ff", maxWidth: 760, margin: "12px auto 18px", fontSize: 18 }}>
            Capture the exact alignment of the stars on a moment that matters — anniversaries, birthdays, proposals. Fast delivery, high-quality prints, and a 30-day money-back guarantee.
          </p>

          <div style={{ display: "flex", justifyContent: "center", gap: 8 }}>
            <a href="#order" style={{ textDecoration: "none" }}>
              <button style={primaryBtn} aria-label="Create your star map now">Design your star map — start now</button>
            </a>
            <a href="#how" style={{ textDecoration: "none" }}>
              <button style={secondaryBtn} aria-label="How it works">How it works</button>
            </a>
          </div>

          <div style={{ marginTop: 18, display: "flex", justifyContent: "center", gap: 14, alignItems: "center" }}>
            <div style={{ background: "rgba(255,255,255,0.06)", padding: "8px 12px", borderRadius: 8, color: "#e6f3ff", fontSize: 14 }}>
              Limited-time: Free upgrade to premium framing for orders in the next
              <strong style={{ marginLeft: 8, marginRight: 8 }}>{countdown || "00:00:00"}</strong>
            </div>
            <div style={{ color: "#cbe0ff", fontSize: 13 }}>30-day money-back guarantee</div>
          </div>
        </div>
      </section>

      <main style={cardStyle}>
        <section style={grid}>
          <div style={{ display: "flex", gap: 20, alignItems: "flex-start", flexWrap: "wrap" }}>
            <div style={{ flex: "1 1 360px" }}>
              <img src="/images/sample-star-map.jpg" alt="Sample star map" style={{ width: "100%", borderRadius: 8, display: "block" }} onError={(e) => (e.currentTarget.style.display = "none")} />
            </div>
            <div style={{ flex: "1 1 420px" }}>
              <h2 style={{ marginTop: 0 }}>Why this makes the best personalized gift</h2>
              <ul style={{ paddingLeft: 18 }}>
                <li><strong>Accurate:</strong> We map the exact stars from the date, time and location you provide.</li>
                <li><strong>Gifts people keep:</strong> Custom, meaningful, and display-ready — framed or print options.</li>
                <li><strong>Fast & easy:</strong> Create in minutes and preview before you buy.</li>
              </ul>

              <div style={{ marginTop: 12 }}>
                <strong style={{ display: "block", marginBottom: 6 }}>Trusted by customers</strong>
                <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                  <img src="/icons/trust-badge-1.png" alt="quality" style={{ height: 36 }} onError={(e) => (e.currentTarget.style.display = "none")} />
                  <img src="/icons/trust-badge-2.png" alt="fast-shipping" style={{ height: 36 }} onError={(e) => (e.currentTarget.style.display = "none")} />
                  <img src="/icons/trust-badge-3.png" alt="secure" style={{ height: 36 }} onError={(e) => (e.currentTarget.style.display = "none")} />
                </div>
              </div>

              <div style={{ marginTop: 18 }}>
                <a href="#order" style={{ textDecoration: "none" }}>
                  <button style={{ ...primaryBtn, width: "100%" }} aria-label="Get started">Get started — it's free to design</button>
                </a>
              </div>
            </div>
          </div>

          <div id="how" style={{ marginTop: 6 }}>
            <h3>How it works — 3 simple steps</h3>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              <div style={{ flex: "1 1 220px", padding: 12, borderRadius: 10, background: "#f7fbff" }}>
                <strong>1. Enter your details</strong>
                <div style={{ fontSize: 14, marginTop: 6 }}>Date, time & location of your special moment.</div>
              </div>
              <div style={{ flex: "1 1 220px", padding: 12, borderRadius: 10, background: "#f7fbff" }}>
                <strong>2. Customize</strong>
                <div style={{ fontSize: 14, marginTop: 6 }}>Choose colors, text, and framing options.</div>
              </div>
              <div style={{ flex: "1 1 220px", padding: 12, borderRadius: 10, background: "#f7fbff" }}>
                <strong>3. Receive or gift</strong>
                <div style={{ fontSize: 14, marginTop: 6 }}>Ships framed or as a fine art print — ready to display.</div>
              </div>
            </div>
          </div>

          <div id="order" style={{ marginTop: 8 }}>
            <h3 style={{ marginBottom: 8 }}>Start your design — quick lead capture</h3>
            <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
              <form onSubmit={handleSubmit} style={{ flex: "1 1 360px", minWidth: 300 }}>
                <label style={{ display: "block", fontSize: 13, marginBottom: 6 }}>Your name</label>
                <input name="name" value={form.name} onChange={handleChange} style={{ width: "100%", padding: 10, borderRadius: 8, border: "1px solid #dbe8ff" }} />

                <label style={{ display: "block", fontSize: 13, marginTop: 12, marginBottom: 6 }}>Email (we'll send design updates)</label>
                <input name="email" type="email" value={form.email} onChange={handleChange} style={{ width: "100%", padding: 10, borderRadius: 8, border: "1px solid #dbe8ff" }} required />

                <label style={{ display: "block", fontSize: 13, marginTop: 12, marginBottom: 6 }}>Special date & time</label>
                <input name="date" type="datetime-local" value={form.date} onChange={handleChange} style={{ width: "100%", padding: 10, borderRadius: 8, border: "1px solid #dbe8ff" }} required />

                <label style={{ display: "block", fontSize: 13, marginTop: 12, marginBottom: 6 }}>Short message (optional)</label>
