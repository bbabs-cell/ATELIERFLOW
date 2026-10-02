import { whatsappUrl } from "@/domain/messaging/whatsapp";

/**
 * Passerelle WhatsApp — point d'extension pour une future intégration
 * officielle (WhatsApp Business Platform / Cloud API).
 *
 * MVP : « click-to-chat ». L'application prépare le message, l'utilisateur
 * le relit et l'envoie lui-même depuis WhatsApp ; aucun jeton, aucun
 * compte Business, aucun envoi automatique.
 *
 * Intégration future : une passerelle `BUSINESS_API` appellera une route
 * serveur (jamais le navigateur directement : le jeton Meta reste côté
 * serveur) qui enverra un modèle de message validé par Meta et renverra
 * l'identifiant du message. Les écrans n'ont pas à changer : ils appellent
 * `dispatch` et lisent le résultat.
 */

export interface WhatsAppMessage {
  /** Numéro au format wa.me (chiffres, indicatif inclus) ; null = choisir le contact. */
  to: string | null;
  text: string;
  /** Objet métier concerné, pour l'historique et la future API. */
  context?: { entity: "appointments" | "receipts"; id: string; kind: string };
}

export type WhatsAppDispatchResult =
  /** Conversation WhatsApp ouverte : l'envoi reste à confirmer par l'utilisateur. */
  | { mode: "CLICK_TO_CHAT"; url: string }
  /** Message envoyé par l'API officielle (future). */
  | { mode: "BUSINESS_API"; providerMessageId: string };

export interface WhatsAppGateway {
  readonly mode: WhatsAppDispatchResult["mode"];
  /** Lien d'ouverture, quand la passerelle passe par WhatsApp (click-to-chat). */
  linkFor(message: WhatsAppMessage): string | null;
  dispatch(message: WhatsAppMessage): Promise<WhatsAppDispatchResult>;
}

export function createClickToChatGateway(open: (url: string) => void): WhatsAppGateway {
  return {
    mode: "CLICK_TO_CHAT",
    linkFor: (message) => whatsappUrl(message.to, message.text),
    async dispatch(message) {
      const url = whatsappUrl(message.to, message.text);
      open(url);
      return { mode: "CLICK_TO_CHAT", url };
    },
  };
}
