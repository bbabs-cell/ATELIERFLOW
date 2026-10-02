"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AlarmClock, KanbanSquare, List, PackagePlus } from "lucide-react";
import { Button, Dialog, Drawer, Field, Select, Textarea } from "@/ui";
import { cx } from "@/lib/cx";
import { ORDER_PRIORITIES } from "@/domain/orders/order";
import { DEFAULT_BOARD_FILTERS, deadlineState, matchesFilters, type BoardFilters } from "@/domain/orders/board";
import type { Customer } from "@/domain/clients/customer";
import type { OrderStatus } from "@/domain/orders/order";
import type { OrderWithCustomer } from "@/application/orders/orderService";
import { getClientsFacade } from "@/features/clients/facade";
import { getOrdersFacade } from "./facade";
import { OrderForm, type OrderFormValues } from "./OrderForm";
import { OrdersList } from "./OrdersList";
import { OrderDetail } from "./OrderDetail";
import { OrderBoard } from "./OrderBoard";
import { ORDER_PRIORITY_META } from "./constants";
import { useAssignees } from "./useAssignees";
import { useDataChanged } from "@/features/sync/useDataChanged";

type OrdersMode = "list" | "board";
const MODE_KEY = "atelier.orders.view";

function initialMode(): OrdersMode {
  try {
    return window.localStorage.getItem(MODE_KEY) === "list" ? "list" : "board";
  } catch {
    return "board";
  }
}

export function OrdersView(): React.ReactElement {
  const [orders, setOrders] = useState<OrderWithCustomer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [selected, setSelected] = useState<OrderWithCustomer | null>(null);
  const selectedIdRef = useRef<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [formErrors, setFormErrors] = useState<Record<string, string> | null>(null);
  const [saving, setSaving] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [busyAction, setBusyAction] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const searchTimer = useRef<number | null>(null);
  const [mode, setMode] = useState<OrdersMode>(initialMode);
  const [filters, setFilters] = useState<BoardFilters>(DEFAULT_BOARD_FILTERS);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [boardMessage, setBoardMessage] = useState<string | null>(null);
  const assignees = useAssignees();

  function switchMode(next: OrdersMode) {
    setMode(next);
    try {
      window.localStorage.setItem(MODE_KEY, next);
    } catch {
      // préférence non mémorisée (navigation privée)
    }
  }

  function flash(message: string) {
    setBoardMessage(message);
    window.setTimeout(() => setBoardMessage((m) => (m === message ? null : m)), 3500);
  }

  async function moveOrder(id: string, to: OrderStatus) {
    setBusyId(id);
    try {
      const result = await getOrdersFacade().orders.transition(id, to);
      if (!result.ok) {
        flash(result.reason);
        return;
      }
      await load(search);
      if (selectedIdRef.current === id) void selectOrder(id).catch(() => undefined);
    } finally {
      setBusyId(null);
    }
  }

  async function assignOrder(id: string, employeeId: string | null) {
    await getOrdersFacade().orders.assign(id, employeeId);
    await load(search);
    void selectOrder(id).catch(() => undefined);
  }

  const load = useCallback(async (query: string) => {
    setError(null);
    try {
      const list = await getOrdersFacade().orders.listOrders({
        search: query,
        includeArchive: false,
      });
      setOrders(list);
    } catch {
      setError("Impossible de charger la liste des commandes.");
    } finally {
      setLoading(false);
    }
  }, []);
  useDataChanged(() => load(search));

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        await load("");
      } catch {
        if (!cancelled) setError("Impossible de charger la liste des commandes.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [load]);

  useEffect(() => {
    if (searchTimer.current !== null) {
      window.clearTimeout(searchTimer.current);
    }
    searchTimer.current = window.setTimeout(() => {
      void load(search);
    }, 250);
    return () => {
      if (searchTimer.current !== null) window.clearTimeout(searchTimer.current);
    };
  }, [search, load]);

  async function selectOrder(id: string) {
    selectedIdRef.current = id;
    const detail = await getOrdersFacade().orders.getOrderDetail(id);
    if (detail !== null && selectedIdRef.current === id) {
      setSelected(detail);
    }
  }

  async function openCreate() {
    setFormErrors(null);
    setFormOpen(true);
    if (customers.length === 0) {
      const list = await getClientsFacade().clients.listCustomers({
        search: "",
        includeArchive: false,
      });
      setCustomers(list);
    }
  }

  async function submitOrder(values: OrderFormValues) {
    setSaving(true);
    setFormErrors(null);
    try {
      const result = await getOrdersFacade().orders.createOrder({
        customerId: values.customerId,
        priority: values.priority,
        expectedAt: values.expectedAt || null,
        notes: values.notes || null,
        items: values.items,
      });
      if (!result.ok) {
        setFormErrors(result.errors);
        return;
      }
      setFormOpen(false);
      await load(search);
      void selectOrder(result.order.id).catch(() => undefined);
    } finally {
      setSaving(false);
    }
  }

  async function runAction(to: OrderStatus) {
    if (!selected) return;
    setBusyAction(true);
    setActionError(null);
    try {
      const result = await getOrdersFacade().orders.transition(selected.order.id, to);
      if (!result.ok) {
        setActionError(result.reason);
        return;
      }
      await load(search);
      void selectOrder(result.order.id).catch(() => undefined);
    } finally {
      setBusyAction(false);
    }
  }

  async function confirmCancel() {
    if (!selected) return;
    if (!cancelReason.trim()) {
      setActionError("La raison d'annulation est obligatoire.");
      return;
    }
    setBusyAction(true);
    setActionError(null);
    try {
      const result = await getOrdersFacade().orders.cancel(selected.order.id, cancelReason);
      if (!result.ok) {
        setActionError(result.reason);
        setCancelOpen(false);
        return;
      }
      setCancelOpen(false);
      setCancelReason("");
      await load(search);
      void selectOrder(result.order.id).catch(() => undefined);
    } finally {
      setBusyAction(false);
    }
  }

  const today = new Date().toISOString();
  const visibleOrders = orders.filter((o) => matchesFilters(o.order, filters, today));
  const lateCount = orders.filter((o) => deadlineState(o.order, today) === "late").length;
  const filtered = filters.priority !== "ALL" || filters.assignee !== "ALL" || filters.lateOnly;

  return (
    <div className={cx("mx-auto w-full px-4 py-6 sm:py-10", mode === "board" ? "max-w-[100rem]" : "max-w-5xl")}>
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="page-title text-4xl text-ink sm:text-5xl">Commandes</h1>
          <p className="mt-1 text-sm text-ink-soft">
            Suivi des créations de l&apos;atelier, de la commande à la livraison.
          </p>
        </div>
        <Button onClick={() => void openCreate()}>
          <PackagePlus className="size-4" aria-hidden="true" />
          Nouvelle commande
        </Button>
      </header>

      <div className="mt-6 flex flex-wrap items-center gap-3 animate-fade-up">
        <div role="tablist" aria-label="Affichage" className="relative grid grid-cols-2 rounded-full bg-chocolat-900 p-1.5 shadow-soft">
          <span
            aria-hidden="true"
            className={cx(
              "absolute inset-y-1.5 left-1.5 w-[calc(50%-0.375rem)] rounded-full bg-sunset-gradient shadow-glow transition-transform duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)]",
              mode === "list" ? "translate-x-full" : "translate-x-0",
            )}
          />
          {([
            ["board", "Atelier", KanbanSquare],
            ["list", "Liste", List],
          ] as const).map(([value, label, Icon]) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={mode === value}
              onClick={() => switchMode(value)}
              className={cx(
                "relative z-10 inline-flex h-10 items-center justify-center gap-2 rounded-full px-4 text-sm font-bold transition-colors duration-300",
                mode === value ? "text-chocolat-950" : "text-chocolat-200 hover:text-white",
              )}
            >
              <Icon className="size-4" aria-hidden="true" />
              {label}
            </button>
          ))}
        </div>

        <div className="w-full sm:w-52">
        <Select
            aria-label="Filtrer par priorité"
            className="h-11 min-h-11 w-auto rounded-full py-0 text-sm"
            value={filters.priority}
            onChange={(e) => setFilters({ ...filters, priority: e.target.value as BoardFilters["priority"] })}
          >
            <option value="ALL">Toutes priorités</option>
            {ORDER_PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {ORDER_PRIORITY_META[p].label}
              </option>
            ))}
          </Select>
        </div>
        <div className="w-full sm:w-52">
        <Select
            aria-label="Filtrer par personne affectée"
            className="h-11 min-h-11 w-auto rounded-full py-0 text-sm"
            value={filters.assignee}
            onChange={(e) => setFilters({ ...filters, assignee: e.target.value })}
          >
            <option value="ALL">Toute l&apos;équipe</option>
            <option value="UNASSIGNED">Non affectées</option>
            {assignees.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </Select>
        </div>
        <button
          type="button"
          aria-pressed={filters.lateOnly}
          onClick={() => setFilters({ ...filters, lateOnly: !filters.lateOnly })}
          className={cx(
            "inline-flex h-11 items-center gap-2 rounded-full border-2 px-4 text-sm font-bold transition-all duration-300",
            filters.lateOnly
              ? "border-wax-500 bg-wax-500 text-white shadow-[0_8px_20px_-8px_rgb(229_51_127/0.7)]"
              : "border-wax-300 bg-surface text-wax-600 hover:bg-wax-50",
          )}
        >
          <AlarmClock className={cx("size-4", lateCount > 0 && "animate-wiggle")} aria-hidden="true" />
          En retard
          <span className="grid min-w-6 place-items-center rounded-full bg-wax-100 px-1.5 text-xs text-wax-600">{lateCount}</span>
        </button>
        {filtered ? (
          <button
            type="button"
            onClick={() => setFilters(DEFAULT_BOARD_FILTERS)}
            className="text-sm font-semibold text-flamme-600 underline-offset-4 hover:underline"
          >
            Effacer les filtres
          </button>
        ) : null}
      </div>

      {boardMessage ? (
        <p role="alert" className="mt-4 rounded-lg border-2 border-wax-300 bg-wax-50 px-3 py-2 text-sm font-semibold text-wax-600 animate-wiggle">
          {boardMessage}
        </p>
      ) : null}

      <main className="mt-6">
        {mode === "board" ? (
          <OrderBoard
            orders={orders}
            filters={filters}
            assignees={assignees}
            busyId={busyId}
            onOpen={(id) => void selectOrder(id)}
            onMove={(id, to) => void moveOrder(id, to)}
            onRefused={flash}
          />
        ) : (
        <OrdersList
          orders={visibleOrders}
          loading={loading}
          error={error}
          search={search}
          onSearch={setSearch}
          onSelect={(id) => void selectOrder(id)}
          onRetry={() => load(search).catch(() => undefined)}
        />
        )}
      </main>

      <Drawer
        open={selected !== null}
        onClose={() => {
          selectedIdRef.current = null;
          setSelected(null);
        }}
        side="right"
        title="Détail de la commande"
      >
        {selected ? (
          <OrderDetail
            detail={selected}
            busyAction={busyAction}
            actionError={actionError}
            onAction={(to) => void runAction(to)}
            onCancelOrder={() => setCancelOpen(true)}
            assignees={assignees}
            onAssign={(employeeId) => void assignOrder(selected.order.id, employeeId)}
          />
        ) : null}
      </Drawer>

      <Dialog
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title="Nouvelle commande"
        size="lg"
      >
        <OrderForm
          customers={customers}
          errors={formErrors}
          busy={saving}
          onSubmit={submitOrder}
          onCancel={() => setFormOpen(false)}
        />
      </Dialog>

      <Dialog
        open={cancelOpen}
        onClose={() => setCancelOpen(false)}
        title="Annuler la commande"
        size="sm"
      >
        <div className="flex flex-col gap-4">
          <p className="text-sm text-ink-soft">
            L&apos;annulation est définitive et conservée dans l&apos;historique. Aucune suppression.
            Une raison est obligatoire.
          </p>
          <Field label="Raison" required htmlFor="cancel-reason">
            <Textarea
              id="cancel-reason"
              rows={3}
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              placeholder="Ex : client a renoncé, tissu indisponible…"
            />
          </Field>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setCancelOpen(false)} disabled={busyAction}>
              Retour
            </Button>
            <Button type="button" variant="danger" onClick={() => void confirmCancel()} loading={busyAction}>
              Confirmer l&apos;annulation
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}