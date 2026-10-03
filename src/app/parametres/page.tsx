import type { Metadata } from "next";
import { PersonnalisationView } from "@/features/branding/PersonnalisationView";

export const metadata: Metadata = {
  title: "Personnalisation",
  description: "Photo de profil, logo et photo de couverture de l'atelier.",
};

export default function ParametresPage() {
  return <PersonnalisationView />;
}
