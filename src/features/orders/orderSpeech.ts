import { deadlineWords } from "@/domain/orders/board";
import type { OrderRecord } from "@/domain/orders/order";
import { stageOf } from "@/domain/orders/stages";
import { formatFcfa } from "@/domain/money";
import { STAGE_META } from "./stageMeta";

/**
 * Phrase lue à voix haute pour une commande : qui, quoi, où en est l'habit,
 * quand le livrer, combien. Les montants sont dits en toutes lettres par la
 * voix du téléphone (« 25 000 francs CFA »).
 */
export function orderSpeech(
  order: Pick<OrderRecord, "status" | "expected_at" | "total_price">,
  customerName: string | null,
  article: string | null,
  today: string,
): string {
  const stage = stageOf(order.status);
  const parts = [`Commande de ${customerName ?? "client"}`];
  if (article) parts.push(article);
  if (stage) parts.push(`${STAGE_META[stage].label}. ${STAGE_META[stage].hint}`);
  else parts.push("Annulée");
  const deadline = deadlineWords(order, today);
  if (deadline) parts.push(deadline.state === "late" ? deadline.text : `À livrer : ${deadline.text.toLowerCase()}`);
  parts.push(`Prix : ${formatFcfa(order.total_price).replace(/F\s?CFA/, "francs CFA")}`);
  return parts.join(". ").replace(/\.\./g, ".") + ".";
}
