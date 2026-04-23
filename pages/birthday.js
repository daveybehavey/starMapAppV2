import React, { useState } from "react";

// Landing page optimized for conversions for the /birthday route.
// Key improvements:
// - Clear hero with strong value proposition and primary CTA above the fold.
// - Secondary CTAs and urgency (limited-time discount).
// - Trust and social proof (reviews, guarantee).
// - Simple email / conversion form with minimal friction.
// - FAQ and benefits to address objections.

export default function BirthdayLanding() {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState(null);

  function onSubmit(e) {
    e.preventDefault();
    setError(null);
    if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
      setError("Please enter a valid email address");
      return;
    }
    // In a real app we'd call an API. For now, we show a light-weight optimistic success state.
    setSubmitted(true);
  }

  return (
    <div style={styles.page}>
      <header style={styles.header}>
        <div style={styles.headerInner}>
          <h1 style={styles.brand}>StarMap Co.</h1>
          <nav style={styles.nav}>
            <a href="/" style={styles.navLink}>Home</a>
            <a href="/shop" style={styles.navLink}>Shop</a>
            <a href="/birthday" style={{...styles.navLink, fontWeight: 700}}>Birthday</a>
          </nav>
        </div>
      </header>

      <main style={styles.main}>
        <section style={styles.hero}>
          <div style={styles.heroContent}>
            <h2 style={styles.heroTitle}>Celebrate their moment. Capture the sky.</h2>
            <p style={styles.heroSubtitle}>
              Create a personalized star map for birthdays — an unforgettable gift that shows the exact alignment of the stars on any date and place.
            </p>

            <div style={styles.ctaRow}>
              <a href="#create" style={styles.primaryCta}>Create Your Birthday Star Map</a>
              <a href="#how-it-works" style={styles.ghostCta}>How it works</a>
            </div>

            <div style={styles.urgency}>
              <strong>Limited time:</strong> 15% off orders placed in the next 48 hours. Use code BDAY15.
            </div>

            <ul style={styles.benefits}>
              <li>Fast turnaround — standard shipping in 5–7 days</li>
              <li>Free proof review on request</li>
              <li>30-day money-back guarantee</li>
            </ul>
          </div>

          <div style={styles.heroVisual}>
            <div style={styles.mockup}>
              <div style={styles.starMapSample}>
                <div style={styles.sampleHeader}>Oct 12, 1990 • New York, NY</div>
                <div style={styles.sampleStars}>★ ★ ★ ★ ★</div>
              </div>
              <div style={styles.priceBadge}>From $39 • Free shipping</div>
            </div>
          </div>
        </section>

        <section id="create" style={styles.createSection}>
          <div style={styles.createInner}>
            <h3 style={styles.sectionTitle}>Create a personalized star map in minutes</h3>
            <p style={styles.sectionSubtitle}>Enter your email to get started — no commitment required. We'll walk you through design options and proofs.</p>

            {submitted ? (
              <div style={styles.thanks}>
                <h4>You're all set!</h4>
                <p>Check your inbox for the next steps to design your star map. We'll help you every step of the way.</p>
                <a href="/shop" style={styles.primaryCta}>Browse Designs</a>
              </div>
            ) : (
              <form onSubmit={onSubmit} style={styles.form} aria-label="Start creating your birthday star map">
                <label htmlFor="email" style={styles.label}>Email address</label>
                <input
                  id="email"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  style={styles.input}
                  required
                />
                {error && <div style={styles.error}>{error}</div>}

                <div style={styles.formActions}>
                  <button type="submit" style={styles.primaryCta}>Get started — it's free</button>
                  <a href="/checkout/quick" style={styles.secondaryCta}>Buy now (fast checkout)</a>
                </div>
                <div style={styles.trustLine}>Secure checkout • 30-day guarantee • Proof before printing</div>
              </form>
            )}
          </div>
        </section>

        <section id="trust" style={styles.trustSection}>
          <div style={styles.trustInner}>
            <h4 style={styles.sectionTitle}>Trusted by thousands</h4>
            <div style={styles.reviews}>
              <blockquote style={styles.review}>
                "The star map we gave for my wife's 40th was the most emotional gift she's ever received." — Sarah L.
              </blockquote>
              <blockquote style={styles.review}>
                "Amazing quality and great customer support. They emailed a mockup and we made a tiny edit before printing." — Jamal R.
              </blockquote>
            </div>
            <div style={styles.trustBadges}>
              <span style={styles.badge}>Top-rated on Trustpilot</span>
              <span style={styles.badge}>Secure payments</span>
              <span style={styles.badge}>Made in USA</span>
            </div>
          </div>
        </section>

        <section id="how-it-works" style={styles.howSection}>
          <div style={styles.howInner}>
            <h4 style={styles.sectionTitle}>How it works</h4>
            <ol style={styles.steps}>
              <li><strong>Choose a date & place:</strong> Birthday, anniversary, or any meaningful moment.</li>
              <li><strong>Pick a design:</strong> Modern, classic, or minimalist layouts and frames.</li>
              <li><strong>Approve a proof:</strong> We send a preview for your sign-off before printing.</li>
              <li><strong>Fast delivery:</strong> Shipped carefully with tracking.</li>
            </ol>
          </div>
        </section>

        <section id="faq" style={styles.faqSection}>
          <div style={styles.faqInner}>
            <h4 style={styles.sectionTitle}>Frequently asked questions</h4>
            <details style={styles.faqItem}>
              <summary style={styles.faqQ}>Can I change the design after I order?</summary>
              <div style={styles.faqA}>Yes — request changes in your proof review. Minor edits are free before printing.</div>
            </details>
            <details style={styles.faqItem}>
              <summary style={styles.faqQ}>What is the turnaround time?</summary>
              <div style={styles.faqA}>Standard processing and shipping is around 5–7 business days. Expedited options are available at checkout.</div>
            </details>
            <details style={styles.faqItem}>
              <summary style={styles.faqQ}>What if I'm not happy?</summary>
              <div style={styles.faqA}>We offer a 30-day money-back guarantee and will work to make it right.</div>
            </details>
          </div>
        </section>

      </main>

      <footer style={styles.footer}>
        <div style={styles.footerInner}>
          <div>© {new Date().getFullYear()} StarMap Co.</div>
          <div style={styles.footerLinks}>
            <a href="/returns" style={styles.footerLink}>Returns</a>
            <a href="/privacy" style={styles.footerLink}>Privacy</a>
            <a href="/contact" style={styles.footerLink}>Contact</a>
          </div>
        </div>
      </footer>
    </div>
  );
}

const styles = {
  page: {
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial",
    color: "#0b1726",
    lineHeight: 1.4,
  },
  header: {
    borderBottom: "1px solid #eef2f6",
    background: "#fff",
  },
  headerInner: {
    maxWidth: 1100,
    margin: "0 auto",
    padding: "16px 20px",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
  },
  brand: {
    margin: 0,
    fontSize: 20,
  },
  nav: {
    display: "flex",
    gap: 16,
  },
  navLink: {
    color: "#0b1726",
    textDecoration: "none",
    opacity: 0.9,
  },
  main: {
    maxWidth: 1100,
    margin: "24px auto",
    padding: "0 20px",
  },
  hero: {
    display: "flex",
