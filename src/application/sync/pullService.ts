import {
  maxCursor,
  PULL_ENTITIES,
  PULL_PAGE_SIZE,
  pullStart,
  unsettledKey,
  type PullCursor,
  type PullEntity,
} from "@/domain/sync/pull";
import type { LocalCachePort } from "@/repository/ports/sync";

/** Page de lignes serveur, triées par (curseur, id). */
export interface PullRemote {
  fetchPage(input: {
    entity: PullEntity;
    /** Lecture à partir de cette valeur incluse (null = depuis le début). */
    from: string | null;
    /** Pages suivantes : strictement après cette ligne. */
    after: PullCursor | null;
    limit: number;
  }): Promise<Record<string, unknown>[]>;
}

export interface PullCursorStore {
  get(entity: string): PullCursor | null;
  set(entity: string, cursor: PullCursor): void;
}

export interface PullReport {
  changed: number;
  skippedLocal: number;
  /** Tables non lisibles (droits du rôle) ou en erreur : réessayées au prochain passage. */
  failed: string[];
}

export interface PullServiceDeps {
  remote: PullRemote;
  cache: LocalCachePort;
  cursors: PullCursorStore;
  /** Clés « entité:id » ayant encore une opération locale non confirmée. */
  unsettled: () => Promise<Set<string>>;
}

function sameRecord(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Applique au cache local les lignes modifiées sur le serveur. Une ligne
 * qui a encore une modification locale en attente n'est pas écrasée : la
 * saisie locale part d'abord, la version serveur reviendra au passage
 * suivant.
 */
export function createPullService(deps: PullServiceDeps) {
  return {
    async pull(): Promise<PullReport> {
      const report: PullReport = { changed: 0, skippedLocal: 0, failed: [] };
      const pending = await deps.unsettled();

      for (const entity of PULL_ENTITIES) {
        const saved = deps.cursors.get(entity.entity);
        const from = pullStart(saved);
        let after: PullCursor | null = null;
        let newest = saved;
        try {
          for (;;) {
            const rows = await deps.remote.fetchPage({ entity, from, after, limit: PULL_PAGE_SIZE });
            for (const row of rows) {
              const id = typeof row.id === "string" ? row.id : null;
              const value = typeof row[entity.cursor] === "string" ? (row[entity.cursor] as string) : null;
              if (!id || !value) continue;
              const cursor = { value, id };
              after = cursor;
              newest = maxCursor(newest, cursor);
              if (pending.has(unsettledKey(entity.entity, id))) {
                report.skippedLocal += 1;
                continue;
              }
              const local = await deps.cache.get(entity.entity, id);
              if (local !== null && sameRecord(local, { ...(local as object), ...row })) continue;
              await deps.cache.put(entity.entity, id, local !== null ? { ...(local as object), ...row } : row);
              report.changed += 1;
            }
            if (rows.length < PULL_PAGE_SIZE) break;
          }
          if (newest && newest !== saved) deps.cursors.set(entity.entity, newest);
        } catch {
          report.failed.push(entity.entity);
        }
      }
      return report;
    },
  };
}
