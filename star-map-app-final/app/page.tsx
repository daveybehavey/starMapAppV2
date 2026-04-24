import React from "react";

type SearchParams = { [key: string]: string | string[] | undefined } | undefined;

export const dynamic = "force-dynamic";

export default function Page({
  searchParams,
}: {
  searchParams?: SearchParams;
}) {
  // Prefer query param ?v=B to choose variant. Fall back to NEXT_PUBLIC_HERO_VARIANT env var.
  const rawV = Array.isArray(searchParams?.v)
    ? searchParams?.v[0]
    : (searchParams?.v as string | undefined);

  const envVariant = typeof process?.env?.NEXT_PUBLIC_HERO_VARIANT === "string"
    ? process.env.NEXT_PUBLIC_HERO_VARIANT
    : undefined;

  const variant = rawV === "B" ? "B" : envVariant === "B" ? "B" : "A";

  const headline =
    variant === "B"
      ? "Discover the stars, your way"
      : "Map the stars of your special moment";

  const ctaLabel = variant === "B" ? "Create now" : "Get your star map";

  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        <title>Star Map</title>
      </head>
      <body>
        <main>
          <section
            id="homepage-hero"
            data-hero-variant={variant}
            style={{
              padding: "60px 20px",
              textAlign: "center",
              fontFamily: "sans-serif",
            }}
