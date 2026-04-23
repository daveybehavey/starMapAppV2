import Head from 'next/head'
import React from 'react'

export default function StarMapCreator() {
  return (
    <>
      <Head>
        <title>Star Map Creator | Starmap Co</title>
        <meta
          name="description"
          content="Create a personalized star map for any date and location. Use our Star Map Creator to design a beautiful, accurate depiction of the night sky for anniversaries, birthdays, and special moments."
        />
      </Head>
      <main style={{ padding: '2rem', fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif' }}>
        <h1>Star Map Creator</h1>
        <p style={{ fontSize: '1.1rem', lineHeight: 1.6 }}>
          Use our intuitive Star Map Creator to craft a unique, high-quality star map for any date and place.
          Whether it's an anniversary, birthday, or meaningful moment, our tool helps you memorialize the
          exact alignment of the stars. This page includes an improved content description for starmap creator
          to help you find and use the feature easily.
        </p>
        <section style={{ marginTop: '1.5rem' }}>
          <h2>How it works</h2>
          <ol>
            <li>Pick a date and time to capture the sky at that exact moment.</li>
            <li>Choose the location (city, coordinates, or use current location).</li>
            <li>Customize the style, colors, and layout of your star map.</li>
            <li>Preview and order a printed or digital version.</li>
          </ol>
        </section>
        <p style={{ marginTop: '1.5rem', color: '#555' }}>
          Keywords: star map maker, star map creator, personalized star map, night sky map, custom star chart.
        </p>
      </main>
    </>
  )
