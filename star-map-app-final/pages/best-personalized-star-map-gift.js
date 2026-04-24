import React from 'react'
import Link from 'next/link'

const TrustBadge = ({ children }) => (
  <div style={{
    display: 'inline-block',
    padding: '8px 12px',
    margin: '6px',
    borderRadius: 6,
    background: '#fff',
    boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
    fontSize: 14,
    color: '#222'
  }}>{children}</div>
)

export default function BestPersonalizedStarMapGift() {
  return (
    <div style={{ fontFamily: 'Inter, system-ui, Arial, sans-serif', color: '#0b1020', lineHeight: 1.5 }}>
      <header style={{
        background: 'linear-gradient(180deg, #0b1220 0%, #071226 100%)',
        color: '#fff',
        padding: '48px 20px',
        textAlign: 'center'
      }}>
        <h1 style={{ margin: 0, fontSize: 36, fontWeight: 700 }}>
          Best personalized star map gift
        </h1>
        <p style={{ marginTop: 12, fontSize: 18, maxWidth: 760, marginLeft: 'auto', marginRight: 'auto', opacity: 0.95 }}>
          Capture a meaningful moment — the exact night sky from any date and place. Perfect for anniversaries, birthdays, weddings, or a heartfelt surprise.
        </p>

        <div style={{ marginTop: 20, display: 'flex', justifyContent: 'center', gap: 12, flexWrap: 'wrap' }}>
          <Link href="/star-map-generator">
            <a style={{
              background: '#ffd166',
              color: '#081229',
              padding: '14px 22px',
              borderRadius: 8,
              fontWeight: 700,
              textDecoration: 'none',
              boxShadow: '0 6px 18px rgba(0,0,0,0.18)'
            }}>
              Create Your Star Map
            </a>
          </Link>

          <Link href="/star-map-gallery">
            <a style={{
              background: 'transparent',
              border: '2px solid rgba(255,255,255,0.14)',
              color: '#fff',
              padding: '12px 20px',
              borderRadius: 8,
              textDecoration: 'none',
              fontWeight: 600
            }}>
              Shop Bestsellers
            </a>
          </Link>
        </div>

        <div style={{ marginTop: 18 }}>
          <TrustBadge>Free worldwide shipping</TrustBadge>
          <TrustBadge>30-day returns</TrustBadge>
          <TrustBadge>Handmade & framed options</TrustBadge>
        </div>
      </header>

      <main style={{ padding: '36px 20px', maxWidth: 1100, margin: '0 auto' }}>
        <section style={{ display: 'flex', gap: 28, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 420px', minWidth: 280 }}>
            <h2 style={{ fontSize: 24, marginBottom: 12 }}>Why customers choose our maps</h2>
            <ul style={{ margin: 0, paddingLeft: 20 }}>
              <li style={{ marginBottom: 10 }}>Scientifically accurate star positions for any date & location</li>
              <li style={{ marginBottom: 10 }}>Custom text, colors, and map styles — design a memory that fits your home</li>
              <li style={{ marginBottom: 10 }}>Fast production & tracked shipping with secure checkout</li>
            </ul>

            <div style={{ marginTop: 18, padding: 14, borderRadius: 8, background: '#f7fafc' }}>
              <strong style={{ display: 'block', marginBottom: 8 }}>Risk-free purchase</strong>
              <div style={{ fontSize: 14, color: '#334155' }}>
                We offer a 30-day return policy and responsive support. Need help creating the perfect map? Our team can assist with layout and text.
              </div>
            </div>

            <div style={{ marginTop: 20, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <Link href="/star-map-generator">
                <a style={{
                  background: '#0b1220',
                  color: '#fff',
                  padding: '12px 18px',
                  borderRadius: 8,
                  textDecoration: 'none',
                  fontWeight: 700
                }}>
                  Start customizing now
                </a>
              </Link>

              <Link href="/star-map-gift-ideas">
                <a style={{
                  background: 'transparent',
                  border: '1px solid #0b1220',
                  color: '#0b1220',
                  padding: '10px 16px',
                  borderRadius: 8,
                  textDecoration: 'none'
                }}>
                  Gift ideas & inspiration
                </a>
              </Link>
            </div>
          </div>

          <div style={{ flex: '0 1 320px', minWidth: 260 }}>
            <div style={{
              borderRadius: 12,
              overflow: 'hidden',
              boxShadow: '0 10px 30px rgba(2,6,23,0.08)'
            }}>
              <img alt="Star map sample" src="/images/sample-star-map.jpg" style={{ width: '100%', display: 'block' }} />
            </div>

            <div style={{ marginTop: 12, fontSize: 14, color: '#475569' }}>
              Best sellers: framed prints, posters, and custom canvas sizes. Ships ready to gift.
