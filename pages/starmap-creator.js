import Head from 'next/head'
import React from 'react'

export default function StarmapCreator() {
  return (
    <>
      <Head>
        <title>Starmap Creator — Create Your Personalized Star Map | StarmapCo</title>
        <meta
          name="description"
          content="Use our Starmap Creator to design a personalized star map poster from any date and location. Easy steps, printable results, and unique gifts."
        />
        <meta name="keywords" content="starmap creator, star map creator, personalized star map, custom starmap, create starmap" />
      </Head>

      <main style={{ fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif', padding: '48px', lineHeight: 1.6 }}>
        <article style={{ maxWidth: 900, margin: '0 auto' }}>
          <h1 style={{ fontSize: 36, marginBottom: 16 }}>Starmap Creator — Design a Personalized Star Map</h1>

          <p style={{ fontSize: 18, marginBottom: 16 }}>
            Our Starmap Creator lets you make a custom star map for any date and place in just a few clicks. Whether you're commemorating a wedding,
            a birthday, or the night you met, create a printable poster-grade starmap that shows the exact sky alignment from your chosen moment.
          </p>

          <section style={{ marginBottom: 24 }}>
            <h2 style={{ fontSize: 22, marginBottom: 12 }}>Why use this Starmap Creator?</h2>
            <ul>
              <li><strong>Accurate:</strong> Maps are generated from real astronomical positions for your selected date and location.</li>
              <li><strong>Personalized:</strong> Add names, a date line, location details, and a custom message to make it meaningful.</li>
              <li><strong>Printable:</strong> High-resolution exports suitable for posters, framed prints, or digital keepsakes.</li>
              <li><strong>Fast:</strong> Intuitive step-by-step creation — no astronomy knowledge required.</li>
            </ul>
          </section>

          <section style={{ marginBottom: 24 }}>
            <h2 style={{ fontSize: 22, marginBottom: 12 }}>How to create your starmap</h2>
            <ol>
              <li>Choose the date and time that matter to you.</li>
              <li>Enter the location (city or coordinates) for the exact sky view.</li>
              <li>Customize design options: color themes, constellation labels, and text.</li>
              <li>Preview, export, and order prints or download a high-res file.</li>
            </ol>
          </section>

          <section style={{ marginBottom: 24 }}>
            <h2 style={{ fontSize: 22, marginBottom: 12 }}>Design features</h2>
            <p>
              Choose from multiple styles — minimalist, vintage, modern — and control star density, constellation labels, and typography.
              Our starmap creator supports portrait and landscape layouts and produces print-ready PNG and PDF downloads.
            </p>
          </section>

          <section style={{ marginBottom: 32 }}>
            <h2 style={{ fontSize: 22, marginBottom: 12 }}>Example use cases</h2>
            <ul>
              <li>Anniversary gifts: a framed starmap of your wedding night.</li>
              <li>Birth announcements: show the sky the moment a child was born.</li>
              <li>Memorial keepsakes: preserve a meaningful moment in the night sky.</li>
              <li>Decor: unique wall art for home or office that tells a story.</li>
            </ul>
          </section>

          <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 40 }}>
            <a
              href="/create"
              style={{
                background: '#0b63ff',
                color: '#fff',
                padding: '12px 20px',
                borderRadius: 6,
                textDecoration: 'none',
                fontWeight: 600,
              }}
            >
              Start creating your starmap
            </a>
            <a href="/examples" style={{ color: '#0b63ff', textDecoration: 'underline' }}>
              View examples
            </a>
          </div>

          <section style={{ marginBottom: 24 }}>
            <h2 style={{ fontSize: 22, marginBottom: 12 }}>Frequently asked questions</h2>
            <h3 style={{ fontSize: 18, marginBottom: 8 }}>Is the starmap accurate?</h3>
            <p>Yes — the starmap creator computes star positions using standard astronomical models for the date, time, and coordinates you provide.</p>

            <h3 style={{ fontSize: 18, marginBottom: 8 }}>Can I print the starmap?</h3>
            <p>Absolutely. Export high-resolution PDF or PNG files optimized for printing at common poster sizes.</p>

            <h3 style={{ fontSize: 18, marginBottom: 8 }}>Can I customize the design?</h3>
            <p>Yes — text, fonts, colors, and label options are all configurable inside the starmap creator interface.</p>
          </section>

          <footer style={{ marginTop: 40, paddingTop: 20, borderTop: '1px solid #eee' }}>
            <p style={{ margin: 0 }}>
              Need help? Contact <a href="/support">support</a> or read our <a href="/help">help center</a> for tips on getting the best print results.
