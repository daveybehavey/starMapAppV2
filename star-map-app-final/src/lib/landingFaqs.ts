/**
 * Shared FAQ sources for the occasion / landing pages (issue #441).
 *
 * Each entry below is the SINGLE source for one page's FAQ: the page renders
 * its visible FAQ by mapping the same array (or builder result) that it
 * passes to <FaqSchema> for the FAQPage JSON-LD, so the two copies can no
 * longer drift. Wording was lifted verbatim from the pages' previous
 * hand-maintained copies — do not edit copy here without updating the page
 * owner's copy source.
 */
export type LandingFaqItem = {
  question: string;
  answer: string;
};

/** FAQ for /birthday. */
export const BIRTHDAY_FAQ_ITEMS: LandingFaqItem[] = [
  {
    question: "Do I need the exact birth time?",
    answer:
      "The exact time makes the sky most precise, but you can still create a beautiful birthday star map with just the date and location. If the birth time is unknown, the map defaults to midnight and you can adjust.",
  },
  {
    question: "Is a constellation map birthday gift a personal keepsake for milestone birthdays?",
    answer:
      "Yes. A sky map birthday gift is a personal way to commemorate the exact night sky from a birth date or milestone birthday. Birthday star maps fit 18th, 21st, 30th, 40th, 50th, and other milestone celebrations because the sky on the day someone was born is truly one of a kind.",
  },
  {
    question: "Can I use the hospital city as the birth location?",
    answer:
      "Yes. Any city or town worldwide works. Enter the place where the person was born — or wherever they were when the birthday moment happened — and the generator plots the accurate sky for that location.",
  },
  {
    question: "Does it work for birthdays from any year?",
    answer:
      "Yes. The map generator works for any past date — whether the birthday is from last year or many decades ago. You can capture the exact sky from someone's birth year just as accurately as a recent date.",
  },
  {
    question: "Can I add a birthday message to the map?",
    answer:
      "Yes. The editor lets you add a title, the person's name, the date, and a short dedication line. You can adjust fonts and styles to match the look you want.",
  },
  {
    question: "Is the preview free before I buy?",
    answer:
      "Yes. You can preview the birthday star map for free with no account required. The watermark is removed only after you pay — so you can fine-tune the design before committing.",
  },
  {
    question: "What gift format works best for a birthday star map?",
    answer:
      "Framed print is the premium birthday gift route because it arrives ready to display. Unframed lowers the total if the recipient already has a frame. HD digital is the fastest option when you need the gift same-day.",
  },
];

/** FAQ for /star-map-gift. The final answer ends with the caller's shipping tag sentence, which the page derives from the print shipping config. */
export function buildStarMapGiftFaqItems(shippingTagSentence: string): LandingFaqItem[] {
  return [
    {
      question: "Is a star map a good couples gift?",
      answer:
        "Yes. A custom star map gift is one of the most meaningful couples gifts because it captures the exact sky from a shared moment.",
    },
    {
      question: "Can I add names and a date?",
      answer:
        "You can personalize the star map with names, a title, a date line, and a dedication before approving the same design for framed print, unframed print, or HD digital delivery.",
    },
    {
      question: "Can I create it now and buy later?",
      answer:
        "Yes. You can design and preview first, then come back when you are ready to take the framed route, the unframed route, or HD digital delivery.",
    },
    {
      question: "What if I need a quick gift turnaround?",
      answer:
        "For same-day gifting, HD digital delivery is the fastest route. If you want a shipped keepsake, start with the framed preview and check shipping timing before payment.",
    },
    {
      question: "Can I send a physical print instead of digital only?",
      answer: `Yes. You can choose framed print or unframed print in checkout after previewing your design. ${shippingTagSentence}`,
    },
  ];
}

/** FAQ for /star-map-in/[slug]. The first two entries interpolate the location display name; the third is the location's survivor FAQ entry. */
export function buildStarMapInFaqItems(
  display: string,
  survivorFaq: { question: string; answer: string }
): LandingFaqItem[] {
  return [
    {
      question: `Can I create a star map for ${display}?`,
      answer: `Yes. Enter any date and time, and the map will render the accurate night sky for ${display}.`,
    },
    {
      question: `Is the ${display} star map print‑ready?`,
      answer: "The HD export is a high‑resolution PNG designed for printing and framing.",
    },
    {
      question: survivorFaq.question,
      answer: survivorFaq.answer,
    },
  ];
}

/** FAQ for /constellation-map. */
export const CONSTELLATION_MAP_FAQ_ITEMS: LandingFaqItem[] = [
  {
    question: "What is a constellation map?",
    answer:
      "A constellation map is a star map that highlights the constellation layout for a specific date and location, showing how the sky looked at that moment.",
  },
  {
    question: "Can I personalize a constellation map?",
    answer:
      "Yes. Add names, a date line, and a dedication, then choose styles and labels before deciding on framed print, unframed print, or HD digital delivery.",
  },
];

/** FAQ for /custom-night-sky-map. */
export const CUSTOM_NIGHT_SKY_MAP_FAQ_ITEMS: LandingFaqItem[] = [
  {
    question: "What is a custom night sky map?",
    answer:
      "A custom night sky map is a star map generated from a specific date, time, and location — showing the real positions of stars and constellations as they appeared at that moment. It is commonly used as a personalized gift for anniversaries, weddings, birthdays, and other milestones.",
  },
  {
    question: "Can I preview the night sky map before buying?",
    answer:
      "Yes. The preview is free and requires no account. Enter your date and location, refine the design, and then choose framed print, unframed print, or HD digital delivery when you are ready to buy.",
  },
  {
    question: "How accurate is the custom night sky map?",
    answer:
      "The map is calculated from real astronomical data, so the star positions and constellation shapes match the sky at your exact date, time, and geographic coordinates — not a generic illustration.",
  },
  {
    question: "Can I make a custom night sky map for a wedding date?",
    answer:
      "Yes. Enter the wedding date and ceremony location to generate the exact night sky for that moment. The framed print works well as a keepsake. You can preview the design for free before choosing a format.",
  },
  {
    question: "What formats are available for the custom night sky map?",
    answer:
      "After preview, you can choose a framed print (arrives ready to display), an unframed poster (lower cost, you frame it), or an HD digital download. All three use the same approved design.",
  },
];

/** FAQ for /how-to-print-star-map. */
export const HOW_TO_PRINT_STAR_MAP_FAQ_ITEMS: LandingFaqItem[] = [
  {
    question: "What file format do I get?",
    answer: "Downloads are high‑resolution PNG files, ideal for local or online printing.",
  },
  {
    question: "What size should I print?",
    answer: "Common sizes include 11x14, 16x20, and 24x36. Choose the size that fits your frame and space.",
  },
];

/** FAQ for /night-sky-map-gift. */
export const NIGHT_SKY_MAP_GIFT_FAQ_ITEMS: LandingFaqItem[] = [
  {
    question: "What is a night sky map gift?",
    answer:
      "A night sky map gift is a custom star map showing the exact positions of stars and constellations on a specific date and location — such as an anniversary, wedding, or birthday. It is printed or delivered digitally and personalized with names, a date, and a message.",
  },
  {
    question: "How fast do I receive a night sky map gift?",
    answer:
      "The HD digital download is available right after payment — ideal for last-minute gifting. Framed and unframed print routes show exact shipping timelines before you pay. All routes start with a free preview.",
  },
  {
    question: "What makes this a personalized gift?",
    answer:
      "Every map is generated from the exact date, time, and location you provide, using real astronomical data. The star positions are accurate to that specific moment — not a generic illustration. You also add custom text like names, a date, and a short message.",
  },
  {
    question: "Is a night sky map a good anniversary gift?",
    answer:
      "Yes — an anniversary star map captures the exact sky from your shared date and place. Enter your anniversary date and the location where you were together to generate that night. The framed print route arrives ready to hang.",
  },
  {
    question: "Can I get a night sky map gift same-day?",
    answer:
      "Yes. The HD digital download is delivered right after payment and can be printed at home or at a local print shop on the same day.",
  },
];

/** FAQ for /star-map-gallery. */
export const STAR_MAP_GALLERY_FAQ_ITEMS: LandingFaqItem[] = [
  {
    question: "Are these real star maps?",
    answer: "Yes. Every example is generated from real astronomical data for a specific date and location.",
  },
  {
    question: "Can I recreate one of these exact maps?",
    answer:
      "Yes. Enter the same date and location to get a matching sky, then customize the text and layout.",
  },
  {
    question: "Do I get a print-ready file?",
    answer: "Yes. After unlocking, you download a high-resolution file ready for printing or gifting.",
  },
  {
    question: "Can I order a physical version from one of these examples?",
    answer:
      "Yes. After preview, checkout supports both unframed print and framed print from the same design, with shipping shown before payment.",
  },
];

/** FAQ for /star-map-gift-formats. */
export const STAR_MAP_GIFT_FORMATS_FAQ_ITEMS: LandingFaqItem[] = [
  {
    question: "Can I choose format before designing?",
    answer:
      "Yes, but the recommended flow is preview first, then choose digital, framed, or unframed checkout.",
  },
  {
    question: "Will you add more products?",
    answer: "Yes. We add new products gradually, once they pass our quality checks.",
  },
  {
    question: "Can I buy digital and print together?",
    answer: "Yes. Print checkout can include the HD digital add-on so you have both immediately.",
  },
  {
    question: "Where can I request a new product format?",
    answer:
      "Email support@starmapco.com with your request and country — requests help us decide what to add next.",
  },
];

/** FAQ for /star-map-gift-ideas. */
export const STAR_MAP_GIFT_IDEAS_FAQ_ITEMS: LandingFaqItem[] = [
  {
    question: "What date should I choose for a gift?",
    answer: "Pick the moment that means the most — the day you met, the proposal, a birth, or a shared trip.",
  },
  {
    question: "Can I preview the map before purchasing?",
    answer:
      "Yes. You can preview the exact sky for free, then choose framed print, unframed print, or HD digital delivery.",
  },
];
