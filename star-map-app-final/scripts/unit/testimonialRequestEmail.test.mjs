import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  buildTestimonialRequestEmailBody,
  buildTestimonialRequestSubject,
  TESTIMONIAL_REVIEW_LINKS,
} from "../testimonial-request-email.mjs";

const SCRIPT_PATH = fileURLToPath(new URL("../testimonial-request-email.mjs", import.meta.url));

test("testimonial outbound subject stays permission-focused", () => {
  assert.match(buildTestimonialRequestSubject(), /share how your star map/i);
});

test("testimonial outbound body leads with Google and Trustpilot review links", () => {
  const body = buildTestimonialRequestEmailBody("Alex", "hello@starmapco.com");
  assert.match(body, /Hi Alex,/);
  assert.match(body, /We never invent reviews or ratings/);
  assert.match(body, /No pressure at all/);

  const googleIdx = body.indexOf(TESTIMONIAL_REVIEW_LINKS.google.href);
  const trustpilotIdx = body.indexOf(TESTIMONIAL_REVIEW_LINKS.trustpilot.href);
  const optionalIdx = body.indexOf("Optional — if you'd rather reply");
  const inventIdx = body.indexOf("We never invent reviews");

  assert.ok(googleIdx >= 0, "Google review URL present");
  assert.ok(trustpilotIdx >= 0, "Trustpilot review URL present");
  assert.ok(optionalIdx > trustpilotIdx, "reply-with-testimonial ask stays secondary");
  assert.ok(inventIdx > optionalIdx, "honesty line retained after secondary ask");

  assert.match(body, /Review us on Google/);
  assert.match(body, /Review us on Trustpilot/);
  assert.match(body, /One or two sentences about your experience/);
  assert.match(body, /hello@starmapco\.com/);
});

test("testimonial CLI prints restructured body without importing side effects breaking tests", () => {
  const result = spawnSync(process.execPath, [SCRIPT_PATH, "--first-name", "Sam"], {
    encoding: "utf8",
    env: { ...process.env, PROMOTION_EMAIL_FROM: "hello@starmapco.com" },
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Subject: Quick favor/);
  assert.match(result.stdout, /Hi Sam,/);
  assert.match(result.stdout, /https:\/\/g\.page\/r\/CVMm_3hOFgRTEAI\/review/);
  assert.match(result.stdout, /https:\/\/www\.trustpilot\.com\/review\/starmapco\.com/);
  assert.match(result.stdout, /Optional — if you'd rather reply/);
  assert.match(result.stdout, /We never invent reviews or ratings/);
});
