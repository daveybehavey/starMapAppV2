import React from 'react'
import { useRouter } from 'next/router'
import Link from 'next/link'
import Head from 'next/head'

function ConversionLinks() {
  return (
    <aside
      className="conversion-links"
      style={{
        padding: '1rem',
        borderTop: '1px solid #eee',
        marginTop: '1.5rem',
        background: '#fafafa',
        borderRadius: 4,
      }}
      aria-label="Conversion links"
    >
      <p style={{ margin: '0 0 .5rem 0', fontWeight: 600 }}>Next steps</p>
      <ul style={{ margin: 0, paddingLeft: '1rem' }}>
        <li>
          <Link href="/pricing">
            <a>See pricing and plans</a>
          </Link>
        </li>
        <li>
          <Link href="/signup">
            <a>Create a free account</a>
          </Link>
        </li>
        <li>
          <Link href="/demo">
            <a>Request a demo</a>
          </Link>
        </li>
        <li>
          <Link href="/contact">
            <a>Contact sales</a>
          </Link>
        </li>
      </ul>
    </aside>
  )
}
