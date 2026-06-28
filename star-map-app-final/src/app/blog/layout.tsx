import Link from "next/link";
import React from "react";

type Props = {
  children: React.ReactNode;
};

export const revalidate = 60;

export default function BlogLayout({ children }: Props) {
  return (
    <div className="mx-auto max-w-[980px] px-6 py-6">
      <main>{children}</main>

      <aside className="mt-8 border-t border-white/10 pt-4 text-sm text-neutral-200">
        <h3 className="mb-2 text-base font-semibold text-amber-200">Create a star map</h3>
        <p className="mb-2">
          Want to recreate the sky from a special moment? Try our{" "}
          <Link className="font-semibold text-amber-300 underline hover:text-amber-200" href="/star-map-generator">
            Star Map Generator
          </Link>{" "}
          to build a customizable star map for any date and location.
        </p>
        <p className="m-0">
          Great for gifts - create a{" "}
          <Link className="font-semibold text-amber-300 underline hover:text-amber-200" href="/birthday">
            Birthday
          </Link>{" "}
          or{" "}
          <Link className="font-semibold text-amber-300 underline hover:text-amber-200" href="/anniversary">
            Anniversary
          </Link>{" "}
          map.
        </p>
      </aside>
    </div>
  );
}
