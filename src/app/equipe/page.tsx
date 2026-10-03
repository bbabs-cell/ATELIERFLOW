import type { Metadata } from "next";
import { TeamScreen } from "@/features/team/TeamScreen";

export const metadata: Metadata = {
  title: "Équipe",
  description: "Membres de l'atelier, rôles et permissions.",
};

export default function TeamPage() {
  return <TeamScreen />;
}