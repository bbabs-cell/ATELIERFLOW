import type { Metadata } from "next";
import { BRAND_NAME, BRAND_TAGLINE } from "@/config/brand";
import { VitrinePage } from "@/features/vitrine/VitrinePage";

export const metadata: Metadata = {
  title: { absolute: `${BRAND_NAME} — ${BRAND_TAGLINE}` },
  description:
    "Mesures des clientes, commandes par étape, acomptes et reste à payer, reçus numérotés, rappels WhatsApp. Fonctionne sur téléphone, même sans connexion.",
};

/**
 * Vitrine pour les visiteurs. Une session déjà ouverte est envoyée sur le
 * tableau de bord par la barrière d'authentification.
 */
export default function Home() {
  return <VitrinePage />;
}
