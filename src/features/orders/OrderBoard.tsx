"use client";

import { useState, type DragEvent } from "react";
import { AlarmClock, CalendarClock, Check, Volume2 } from "lucide-react";
import { cx } from "@/lib/cx";
import { formatFcfa } from "@/domain/money";
import type { OrderStatus } from "@/domain/orders/order";
import { BOARD_STAGES, canDrop, deadlineWords, groupForBoard, type BoardFilters } from "@/domain/orders/board";
import { nextStage, statusForStage, type OrderStage } from "@/domain/orders/stages";
import type { OrderWithCustomer } from "@/application/orders/orderService";
import { canSpeak, speak } from "@/infrastructure/speech/speak";
import type { Assignee } from "./useAssignees";
import { STAGE_META } from "./stageMeta";
import { orderSpeech } from "./orderSpeech";

/**
 * Tableau de l'atelier en 4 étapes : Reçue → En couture → Prête → Livrée.
 *
 * Pensé pour une personne qui ne lit pas : chaque étape a une image et une
 * couleur ; une carte montre le nom du client en grand, l'habit, l'échéance
 * en mots, et UN gros bouton (image + un verbe) qui fait passer à l'étape
 * suivante. Le haut-parleur lit la commande à voix haute.
 * Téléphone, tablette et petit portable (< 1280 px) : 4 grosses images (avec
 * le nombre de commandes) pour choisir l'étape, puis ses commandes. Grand
 * écran : 4 colonnes, glisser-déposer (à 1024 px, à côté du menu, les
 * colonnes étaient trop étroites pour lire les noms).
 */

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

function articleOf(items: OrderWithCustomer["items"]): string | null {
  const live = items.filter((i) => i.deleted_at === null);
  if (live.length === 0) return null;
  return live.length > 1 ? `${live[0].description} + ${live.length - 1}` : live[0].description;
}

export function OrderBoard({ orders, filters, busyId, onOpen, onMove, onRefused }: OrderBoardProps) {
  const today = new Date().toISOString();
  const columns = groupForBoard(orders, filters, today);
  const [dragging, setDragging] = useState<{ id: string; from: OrderStatus } | null>(null);
  const [hover, setHover] = useState<OrderStage | null>(null);
  const [chosen, setChosen] = useState<OrderStage | null>(null);
  const speech = canSpeak();
  // Téléphone : sans choix, l'étape où il y a du travail (couture, sinon reçues).
  const selected: OrderStage =
    chosen ?? (BOARD_STAGES.find((s) => s !== "DELIVERED" && (columns.get(s)?.length ?? 0) > 0) ?? "RECEIVED");

  function drop(event: DragEvent, stage: OrderStage) {
    event.preventDefault();
    setHover(null);
    const raw = event.dataTransfer.getData(DND_TYPE);
    const source = dragging ?? (raw ? (JSON.parse(raw) as { id: string; from: OrderStatus }) : null);
    setDragging(null);
    if (!source) return;
    const to = statusForStage(source.from, stage);
    if (to === null) {
      onRefused(`Impossible de mettre cette commande dans « ${STAGE_META[stage].label} ».`);
      return;
    }
    onMove(source.id, to);
  }

  return (
    <div>
      {/* Téléphone et tablette : une grosse image par étape, avec le nombre de commandes. */}
      <div role="tablist" aria-label="Étapes de l'atelier" className="grid grid-cols-4 gap-2 2xl:hidden">
        {BOARD_STAGES.map((stage) => {
          const meta = STAGE_META[stage];
          const count = columns.get(stage)?.length ?? 0;
          const active = stage === selected;
          return (
            <button
              key={stage}
              type="button"
              role="tab"
              aria-selected={active}
              aria-label={`${meta.label} : ${count} commande${count > 1 ? "s" : ""}`}
              onClick={() => {
                setChosen(stage);
                if (speech) speak(`${meta.label}. ${count} commande${count > 1 ? "s" : ""}.`);
              }}
              className={cx(
                "relative flex min-w-0 flex-col items-center gap-1 rounded-2xl border-2 px-1 py-2.5 transition active:scale-95",
                active ? cx(meta.solid, "border-transparent shadow-soft") : "border-outline bg-surface text-ink",
              )}
            >
              <meta.icon className="size-7" aria-hidden="true" />
              {/* Pas de « … » : à 320 px, « En couture » passe sur deux lignes. */}
              <span className="max-w-full text-center text-[12px] font-bold leading-tight">{meta.label}</span>
              <span
                className={cx(
                  "absolute -right-1 -top-1.5 grid min-w-6 place-items-center rounded-full px-1.5 text-xs font-extrabold",
                  active ? "bg-surface text-ink" : count > 0 ? meta.solid : "bg-surface-2 text-ink-faint",
                )}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      <div className="mt-4 2xl:mt-0 2xl:grid 2xl:grid-cols-4 2xl:gap-4">
        {BOARD_STAGES.map((stage) => {
          const meta = STAGE_META[stage];
          const rows = columns.get(stage) ?? [];
          const allowed = dragging ? canDrop(dragging.from, stage) : false;
          return (
            <section
              key={stage}
              aria-label={meta.label}
              onDragOver={(e) => {
                if (dragging) {
                  e.preventDefault();
                  if (allowed) setHover(stage);
                }
              }}
              onDragLeave={() => setHover((h) => (h === stage ? null : h))}
              onDrop={(e) => drop(e, stage)}
              className={cx(
                "min-w-0 flex-col rounded-2xl border",
                stage === selected ? "flex" : "hidden 2xl:flex",
                hover === stage ? "border-flamme-400 ring-2 ring-flamme-300" : dragging && !allowed ? "border-outline opacity-50" : "border-outline",
                meta.soft,
              )}
            >
              <header className={cx("flex items-center gap-3 rounded-t-2xl px-4 py-3", meta.solid)}>
                <span className="grid size-10 shrink-0 place-items-center rounded-full bg-white/20">
                  <meta.icon className="size-5" aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-display text-lg font-bold leading-tight">{meta.label}</span>
                  <span className="block truncate text-xs text-white/85">{meta.hint}</span>
                </span>
                <span className="grid min-w-8 place-items-center rounded-full bg-white/25 px-2 text-sm font-extrabold">{rows.length}</span>
              </header>

              <div className="flex min-h-32 flex-1 flex-col gap-3 p-3">
                {rows.length === 0 ? (
                  <p className="m-auto flex flex-col items-center gap-2 py-8 text-center text-sm text-ink-faint">
                    <meta.icon className="size-8 opacity-40" aria-hidden="true" />
                    {dragging && allowed ? "Déposer ici" : "Aucune commande"}
                  </p>
                ) : (
                  rows.map(({ order, customerName, items }) => {
                    const deadline = deadlineWords(order, today);
                    const next = nextStage(order.status);
                    const to = next ? statusForStage(order.status, next) : null;
                    const article = articleOf(items);
                    const NextIcon = next ? STAGE_META[next].icon : Check;
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
                          "relative overflow-hidden rounded-2xl border bg-surface p-3 shadow-soft",
                          deadline?.state === "late" ? "border-wax-300" : "border-outline",
                          dragging?.id === order.id && "opacity-60",
                          busyId === order.id && "opacity-70",
                        )}
                      >
                        {deadline?.state === "late" ? <span aria-hidden="true" className="absolute inset-y-0 left-0 w-1.5 bg-wax-500" /> : null}
                        <button type="button" onClick={() => onOpen(order.id)} className="block w-full min-w-0 text-left" aria-label={`Ouvrir la commande de ${customerName ?? "client"}`}>
                          <span className="flex items-center gap-2">
                            <span className="min-w-0 flex-1 truncate text-lg font-bold text-ink">{customerName ?? "Client"}</span>
                            {order.priority === "URGENT" ? (
                              <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-wax-100 px-2 py-0.5 text-xs font-bold text-wax-600">
                                <AlarmClock className="size-3.5" aria-hidden="true" /> Urgent
                              </span>
                            ) : null}
                          </span>
                          {article ? <span className="mt-0.5 block truncate text-sm text-ink-soft">{article}</span> : null}
                          {deadline ? (
                            <span
                              className={cx(
                                "mt-2 flex items-center gap-1.5 text-sm font-semibold",
                                deadline.state === "late" ? "text-wax-600" : deadline.state === "today" || deadline.state === "soon" ? "text-flamme-700" : "text-ink-soft",
                              )}
                            >
                              {deadline.state === "late" ? <AlarmClock className="size-4" aria-hidden="true" /> : <CalendarClock className="size-4" aria-hidden="true" />}
                              {deadline.text}
                            </span>
                          ) : null}
                          <span className="mt-1 block truncate text-xs text-ink-faint">
                            <span className="tabular font-semibold text-ink-soft">{formatFcfa(order.total_price)}</span> · {order.reference}
                          </span>
                        </button>

                        <div className="mt-3 flex items-stretch gap-2">
                          {next && to ? (
                            // Action de la carte en secondaire (fond doux de l'étape suivante) : la couleur
                            // pleine reste au seul bouton principal de l'écran (« Nouvelle commande »).
                            <button
                              type="button"
                              onClick={() => onMove(order.id, to)}
                              disabled={busyId === order.id}
                              className={cx(
                                "flex h-12 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-xl border-2 px-2 text-base font-bold transition active:scale-95 disabled:opacity-50 2xl:h-11 2xl:gap-1 2xl:px-1.5 2xl:text-[13px]",
                                next === "SEWING" && "border-flamme-300 bg-flamme-50 text-flamme-700",
                                next === "READY" && "border-menthe-300 bg-menthe-50 text-menthe-600",
                                next === "DELIVERED" && "border-azur-300 bg-azur-50 text-azur-700",
                              )}
                            >
                              <NextIcon className="size-5 shrink-0 2xl:size-4" aria-hidden="true" />
                              {/* Colonnes étroites (1280 px) : le verbe passe sur deux lignes plutôt que « Commen… ». */}
                              <span className="truncate 2xl:whitespace-normal 2xl:text-center 2xl:leading-tight">{STAGE_META[next].action}</span>
                            </button>
                          ) : (
                            <span className="flex h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-azur-50 text-sm font-bold text-azur-700">
                              <Check className="size-5" aria-hidden="true" /> Livrée
                            </span>
                          )}
                          {speech ? (
                            <button
                              type="button"
                              onClick={() => speak(orderSpeech(order, customerName, article, today))}
                              aria-label="Écouter la commande"
                              title="Écouter la commande"
                              className="grid size-12 shrink-0 place-items-center rounded-xl border-2 border-outline bg-surface text-ink-soft transition hover:text-ink active:scale-95 2xl:size-11"
                            >
                              <Volume2 className="size-5" aria-hidden="true" />
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
    </div>
  );
}
