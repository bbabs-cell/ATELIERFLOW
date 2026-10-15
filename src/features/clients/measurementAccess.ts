import { peekActiveSession } from "@/application/auth/session";
import { can, isTenantRole } from "@/domain/team/roles";

/** Le rôle peut-il prendre des mesures ? (rôle inconnu, démo : oui ; le serveur tranche). */
export function canWriteMeasurements(): boolean {
  const role = peekActiveSession()?.role ?? null;
  return role === null || !isTenantRole(role) || can(role, "measurements.write");
}
