import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import localFont from "next/font/local";
import PreviewStartForm from "@/components/PreviewStartForm";
import { formatPrice, getPricingTiers } from "@/lib/pricing";
import {
  formatStandalonePrintPriceWithShipping,
  getPrintShippingDisclosure,
  getPrintProductionReviewDisclosure,
} from "@/lib/printCheckoutConfig";
import styles from "./page.module.css";

const editorial = localFont({
  src: "../../../fonts/cormorant-garamond/latin-400-normal.woff2",
  display: "swap",
});
export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Some nights change everything. | StarMapCo",
  description:
    "Keep the sky from your meaningful moment. Create a free personal star map preview, then choose a download or print.",
  robots: { index: false, follow: false, googleBot: { index: false, follow: false } },
};

export default function MeaningfulNightPage() {
  const digital = getPricingTiers().single;
  const formats = [
    {
      name: "The digital keepsake",
      detail: "HD digital download",
      price: formatPrice(digital.amountCents, digital.currency),
      size: "6000px-wide PNG",
      description:
        "Your finished design, without a watermark. Download after payment and print locally when you’re ready.",
      note: "No shipping. No physical product.",
    },
    {
      name: "Make room for a memory",
      detail: "Unframed print",
      price: formatStandalonePrintPriceWithShipping("poster_unframed"),
      size: "18 × 18 inch poster",
      description:
        "Your personal sky on matte poster stock. Bring your own frame and make it part of your home.",
      note: "Frame not included.",
    },
    {
      name: "A moment, beautifully kept",
      detail: "Framed print",
      price: formatStandalonePrintPriceWithShipping("poster_framed"),
      size: "14 × 14 inch · black frame",
      description:
        "A ready-to-hang keepsake with Enhanced Matte paper and a black frame. Made from your approved design.",
      note: "HD download is an optional paid add-on.",
    },
  ];
  return (
    <main id="main-content" className={styles.landing}>
      <header className={styles.nav}>
        <Link href="/" prefetch={false} className={styles.wordmark}>
          STARMAPCO
        </Link>
        <a href="#preview" className={styles.navAction}>
          Create your preview <span aria-hidden="true">↗</span>
        </a>
      </header>
      <section className={styles.hero} aria-labelledby="campaign-title">
        <div className={styles.heroCopy}>
          <p className={styles.eyebrow}>THE SKY CHANGES. THE MEMORY STAYS.</p>
          <h1 id="campaign-title" className={editorial.className}>
            Some nights
            <br />
            <em>change everything.</em>
          </h1>
          <p className={styles.intro}>
            The first hello. The day you said yes. The moment your world grew.
            <br />
            Keep the sky that belongs to your story.
          </p>
          <a className={styles.primary} href="#preview">
            Create your free preview <span aria-hidden="true">↗</span>
          </a>
          <p className={styles.micro}>No account needed. Downloads and prints are paid options.</p>
        </div>
        <figure className={styles.scene}>
          <div className={styles.frame}>
            <Image
              src="/campaign/meaningful-night/heart-preview.png"
              alt="Actual StarMapCo heart preview for Santorini, June 1, 2024, with the dedication The Night We Became One"
              width={1200}
              height={1200}
              sizes="(max-width: 760px) 80vw, 42vw"
              priority
            />
          </div>
          <figcaption>Illustrative frame · actual watermarked StarMapCo preview</figcaption>
          <span className={`${styles.sceneCaption} ${editorial.className}`} aria-hidden="true">
            A date. A place.
            <br />
            <em>Forever yours.</em>
          </span>
        </figure>
      </section>
      <section className={styles.story} aria-labelledby="story-title">
        <div>
          <p className={styles.eyebrow}>PERSONAL, FROM THE FIRST STAR</p>
          <h2 id="story-title" className={editorial.className}>
            Not just a night sky.
            <br />
            <em>Your night sky.</em>
          </h2>
        </div>
        <ol className={styles.steps}>
          <li>
            <span>01</span>
            <div>
              <h3>Choose your moment</h3>
              <p>
                Start with a date and place. Check the local time and timezone in the editor for the moment
                you want to capture.
              </p>
            </div>
          </li>
          <li>
            <span>02</span>
            <div>
              <h3>Make it yours</h3>
              <p>
                Choose the shape and colors. Add names, a dedication or the few words that say everything.
              </p>
            </div>
          </li>
          <li>
            <span>03</span>
            <div>
              <h3>Choose how to keep it</h3>
              <p>
                Preview your design before paying. Then choose an HD download, an unframed print or a framed
                keepsake.
              </p>
            </div>
          </li>
        </ol>
      </section>
      <section id="preview" className={styles.preview} aria-label="Create your personal star map">
        <div>
          <p className={styles.eyebrow}>BEGIN WITH YOUR MOMENT</p>
          <h2 className={editorial.className}>
            Which night
            <br />
            <em>is yours?</em>
          </h2>
          <p>
            Start here. In the editor, confirm your local time and timezone before approving the sky. If the
            time is unknown, your map will be an approximation of that night.
          </p>
          <Link href="/how-accurate-are-star-maps" prefetch={false}>
            How your sky is calculated ↗
          </Link>
        </div>
        <div className={styles.form}>
          <PreviewStartForm
            title="Create your free preview"
            description="Enter your date and place. You can personalize the design and choose a delivery format in the editor."
            buttonLabel="See my night sky →"
            source="meaningful-night"
            showMobileDateHelper
            showPrintOffer={false}
          />
        </div>
      </section>
      <section className={styles.formats} aria-labelledby="formats-title">
        <p className={styles.eyebrow}>ONE DESIGN. YOUR WAY TO KEEP IT.</p>
        <h2 id="formats-title" className={editorial.className}>
          From a moment
          <br />
          <em>to a keepsake.</em>
        </h2>
        <div className={styles.cards}>
          {formats.map((format, i) => (
            <article key={format.detail} className={styles.card}>
              <span className={styles.formatNumber}>0{i + 1}</span>
              <p className={styles.eyebrow}>{format.detail}</p>
              <h3 className={editorial.className}>{format.name}</h3>
              <p className={styles.price}>{format.price}</p>
              <p className={styles.size}>{format.size}</p>
              <p>{format.description}</p>
              <p className={styles.note}>{format.note}</p>
              <a href="#preview">
                Start with a free preview <span aria-hidden="true">↗</span>
              </a>
            </article>
          ))}
        </div>
        <p className={styles.shipping}>
          {getPrintShippingDisclosure()} Applicable taxes and the final total are shown before payment. Prices
          above are in the displayed currency; checkout confirms your market.
        </p>
      </section>
      <section className={styles.questions} aria-labelledby="questions-title">
        <div>
          <p className={styles.eyebrow}>THE LITTLE DETAILS</p>
          <h2 id="questions-title" className={editorial.className}>
            Before you
            <br />
            <em>make it yours.</em>
          </h2>
        </div>
        <div className={styles.answers}>
          <details>
            <summary>Is the preview really free?</summary>
            <p>
              Yes. Create and customize a watermarked preview without an account. HD downloads and physical
              prints are paid options. A free preview does not include a free physical product.
            </p>
          </details>
          <details>
            <summary>When will my gift arrive?</summary>
            <p>
              {getPrintProductionReviewDisclosure()} Typical production takes 2–5 business days, plus carrier
              transit. Select your shipping country in checkout for an estimate. Delivery dates are estimates,
              not guarantees.{" "}
              <Link href="/shipping" prefetch={false}>
                Shipping details
              </Link>
              .
            </p>
          </details>
          <details>
            <summary>What if my print arrives damaged?</summary>
            <p>
              Contact support with your order details and photos within 30 days. Personalized products are not
              eligible for change-of-mind returns.{" "}
              <Link href="/returns" prefetch={false}>
                Read the returns policy
              </Link>
              .
            </p>
          </details>
          <details>
            <summary>Will my finished map have a watermark?</summary>
            <p>
              The free preview shown here is watermarked. Paid HD exports have no watermark. Confirm your
              design and selected product in the editor before paying.
            </p>
          </details>
        </div>
      </section>
      <section className={styles.closing}>
        <p className={styles.eyebrow}>SOME MOMENTS DESERVE MORE THAN A PHOTO.</p>
        <h2 className={editorial.className}>Keep yours.</h2>
        <a className={styles.primary} href="#preview">
          Create your free preview <span aria-hidden="true">↗</span>
        </a>
        <p className={styles.micro}>Made personal. Previewed by you.</p>
      </section>
    </main>
  );
}
