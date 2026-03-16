import type { Metadata } from "next";
import { getBusinessPhoneHref, getBusinessProfile } from "@/lib/businessProfile";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://starmapco.com";

export const metadata: Metadata = {
  title: "Contact | StarMapCo",
  description: "How to reach StarMapCo customer support.",
  alternates: { canonical: `${siteUrl}/contact` },
};

export default function ContactPage() {
  const profile = getBusinessProfile();
  const phoneHref = getBusinessPhoneHref();

  return (
    <main className="mx-auto max-w-3xl px-4 py-10 sm:py-14">
      <div className="cosmic-panel rounded-3xl border border-amber-200/70 bg-[rgba(247,241,227,0.9)] p-6 shadow-2xl sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.25em] text-amber-700">Support</p>
        <h1 className="mt-2 text-3xl font-semibold text-midnight sm:text-4xl">Contact {profile.name}</h1>
        <p className="mt-3 text-sm text-neutral-900 sm:text-base">
          Need help with a download, print order, or billing question? Reach us using the details below and include your
          order email if you have one.
        </p>

        <div className="mt-6 space-y-3 text-sm text-neutral-900 sm:text-base">
          <p>
            <strong>Email:</strong>{" "}
            <a className="font-semibold text-midnight underline" href={`mailto:${profile.email}`}>
              {profile.email}
            </a>
          </p>
          {profile.phone ? (
            <p>
              <strong>Phone:</strong>{" "}
              <a className="font-semibold text-midnight underline" href={`tel:${phoneHref}`}>
                {profile.phone}
              </a>
            </p>
          ) : null}
          {profile.address ? (
            <p>
              <strong>Business address:</strong> {profile.address}
            </p>
          ) : null}
          {profile.hours ? (
            <p>
              <strong>Support hours:</strong> {profile.hours}
            </p>
          ) : null}
          <p>
            StarMapCo handles customer support directly. Include your order details and any screenshots or photos if
            you are contacting us about a print, shipping, or download issue.
          </p>
        </div>
      </div>
    </main>
  );
}
