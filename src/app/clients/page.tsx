import type { Metadata } from "next";
import { ClientsView } from "@/features/clients/ClientsView";

export const metadata: Metadata = {
  title: "Clients — Atelier",
  description: "Carnet de clients et profils de mesures de l'atelier.",
};

export default function ClientsPage() {
  return <ClientsView />;
}