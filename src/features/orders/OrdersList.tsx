"use client";

import { useEffect } from "react";
import { CalendarClock, Search, Scissors } from "lucide-react";
import { Badge, Input, StateView, Skeleton } from "@/ui";
import { formatEuros } from "@/domain/money";
import type { OrderWithCustomer } from "@/application/orders/orderService";
import { getClientsFacade } from "@/features/clients/facade";
import {
  ORDER_PRIORITY_META,
  ORDER_STATUS_META,
} from "./constants";

export interface OrdersListProps {
  orders: OrderWithCustomer[];
  loading: boolean;
  error: string | null;
  search: string;
  onSearch: (query: string) => void;
  onSelect: (orderId: string) => void;
  onRetry: () => void;
}

export function OrdersList({
  orders,
  loading,
  error,
  search,
  onSearch,
  onSelect,
  onRetry,
}: OrdersListProps): React.ReactElement {
  useEffect(() => {
    return getClientsFacade().engine.subscribe(() => undefined);
  }, []);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <label className="relative flex-1 min-w-56" htmlFor="orders-search">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-faint"
          />
          <Input
            id="orders-search"
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            placeholder="Rechercher par référence ou client…"
            className="pl-9"
          />
        </label>
      </div>

      {loading ? (
        <div className="grid gap-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
      ) : error ? (
        <StateView
          variant="error"
          title="Commandes indisponibles"
          description={error}
          action={
            <button type="button" className="text-sm font-medium text-chocolat-900 underline underline-offset-2" onClick={onRetry}>
              Réessayer
            </button>
          }
        />
      ) : orders.length === 0 ? (
        <StateView
          variant="empty"
          title={search.trim() ? "Aucun résultat" : "Aucune commande"}
          description={
            search.trim()
              ? "Essayez une autre référence ou un autre client."
              : "Créez votre première commande pour démarrer l'atelier."
          }
        />
      ) : (
        <ul className="flex flex-col divide-y divide-anthracite-100 rounded-lg border border-outline bg-surface">
          {orders.map(({ order, customerName }) => {
            const meta = ORDER_STATUS_META[order.status];
            const priority = ORDER_PRIORITY_META[order.priority];
            return (
              <li key={order.id}>
                <button
                  type="button"
                  className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 text-left transition-colors hover:bg-ivoire-100"
                  onClick={() => onSelect(order.id)}
                >
                  <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-champagne-400 text-chocolat-950">
                    <Scissors className="size-5" aria-hidden="true" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-sm font-semibold text-ink">
                        {order.reference}
                      </span>
                      <Badge tone={priority.tone} dot>
                        {priority.label}
                      </Badge>
                      <Badge tone={meta.tone}>{meta.label}</Badge>
                    </span>
                    <span className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-sm text-ink-soft">
                      <span>{customerName ?? "Client supprimé"}</span>
                      {order.expected_at ? (
                        <span className="inline-flex items-center gap-1">
                          <CalendarClock className="size-3" aria-hidden="true" />
                          {order.expected_at}
                        </span>
                      ) : null}
                    </span>
                  </span>
                  <span className="font-display text-lg text-ink">
                    {formatEuros(order.total_price)}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}