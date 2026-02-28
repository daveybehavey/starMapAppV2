export type VerifiedTestimonial = {
  quote: string;
  author: string;
  context: string;
};

// Keep these arrays empty until you have real, permissioned customer quotes.
// The testimonial module renders only when entries are present.
export const testimonialsByPage: Record<"personalized" | "gift" | "wedding", VerifiedTestimonial[]> = {
  personalized: [],
  gift: [],
  wedding: [],
};
