/**
 * Liste blanche des services push des navigateurs.
 *
 * Pourquoi : l'adresse d'abonnement est fournie par le téléphone. Sans liste
 * blanche, n'importe quel membre connecté pourrait enregistrer une adresse
 * arbitraire (« https://serveur-interne/… ») et la fonction push-alerts irait
 * la contacter chaque minute : notre serveur deviendrait un relais de
 * requêtes. Seuls les services de Google (Chrome, Android), Mozilla
 * (Firefox), Apple (Safari, iPhone) et Microsoft (Edge, Windows) sont
 * contactés.
 */
const ALLOWED_SUFFIXES = [
  "fcm.googleapis.com",
  "android.googleapis.com",
  "push.services.mozilla.com",
  "push.apple.com",
  "notify.windows.com",
] as const;

export function isAllowedPushEndpoint(endpoint: string): boolean {
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return false;
  }
  if (url.protocol !== "https:" || url.port !== "" || url.username !== "" || url.password !== "") return false;
  const host = url.hostname.toLowerCase();
  return ALLOWED_SUFFIXES.some((suffix) => host === suffix || host.endsWith(`.${suffix}`));
}
