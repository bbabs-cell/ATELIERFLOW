import "server-only";
import { groupThousands } from "@/domain/money";

/**
 * Alerte e-mail à la plateforme quand un atelier envoie une preuve de
 * paiement (Resend, même domaine d'envoi que les e-mails de connexion).
 * Facultative : sans RESEND_API_KEY / PLATFORM_ALERT_EMAIL, rien n'est
 * envoyé. Un échec d'envoi n'annule jamais la demande, déjà enregistrée.
 */
export interface PaymentAlert {
  amount: number;
  currency: string;
  months: number;
  planCode: string;
  methodLabel: string;
  countryName: string;
  senderName: string;
  reference: string | null;
  origin: string;
}

const escape = (v: string) => v.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

export function paymentAlertContent(alert: PaymentAlert): { subject: string; text: string; html: string } {
  const amount = `${groupThousands(alert.amount).replace(/ /g, " ")} ${alert.currency === "XOF" ? "F CFA" : alert.currency}`;
  const subject = `Preuve de paiement reçue : ${amount} (${alert.planCode}, ${alert.months} mois)`;
  const lines = [
    `Un atelier vient d'envoyer une preuve de paiement.`,
    ``,
    `Montant : ${amount}`,
    `Plan : ${alert.planCode} — ${alert.months} mois`,
    `Moyen : ${alert.methodLabel} (${alert.countryName})`,
    `Expéditeur : ${alert.senderName}`,
    `Référence : ${alert.reference ?? "—"}`,
    ``,
    `Vérifier et valider : ${alert.origin}/plateforme`,
  ];
  const html = `<div style="font-family:Arial,sans-serif;font-size:15px;color:#1f1a15">${lines
    .map((l) => (l === "" ? "<br>" : `<p style="margin:4px 0">${escape(l)}</p>`))
    .join("")}<p style="margin-top:16px"><a href="${escape(alert.origin)}/plateforme" style="background:#e8610f;color:#fff;padding:10px 16px;border-radius:10px;text-decoration:none">Ouvrir les paiements à vérifier</a></p></div>`;
  return { subject, text: lines.join("\n"), html };
}

export async function sendPaymentAlert(alert: PaymentAlert, fetcher: typeof fetch = fetch): Promise<boolean> {
  const key = process.env.RESEND_API_KEY?.trim();
  const to = process.env.PLATFORM_ALERT_EMAIL?.trim();
  if (!key || !to) return false;
  const from = process.env.ALERT_FROM_EMAIL?.trim() || "Atelier <noreply@magyapro.com>";
  const content = paymentAlertContent(alert);
  try {
    const response = await fetcher("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify({ from, to: to.split(",").map((s) => s.trim()).filter(Boolean), ...content }),
    });
    return response.ok;
  } catch {
    return false;
  }
}
