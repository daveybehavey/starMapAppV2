import Head from 'next/head'
import Link from 'next/link'
import { useState } from 'react'

export default function CreateAStarMap() {
  const [email, setEmail] = useState('')
  const [submitted, setSubmitted] = useState(false)

  const handleSignup = (e) => {
    e.preventDefault()
    // Lightweight optimistic UX: show a success state.
    setSubmitted(true)
    // In-app analytics or API calls can be wired up later.
  }

  return (
    <>
      <Head>
        <title>Create a Star Map — StarMap Co.</title>
        <meta
          name="description"
          content="Design a beautiful, personalized star map for any special moment. Fast preview, easy customization, and high-quality prints."
        />
      </Head>

      <main style={styles.page}>
        <section style={styles.hero}>
          <div style={styles.heroInner}>
            <h1 style={styles.h1}>Create a Star Map for Any Moment</h1>
            <p style={styles.lead}>
              Capture the exact stars above a special place and time. Perfect for gifts,
              anniversaries, weddings, and keepsakes. Fast preview, multiple sizes,
              and handcrafted prints.
            </p>

            <div style={styles.ctaRow}>
              <Link href="/customize">
                <a style={styles.primaryCta}>Design Your Star Map</a>
              </Link>
              <a href="#how-it-works" style={styles.secondaryCta}>
                See How It Works
              </a>
            </div>
            <div style={styles.quickLinks}>
              <Link href="/shop">
                <a style={styles.link}>Shop Prints</a>
              </Link>
              <Link href="/gift-card">
                <a style={styles.link}>Gift Cards</a>
              </Link>
            </div>
          </div>
        </section>

        <section id="how-it-works" style={styles.howItWorks}>
          <h2 style={styles.h2}>Make one in 3 easy steps</h2>
          <ol style={styles.steps}>
            <li style={styles.step}>
              <strong>Pick a Moment</strong> — choose a date, time, and location that
              matters.
            </li>
            <li style={styles.step}>
              <strong>Customize</strong> — select colors, labels, and size. Live preview
              shows exactly what you'll get.
            </li>
            <li style={styles.step}>
              <strong>Order or Download</strong> — get a high-res file or a framed
              print delivered to your door.
            </li>
          </ol>

          <div style={styles.guideCtaRow}>
            <Link href="/customize">
              <a style={styles.primaryCta}>Start Designing</a>
            </Link>
            <a href="#faq" style={styles.link}>
              Read FAQs
            </a>
          </div>
        </section>

        <section style={styles.trust}>
          <h3 style={styles.h3}>Why customers love our maps</h3>
          <ul style={styles.testimonials}>
            <li>"Beautiful quality and shipped fast." — Mia</li>
            <li>"The memorial map gave us comfort." — Jordan</li>
            <li>"Easy to design and customize." — Alex</li>
          </ul>
        </section>

        <section id="signup" style={styles.signup}>
          <h4 style={styles.h4}>Get a Free Preview</h4>
          <p style={styles.small}>
            Enter your email and we'll send a free preview and a 10% off code for your
            first order.
          </p>

          {!submitted ? (
            <form onSubmit={handleSignup} style={styles.form}>
              <input
                type="email"
                placeholder="you@example.com"
                aria-label="Email address"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                style={styles.input}
              />
              <button type="submit" style={styles.primaryCta}>
                Send Preview
              </button>
            </form>
          ) : (
            <p style={styles.small}>Thanks! Check your inbox for the preview.</p>
          )}
        </section>

        <section id="faq" style={styles.faq}>
          <h4 style={styles.h4}>Frequently asked</h4>
          <details style={styles.detail}>
            <summary>How long until my print arrives?</summary>
            <p style={styles.small}>Most orders ship within 3–7 business days. Framed
            options may take longer.</p>
          </details>
          <details style={styles.detail}>
            <summary>Can I get a digital download?</summary>
            <p style={styles.small}>Yes — choose the digital file option at checkout
            for instant delivery.</p>
          </details>
        </section>
      </main>
    </>
  )
}

const styles = {
