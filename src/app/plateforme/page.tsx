import type { Metadata } from "next";
import { PlatformView } from "@/features/platform/PlatformView";

export const metadata: Metadata = {
  title: "Plateforme — Atelier",
  description: "Administration des abonnements et du catalogue des plans.",
};

export default function PlateformePage() {
  return <PlatformView />;
}
