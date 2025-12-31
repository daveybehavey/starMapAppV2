import type { ReactNode } from "react";

export type BlogPost = {
  slug: string;
  title: string;
  description: string;
  date: string;
  keywords: string[];
  content: () => ReactNode;
};

export const blogPosts: BlogPost[] = [
  {
    slug: "custom-star-maps-for-weddings",
    title: "Custom Star Maps for Weddings: How to Capture Your Night Sky",
    description:
      "Learn how to create a personalized star map for your wedding day, from choosing location and time to styling and printing.",
    date: "2024-06-01",
    keywords: [
      "custom star map",
      "wedding star map",
      "personalized night sky print",
      "anniversary gift",
      "star map generator",
    ],
    content: () => (
      <article className="prose prose-neutral prose-invert max-w-none">
        <p>
          Your wedding night sky is a one-of-a-kind snapshot in time. A custom star map lets you preserve the exact
          positions of constellations, stars, and planets for your ceremony or reception — a keepsake that’s both
          scientific and sentimental.
        </p>
        <h2>Pick the perfect moment and location</h2>
        <p>
          Set your map to the precise date, time, and venue coordinates. Even a few minutes can shift the layout of
          constellations, so match the moment you said “I do” or your first dance. If you had an outdoor ceremony, use
          that latitude/longitude; for destination weddings, capture the city or venue address.
        </p>
        <h2>Choose a style that fits your aesthetic</h2>
        <ul>
          <li>
            <strong>Navy &amp; Gold:</strong> Luxe, editorial feel that pairs with formal suites and gilded frames.
          </li>
          <li>
            <strong>Vintage Engraving:</strong> Linework and etched textures for classic or heritage themes.
          </li>
          <li>
            <strong>Minimal:</strong> Clean, gallery-ready layouts that spotlight your names and date.
          </li>
        </ul>
        <h2>Add personal wording</h2>
        <p>
          Include your names, wedding date, venue, or a favorite lyric. Align the text to the negative space of the sky
          shape (rectangle, circle, heart) and test a soft glow or subtle shadow for legibility on darker skies.
        </p>
        <h2>Export and frame</h2>
        <p>
          Download a high-resolution file for printing (6000px+ recommended). Pair with a matted frame in warm wood or
          black to keep focus on the map. For digital sharing, export a watermark preview to post on social or send to
          guests.
        </p>
        <h2>SEO tip: think like your guests</h2>
        <p>
          If you’re sharing online, use captions like “custom star map for our wedding night” or “personalized night sky
          print from our ceremony” to help friends — and search engines — understand the story.
        </p>
      </article>
    ),
  },
  {
    slug: "custom-star-map-for-anniversary",
    title: "Custom Star Map for Anniversary: A Timeless Romantic Gift",
    description:
      "Discover why a custom star map for anniversary moments is one of the most romantic, personal, and unforgettable gifts you can give.",
    date: "2025-12-31",
    keywords: [
      "custom star map for anniversary",
      "personalized anniversary star map",
      "anniversary night sky gift",
    ],
    content: () => (
      <article className="prose prose-neutral prose-invert max-w-none">
        <p>
          This long-form guide explores why anniversary star maps are deeply personal, how they are created with real
          astronomical data, and how to personalize them with names, dates, locations, and heartfelt messages.
        </p>
        <p>
          It also covers design ideas, common mistakes to avoid, and how star maps compare to traditional gifts—highlighting
          their uniqueness and lasting impact as a keepsake that captures the exact night sky from your milestone
          moment.
        </p>
      </article>
    ),
  },
];

export function getPost(slug: string) {
  return blogPosts.find((post) => post.slug === slug);
}
