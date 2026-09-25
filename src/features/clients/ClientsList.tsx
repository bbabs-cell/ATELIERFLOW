"use client";

import { useEffect } from "react";
import { Phone, Search, UserRound } from "lucide-react";
import { Badge, Input, StateView, Skeleton } from "@/ui";
import type { Customer } from "@/domain/clients/customer";
import { SyncStatusChip } from "@/features/sync/SyncStatusChip";
import { getClientsFacade } from "./facade";

export interface ClientsListProps {
  customers: Customer[];
  loading: boolean;
  error: string | null;
  search: string;
  onSearch: (query: string) => void;
  onSelect: (customer: Customer) => void;
  onRetry: () => void;
}

export function ClientsList({
  customers,
  loading,
  error,
  search,
  onSearch,
  onSelect,
  onRetry,
}: ClientsListProps): React.ReactElement {
  useEffect(() => {
    const facade = getClientsFacade();
    return facade.engine.subscribe(() => undefined);
  }, []);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <label className="relative flex-1 min-w-56" htmlFor="clients-search">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-faint"
          />
          <Input
            id="clients-search"
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            placeholder="Rechercher un client…"
            className="pl-9"
          />
        </label>
        <SyncStatusChip engine={null} />
      </div>

      {loading ? (
        <div className="grid gap-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      ) : error ? (
        <StateView
          variant="error"
          title="Clients indisponibles"
          description={error}
          action={
            <button type="button" className="text-sm font-medium text-chocolat-900 underline underline-offset-2" onClick={onRetry}>
              Réessayer
            </button>
          }
        />
      ) : customers.length === 0 ? (
        <StateView
          variant="empty"
          title={search.trim() ? "Aucun résultat" : "Aucun client"}
          description={
            search.trim()
              ? "Essayez un autre nom ou numéro de téléphone."
              : "Créez votre premier client pour démarrer."
          }
        />
      ) : (
        <ul className="flex flex-col divide-y divide-anthracite-100 rounded-lg border border-outline bg-surface">
          {customers.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-ivoire-100"
                onClick={() => onSelect(c)}
              >
                <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-champagne-400 text-chocolat-950">
                  <UserRound className="size-5" aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="truncate font-medium text-ink">
                      {c.full_name}
                    </span>
                    {c.status === "ARCHIVED" ? (
                      <Badge tone="neutral">Archivé</Badge>
                    ) : null}
                  </span>
                  <span className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-sm text-ink-soft">
                    {c.phone ? (
                      <span className="inline-flex items-center gap-1">
                        <Phone className="size-3" aria-hidden="true" />
                        {c.phone}
                      </span>
                    ) : null}
                    {c.email ? <span className="truncate">{c.email}</span> : null}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}