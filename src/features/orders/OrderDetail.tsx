"use client";

import { CalendarClock, Undo2, UserRound, XCircle } from "lucide-react";
import { Badge, Button, Select, Timeline } from "@/ui";
import type { Assignee } from "./useAssignees";
import { formatFcfa } from "@/domain/money";
import { isTerminal, type OrderStatus } from "@/domain/orders/order";
import { ORDER_STAGES, nextStage, previousStage, stageIndex, stageOf, statusForStage } from "@/domain/orders/stages";
import { cx } from "@/lib/cx";
import { STAGE_META } from "./stageMeta";
import { deadlineWords } from "@/domain/orders/board";
import { OrderMeasurements } from "@/features/clients/OrderMeasurements";
import type { OrderWithCustomer } from "@/application/orders/orderService";
import {
  ORDER_PRIORITY_META,
  ORDER_STATUS_META,
  ORDER_STATUS_LABELS,
} from "./constants";
import { PaymentsPanel } from "./PaymentsPanel";
import { PhotoGallery } from "@/features/files/PhotoGallery";

export interface OrderDetailProps {
  detail: OrderWithCustomer;
  busyAction: boolean;
  actionError: string | null;
  onAction: (to: OrderStatus) => void;
  onCancelOrder: () => void;
  assignees?: Assignee[];
  onAssign?: (employeeId: string | null) => void;
}

export function OrderDetail({
  detail,
  busyAction,
  actionError,
  onAction,
  onCancelOrder,
  assignees = [],
  onAssign,
}: OrderDetailProps): React.ReactElement {
  const { order, customerName, items, history } = detail;
  const status = ORDER_STATUS_META[order.status];
  const priority = ORDER_PRIORITY_META[order.priority];
  const stage = stageOf(order.status);
  const next = nextStage(order.status);
  const back = previousStage(order.status);
  const deadline = deadlineWords(order, new Date().toISOString());
  const timeline = [...history].reverse();

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-3">
        <span className="flex size-14 shrink-0 items-center justify-center rounded-full bg-sunset-gradient text-white shadow-soft transition-transform duration-300 group-hover:scale-110">
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
            {order.expected_at
              ? `${new Date(`${order.expected_at.slice(0, 10)}T12:00:00Z`).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" })}${deadline ? ` · ${deadline.text}` : ""}`
              : "Non définie"}
          </dd>
        </div>
      </dl>

      {/* Où en est l'habit : les 4 étapes en images, puis UN bouton pour la suivante. */}
      <div className="flex flex-col gap-3">
        <ol aria-label="Étapes de la commande" className="grid grid-cols-4 gap-1.5">
          {ORDER_STAGES.map((s) => {
            const meta = STAGE_META[s];
            const done = stage !== null && stageIndex(s) <= stageIndex(stage);
            return (
              <li
                key={s}
                aria-current={s === stage ? "step" : undefined}
                className={cx(
                  "flex min-w-0 flex-col items-center gap-1 rounded-xl px-1 py-2 text-center",
                  done ? meta.solid : "bg-surface-2 text-ink-faint",
                  s === stage && "ring-2 ring-offset-2 ring-chocolat-300",
                )}
              >
                <meta.icon className="size-5" aria-hidden="true" />
                <span className="max-w-full truncate text-[11px] font-bold">{meta.label}</span>
              </li>
            );
          })}
        </ol>
        {!isTerminal(order.status) ? (
          <>
            {next ? (
              <Button className="h-14 w-full text-base" onClick={() => onAction(statusForStage(order.status, next) as OrderStatus)} disabled={busyAction}>
                {(() => {
                  const NextIcon = STAGE_META[next].icon;
                  return <NextIcon className="size-5" aria-hidden="true" />;
                })()}
                {STAGE_META[next].action}
              </Button>
            ) : null}
            <div className="flex flex-wrap gap-2">
              {back ? (
                <Button size="sm" variant="outline" onClick={() => onAction(statusForStage(order.status, back) as OrderStatus)} disabled={busyAction}>
                  <Undo2 className="size-4" aria-hidden="true" />
                  Revenir à « {STAGE_META[back].label} »
                </Button>
              ) : null}
              <Button size="sm" variant="ghost" onClick={onCancelOrder} disabled={busyAction}>
                <XCircle className="size-4" aria-hidden="true" />
                Annuler la commande
              </Button>
            </div>
          </>
        ) : null}
        {actionError ? (
          <p className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger" role="alert">
            {actionError}
          </p>
        ) : null}
      </div>


      {onAssign && !isTerminal(order.status) ? (
        <label className="flex flex-col gap-1.5 rounded-xl bg-flamme-50 px-3 py-2.5">
          <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-flamme-700">Affectée à</span>
          <Select
            aria-label="Personne affectée"
            className="h-10 min-h-10 rounded-full py-0 text-sm"
            value={order.employee_id ?? ""}
            onChange={(e) => onAssign(e.target.value === "" ? null : e.target.value)}
          >
            <option value="">Personne (non affectée)</option>
            {order.employee_id && !assignees.some((a) => a.id === order.employee_id) ? (
              <option value={order.employee_id}>Membre</option>
            ) : null}
            {assignees.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </Select>
        </label>
      ) : null}

      {order.notes ? (
        <p className="rounded-lg bg-ivoire-100 px-3 py-2 text-sm text-ink-soft">{order.notes}</p>
      ) : null}

      <div>
        <p className="text-sm font-medium text-ink">Articles</p>
        <ul className="mt-2 divide-y divide-anthracite-100 overflow-hidden rounded-xl border border-outline bg-surface shadow-soft">
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

      <PhotoGallery category="ORDER" entityId={order.id} title="Photos de la commande" />

      <OrderMeasurements customerId={order.customer_id} orderId={order.id} />

      <div>
        <p className="text-sm font-medium text-ink">Historique du statut</p>
        <Timeline
          className="mt-3"
          items={timeline.map((entry) => {
            const from = entry.from_status ? ORDER_STATUS_LABELS[entry.from_status] : "Création";
            const to = ORDER_STATUS_LABELS[entry.to_status];
            return {
              title: from === "Création" ? "Commande créée" : from === to ? to : `${from} → ${to}`,
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