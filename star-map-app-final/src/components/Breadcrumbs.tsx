import Link from "next/link";

export type BreadcrumbItem = {
  label: string;
  href: string;
};

type BreadcrumbsProps = {
  items: BreadcrumbItem[];
  className?: string;
};

export function Breadcrumbs({ items, className = "" }: BreadcrumbsProps) {
  if (!items.length) return null;

  return (
    <nav aria-label="Breadcrumb" className={className}>
      <ol className="flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-[0.25em] text-white/60">
        {items.map((item, index) => (
          <li key={`${item.href}-${item.label}`} className="flex items-center gap-2">
            {index > 0 && <span className="text-white/30">/</span>}
            <Link href={item.href} prefetch={false} className="text-inherit transition hover:text-amber-200">
              {item.label}
            </Link>
          </li>
        ))}
      </ol>
    </nav>
  );
}

type BreadcrumbSchemaProps = {
  items: BreadcrumbItem[];
  baseUrl: string;
};

export function BreadcrumbSchema({ items, baseUrl }: BreadcrumbSchemaProps) {
  if (!items.length) return null;
  const normalizedBase = baseUrl.replace(/\/$/, "");

  const schema = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      item: {
        "@id": new URL(item.href, normalizedBase).toString(),
        name: item.label,
      },
    })),
  };

  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }} />;
}
