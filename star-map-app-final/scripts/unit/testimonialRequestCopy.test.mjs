import assert from "node:assert/strict";
import test from "node:test";
import {
  buildTestimonialRequestBody,
  buildTestimonialRequestSubject,
} from "../lib/testimonialRequestCopy.harness.mjs";

test("testimonial mailto subject is permission-focused", () => {
  assert.match(buildTestimonialRequestSubject(), /share how your star map/i);
});

test("testimonial mailto body asks for publish permission", () => {
  const body = buildTestimonialRequestBody("Alex");
  assert.match(body, /publish my first name/i);
  assert.match(body, /Alex/);
});
