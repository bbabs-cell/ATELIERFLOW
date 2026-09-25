import type { Metadata } from "next";
import { AbonnementView } from "@/features/subscriptions/AbonnementView";

export const metadata: Metadata = {
  title: "Abonnement — Atelier",
  description: "Plan SaaS du workspace, usages et limites.",
};

export default function AbonnementPage() {
  return <AbonnementView />;
}