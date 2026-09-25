import type { Metadata } from "next";
import { AppointmentsView } from "@/features/appointments/AppointmentsView";

export const metadata: Metadata = {
  title: "Rendez-vous — Atelier",
  description: "Planification des rendez-vous et rappels WhatsApp de l'atelier.",
};

export default function RendezVousPage() {
  return <AppointmentsView />;
}