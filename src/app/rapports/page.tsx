import type { Metadata } from "next";
import { ReportsView } from "@/features/reports/ReportsView";

export const metadata: Metadata = {
  title: "Rapports",
  description: "Les chiffres du mois de l'atelier et leur export pour Excel.",
};

export default function RapportsPage() {
  return <ReportsView />;
}
