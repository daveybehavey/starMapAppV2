import type { Metadata } from "next";
import BlogPostConversionLinks from "@/components/BlogPostConversionLinks";
import FaqSchema from "@/components/FaqSchema";
import Link from "next/link";

const title = "Birth Star Map: A Meaningful Nursery Gift From the Night They Arrived";
const description =
  "A birth star map captures the exact night sky from a baby's birth date, time, and location — a personalized nursery keepsake for new parents, grandparents, and baby shower gifts.";
const ogImage = "https://starmapco.com/custom-star-map-anniversary.webp";
const keywords = [
  "birth star map",
  "baby star map",
  "new baby star map",
  "nursery star map",
  "baby shower star map gift",
  "birth date star map",
  "personalized baby gift",
  "night sky when baby was born",
];

const faqItems = [
  {
    question: "Is a birth star map scientifically accurate?",
    answer:
      "Yes. StarMapCo calculates the sky from real date, time, timezone, and location inputs using astronomical data — not a decorative illustration. Exact birth time improves Moon and planet placement; date plus city or hospital location still produces a meaningful nursery print.",
  },
  {
    question: "Do I need the exact birth time for a baby star map?",
    answer:
      "Exact time is ideal when you have it from a birth certificate or hospital record. If you only know the date and city, the map is still personal and gift-worthy — many buyers use midnight or an approximate hour and add a note that time was estimated.",
  },
  {
    question: "Is a star map a good baby shower gift?",
    answer:
      "Yes. A baby shower star map gift works well when the due date is known or when the group wants something the parents can display after birth. You can preview the design free, then order framed print, unframed poster, or instant HD digital delivery.",
  },
  {
    question: "What format is best for a nursery?",
    answer:
      "Framed print is the most common nursery choice — ready to hang above a crib or changing table. Unframed poster lowers the total if parents already chose a frame. HD digital lets you print locally or share with grandparents the same day.",
  },
  {
    question: "Can I add the baby's name on the print?",
    answer:
      "Yes. Add the baby's name, birth date line, and a short welcome message in the editor before checkout. Keep text minimal so the sky stays the focus.",
  },
  {
    question: "How is a birth star map different from a birthday star map?",
    answer:
      "A birth star map marks the night they arrived — often used for nurseries, baby showers, and newborn keepsakes. A birthday star map celebrates any birthday year (18th, 30th, etc.). Same tool, different emotional moment. See the birthday star map page for milestone-year gifts.",
  },
];

export const metadata: Metadata = {
  title,
  description,
  keywords,
  alternates: { canonical: "https://starmapco.com/blog/birth-star-map" },
  openGraph: {
    title,
    description,
    url: "https://starmapco.com/blog/birth-star-map",
    type: "article",
    publishedTime: "2026-06-19",
    images: [{ url: ogImage }],
  },
  twitter: {
    title,
    description,
    images: [ogImage],
    card: "summary_large_image",
  },
};

const published = "2026-06-19";

export default function BirthStarMapPostPage() {
  const articleJsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: title,
    description,
    datePublished: published,
    dateModified: published,
    author: { "@type": "Organization", name: "StarMapCo" },
    image: ogImage,
    publisher: {
      "@type": "Organization",
      name: "StarMapCo",
      logo: { "@type": "ImageObject", url: "https://starmapco.com/favicon.ico" },
    },
    mainEntityOfPage: "https://starmapco.com/blog/birth-star-map",
  };

  return (
    <main className="bg-[#050915] px-4 py-10 text-white sm:py-14">
      <article className="mx-auto max-w-4xl font-sans leading-relaxed">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(articleJsonLd) }}
        />
        <header className="mb-8 space-y-3">
          <p className="text-sm tracking-[0.25em] text-amber-300 uppercase">New Baby &amp; Nursery</p>
          <h1 className="text-3xl font-bold text-amber-200 sm:text-4xl">{title}</h1>
          <p className="text-base text-neutral-200 sm:text-lg">{description}</p>
        </header>

        <div className="space-y-8 text-neutral-100">
          <p>
            The first night of a new life is easy to remember emotionally and surprisingly hard to picture later.
            Photos capture faces; a <strong>birth star map</strong> captures something quieter — the exact night sky
            above the hospital, home, or city where they arrived. It turns that moment into nursery wall art parents
            can keep for years, or into a <strong>baby shower star map gift</strong> that feels personal instead of
            generic.
          </p>
          <p>
            Unlike a monogrammed blanket or another outfit they will outgrow, a{" "}
            <strong>new baby star map</strong> is tied to one unrepeatable instant. The sky that night was unique to
            that date, that place, and that hour. That is what makes it a strong{" "}
            <strong>personalized baby gift</strong> for parents, grandparents, aunts, uncles, and close friends.
          </p>

          <section>
            <h2 className="mb-3 text-xl font-semibold text-amber-200 sm:text-2xl">What is a birth star map?</h2>
            <p>
              A birth star map (sometimes called a <strong>baby star map</strong> or{" "}
              <strong>night sky when baby was born</strong> print) is a calculated map of the stars and constellations
              visible from a specific date, time, and location on Earth. It is not clip art — the layout comes from
              real astronomy inputs. You add the baby&apos;s name, birth date line, and a short welcome message so the
              print reads as a keepsake, not a poster from a template shop.
            </p>
            <p className="mt-2">
              If you want to understand how accuracy works before you buy, read{" "}
              <Link href="/how-accurate-are-star-maps" className="text-amber-300 hover:underline">
                how accurate star maps are
              </Link>
              . The short version: date, time, timezone, and location all matter; exact birth time is best when you
              have it.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-semibold text-amber-200 sm:text-2xl">
              Which date, time, and location should you use?
            </h2>
            <p>
              Most <strong>birth date star map</strong> gifts use one of these anchors:
            </p>
            <ul className="mt-2 list-disc space-y-2 pl-5 text-neutral-200">
              <li>
                <strong>Birth date and time from the hospital record.</strong> Best when you want Moon and planet
                placement as precise as possible — common for maps ordered after the baby arrives.
              </li>
              <li>
                <strong>Birth date with the hospital or home city.</strong> Works when you know the day but not the
                minute. Many nursery prints use midnight or a reasonable estimate and still feel deeply personal.
              </li>
              <li>
                <strong>First night home.</strong> Some families prefer the sky from the first night in their own
                nursery rather than the delivery room — both are valid; pick the story you want on the wall.
              </li>
            </ul>
            <p className="mt-3">
              Location should match where the sky was viewed: the birth city, hospital town, or home address area.
              You do not need street-level precision — city-level coordinates are enough for a beautiful result.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-semibold text-amber-200 sm:text-2xl">Nursery and framed gift ideas</h2>
            <p>
              A <strong>nursery star map</strong> usually lives above the crib, on a gallery wall near the changing
              table, or in a reading corner. Soft, minimal styles tend to fit nursery decor — dark or muted backgrounds
              with clean typography so the sky stays calm rather than busy.
            </p>
            <p className="mt-2">Personalization that lands well:</p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-neutral-200">
              <li>Title: <em>Welcome to the World</em> or the baby&apos;s name</li>
              <li>Subtitle: city and birth date line</li>
              <li>One short line: <em>Under these stars you arrived</em></li>
            </ul>
            <p className="mt-3">
              For a ready-to-hang gift, framed print is the strongest presentation. Compare{" "}
              <Link href="/star-map-gift-formats" className="text-amber-300 hover:underline">
                framed, unframed, and HD digital formats
              </Link>{" "}
              before checkout — the same preview can become any of them.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-semibold text-amber-200 sm:text-2xl">Baby shower and group gifts</h2>
            <p>
              A <strong>baby shower star map gift</strong> works in two common scenarios. Before birth, the group may
              know the due date and city and want something the parents can finalize with the exact time after delivery.
              After birth, grandparents or friends often order from the known birth details as a surprise for the
              nursery.
            </p>
            <p className="mt-2">
              Instant HD digital delivery helps when the shower is this weekend and shipping will not arrive in time —
              parents get a file to print locally while a framed version ships separately. You can also browse the{" "}
              <Link href="/star-map-for/baby-shower" className="text-amber-300 hover:underline">
                baby shower star map page
              </Link>{" "}
              for a preview-first path into checkout.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-semibold text-amber-200 sm:text-2xl">
              How to preview before you buy
            </h2>
            <p>
              You should never pay for a personalized gift blind. StarMapCo lets you build the map free, see the sky,
              adjust text and style, then choose delivery format only when it looks right.
            </p>
            <ol className="mt-2 list-decimal space-y-2 pl-5 text-neutral-200">
              <li>
                Open the{" "}
                <Link href="/star-map-generator" className="text-amber-300 hover:underline">
                  star map generator
                </Link>{" "}
                or the{" "}
                <Link href="/star-map-for/new-baby" className="text-amber-300 hover:underline">
                  new baby star map gift page
                </Link>
              </li>
              <li>Enter birth date, time (if known), and location</li>
              <li>Customize name, date line, and style for the nursery</li>
              <li>Preview free — then unlock HD digital or order framed/unframed print</li>
            </ol>
            <div className="mt-4 flex flex-wrap gap-3">
              <Link
                href="/editor?mode=quick&source=blog-birth-star-map-framed&checkout=print&print_variant=poster_framed"
                className="inline-flex items-center justify-center rounded-full bg-gradient-to-r from-amber-400 via-amber-500 to-amber-400 px-5 py-2.5 text-sm font-semibold text-midnight shadow-lg shadow-amber-200/30 transition hover:-translate-y-[1px]"
              >
                Preview framed nursery gift
              </Link>
              <Link
                href="/star-map-for/new-baby"
                className="inline-flex items-center justify-center rounded-full border border-amber-200/40 bg-amber-400/10 px-5 py-2.5 text-sm font-semibold text-amber-100 transition hover:bg-amber-400/20"
              >
                New baby gift page
              </Link>
            </div>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-semibold text-amber-200 sm:text-2xl">
              Birth star map vs birthday star map
            </h2>
            <p>
              These searches sound similar but serve different moments. A birth star map marks arrival — the night they
              entered the world — and is most often bought for nurseries, newborn gifts, and baby showers. A{" "}
              <Link href="/birthday" className="text-amber-300 hover:underline">
                birthday star map
              </Link>{" "}
              celebrates any birthday year (first birthday, sweet sixteen, a parent&apos;s 40th). If the goal is
              nursery art from delivery night, stay on the birth-night angle; if the goal is a milestone birthday later,
              use the birthday path instead.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-semibold text-amber-200 sm:text-2xl">Birth star map FAQ</h2>
            {faqItems.map((item) => (
              <div key={item.question} className="mt-4">
                <h3 className="font-semibold text-amber-100">{item.question}</h3>
                <p className="mt-1 text-neutral-300">{item.answer}</p>
              </div>
            ))}
          </section>
        </div>

        <BlogPostConversionLinks source="blog-birth-star-map" />
        <FaqSchema items={faqItems} />
      </article>
    </main>
  );
}
