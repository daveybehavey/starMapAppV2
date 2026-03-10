export type GalleryExample = {
  id: string;
  src: string;
  alt: string;
  title: string;
  shortLabel: string;
  caption: string;
  badge: string;
  anchor: string;
};

export const galleryExamples: GalleryExample[] = [
  {
    id: "wedding-aurora",
    src: "/examples/example-wedding-aurora-heart.webp",
    alt: "Wedding star map rendered in the Aurora Night preset with a heart crop",
    title: "Wedding · Aurora Night",
    shortLabel: "Wedding · Aurora Night",
    caption: "Santorini, Greece · June 1, 2024",
    badge: "AURORA",
    anchor: "aurora-night",
  },
  {
    id: "anniversary-heirloom",
    src: "/examples/example-anniversary-heirloom.webp",
    alt: "Anniversary star map rendered in the Heirloom preset",
    title: "Anniversary · Heirloom",
    shortLabel: "Anniversary · Heirloom",
    caption: "Paris, France · September 17, 2016",
    badge: "HEIRLOOM",
    anchor: "heirloom",
  },
  {
    id: "birthday-noir",
    src: "/examples/example-birthday-noir.webp",
    alt: "Birthday star map rendered in the Noir Minimal preset",
    title: "Birthday · Noir Minimal",
    shortLabel: "Birthday · Noir Minimal",
    caption: "Tokyo, Japan · July 9, 1995",
    badge: "NOIR",
    anchor: "noir-minimal",
  },
  {
    id: "new-baby-heirloom",
    src: "/examples/example-new-baby-heirloom.webp",
    alt: "New baby star map rendered in the Heirloom preset",
    title: "New Baby · Heirloom",
    shortLabel: "New Baby · Heirloom",
    caption: "Toronto, Canada · February 18, 2023",
    badge: "HEIRLOOM",
    anchor: "new-baby-heirloom",
  },
  {
    id: "memorial-starlace",
    src: "/examples/example-memorial-starlace.webp",
    alt: "Memorial star map rendered in the Starlace preset",
    title: "Memorial · Starlace",
    shortLabel: "Memorial · Starlace",
    caption: "London, UK · November 2, 2018",
    badge: "STARLACE",
    anchor: "starlace",
  },
  {
    id: "graduation-aurora",
    src: "/examples/example-graduation-aurora.webp",
    alt: "Graduation star map rendered in the Aurora Night preset",
    title: "Graduation · Aurora Night",
    shortLabel: "Graduation · Aurora Night",
    caption: "Boston, USA · May 25, 2024",
    badge: "AURORA",
    anchor: "graduation-aurora",
  },
];

export const featuredRenderExamples = galleryExamples.slice(0, 3);

export const galleryStyleQuickLinks = [
  { href: "/star-map-gallery#aurora-night", label: "Aurora Night" },
  { href: "/star-map-gallery#heirloom", label: "Heirloom" },
  { href: "/star-map-gallery#noir-minimal", label: "Noir Minimal" },
  { href: "/star-map-gallery#new-baby-heirloom", label: "Warm Heirloom" },
  { href: "/star-map-gallery#starlace", label: "Starlace" },
];
