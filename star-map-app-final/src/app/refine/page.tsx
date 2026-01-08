import type { Metadata } from "next";
import { RefineClient } from "./RefineClient";

export const metadata: Metadata = {
  title: "Refine Your Star Map | StarMapCo",
  description: "Fine-tune every detail of your custom star map with advanced controls and professional options.",
};

export default function RefinePage() {
  return <RefineClient />;
}
