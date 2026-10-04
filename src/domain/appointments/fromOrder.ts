import type { OrderStatus } from "@/domain/orders/order";
import type { AppointmentRecord, AppointmentStatus, AppointmentType } from "./appointments";

/**
 * Lien commande → rendez-vous : la date de livraison prévue d'une nouvelle
 * commande est notée automatiquement dans le calendrier, et le rendez-vous
 * suit ensuite la commande (livrée → terminé, annulée → annulé).
 */

/** Types proposés pour le rendez-vous créé avec la commande. */
export const ORDER_APPOINTMENT_TYPES = ["DELIVERY", "PICKUP", "FITTING"] as const satisfies readonly AppointmentType[];
export type OrderAppointmentType = (typeof ORDER_APPOINTMENT_TYPES)[number];

export const DEFAULT_ORDER_APPOINTMENT_TIME = "10:00";

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Début du rendez-vous : date de livraison (AAAA-MM-JJ) à l'heure choisie,
 * dans le fuseau de l'appareil. null si la date ou l'heure est invalide.
 */
export function orderAppointmentStartsAt(expectedAt: string | null | undefined, time: string): string | null {
  if (!expectedAt || !DATE_RE.test(expectedAt.slice(0, 10)) || !TIME_RE.test(time)) return null;
  const local = new Date(`${expectedAt.slice(0, 10)}T${time}:00`);
  return Number.isNaN(local.getTime()) ? null : local.toISOString();
}

/**
 * Note du rendez-vous. Sans numéro de commande : la référence locale est
 * provisoire (le serveur attribue la définitive) ; le lien vers la commande
 * affiche toujours la bonne.
 */
export const ORDER_APPOINTMENT_NOTE = "Rendez-vous noté automatiquement à la création de la commande.";

/** Statut que doit prendre le rendez-vous lié quand la commande change d'étape ; null = inchangé. */
export function appointmentStatusForOrder(orderStatus: OrderStatus): AppointmentStatus | null {
  if (orderStatus === "DELIVERED") return "COMPLETED";
  if (orderStatus === "CANCELLED") return "CANCELLED";
  return null;
}

/** Rendez-vous encore ouverts liés à une commande. */
export function openAppointmentsOfOrder(appointments: readonly AppointmentRecord[], orderId: string): AppointmentRecord[] {
  return appointments.filter((a) => a.order_id === orderId && !a.deleted_at && (a.status === "SCHEDULED" || a.status === "CONFIRMED"));
}
