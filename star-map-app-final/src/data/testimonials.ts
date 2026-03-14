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
  wedding: [],
  anniversary: [],
  nightSkyGift: [],
};
