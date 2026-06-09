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

  const isHome = pathname === "/";

  return (
    <header
      className={
        isHome
          ? "sticky top-0 z-50 border-b border-white/10 bg-[rgba(5,10,25,0.35)] text-[#f7f0e2] backdrop-blur-sm"
          : "sticky top-0 z-50 border-b border-white/10 bg-gradient-to-b from-[rgba(7,17,42,0.82)] to-[rgba(5,9,21,0.66)] text-[#f7f0e2] backdrop-blur-md"
      }
    >
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <Link
          href="/"
          prefetch={false}
          className="inline-flex shrink-0 items-center gap-1.5 text-sm font-semibold tracking-wide text-[#f8e8bf] sm:text-base"
        >
          {isHome ? (
            <svg className="h-3.5 w-3.5 text-[#f7c24a]" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M12 2.5l2.2 5.4 5.8.5-4.4 3.8 1.3 5.7L12 15.8 7.1 18l1.3-5.7-4.4-3.8 5.8-.5L12 2.5z" />
            </svg>
          ) : null}
          <span className={isHome ? "font-[var(--font-playfair)]" : undefined}>{brand.name}</span>
        </Link>
        <nav
          aria-label="Primary"
          className="flex max-w-[min(72vw,28rem)] flex-nowrap items-center justify-end gap-0.5 overflow-x-auto text-[13px] font-semibold text-[#f7f0e2] sm:max-w-none sm:gap-1 sm:text-sm"
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
            href={isHome ? "/editor?mode=quick&source=home-nav-create" : "/editor?mode=quick&source=site-nav"}
            prefetch={false}
            className={
              isHome
                ? "whitespace-nowrap rounded-md border border-[#f7c24a]/80 bg-transparent px-2.5 py-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-[#f7c24a] transition hover:bg-[#f7c24a]/10 sm:px-3 sm:text-xs"
                : "whitespace-nowrap rounded-full border border-amber-400/50 bg-amber-400/15 px-2.5 py-1.5 text-amber-100 transition hover:bg-amber-400/25 sm:px-3"
            }
          >
            {isHome ? "Create yours" : "Create map"}
          </Link>
        </nav>
      </div>
    </header>
  );
}
