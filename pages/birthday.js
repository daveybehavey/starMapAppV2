import Head from "next/head";

/**
 * Canonical birthday experience lives in the main app route (/birthday).
 * Keep this page minimal and avoid inventing promo codes or signup flows.
 */
export default function BirthdayLanding() {
  return (
    <>
      <Head>
        <title>Personalized Birthday Star Map | StarMapCo</title>
        <meta
          name="description"
          content="Create a personalized birthday star map showing the exact night sky from their birth date and location."
        />
        <meta name="robots" content="index,follow" />
        <link rel="canonical" href="https://starmapco.com/birthday" />
      </Head>

      <main style={styles.page}>
        <h1 style={styles.h1}>Personalized Birthday Star Map</h1>
        <p style={styles.p}>
          Capture the night sky from their birthday (date and location), then customize the title and dedication line.
        </p>
        <a href="/birthday" style={styles.cta}>
          Start a free birthday preview
        </a>
      </main>
    </>
  );
}

const styles = {
  page: {
    maxWidth: 760,
    margin: "48px auto",
    padding: "0 16px",
    fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
    color: "#0b1726",
    lineHeight: 1.55,
  },
  h1: { fontSize: 34, margin: "0 0 10px" },
  p: { fontSize: 16, margin: "0 0 18px" },
  cta: {
    display: "inline-block",
    background: "#0b69a3",
    color: "#fff",
    padding: "12px 16px",
    borderRadius: 10,
    textDecoration: "none",
    fontWeight: 700,
  },
};

