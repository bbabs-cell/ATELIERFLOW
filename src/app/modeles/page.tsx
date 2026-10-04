import type { Metadata } from "next";
import { ModelsView } from "@/features/models/ModelsView";

export const metadata: Metadata = {
  title: "Mes modèles",
  description: "Les modèles de l'atelier en photos, à montrer aux clients.",
};

export default function ModelesPage() {
  return <ModelsView />;
}
