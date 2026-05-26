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
  wedding: [],
  anniversary: [],
  nightSkyGift: [],
};
