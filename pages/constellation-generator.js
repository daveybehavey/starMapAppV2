import Head from "next/head";

export default function ConstellationGenerator() {
  return (
    <>
      <Head>
        <title>Constellation Map — Personalize Your Star Map | StarMapCo</title>
        <meta
          name="description"
          content="Explore constellations on a personalized star map. Customize date, location, and style, then export a high-resolution download or order a print."
        />
        <meta name="robots" content="index,follow" />
        <link rel="canonical" href="https://starmapco.com/constellation-map" />
        <meta
          name="keywords"
          content="constellation map, constellation chart, star map generator, personalized star map, printable star map, constellations"
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "WebPage",
              "name": "Constellation Map",
              "description":
                "Preview constellations on a personalized star map, then customize labels, style, and export or order a print.",
              "url": "https://starmapco.com/constellation-map"
            })
          }}
        />
      </Head>

      <main>
        <header>
          <h1>Constellation Map</h1>
          <p className="lede">
            Preview constellations on a star map for any date and location, then customize style and labels.
            Export a high-resolution file or order a print.
          </p>
        </header>

        <section aria-labelledby="why-use">
          <h2 id="why-use">Why use a constellation map?</h2>
          <ul>
            <li>See recognizable constellations for the sky from your chosen date and place.</li>
            <li>Choose style: background, palettes, label fonts, and constellation lines.</li>
            <li>High-resolution downloads optimized for printing; framing-ready file exports.</li>
            <li>Perfect for gifting—anniversaries, birthdays, weddings, memorials, and home decor.</li>
          </ul>
        </section>

        <section aria-labelledby="how-it-works">
          <h2 id="how-it-works">How it works</h2>
          <ol>
            <li>Select a date, time and location (or choose a random sky).</li>
            <li>Customize the map style: background, star brightness, labels and constellation connections.</li>
            <li>Preview in real time, download a high-res image (PNG/PDF) or order a professionally printed poster.</li>
          </ol>
        </section>

        <section aria-labelledby="get-started">
          <h2 id="get-started">Get started</h2>
          <p>
            Start with a preview, then decide on labels, layout, and whether you want a download or a print.
          </p>
          <p>
            <a className="btn" href="/constellation-map">Open the constellation map</a>
          </p>
        </section>

        <section aria-labelledby="tips">
          <h2 id="tips">Tips to create a memorable star map</h2>
          <ul>
            <li>Use a meaningful date and location to personalize the map.</li>
            <li>Choose contrasting colors for walls and frames for best display.</li>
            <li>Download the high-resolution option for larger prints to maintain clarity.</li>
          </ul>
        </section>

        <footer>
          <p className="note">
            Want this as a gift? We offer professional printing and framing options — select “Order Print”
            in the generator when you’re ready.
          </p>
        </footer>

        <style jsx>{`
          main {
