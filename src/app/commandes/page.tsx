import type { Metadata } from "next";
import { OrdersView } from "@/features/orders/OrdersView";

export const metadata: Metadata = {
  title: "Commandes — Atelier",
  description: "Création et suivi des commandes de l'atelier.",
};

export default function OrdersPage() {
  return <OrdersView />;
}