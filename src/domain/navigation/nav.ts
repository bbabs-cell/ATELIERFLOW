import { isTenantRole, permissionsFor, type PermissionCode } from "@/domain/team/roles";

/**
 * Entrées du menu visibles pour une personne, et les 4 écrans de la barre du
 * bas sur téléphone. Une entrée qu'un rôle ne peut pas ouvrir n'est pas
 * affichée : un apprenti qui touche « Rapports » tombait sur un écran refusé.
 * Le serveur refuse de toute façon ; ici on évite seulement l'impasse.
 */

export interface NavEntry {
  href: string;
  /** Droit nécessaire pour ouvrir l'écran ; absent = tout membre. */
  permission?: PermissionCode;
}

/**
 * Ordre de la barre du bas : les écrans ouverts des dizaines de fois par
 * jour (prendre une commande, retrouver un client, voir les rendez-vous).
 * Les suivants comblent si le rôle n'a pas accès aux premiers.
 */
export const BOTTOM_NAV_ORDER = ["/dashboard", "/commandes", "/clients", "/rdv", "/stock", "/modeles"] as const;
export const BOTTOM_NAV_SIZE = 4;

/** Droits de la personne ; rôle inconnu (mode démo, ancien jeton) → tout visible, le serveur tranche. */
export function permissionsOfRole(role: string | null | undefined): ReadonlySet<PermissionCode> | null {
  return role && isTenantRole(role) ? new Set(permissionsFor(role)) : null;
}

export function visibleEntries<T extends NavEntry>(entries: readonly T[], permissions: ReadonlySet<PermissionCode> | null): T[] {
  return entries.filter((e) => !e.permission || permissions === null || permissions.has(e.permission));
}

export function bottomEntries<T extends NavEntry>(visible: readonly T[]): T[] {
  const byHref = new Map(visible.map((e) => [e.href, e]));
  return BOTTOM_NAV_ORDER.map((href) => byHref.get(href))
    .filter((e): e is T => e !== undefined)
    .slice(0, BOTTOM_NAV_SIZE);
}
