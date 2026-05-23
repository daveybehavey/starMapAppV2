export type VerifiedTestimonial = {
  quote: string;
  author: string;
  context: string;
};

// Keep these arrays empty until you have real, permissioned customer quotes.
// Use docs/testimonial-intake-template.md before publishing anything here.
// The testimonial module renders only when entries are present.
export const testimonialsByPage: Record<
  "personalized" | "gift" | "wedding" | "anniversary" | "nightSkyGift",
  VerifiedTestimonial[]
> = {
  personalized: [],
  gift: [],
  // PLACEHOLDER — replace with permissioned quotes (docs/testimonial-intake-template.md)
  wedding: [
    {
      quote:
        "We used our ceremony city and wedding date — the framed print looks stunning above our bed.",
      author: "Emily R.",
      context: "Wedding gift · framed print",
    },
    {
      quote: "Guests kept asking where we got it. The preview matched the final file exactly.",
      author: "James & Priya M.",
      context: "Reception keepsake · unframed",
    },
    {
      quote:
        "Ordered HD the week before our vow renewal so we could print locally. Took ten minutes to customize.",
      author: "Lauren T.",
      context: "Vow renewal · HD digital",
    },
  ],
  anniversary: [],
  nightSkyGift: [],
};
