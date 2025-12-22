"use client";

import PreviewCanvas from "@/components/PreviewCanvas";
import { useEffect, useState } from "react";
import { useStore } from "@/lib/store";

type Recipe = {
  dateTime: string;
  location: {
    name: string;
    latitude: number;
    longitude: number;
    timezone: string;
  };
  textBoxes: unknown;
  selectedStyle: string;
};

type Props = {
  id: string;
  searchParams?: Record<string, string>;
};

export function SharedMapClient({ id, searchParams }: Props) {
  const [status, setStatus] = useState<"loading" | "error" | "ready">("loading");
  const setDateTime = useStore((s) => s.setDateTime);
  const setLocation = useStore((s) => s.setLocation);
  const setTextBoxes = useStore((s) => s.setTextBoxes);
  const setStyle = useStore((s) => s.setStyle);
  const setRevealed = useStore((s) => s.setRevealed);

  useEffect(() => {
    const load = async () => {
      try {
        const qp = searchParams
          ? Object.entries(searchParams)
              .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
              .join("&")
          : "";
        const res = await fetch(`/api/maps?id=${id}${qp ? `&${qp}` : ""}`);
        if (!res.ok) throw new Error("Not found");
        const data = (await res.json()) as Recipe;
        setDateTime(data.dateTime);
        setLocation(data.location);
        if (Array.isArray(data.textBoxes)) {
          setTextBoxes(data.textBoxes as any);
        }
        setStyle(data.selectedStyle as any);
        setRevealed(true);
        setStatus("ready");
      } catch (e) {
        console.error(e);
        setStatus("error");
      }
    };
    load();
  }, [id, searchParams, setDateTime, setLocation, setRevealed, setStyle, setTextBoxes]);

  if (status === "loading") {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#0b0f3b] text-amber-50">
        <p>Loading map…</p>
      </main>
    );
  }

  if (status === "error") {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center bg-[#0b0f3b] text-amber-50">
        <p className="text-lg font-semibold">Map not found.</p>
        <a href="/" className="mt-3 rounded-full bg-amber-400 px-4 py-2 text-sm font-semibold text-midnight">
          Create your own
        </a>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col gap-4 bg-[#0b0f3b] px-4 py-6 text-amber-50">
      <header className="flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.35em] text-amber-200">Shared star map</p>
          <h1 className="text-2xl font-semibold">A captured night sky</h1>
        </div>
        <a
          href="/"
          className="rounded-full bg-amber-400 px-4 py-2 text-sm font-semibold text-midnight shadow-md transition hover:-translate-y-[1px] hover:shadow-lg"
        >
          Remix this map
        </a>
      </header>
      <div className="rounded-2xl border border-amber-200/40 bg-black/30 p-3 shadow-lg backdrop-blur">
        <PreviewCanvas />
      </div>
    </main>
  );
}
