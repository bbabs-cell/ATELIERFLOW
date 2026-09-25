import type { Metadata } from "next";
import { StockView } from "@/features/stock/StockView";

export const metadata: Metadata = {
  title: "Stock — Atelier",
  description: "Tissus et journal des mouvements de stock de l'atelier.",
};

export default function StockPage() {
  return <StockView />;
}