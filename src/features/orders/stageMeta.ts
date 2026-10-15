import { Handshake, Inbox, PackageCheck, Scissors, type LucideIcon } from "lucide-react";
import type { OrderStage } from "@/domain/orders/stages";

/**
 * Les 4 étapes à l'écran : une image, une couleur, un mot. Le bouton de la
 * carte dit l'action en un verbe, avec l'image de l'étape suivante — on peut
 * s'en servir sans savoir lire.
 */
export interface StageMeta {
  label: string;
  /** Phrase lue à voix haute et affichée sous le titre de la colonne. */
  hint: string;
  icon: LucideIcon;
  /** En-tête de colonne et pastille (texte blanc lisible). */
  solid: string;
  /** Fond doux de la colonne. */
  soft: string;
  /** Bouton qui fait ENTRER une commande dans cette étape. */
  action: string;
  actionClass: string;
}

export const STAGE_META: Record<OrderStage, StageMeta> = {
  RECEIVED: {
    label: "Reçue",
    hint: "À commencer",
    icon: Inbox,
    solid: "bg-chocolat-700 text-white",
    soft: "bg-chocolat-50",
    action: "Remettre en attente",
    actionClass: "bg-chocolat-700 text-white",
  },
  SEWING: {
    label: "En couture",
    hint: "On coud l'habit",
    icon: Scissors,
    solid: "bg-flamme-700 text-white",
    soft: "bg-flamme-50",
    action: "Commencer",
    actionClass: "bg-flamme-700 text-white",
  },
  READY: {
    label: "Prête",
    hint: "Le client peut venir",
    icon: PackageCheck,
    solid: "bg-menthe-600 text-white",
    soft: "bg-menthe-50",
    action: "C'est prêt",
    actionClass: "bg-menthe-600 text-white",
  },
  DELIVERED: {
    label: "Livrée",
    hint: "Remise au client",
    icon: Handshake,
    solid: "bg-azur-700 text-white",
    soft: "bg-azur-50",
    action: "Remise au client",
    actionClass: "bg-azur-700 text-white",
  },
};
