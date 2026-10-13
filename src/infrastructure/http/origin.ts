/**
 * Contrôle d'origine des écritures (POST, PUT, PATCH, DELETE sur /api).
 *
 * Nos routes exigent déjà le jeton de session dans l'en-tête Authorization,
 * qu'une page étrangère ne peut pas joindre : ce contrôle est une seconde
 * barrière. Il ferme la porte si une route acceptait un jour un cookie, et
 * refuse d'emblée une écriture envoyée par la page d'un autre site.
 *
 * Sans en-tête Origin (tâches planifiées, appels entre serveurs) : accepté,
 * seul un navigateur l'envoie et c'est lui qu'il faut tenir.
 * `Origin: null` (cadre isolé, redirection) : jamais une page à nous → refusé.
 */
const WRITE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export function isForeignOriginWrite(method: string, headers: Headers): boolean {
  if (!WRITE_METHODS.has(method.toUpperCase())) return false;
  const origin = headers.get("origin");
  if (!origin) return false;
  let originHost: string;
  try {
    originHost = new URL(origin).host.toLowerCase();
  } catch {
    return true;
  }
  const host = (headers.get("x-forwarded-host") ?? headers.get("host") ?? "").split(",")[0].trim().toLowerCase();
  return !host || originHost !== host;
}
