"use client";

import { useState } from "react";
import { ClipboardList, Plus, Trash2 } from "lucide-react";
import { Button, Field, Input, Select, Textarea } from "@/ui";
import type { Customer } from "@/domain/clients/customer";
import { parseEurosToCentimes, lineTotal, sumCentimes, formatEuros } from "@/domain/money";
import { ORDER_PRIORITIES, type OrderItemDraft, type OrderPriority } from "@/domain/orders/order";
import { GARMENT_TYPES, ORDER_PRIORITY_LABELS } from "./constants";

export interface OrderFormValues {
  customerId: string;
  priority: OrderPriority;
  expectedAt: string;
  notes: string;
  items: OrderItemDraft[];
}

export interface OrderFormProps {
  customers: Customer[];
  busy?: boolean;
  errors?: Record<string, string> | null;
  onSubmit: (values: OrderFormValues) => Promise<void>;
  onCancel: () => void;
}

interface ItemRow {
  key: number;
  description: string;
  garmentType: string;
  quantity: number;
  unitPriceEuros: string;
}

let nextKey = 1;

function blankRow(): ItemRow {
  return {
    key: nextKey++,
    description: "",
    garmentType: "",
    quantity: 1,
    unitPriceEuros: "",
  };
}

export function OrderForm({
  customers,
  busy,
  errors,
  onSubmit,
  onCancel,
}: OrderFormProps) {
  const [customerId, setCustomerId] = useState("");
  const [priority, setPriority] = useState<OrderPriority>("NORMAL");
  const [expectedAt, setExpectedAt] = useState("");
  const [notes, setNotes] = useState("");
  const [rows, setRows] = useState<ItemRow[]>(() => [blankRow()]);
  const [localErrors, setLocalErrors] = useState<Record<string, string>>({});

  function updateRow(key: number, patch: Partial<ItemRow>) {
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  function addRow() {
    setRows((rs) => [...rs, blankRow()]);
  }

  function removeRow(key: number) {
    setRows((rs) => (rs.length > 1 ? rs.filter((r) => r.key !== key) : rs));
  }

  const parsed = rows.map((r) => ({
    row: r,
    unitPrice: parseEurosToCentimes(r.unitPriceEuros),
  }));
  const totals = parsed
    .map(({ row, unitPrice }) =>
      unitPrice === null ? null : lineTotal({ quantity: row.quantity, unitPrice }),
    )
    .filter((t): t is number => t !== null);
  const grandTotal = sumCentimes(totals);

  function submit() {
    const errs: Record<string, string> = {};
    if (!customerId) errs.customerId = "Sélectionnez un client.";

    if (rows.length === 0) {
      errs.generic = "Ajoutez au moins un article.";
    }
    rows.forEach((row, index) => {
      const itemError = (message: string) => {
        errs[`items.${index}.description`] = message;
      };
      if (!row.description.trim()) {
        itemError("Précisez l'article.");
      } else if (parsed[index].unitPrice === null) {
        itemError("Montant invalide (ex : 25,50).");
      } else if (!Number.isSafeInteger(row.quantity) || row.quantity < 1) {
        itemError("Quantité minimale : 1.");
      }
    });

    setLocalErrors(errs);
    if (Object.keys(errs).length > 0) return;

    void onSubmit({
      customerId,
      priority,
      expectedAt: expectedAt || "",
      notes,
      items: rows.map((row, index) => ({
        description: row.description.trim(),
        garment_type: row.garmentType || null,
        quantity: row.quantity,
        unit_price: parsed[index].unitPrice as number,
      })),
    });
  }

  const errorFor = (i: number) =>
    localErrors[`items.${i}.description`] ?? errors?.[`items.${i}.description`];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <span className="flex size-9 items-center justify-center rounded-full bg-champagne-400 text-chocolat-950">
          <ClipboardList className="size-4" aria-hidden="true" />
        </span>
        <h2 className="font-display text-2xl text-ink">Nouvelle commande</h2>
      </div>

      {(localErrors.generic ?? errors?.generic ?? errors?.customerId ?? errors?.total) ? (
        <p className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger" role="alert">
          {localErrors.generic ?? errors?.generic ?? errors?.customerId ?? errors?.total}
        </p>
      ) : null}

      <form
        className="flex flex-col gap-5"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        noValidate
      >
        <div className="grid gap-4 min-[480px]:grid-cols-2">
          <Field label="Client" required htmlFor="order-customer" error={errors?.customerId}>
            <Select
              id="order-customer"
              value={customerId}
              onChange={(e) => setCustomerId(e.target.value)}
              invalid={Boolean(errors?.customerId)}
            >
              <option value="">Choisir un client…</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.full_name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Priorité" htmlFor="order-priority">
            <Select
              id="order-priority"
              value={priority}
              onChange={(e) => setPriority(e.target.value as OrderPriority)}
            >
              {ORDER_PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {ORDER_PRIORITY_LABELS[p]}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <Field label="Livraison prévue" htmlFor="order-expected">
          <Input
            id="order-expected"
            type="date"
            value={expectedAt}
            onChange={(e) => setExpectedAt(e.target.value)}
          />
        </Field>

        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-ink">Articles</p>
            <Button type="button" variant="outline" size="sm" onClick={addRow}>
              <Plus className="size-4" aria-hidden="true" />
              Ajouter un article
            </Button>
          </div>

          {rows.map((row, index) => (
            <div
              key={row.key}
              className="flex flex-col gap-3 rounded-lg border border-outline bg-anthracite-50 p-3"
            >
              <div className="grid items-start gap-3 min-[460px]:grid-cols-[1fr_120px]">
                <Field label={`Article ${index + 1}`} htmlFor={`item-${row.key}-desc`} error={errorFor(index)}>
                  <Input
                    id={`item-${row.key}-desc`}
                    value={row.description}
                    onChange={(e) => updateRow(row.key, { description: e.target.value })}
                    placeholder="Ex : Robe bazin en soie"
                    invalid={Boolean(errorFor(index))}
                  />
                </Field>
                <Field label="Type" htmlFor={`item-${row.key}-type`}>
                  <Select
                    id={`item-${row.key}-type`}
                    value={row.garmentType}
                    onChange={(e) => updateRow(row.key, { garmentType: e.target.value })}
                  >
                    <option value="">—</option>
                    {GARMENT_TYPES.map((g) => (
                      <option key={g} value={g}>
                        {g}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>

              <div className="grid items-end gap-3 min-[460px]:grid-cols-[100px_140px_1fr_auto]">
                <Field label="Qté" htmlFor={`item-${row.key}-qty`}>
                  <Input
                    id={`item-${row.key}-qty`}
                    type="number"
                    inputMode="numeric"
                    min={1}
                    value={row.quantity}
                    onChange={(e) => updateRow(row.key, { quantity: Number(e.target.value) })}
                  />
                </Field>
                <Field label="Prix unitaire (€)" htmlFor={`item-${row.key}-price`}>
                  <Input
                    id={`item-${row.key}-price`}
                    inputMode="decimal"
                    value={row.unitPriceEuros}
                    onChange={(e) => updateRow(row.key, { unitPriceEuros: e.target.value })}
                    placeholder="25,50"
                    invalid={parsed[index].unitPrice === null && row.unitPriceEuros !== ""}
                  />
                </Field>
                <p className="py-2 text-right text-sm font-medium text-ink">
                  {parsed[index].unitPrice === null
                    ? "—"
                    : formatEuros(
                        lineTotal({ quantity: row.quantity, unitPrice: parsed[index].unitPrice }) ?? 0,
                      )}
                </p>
                <button
                  type="button"
                  onClick={() => removeRow(row.key)}
                  aria-label={`Supprimer l'article ${index + 1}`}
                  disabled={rows.length === 1}
                  className="rounded-md p-2 text-ink-soft hover:bg-danger-soft hover:text-danger disabled:opacity-40"
                >
                  <Trash2 className="size-4" aria-hidden="true" />
                </button>
              </div>
            </div>
          ))}

          <div className="flex items-center justify-between border-t border-anthracite-100 pt-3">
            <span className="text-sm text-ink-soft">Total de la commande</span>
            <span className="font-display text-xl text-ink">{formatEuros(grandTotal ?? 0)}</span>
          </div>
        </div>

        <Field label="Notes" htmlFor="order-notes">
          <Textarea
            id="order-notes"
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Détails de coupe, délais, préférences…"
          />
        </Field>

        <div className="flex justify-end gap-2 border-t border-anthracite-100 pt-4">
          <Button type="button" variant="ghost" onClick={onCancel} disabled={busy}>
            Annuler
          </Button>
          <Button type="submit" loading={busy}>
            Créer la commande
          </Button>
        </div>
      </form>
    </div>
  );
}