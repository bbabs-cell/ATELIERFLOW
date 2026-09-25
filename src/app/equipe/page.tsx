import type { Metadata } from "next";
import { TeamView } from "@/features/team/TeamView";

export const metadata: Metadata = {
  title: "Équipe — Atelier",
  description: "Membres de l'atelier, rôles et permissions.",
};

export default function TeamPage() {
  return <TeamView />;
}