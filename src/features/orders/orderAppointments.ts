import { peekActiveSession } from "@/application/auth/session";
import {
  appointmentStatusForOrder,
  openAppointmentsOfOrder,
  ORDER_APPOINTMENT_NOTE,
  orderAppointmentStartsAt,
  type OrderAppointmentType,
} from "@/domain/appointments/fromOrder";
import type { OrderRecord } from "@/domain/orders/order";
import { can, TENANT_ROLE_CODES, type TenantRoleCode } from "@/domain/team/roles";
import { getAppointmentsFacade } from "@/features/appointments/facade";

/** Le rôle courant peut-il créer ou modifier des rendez-vous ? */
export function canWriteAppointments(): boolean {
  const role = peekActiveSession()?.role ?? null;
  // Mode démo : pas de rôle, tout est permis localement.
  if (role === null) return true;
  return (TENANT_ROLE_CODES as readonly string[]).includes(role) && can(role as TenantRoleCode, "appointments.write");
}

export interface OrderAppointmentChoice {
  enabled: boolean;
  time: string;
  type: OrderAppointmentType;
}

/**
 * Note la livraison prévue d'une nouvelle commande dans le calendrier.
 * Renvoie true si le rendez-vous a été créé. Ne bloque jamais la commande.
 */
export async function scheduleOrderAppointment(order: OrderRecord, choice: OrderAppointmentChoice): Promise<boolean> {
  if (!choice.enabled || !canWriteAppointments()) return false;
  const startsAt = orderAppointmentStartsAt(order.expected_at, choice.time);
  if (!startsAt) return false;
  try {
    const result = await getAppointmentsFacade().appointments.createAppointment({
      customerId: order.customer_id,
      orderId: order.id,
      type: choice.type,
      startsAt,
      note: ORDER_APPOINTMENT_NOTE,
    });
    return result.ok;
  } catch {
    return false;
  }
}

/** Fait suivre l'étape de la commande aux rendez-vous liés encore ouverts (livrée → terminé, annulée → annulé). */
export async function followOrderStatus(order: OrderRecord): Promise<void> {
  const target = appointmentStatusForOrder(order.status);
  if (!target || !canWriteAppointments()) return;
  try {
    const facade = getAppointmentsFacade().appointments;
    const items = await facade.listAppointments();
    for (const appointment of openAppointmentsOfOrder(
      items.map((i) => i.appointment),
      order.id,
    )) {
      await facade.transitionAppointment(appointment.id, target);
    }
  } catch {
    // le calendrier se met à jour à la prochaine action ; la commande, elle, est enregistrée
  }
}
