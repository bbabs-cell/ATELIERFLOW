import type { Metadata } from "next";
import { DashboardView } from "@/features/dashboard/DashboardView";

export const metadata: Metadata = {
  title: "Tableau de bord — Atelier",
  description: "Vue d'ensemble de l'atelier : encaissements, commandes, activités.",
};

export default function DashboardPage() {
  return <DashboardView />;
}