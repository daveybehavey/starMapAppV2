"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { getBusinessProfile } from "@/lib/businessProfile";
import { isShopTabEnabled } from "@/lib/shopTab";

function shouldHideSiteTopNav(pathname: string) {
  if (pathname.startsWith("/editor")) return true;
  if (pathname.startsWith("/m/")) return true;
  if (pathname.startsWith("/funnel")) return true;
  return false;
}

export default function SiteTopNav() {
  const pathname = usePathname() || "";
  if (shouldHideSiteTopNav(pathname)) return null;

  const brand = getBusinessProfile();
  const shopOn = isShopTabEnabled();

  return (
    <header className="sticky top-0 z-50 border-b border-white/10 bg-[rgba(5,9,21,0.88)] backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <Link
          href="/"
          prefetch={false}
          className="shrink-0 text-sm font-semibold tracking-wide text-[#f8e8bf] sm:text-base"
        >
          {brand.name}
        </Link>
        <nav
          aria-label="Primary"
          className="flex max-w-[min(72vw,28rem)] flex-nowrap items-center justify-end gap-0.5 overflow-x-auto text-[13px] font-semibold sm:max-w-none sm:gap-1 sm:text-sm"
        >
          {shopOn ? (
            <Link
              href="/shop"
              prefetch={false}
              className="whitespace-nowrap rounded-full px-2.5 py-1.5 text-amber-100 transition hover:bg-white/10 sm:px-3"
            >
              Shop
            </Link>
          ) : null}
          <Link
            href="/star-map-gallery"
            prefetch={false}
            className="whitespace-nowrap rounded-full px-2.5 py-1.5 text-white/85 transition hover:bg-white/10 sm:px-3"
          >
            Gallery
          </Link>
          <Link
            href="/how-to-print-star-map"
            prefetch={false}
            className="hidden whitespace-nowrap rounded-full px-3 py-1.5 text-white/85 transition hover:bg-white/10 md:inline-flex"
          >
            Print guide
          </Link>
          <Link
            href="/editor?mode=quick&source=site-nav"
            prefetch={false}
            className="whitespace-nowrap rounded-full border border-amber-400/50 bg-amber-400/15 px-2.5 py-1.5 text-amber-100 transition hover:bg-amber-400/25 sm:px-3"
          >
            Create map
          </Link>
        </nav>
      </div>
    </header>
  );
}
