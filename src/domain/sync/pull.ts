/**
 * Récupération des données du serveur (synchronisation descendante).
 * Chaque appareil envoie ses opérations (sync_push) puis lit ce qui a
 * changé côté serveur depuis sa dernière lecture, table par table, dans
 * l'ordre des dépendances. La RLS limite la lecture à l'atelier et aux
 * permissions de l'utilisateur.
 */

export interface PullEntity {
  /** Nom de la table = nom de l'entité dans le cache local. */
  entity: string;
  /** Colonne de curseur : updated_at (modifiable) ou created_at (immuable). */
  cursor: "updated_at" | "created_at";
}

export const PULL_ENTITIES: readonly PullEntity[] = [
  { entity: "customers", cursor: "updated_at" },
  { entity: "measurement_profiles", cursor: "updated_at" },
  { entity: "measurement_snapshots", cursor: "created_at" },
  { entity: "fabrics", cursor: "updated_at" },
  { entity: "orders", cursor: "updated_at" },
  { entity: "order_items", cursor: "updated_at" },
  { entity: "order_status_history", cursor: "created_at" },
  { entity: "stock_movements", cursor: "created_at" },
  { entity: "payments", cursor: "updated_at" },
  { entity: "receipts", cursor: "created_at" },
  { entity: "appointments", cursor: "updated_at" },
];

export const PULL_PAGE_SIZE = 500;
/**
 * Recouvrement à chaque lecture : une transaction validée tardivement peut
 * porter un horodatage légèrement antérieur au curseur. Relire la dernière
 * minute est sans danger (fusion idempotente).
 */
export const PULL_OVERLAP_MS = 60_000;

export interface PullCursor {
  value: string;
  id: string;
}

/** Début de lecture : curseur moins le recouvrement (null = tout lire). */
export function pullStart(cursor: PullCursor | null): string | null {
  if (!cursor) return null;
  const t = Date.parse(cursor.value);
  return Number.isFinite(t) ? new Date(t - PULL_OVERLAP_MS).toISOString() : null;
}

/** Curseur le plus avancé entre deux (ordre : valeur puis id). */
export function maxCursor(a: PullCursor | null, b: PullCursor | null): PullCursor | null {
  if (!a) return b;
  if (!b) return a;
  const ta = Date.parse(a.value);
  const tb = Date.parse(b.value);
  if (ta !== tb) return ta > tb ? a : b;
  return a.id >= b.id ? a : b;
}

export function unsettledKey(entity: string, id: string): string {
  return `${entity}:${id}`;
}
