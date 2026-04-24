import Head from 'next/head';

export default function ConstellationGenerator() {
  return (
    <>
      <Head>
        <title>Constellation Generator — Create Custom Star Maps | StarMap Co</title>
        <meta
          name="description"
          content="Create custom constellations and printable star maps with our Constellation Generator. Perfect for gifts, wall art, astronomy projects, and memorable moments. Customize date, location, style, and download high-resolution images or order prints."
        />
        <meta name="robots" content="index,follow" />
        <link rel="canonical" href="https://starmapco.com/constellation-generator" />
        <meta name="keywords" content="constellation generator, custom star map, star map generator, printable star map, personalized constellation, starmap" />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "WebPage",
              "name": "Constellation Generator",
              "description":
                "Design your own constellation and download a high-resolution star map. Customize colors, labels, date, and location to create a meaningful gift or piece of wall art.",
              "url": "https://starmapco.com/constellation-generator"
            })
          }}
        />
      </Head>

      <main>
        <header>
          <h1>Constellation Generator</h1>
          <p className="lede">
            Design beautiful, accurate star maps and unique constellations in seconds.
            Customize date, location, colors, labels and download high-resolution files
            or order a print delivered to your door.
          </p>
        </header>

        <section aria-labelledby="why-use">
          <h2 id="why-use">Why use our Constellation Generator?</h2>
          <ul>
            <li>Generate realistic constellations and full star maps based on date, time, and location.</li>
            <li>Fine-tune style: background, color palettes, label fonts, and constellation lines.</li>
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
            Ready to create your constellation? Start now to capture a moment in the sky —
            whether it’s a first date, birthday, or a special milestone.
          </p>
          <p>
            <a className="btn" href="/create-constellation">Open the Constellation Generator</a>
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
