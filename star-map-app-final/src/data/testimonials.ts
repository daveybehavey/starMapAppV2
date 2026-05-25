export type VerifiedTestimonial = {
  quote: string;
  author: string;
  context: string;
  /** When true, UI labels the card as a sample placeholder until permissioned quotes replace it. */
  isSample?: boolean;
};

// Use docs/testimonial-intake-template.md before publishing non-sample quotes.
export const testimonialsByPage: Record<
  "personalized" | "gift" | "wedding" | "anniversary" | "nightSkyGift",
  VerifiedTestimonial[]
> = {
  personalized: [],
  gift: [],
  wedding: [
    {
      quote:
        "We used our ceremony city and wedding date — the framed print looks stunning above our bed.",
      author: "Emily R.",
      context: "Wedding gift · framed print",
      isSample: true,
    },
    {
      quote: "Guests kept asking where we got it. The preview matched the final file exactly.",
      author: "James & Priya M.",
      context: "Reception keepsake · unframed",
      isSample: true,
    },
    {
      quote:
        "Ordered HD the week before our vow renewal so we could print locally. Took ten minutes to customize.",
      author: "Lauren T.",
      context: "Vow renewal · HD digital",
      isSample: true,
    },
  ],
  anniversary: [],
  nightSkyGift: [],
};
