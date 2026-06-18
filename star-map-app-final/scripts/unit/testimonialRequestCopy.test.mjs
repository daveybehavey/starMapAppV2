import assert from "node:assert/strict";
import test from "node:test";
import {
  buildTestimonialRequestBody,
  buildTestimonialRequestSubject,
} from "../lib/testimonialRequestCopy.harness.mjs";

test("testimonial request subject is permission-focused", () => {
  assert.match(buildTestimonialRequestSubject(), /share how your star map/i);
});

test("testimonial body asks for publish permission", () => {
  const body = buildTestimonialRequestBody("Alex");
  assert.match(body, /publish my first name/i);
  assert.match(body, /Alex/);
});
