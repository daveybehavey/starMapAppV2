import Link from "next/link";

export default function HomePage() {
  return (
    <main>
      <Link href="/landing">Obsolete static route</Link>
      <a href="/logo.svg">Exact public asset</a>
    </main>
  );
}
