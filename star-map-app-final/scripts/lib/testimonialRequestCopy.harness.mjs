/** Keep in sync with src/lib/testimonialRequestCopy.ts */

export function buildTestimonialRequestSubject() {
  return "Quick favor — would you share how your star map turned out?";
}

export function buildTestimonialRequestBody(firstName = "there") {
  return [
    "Hi StarMapCo,",
    "",
    "Thank you again for my order. If you're open to it, here's a short testimonial you may publish on starmapco.com:",
    "",
    "1. One or two sentences about my experience (what I ordered and who it was for)",
    "2. Yes — you may publish my first name + quote on the site",
    "3. Optional: I can send a photo of the print if you'd like (only with my permission)",
    "",
    "[Your quote here]",
    "",
    `— ${firstName === "there" ? "[Your first name]" : firstName}`,
  ].join("\n");
}
