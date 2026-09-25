"use client";

import { useCallback, useEffect, useState } from "react";
import { Archive, PackagePlus, Shirt, TrendingDown, TrendingUp, Scale } from "lucide-react";
import { Badge, Button, Dialog, Drawer, Field, Input, Select, StateView, Textarea } from "@/ui";
import type { FabricRecord } from "@/domain/inventory/fabrics";
import type { StockMovementRecord, StockMovementType } from "@/domain/inventory/stock";
import { formatFcfa } from "@/domain/money";
import { formatCentiUnits, formatMeters } from "@/domain/inventory/units";
import { getStockFacade } from "./facade";
import {
  FABRIC_STATUS_META,
  STOCK_MOVEMENT_TYPE_META,
  STOCK_MOVEMENT_TYPES_LIST,
} from "./constants";
import { FabricForm, type FabricFormValues } from "./FabricForm";

const isStrictlyPositive = (v: string) => v.trim() !== "";

export function StockView(): React.ReactElement {
  const [fabrics, setFabrics] = useState<FabricRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [formErrors, setFormErrors] = useState<Record<string, string> | null>(null);
  const [saving, setSaving] = useState(false);

  const [movement, setMovement] = useState<{
    fabric: FabricRecord;
    type: StockMovementType;
  } | null>(null);
  const [meters, setMeters] = useState("");
  const [reason, setReason] = useState("");
  const [movementErrors, setMovementErrors] = useState<Record<string, string> | null>(null);
  const [savingMovement, setSavingMovement] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const [detail, setDetail] = useState<FabricRecord | null>(null);
  const [movements, setMovements] = useState<StockMovementRecord[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const list = await getStockFacade().stock.listFabrics(search, showArchived);
      setFabrics(list);
    } catch {
      setError("Impossible de charger le stock.");
    } finally {
      setLoading(false);
    }
  }, [search, showArchived]);

  useEffect(() => {
    void (async () => {
      try {
        await load();
      } catch {
        // load encode déjà l'erreur
      }
    })();
  }, [load]);

  async function openCreate() {
    setFormErrors(null);
    setFormOpen(true);
  }

  async function submitFabric(values: FabricFormValues) {
    setSaving(true);
    setFormErrors(null);
    try {
      const result = await getStockFacade().stock.createFabric({
        name: values.name,
        color: values.color || null,
        supplier: values.supplier || null,
        unitPriceInput: values.unitPriceInput,
        initialMeters: values.initialMeters,
      });
      if (!result.ok) {
        setFormErrors(result.errors as Record<string, string>);
        return;
      }
      setFormOpen(false);
      await load();
    } finally {
      setSaving(false);
    }
  }

  async function openMovement(fabric: FabricRecord, type: StockMovementType) {
    setMovement({ fabric, type });
    setMeters("");
    setReason("");
    setMovementErrors(null);
    setActionError(null);
  }

  async function submitMovement() {
    if (!movement) return;
    setSavingMovement(true);
    setMovementErrors(null);
    setActionError(null);
    try {
      const result = await getStockFacade().stock.recordMovement({
        fabricId: movement.fabric.id,
        type: movement.type,
        meters,
        reason: reason || null,
      });
      if (!result.ok) {
        if (result.errors) {
          setMovementErrors(result.errors);
        } else if (result.reason) {
          setMovementErrors({ meters: result.reason });
        }
        return;
      }
      setMovement(null);
      await load();
    } finally {
      setSavingMovement(false);
    }
  }

  async function archive(fabric: FabricRecord) {
    setActionError(null);
    try {
      const result = await getStockFacade().stock.archiveFabric(fabric.id);
      if (!result.ok) {
        setActionError(result.reason);
        return;
      }
      await load();
    } catch {
      setActionError("L'archivage a échoué.");
    }
  }

  async function openDetail(fabric: FabricRecord) {
    setDetail(fabric);
    setDetailLoading(true);
    try {
      const list = await getStockFacade().stock.fabricMovements(fabric.id);
      setMovements(list);
    } finally {
      setDetailLoading(false);
    }
  }

  const hasNegative = fabrics.some((f) => f.quantity > 0);

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:py-10">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl text-ink sm:text-4xl">Stock · Tissus</h1>
          <p className="mt-1 text-sm text-ink-soft">
            Référentiel des tissus et journal des mouvements (entrées, sorties, ajustements).
          </p>
        </div>
        <Button onClick={() => void openCreate()}>
          <PackagePlus className="size-4" aria-hidden="true" />
          Nouveau tissu
        </Button>
      </header>

      <main className="mt-8">
        {error ? (
          <StateView
            variant="error"
            title="Impossible de charger le stock"
            description={error}
            action={<Button onClick={() => load().catch(() => undefined)}>Réessayer</Button>}
          />
        ) : loading ? (
          <StateView variant="loading" title="Chargement du stock…" />
        ) : (
          <>
            <div className="mb-4 flex flex-wrap items-center gap-3">
              <Input
                className="max-w-xs"
                placeholder="Rechercher un tissu…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                aria-label="Rechercher un tissu"
              />
              <label className="flex cursor-pointer items-center gap-2 text-sm text-ink-soft">
                <input
                  type="checkbox"
                  checked={showArchived}
                  onChange={(e) => setShowArchived(e.target.checked)}
                  className="size-4 accent-chocolat-800"
                />
                Afficher les archivés
              </label>
              {hasNegative ? (
                <p className="ml-auto text-sm text-danger">Stock négatif détecté — comptez-le.</p>
              ) : null}
              {actionError ? (
                <p className="ml-auto text-sm text-danger" role="alert">
                  {actionError}
                </p>
              ) : null}
            </div>

            {fabrics.length === 0 ? (
              <StateView
                variant="empty"
                title="Aucun tissu"
                description="Ajoutez votre premier tissu pour démarrer le stock."
                action={<Button onClick={() => void openCreate()}>Nouveau tissu</Button>}
              />
            ) : (
              <ul className="flex flex-col gap-2">
                {fabrics.map((fabric) => {
                  const statusMeta = FABRIC_STATUS_META[fabric.status];
                  const low = fabric.status === "ACTIVE" && fabric.quantity <= 100;
                  return (
                    <li
                      key={fabric.id}
                      className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-outline bg-surface p-3"
                    >
                      <button
                        type="button"
                        onClick={() => void openDetail(fabric)}
                        className="flex min-w-0 flex-1 items-start gap-3 text-left"
                      >
                        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-beige-100 text-chocolat-800">
                          <Shirt className="size-5" aria-hidden="true" />
                        </span>
                        <span className="min-w-0">
                          <span className="flex flex-wrap items-center gap-2">
                            <span className="font-medium text-ink">{fabric.name}</span>
                            {fabric.color ? (
                              <span className="text-sm text-ink-soft">{fabric.color}</span>
                            ) : null}
                            <Badge tone={statusMeta.tone}>{statusMeta.label}</Badge>
                            {low ? <Badge tone="warning">Stock bas</Badge> : null}
                          </span>
                          <span className="mt-0.5 block text-sm text-ink-faint">
                            {[fabric.supplier, formatFcfa(fabric.unit_price)].filter(Boolean).join(" · ") ||
                              "Prix non renseigné"}
                          </span>
                        </span>
                      </button>

                      <span
                        className={`font-display text-lg ${
                          low ? "text-warning" : "text-ink"
                        }`}
                        title={`${formatCentiUnits(fabric.quantity)} unités`}
                      >
                        {formatMeters(fabric.quantity)}
                      </span>

                      {fabric.status === "ACTIVE" ? (
                        <div className="flex flex-wrap gap-1.5">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => void openMovement(fabric, "IN")}
                          >
                            <TrendingUp className="size-4" aria-hidden="true" />
                            Entrée
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => void openMovement(fabric, "OUT")}
                          >
                            <TrendingDown className="size-4" aria-hidden="true" />
                            Sortie
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => void openMovement(fabric, "ADJUST")}
                          >
                            <Scale className="size-4" aria-hidden="true" />
                            Ajuster
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => void archive(fabric)}
                          >
                            <Archive className="size-4" aria-hidden="true" />
                            Archiver
                          </Button>
                        </div>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
          </>
        )}
      </main>

      <Dialog
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title="Nouveau tissu"
        size="lg"
      >
        <FabricForm
          errors={formErrors}
          busy={saving}
          onSubmit={submitFabric}
          onCancel={() => setFormOpen(false)}
        />
      </Dialog>

      <Dialog
        open={movement !== null}
        onClose={() => setMovement(null)}
        title={movement ? `Mouvement — ${movement.fabric.name}` : "Mouvement"}
        size="sm"
      >
        {movement ? (
          <form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              void submitMovement();
            }}
            noValidate
          >
            <p className="text-sm text-ink-soft">
              Stock actuel :{" "}
              <span className="font-medium text-ink">{formatMeters(movement.fabric.quantity)}</span>
            </p>
            <Field
              label="Type"
              htmlFor="movement-type"
            >
              <Select
                id="movement-type"
                value={movement.type}
                onChange={(e) =>
                  setMovement({ ...movement, type: e.target.value as StockMovementType })
                }
              >
                {STOCK_MOVEMENT_TYPES_LIST.map((t) => (
                  <option key={t} value={t}>
                    {STOCK_MOVEMENT_TYPE_META[t].label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field
              label={
                movement.type === "ADJUST" ? "Stock cible (m)" : "Quantité (m)"
              }
              htmlFor="movement-meters"
              error={movementErrors?.meters}
              required
            >
              <Input
                id="movement-meters"
                inputMode="decimal"
                value={meters}
                onChange={(e) => setMeters(e.target.value)}
                placeholder={movement.type === "ADJUST" ? "Ex : 8,5" : "2,50"}
                invalid={Boolean(movementErrors?.meters)}
              />
            </Field>
            <Field label="Raison" htmlFor="movement-reason">
              <Textarea
                id="movement-reason"
                rows={2}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder={movement.type === "ADJUST" ? "Ex : inventaire" : "Ex : nouvelle commande"}
              />
            </Field>
            <p className={`text-sm ${isStrictlyPositive(meters) ? "text-ink-soft" : "text-ink-soft"}`}>
              {movement.type === "ADJUST"
                ? `Le journal enregistrera un delta vers ${meters || "…"} m.`
                : movement.type === "IN"
                  ? "Entrée stockée au journal, solde recalculé."
                  : "Sortie stockée au journal, solde recalculé (jamais négatif)."}
            </p>
            <div className="flex justify-end gap-2 border-t border-anthracite-100 pt-4">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setMovement(null)}
                disabled={savingMovement}
              >
                Annuler
              </Button>
              <Button type="submit" loading={savingMovement}>
                Enregistrer le mouvement
              </Button>
            </div>
          </form>
        ) : null}
      </Dialog>

      <Drawer
        open={detail !== null}
        onClose={() => setDetail(null)}
        side="right"
        title={detail ? detail.name : "Tissu"}
      >
        {detail ? (
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={FABRIC_STATUS_META[detail.status].tone}>
                {FABRIC_STATUS_META[detail.status].label}
              </Badge>
              {detail.quantity <= 100 && detail.status === "ACTIVE" ? (
                <Badge tone="warning">Stock bas</Badge>
              ) : null}
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <p className="text-ink-soft">Couleur</p>
              <p className="font-medium text-ink">{detail.color ?? "—"}</p>
              <p className="text-ink-soft">Fournisseur</p>
              <p className="font-medium text-ink">{detail.supplier ?? "—"}</p>
              <p className="text-ink-soft">Prix au mètre</p>
              <p className="font-medium text-ink">{formatFcfa(detail.unit_price)}</p>
              <p className="text-ink-soft">Stock</p>
              <p className="font-display text-xl text-ink">{formatMeters(detail.quantity)}</p>
            </div>

            <div>
              <p className="mb-2 text-sm font-medium text-ink">Journal des mouvements</p>
              {detailLoading ? (
                <StateView variant="loading" title="Chargement…" />
              ) : movements.length === 0 ? (
                <p className="rounded-md bg-surface-2 p-3 text-sm text-ink-soft">
                  Aucun mouvement enregistré.
                </p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {movements.map((m) => {
                    const meta = STOCK_MOVEMENT_TYPE_META[m.type];
                    const sign = m.quantity > 0 ? "+" : m.quantity < 0 ? "−" : "";
                    return (
                      <li
                        key={m.id}
                        className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border border-outline bg-surface-2 p-2.5 text-sm"
                      >
                        <Badge tone={meta.tone}>{meta.label}</Badge>
                        <span
                          className={`font-mono font-semibold ${
                            m.quantity > 0
                              ? "text-success"
                              : m.quantity < 0
                                ? "text-warning"
                                : "text-ink"
                          }`}
                        >
                          {sign}
                          {formatCentiUnits(Math.abs(m.quantity))} m
                        </span>
                        <span className="ml-auto text-ink-soft">
                          Solde : <span className="font-medium text-ink">{formatMeters(m.balance_after)}</span>
                        </span>
                        {m.reason ? (
                          <span className="w-full text-xs text-ink-faint">{m.reason}</span>
                        ) : null}
                        <span className="w-full text-xs text-ink-faint">
                          {new Date(m.created_at).toLocaleString("fr-FR")}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        ) : null}
      </Drawer>
    </div>
  );
}