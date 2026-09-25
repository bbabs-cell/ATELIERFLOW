import type { Metadata } from "next";
import { OnboardingView } from "@/features/auth/OnboardingView";

export const metadata: Metadata = {
  title: "Votre atelier — Atelier",
  description: "Création de votre atelier.",
};

export default function BienvenuePage() {
  return <OnboardingView />;
}
