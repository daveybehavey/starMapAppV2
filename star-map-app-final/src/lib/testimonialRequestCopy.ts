const DEFAULT_SUPPORT_EMAIL = "support@starmapco.com";

export function getTestimonialRequestSupportEmail(): string {
  const fromEnv = process.env.NEXT_PUBLIC_SUPPORT_EMAIL?.trim();
  return fromEnv || DEFAULT_SUPPORT_EMAIL;
}

export function buildTestimonialRequestSubject(): string {
  return "Quick favor — would you share how your star map turned out?";
}

/** Permissioned testimonial ask — publish only with written approval. */
export function buildTestimonialRequestBody(firstName = "there"): string {
  const supportEmail = getTestimonialRequestSupportEmail();
  return [
    `Hi StarMapCo,`,
    ``,
    `Thank you again for my order. If you're open to it, here's a short testimonial you may publish on starmapco.com:`,
    ``,
    `1. One or two sentences about my experience (what I ordered and who it was for)`,
    `2. Yes — you may publish my first name + quote on the site`,
    `3. Optional: I can send a photo of the print if you'd like (only with my permission)`,
    ``,
    `[Your quote here]`,
    ``,
    `— ${firstName === "there" ? "[Your first name]" : firstName}`,
    ``,
    `Sent to ${supportEmail}`,
  ].join("\n");
}

export function buildTestimonialRequestMailto(firstName?: string): string {
  const email = getTestimonialRequestSupportEmail();
  const subject = buildTestimonialRequestSubject();
  const body = buildTestimonialRequestBody(firstName?.trim() || "there");
  return `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
