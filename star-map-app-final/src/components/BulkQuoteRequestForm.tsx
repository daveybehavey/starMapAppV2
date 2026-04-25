"use client";

import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/Button";

type BulkQuoteRequestFormProps = {
  supportEmail: string;
};

type SubmitState =
  | { status: "idle" }
  | { status: "success"; requestId: string | null }
  | { status: "error"; message: string };

function errorMessageFor(code: string) {
  switch (code) {
    case "invalid_name":
      return "Add a contact name so the quote can be routed correctly.";
    case "invalid_email":
      return "Use a valid reply email for the quote.";
    case "invalid_quantity":
      return "Bulk quotes start at 25 pieces.";
    case "invalid_version_count":
    case "version_count_exceeds_quantity":
      return "Check the number of distinct versions against the total quantity.";
    case "invalid_event_dates":
      return "Add the event date or date range you want us to quote.";
    case "invalid_map_location":
      return "Add the location details you want used for the map.";
    case "invalid_shipping_destination":
      return "Add the shipping city, state, and country.";
    case "Too many requests. Please try again later.":
      return "Too many requests from this browser right now. Try again later or email support directly.";
    default:
      return "The quote request did not go through. Email support if this keeps happening.";
  }
}

export default function BulkQuoteRequestForm({ supportEmail }: BulkQuoteRequestFormProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitState, setSubmitState] = useState<SubmitState>({ status: "idle" });

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting) return;

    const form = event.currentTarget;
    const formData = new FormData(form);
    const payload = {
      name: formData.get("name"),
      email: formData.get("email"),
      organization: formData.get("organization"),
      orderType: formData.get("orderType"),
      quantity: formData.get("quantity"),
      versionCount: formData.get("versionCount"),
      eventDates: formData.get("eventDates"),
      mapLocation: formData.get("mapLocation"),
      preferredFormat: formData.get("preferredFormat"),
      sizePreference: formData.get("sizePreference"),
      deliveryDeadline: formData.get("deliveryDeadline"),
      shippingDestination: formData.get("shippingDestination"),
      brandingRequest: formData.get("brandingRequest"),
      notes: formData.get("notes"),
      source: "bulk_event_orders_page",
      website: formData.get("website"),
    };

    setIsSubmitting(true);
    setSubmitState({ status: "idle" });

    try {
      const response = await fetch("/api/bulk-quotes", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const result = (await response.json().catch(() => null)) as
        | { ok?: boolean; error?: string; requestId?: string | null }
        | null;

      if (!response.ok || !result?.ok) {
        setSubmitState({ status: "error", message: errorMessageFor(result?.error || "") });
        return;
      }

      form.reset();
      setSubmitState({ status: "success", requestId: result.requestId ?? null });
    } catch {
      setSubmitState({
        status: "error",
        message: "The quote request could not be sent. Email support if you need a same-day reply.",
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div
      id="quote-form"
      className="rounded-[32px] border border-amber-200/60 bg-[linear-gradient(180deg,rgba(255,251,240,0.98),rgba(247,241,227,0.94))] p-6 shadow-2xl shadow-black/20 sm:p-8"
    >
      <div className="space-y-3 text-midnight">
        <p className="text-xs font-semibold uppercase tracking-[0.32em] text-amber-600">Request a custom quote</p>
        <h2 className="text-2xl font-semibold leading-tight sm:text-3xl">Tell us the event, quantity, and timeline.</h2>
        <p className="text-sm leading-7 text-slate-800 sm:text-base">
          We use this to scope the version count, production format, and delivery plan before sending a formal quote.
        </p>
      </div>

      <form className="mt-8 grid gap-4 sm:grid-cols-2" onSubmit={handleSubmit}>
        <input
          type="text"
          name="website"
          tabIndex={-1}
          autoComplete="off"
          aria-hidden="true"
          className="pointer-events-none absolute left-[-9999px] top-auto h-px w-px opacity-0"
        />

        <label className="space-y-2">
          <span className="text-sm font-semibold text-midnight">Name</span>
          <input
            name="name"
            required
            maxLength={80}
            className="w-full rounded-2xl border border-amber-200 bg-white px-4 py-3 text-sm text-midnight shadow-inner shadow-black/5 focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-400/35"
            placeholder="Monica Eguia"
          />
        </label>

        <label className="space-y-2">
          <span className="text-sm font-semibold text-midnight">Reply email</span>
          <input
            name="email"
            type="email"
            required
            maxLength={120}
            autoComplete="email"
            className="w-full rounded-2xl border border-amber-200 bg-white px-4 py-3 text-sm text-midnight shadow-inner shadow-black/5 focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-400/35"
            placeholder="you@company.com"
          />
        </label>

        <label className="space-y-2">
          <span className="text-sm font-semibold text-midnight">Company or organization</span>
          <input
            name="organization"
            maxLength={120}
            className="w-full rounded-2xl border border-amber-200 bg-white px-4 py-3 text-sm text-midnight shadow-inner shadow-black/5 focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-400/35"
            placeholder="Inviso Corp"
          />
        </label>

        <label className="space-y-2">
          <span className="text-sm font-semibold text-midnight">Order type</span>
          <select
            name="orderType"
            defaultValue="corporate"
            className="w-full rounded-2xl border border-amber-200 bg-white px-4 py-3 text-sm text-midnight shadow-inner shadow-black/5 focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-400/35"
          >
            <option value="corporate">Corporate</option>
            <option value="memorial">Memorial</option>
            <option value="wedding">Wedding</option>
            <option value="milestone">Milestone event</option>
            <option value="other">Other</option>
          </select>
        </label>

        <label className="space-y-2">
          <span className="text-sm font-semibold text-midnight">Quantity</span>
          <input
            name="quantity"
            type="number"
            min={25}
            max={5000}
            required
            defaultValue={25}
            className="w-full rounded-2xl border border-amber-200 bg-white px-4 py-3 text-sm text-midnight shadow-inner shadow-black/5 focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-400/35"
          />
        </label>

        <label className="space-y-2">
          <span className="text-sm font-semibold text-midnight">Distinct versions</span>
          <input
            name="versionCount"
            type="number"
            min={1}
            max={5000}
            required
            defaultValue={1}
            className="w-full rounded-2xl border border-amber-200 bg-white px-4 py-3 text-sm text-midnight shadow-inner shadow-black/5 focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-400/35"
          />
        </label>

        <label className="space-y-2 sm:col-span-2">
          <span className="text-sm font-semibold text-midnight">Event date or date range</span>
          <input
            name="eventDates"
            required
            maxLength={280}
            className="w-full rounded-2xl border border-amber-200 bg-white px-4 py-3 text-sm text-midnight shadow-inner shadow-black/5 focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-400/35"
            placeholder="April 20, 2026 or April 20-22, 2026"
          />
        </label>

        <label className="space-y-2 sm:col-span-2">
          <span className="text-sm font-semibold text-midnight">Map location details</span>
          <input
            name="mapLocation"
            required
            maxLength={180}
            className="w-full rounded-2xl border border-amber-200 bg-white px-4 py-3 text-sm text-midnight shadow-inner shadow-black/5 focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-400/35"
            placeholder="Scottsdale, Arizona"
          />
        </label>

        <label className="space-y-2">
          <span className="text-sm font-semibold text-midnight">Preferred format</span>
          <select
            name="preferredFormat"
            defaultValue="unframed"
            className="w-full rounded-2xl border border-amber-200 bg-white px-4 py-3 text-sm text-midnight shadow-inner shadow-black/5 focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-400/35"
          >
            <option value="unframed">Unframed</option>
            <option value="framed">Framed</option>
            <option value="not_sure">Not sure yet</option>
          </select>
        </label>

        <label className="space-y-2">
          <span className="text-sm font-semibold text-midnight">Preferred size</span>
          <input
            name="sizePreference"
            maxLength={80}
            className="w-full rounded-2xl border border-amber-200 bg-white px-4 py-3 text-sm text-midnight shadow-inner shadow-black/5 focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-400/35"
            placeholder='18" x 18"'
          />
        </label>

        <label className="space-y-2">
          <span className="text-sm font-semibold text-midnight">Delivery deadline</span>
          <input
            name="deliveryDeadline"
            maxLength={80}
            className="w-full rounded-2xl border border-amber-200 bg-white px-4 py-3 text-sm text-midnight shadow-inner shadow-black/5 focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-400/35"
            placeholder="Needed by May 5, 2026"
          />
        </label>

        <label className="space-y-2">
          <span className="text-sm font-semibold text-midnight">Branding request</span>
          <select
            name="brandingRequest"
            defaultValue="none"
            className="w-full rounded-2xl border border-amber-200 bg-white px-4 py-3 text-sm text-midnight shadow-inner shadow-black/5 focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-400/35"
          >
            <option value="none">No logo or branding</option>
            <option value="bottom_left_logo">Bottom-left logo</option>
            <option value="subtle_logo">Subtle logo placement</option>
            <option value="custom_branding">Custom branding note</option>
          </select>
        </label>

        <label className="space-y-2 sm:col-span-2">
          <span className="text-sm font-semibold text-midnight">Shipping destination</span>
          <input
            name="shippingDestination"
            required
            maxLength={180}
            className="w-full rounded-2xl border border-amber-200 bg-white px-4 py-3 text-sm text-midnight shadow-inner shadow-black/5 focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-400/35"
            placeholder="Bellevue, WA, United States"
          />
        </label>

        <label className="space-y-2 sm:col-span-2">
          <span className="text-sm font-semibold text-midnight">Notes</span>
          <textarea
            name="notes"
            rows={5}
            maxLength={1200}
            className="w-full rounded-3xl border border-amber-200 bg-white px-4 py-3 text-sm text-midnight shadow-inner shadow-black/5 focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-400/35"
            placeholder="Anything that affects quoting: version splits, packaging requirements, or branding details."
          />
        </label>

        <div className="space-y-3 sm:col-span-2">
          <Button type="submit" variant="cta" size="lg" isLoading={isSubmitting}>
            Request custom quote
          </Button>

          {submitState.status === "success" ? (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
              Quote request sent. We&apos;ll reply from {supportEmail} after reviewing the quantity, version count, and timing.
              {submitState.requestId ? (
                <span className="mt-1 block text-xs text-emerald-800/80">Reference: {submitState.requestId}</span>
              ) : null}
            </div>
          ) : null}

          {submitState.status === "error" ? (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
              {submitState.message}{" "}
              <a className="font-semibold underline" href={`mailto:${supportEmail}`}>
                Email {supportEmail}
              </a>
              .
            </div>
          ) : null}

          <p className="text-xs leading-6 text-slate-700">
            We&apos;ll confirm logo files and any proof details after reviewing the request. This form is for quote scoping,
            not final artwork upload.
          </p>
        </div>
      </form>
    </div>
  );
}
