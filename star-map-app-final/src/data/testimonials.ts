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
      quote: "We turned our most meaningful night into a stunning piece of art.",
      author: "D.H. & K.H.",
      context: "Wedding gift · framed print + HD",
      isSample: true,
    },
  ],
  anniversary: [],
  nightSkyGift: [],
};
