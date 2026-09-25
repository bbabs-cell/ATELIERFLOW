"use client";

import { CalendarClock, Flag, UserRound, XCircle } from "lucide-react";
import { Badge, Button, Timeline } from "@/ui";
import { formatFcfa } from "@/domain/money";
import {
  availableTransitions,
  isTerminal,
  type OrderStatus,
} from "@/domain/orders/order";
import type { OrderWithCustomer } from "@/application/orders/orderService";
import {
  ORDER_PRIORITY_META,
  ORDER_STATUS_META,
  ORDER_STATUS_LABELS,
} from "./constants";
import { PaymentsPanel } from "./PaymentsPanel";

export interface OrderDetailProps {
  detail: OrderWithCustomer;
  busyAction: boolean;
  actionError: string | null;
  onAction: (to: OrderStatus) => void;
  onCancelOrder: () => void;
}

export function OrderDetail({
  detail,
  busyAction,
  actionError,
  onAction,
  onCancelOrder,
}: OrderDetailProps): React.ReactElement {
  const { order, customerName, items, history } = detail;
  const status = ORDER_STATUS_META[order.status];
  const priority = ORDER_PRIORITY_META[order.priority];
  const transitions = availableTransitions(order.status);
  const timeline = [...history].reverse();

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-3">
        <span className="flex size-14 shrink-0 items-center justify-center rounded-full bg-champagne-400 text-chocolat-950">
          <UserRound className="size-6" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <p className="font-mono text-lg font-semibold text-ink">{order.reference}</p>
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge tone={status.tone}>{status.label}</Badge>
            <Badge tone={priority.tone} dot>
              {priority.label}
            </Badge>
          </div>
        </div>
      </div>

      <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="rounded-lg bg-ivoire-100 px-3 py-2">
          <dt className="text-xs uppercase tracking-wide text-ink-faint">Client</dt>
          <dd className="text-sm font-medium text-ink">{customerName ?? "Client supprimé"}</dd>
        </div>
        <div className="rounded-lg bg-ivoire-100 px-3 py-2">
          <dt className="text-xs uppercase tracking-wide text-ink-faint">Livraison prévue</dt>
          <dd className="inline-flex items-center gap-1.5 text-sm font-medium text-ink">
            <CalendarClock className="size-4 text-ink-soft" aria-hidden="true" />
            {order.expected_at ?? "Non définie"}
          </dd>
        </div>
      </dl>

      {order.notes ? (
        <p className="rounded-lg bg-ivoire-100 px-3 py-2 text-sm text-ink-soft">{order.notes}</p>
      ) : null}

      <div>
        <p className="text-sm font-medium text-ink">Articles</p>
        <ul className="mt-2 divide-y divide-anthracite-100 rounded-lg border border-outline bg-surface">
          {items.map((item) => (
            <li key={item.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-ink">{item.description}</p>
                <p className="text-xs text-ink-soft">
                  {item.garment_type ? `${item.garment_type} · ` : ""}
                  {item.quantity} × {formatFcfa(item.unit_price)}
                </p>
              </div>
              <p className="text-sm font-medium text-ink">{formatFcfa(item.quantity * item.unit_price)}</p>
            </li>
          ))}
        </ul>
        <div className="mt-2 flex items-center justify-between px-3">
          <span className="text-sm text-ink-soft">Total</span>
          <span className="font-display text-xl text-ink">{formatFcfa(order.total_price)}</span>
        </div>
      </div>

      <PaymentsPanel
        orderId={order.id}
        orderTotal={order.total_price}
        orderReference={order.reference}
        orderStatus={order.status}
      />

      {!isTerminal(order.status) ? (
        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium text-ink">Faire avancer l&apos;atelier</p>
          <div className="flex flex-wrap gap-2">
            {transitions
              .filter((t) => t.to !== "CANCELLED")
              .map((t) => (
                <Button
                  key={t.to}
                  size="sm"
                  variant="outline"
                  onClick={() => onAction(t.to)}
                  disabled={busyAction}
                >
                  <Flag className="size-4" aria-hidden="true" />
                  {ORDER_STATUS_LABELS[t.to]}
                </Button>
              ))}
            <Button size="sm" variant="ghost" onClick={onCancelOrder} disabled={busyAction}>
              <XCircle className="size-4" aria-hidden="true" />
              Annuler
            </Button>
          </div>
          {actionError ? (
            <p className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger" role="alert">
              {actionError}
            </p>
          ) : null}
        </div>
      ) : null}

      <div>
        <p className="text-sm font-medium text-ink">Historique du statut</p>
        <Timeline
          className="mt-3"
          items={timeline.map((entry) => {
            const from = entry.from_status ? ORDER_STATUS_LABELS[entry.from_status] : "Création";
            const to = ORDER_STATUS_LABELS[entry.to_status];
            return {
              title: from === "Création" ? "Commande créée" : `${from} → ${to}`,
              description: entry.note ?? null,
              date: new Intl.DateTimeFormat("fr-FR", {
                dateStyle: "medium",
                timeStyle: "short",
              }).format(new Date(entry.created_at)),
            };
          })}
        />
      </div>
    </div>
  );
}