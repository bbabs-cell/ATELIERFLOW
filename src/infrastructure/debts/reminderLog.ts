/**
 * Dernière relance de solde envoyée à chaque client, sur cet appareil.
 *
 * Pourquoi local : éviter de relancer deux fois le même client dans la
 * journée sans créer de table ni de migration (méthode : dériver plutôt que
 * stocker). Limite assumée : la mention « relancé » n'est pas partagée avec
 * les autres téléphones de l'équipe. Toujours dans un try/catch : navigation
 * privée ou stockage plein ne doivent rien casser.
 */
const key = (tenantId: string) => `atelierflow:${tenantId}:relances-solde`;

export function readReminderLog(tenantId: string): Record<string, string> {
  try {
    const raw = localStorage.getItem(key(tenantId));
    const parsed = raw ? (JSON.parse(raw) as unknown) : {};
    return parsed && typeof parsed === "object" ? (parsed as Record<string, string>) : {};
  } catch {
    return {};
  }
}

export function recordReminder(tenantId: string, customerId: string, at: string): Record<string, string> {
  const log = { ...readReminderLog(tenantId), [customerId]: at };
  try {
    localStorage.setItem(key(tenantId), JSON.stringify(log));
  } catch {
    // stockage indisponible : la relance est envoyée quand même
  }
  return log;
}
