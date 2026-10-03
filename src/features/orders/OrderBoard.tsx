"use client";

import { useState, type DragEvent } from "react";
import { AlarmClock, ArrowRight, CalendarClock, GripVertical, UserRound } from "lucide-react";
import { Badge } from "@/ui";
import { cx } from "@/lib/cx";
import { formatFcfa } from "@/domain/money";
import type { OrderStatus } from "@/domain/orders/order";
import {
  BOARD_STATUSES,
  canDrop,
  daysLate,
  deadlineState,
  groupForBoard,
  nextStatus,
  type BoardFilters,
} from "@/domain/orders/board";
import type { OrderWithCustomer } from "@/application/orders/orderService";
import { ORDER_PRIORITY_META, ORDER_STATUS_LABELS } from "./constants";
import { assigneeName, type Assignee } from "./useAssignees";

/** Couleur d'en-tête par étape : le tableau se lit d'un coup d'œil. */
const COLUMN_TONES: Record<OrderStatus, string> = {
  REGISTERED: "from-anthracite-300 to-anthracite-500",
  FABRIC_RECEIVED: "from-champagne-300 to-champagne-500",
  PREPARATION: "from-azur-300 to-azur-500",
  SEWING: "from-flamme-300 to-flamme-500",
  FITTING: "from-violet-100 to-violet-500",
  ALTERATION: "from-flamme-400 to-flamme-700",
  COMPLETED: "from-menthe-300 to-menthe-500",
  READY_FOR_PICKUP: "from-champagne-400 to-flamme-500",
  DELIVERED: "from-menthe-500 to-menthe-600",
  CANCELLED: "from-anthracite-300 to-anthracite-500",
};

const DND_TYPE = "application/x-atelier-order";

export interface OrderBoardProps {
  orders: OrderWithCustomer[];
  filters: BoardFilters;
  assignees: Assignee[];
  busyId: string | null;
  onOpen: (orderId: string) => void;
  onMove: (orderId: string, to: OrderStatus) => void;
  onRefused: (message: string) => void;
}

function initials(name: string): string {
  const parts = name.replace(/\(moi\)/, "").trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "?") + (parts[1]?.[0] ?? "")).toUpperCase();
}

export function OrderBoard({ orders, filters, assignees, busyId, onOpen, onMove, onRefused }: OrderBoardProps) {
  const today = new Date().toISOString();
  const columns = groupForBoard(orders, filters, today);
  const [dragging, setDragging] = useState<{ id: string; from: OrderStatus } | null>(null);
  const [hover, setHover] = useState<OrderStatus | null>(null);
  const [refused, setRefused] = useState<string | null>(null);

  function drop(event: DragEvent, to: OrderStatus) {
    event.preventDefault();
    setHover(null);
    const raw = event.dataTransfer.getData(DND_TYPE);
    const source = dragging ?? (raw ? (JSON.parse(raw) as { id: string; from: OrderStatus }) : null);
    setDragging(null);
    if (!source || source.from === to) return;
    if (!canDrop(source.from, to)) {
      setRefused(source.id);
      window.setTimeout(() => setRefused(null), 700);
      onRefused(`Passage « ${ORDER_STATUS_LABELS[source.from]} » → « ${ORDER_STATUS_LABELS[to]} » non autorisé.`);
      return;
    }
    onMove(source.id, to);
  }

  return (
    <div
      className="-mx-4 flex items-start snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-4 sm:snap-none"
      role="list"
      aria-label="Tableau de l'atelier"
    >
      {BOARD_STATUSES.map((status, columnIndex) => {
        const rows = columns.get(status) ?? [];
        const allowed = dragging ? canDrop(dragging.from, status) : false;
        return (
          <section
            key={status}
            role="listitem"
            aria-label={ORDER_STATUS_LABELS[status]}
            onDragOver={(e) => {
              // Toute colonne accepte le dépôt : un passage interdit est
              // refusé avec une explication plutôt qu'en silence.
              if (dragging) {
                e.preventDefault();
                if (allowed) setHover(status);
              }
            }}
            onDragLeave={() => setHover((h) => (h === status ? null : h))}
            onDrop={(e) => drop(e, status)}
            className={cx(
              "flex w-[82vw] max-w-[19rem] shrink-0 snap-start flex-col rounded-2xl border bg-surface-2/80 backdrop-blur transition-all duration-300 animate-fade-up sm:w-72",
              hover === status
                ? "scale-[1.02] border-flamme-400 bg-flamme-50 shadow-glow"
                : dragging && allowed
                  ? "border-dashed border-flamme-300"
                  : dragging
                    ? "border-outline opacity-50"
                    : "border-outline",
            )}
            style={{ animationDelay: `${columnIndex * 50}ms` }}
          >
            <header className={cx("flex items-center justify-between gap-2 rounded-t-2xl bg-gradient-to-r px-4 py-3 text-white", COLUMN_TONES[status])}>
              <h3 className="truncate font-display text-base font-bold">{ORDER_STATUS_LABELS[status]}</h3>
              <span key={rows.length} className="grid min-w-7 place-items-center rounded-full bg-white/25 px-2 text-xs font-bold animate-pop">
                {rows.length}
              </span>
            </header>

            <div className="flex min-h-32 flex-1 flex-col gap-2.5 p-3">
              {rows.length === 0 ? (
                <p className="m-auto py-6 text-center font-mono text-[11px] uppercase tracking-wider text-ink-faint">
                  {dragging && allowed ? "Déposer ici" : "Aucune commande"}
                </p>
              ) : (
                rows.map(({ order, customerName }, index) => {
                  const deadline = deadlineState(order, today);
                  const priority = ORDER_PRIORITY_META[order.priority];
                  const next = nextStatus(order.status);
                  const assignee = assigneeName(assignees, order.employee_id);
                  return (
                    <article
                      key={order.id}
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.effectAllowed = "move";
                        e.dataTransfer.setData(DND_TYPE, JSON.stringify({ id: order.id, from: order.status }));
                        setDragging({ id: order.id, from: order.status });
                      }}
                      onDragEnd={() => {
                        setDragging(null);
                        setHover(null);
                      }}
                      className={cx(
                        "gradient-border group relative cursor-grab rounded-xl border bg-surface p-3 shadow-soft transition-all duration-300 hover:-translate-y-1 hover:rotate-[-0.6deg] hover:shadow-lift active:cursor-grabbing animate-fade-up",
                        deadline === "late" ? "border-wax-300" : "border-outline",
                        dragging?.id === order.id && "rotate-2 opacity-60",
                        refused === order.id && "animate-wiggle",
                        busyId === order.id && "animate-pulse",
                      )}
                      style={{ animationDelay: `${columnIndex * 50 + index * 40}ms` }}
                    >
                      {deadline === "late" ? (
                        <span aria-hidden="true" className="absolute inset-y-0 left-0 w-1 rounded-l-xl bg-wax-500 animate-pulse" />
                      ) : null}
                      <button
                        type="button"
                        onClick={() => onOpen(order.id)}
                        className="block w-full text-left"
                        aria-label={`Ouvrir ${order.reference}`}
                      >
                        <span className="flex items-start justify-between gap-2">
                          <span className="font-mono text-[13px] font-semibold text-ink">{order.reference}</span>
                          <GripVertical className="size-4 shrink-0 text-ink-faint transition-colors group-hover:text-flamme-500" aria-hidden="true" />
                        </span>
                        <span className="mt-0.5 block truncate text-sm font-bold text-ink">{customerName ?? "Client"}</span>
                        <span className="mt-2 flex flex-wrap items-center gap-1.5">
                          {order.priority !== "NORMAL" ? (
                            <Badge tone={priority.tone} dot={order.priority === "URGENT"}>
                              {priority.label}
                            </Badge>
                          ) : null}
                          {deadline === "late" ? (
                            <Badge tone="danger" dot>
                              <AlarmClock className="size-3" aria-hidden="true" /> {daysLate(order, today)} j de retard
                            </Badge>
                          ) : deadline === "today" ? (
                            <Badge tone="warning" dot>
                              Aujourd&apos;hui
                            </Badge>
                          ) : order.expected_at && deadline !== "none" ? (
                            <span className={cx("inline-flex items-center gap-1 text-xs", deadline === "soon" ? "font-semibold text-flamme-700" : "text-ink-soft")}>
                              <CalendarClock className="size-3.5" aria-hidden="true" />
                              {new Date(order.expected_at).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}
                            </span>
                          ) : null}
                        </span>
                      </button>
                      <div className="mt-3 flex items-center justify-between gap-2 border-t border-anthracite-100 pt-2.5">
                        <span className="flex min-w-0 items-center gap-1.5">
                          {assignee ? (
                            <span title={assignee} className="grid size-7 shrink-0 place-items-center rounded-full bg-ocean-gradient text-[10px] font-bold text-white shadow-soft">
                              {initials(assignee)}
                            </span>
                          ) : (
                            <span title="Non affectée" className="grid size-7 shrink-0 place-items-center rounded-full border-2 border-dashed border-anthracite-300 text-ink-faint">
                              <UserRound className="size-3.5" aria-hidden="true" />
                            </span>
                          )}
                          <span className="truncate text-xs font-semibold tabular text-ink">{formatFcfa(order.total_price)}</span>
                        </span>
                        {next ? (
                          <button
                            type="button"
                            onClick={() => onMove(order.id, next)}
                            disabled={busyId === order.id}
                            title={`Passer à « ${ORDER_STATUS_LABELS[next]} »`}
                            className="inline-flex h-8 shrink-0 items-center gap-1 rounded-full pointer-coarse:h-10 bg-flamme-gradient px-3 text-[11px] font-bold text-white shadow-soft transition-all duration-200 hover:-translate-y-0.5 hover:shadow-glow disabled:opacity-50"
                          >
                            <span className="max-w-24 truncate">{ORDER_STATUS_LABELS[next]}</span>
                            <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
                          </button>
                        ) : null}
                      </div>
                    </article>
                  );
                })
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}
