"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PackagePlus } from "lucide-react";
import { Button, Dialog, Drawer, Field, Textarea } from "@/ui";
import type { Customer } from "@/domain/clients/customer";
import type { OrderStatus } from "@/domain/orders/order";
import type { OrderWithCustomer } from "@/application/orders/orderService";
import { getClientsFacade } from "@/features/clients/facade";
import { getOrdersFacade } from "./facade";
import { OrderForm, type OrderFormValues } from "./OrderForm";
import { OrdersList } from "./OrdersList";
import { OrderDetail } from "./OrderDetail";

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

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:py-10">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl text-ink sm:text-4xl">Commandes</h1>
          <p className="mt-1 text-sm text-ink-soft">
            Suivi des créations de l&apos;atelier, de la commande à la livraison.
          </p>
        </div>
        <Button onClick={() => void openCreate()}>
          <PackagePlus className="size-4" aria-hidden="true" />
          Nouvelle commande
        </Button>
      </header>

      <main className="mt-8">
        <OrdersList
          orders={orders}
          loading={loading}
          error={error}
          search={search}
          onSearch={setSearch}
          onSelect={(id) => void selectOrder(id)}
          onRetry={() => load(search).catch(() => undefined)}
        />
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