import type { ReactNode } from "react";
import ClientOverlays from "@/components/ClientOverlays";

export default function WithOverlaysLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <>
      {children}
      <ClientOverlays />
    </>
  );
}
