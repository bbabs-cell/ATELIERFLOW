import type { Metadata } from "next";
import { DebtsView } from "@/features/debts/DebtsView";

export const metadata: Metadata = {
  title: "Soldes à encaisser",
  description: "Clients qui doivent encore de l'argent, avec la relance WhatsApp prête.",
};

export default function DebtsPage() {
  return <DebtsView />;
}
