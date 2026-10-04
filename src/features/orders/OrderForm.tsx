"use client";

import { useEffect, useId, useRef, useState } from "react";
import { CalendarPlus, Camera, ClipboardList, Plus, Trash2, X } from "lucide-react";
import { Button, Field, Input, Select, Textarea } from "@/ui";
import { cx } from "@/lib/cx";
import type { Customer } from "@/domain/clients/customer";
import { parseFcfa, lineTotal, sumAmounts, formatFcfa } from "@/domain/money";
import { ORDER_PRIORITIES, type OrderItemDraft, type OrderPriority } from "@/domain/orders/order";
import { GARMENT_TYPES, ORDER_PRIORITY_LABELS } from "./constants";
import { currencySymbol } from "@/domain/money";
import { APPOINTMENT_TYPE_LABELS } from "@/domain/appointments/appointments";
import {
  DEFAULT_ORDER_APPOINTMENT_TIME,
  ORDER_APPOINTMENT_TYPES,
  type OrderAppointmentType,
} from "@/domain/appointments/fromOrder";
import { canWriteAppointments, type OrderAppointmentChoice } from "./orderAppointments";
import { canAttachOrderPhotos, MAX_ORDER_FORM_PHOTOS } from "./orderPhotos";

export interface OrderFormValues {
  customerId: string;
  priority: OrderPriority;
  expectedAt: string;
  notes: string;
  items: OrderItemDraft[];
  /** Rendez-vous à noter dans le calendrier à la date de livraison. */
  appointment: OrderAppointmentChoice;
  /** Photos du tissu apporté par le client, envoyées après la création. */
  fabricPhotos: File[];
  /** Client non enregistré : créé avec la commande (nom + téléphone). */
  newCustomer: { fullName: string; phone: string } | null;
}

type CustomerMode = "existing" | "new";

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
  unitPriceInput: string;
}

let nextKey = 1;

function blankRow(): ItemRow {
  return {
    key: nextKey++,
    description: "",
    garmentType: "",
    quantity: 1,
    unitPriceInput: "",
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
  // Sans choix explicite : « nouveau client » tant qu'aucun client n'est enregistré.
  const [chosenMode, setChosenMode] = useState<CustomerMode | null>(null);
  const customerMode: CustomerMode = chosenMode ?? (customers.length > 0 ? "existing" : "new");
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [priority, setPriority] = useState<OrderPriority>("NORMAL");
  const [expectedAt, setExpectedAt] = useState("");
  const allowAppointment = canWriteAppointments();
  const [addAppointment, setAddAppointment] = useState(true);
  const [appointmentTime, setAppointmentTime] = useState(DEFAULT_ORDER_APPOINTMENT_TIME);
  const [appointmentType, setAppointmentType] = useState<OrderAppointmentType>("DELIVERY");
  const [notes, setNotes] = useState("");
  const allowPhotos = canAttachOrderPhotos();
  const photoInputId = useId();
  const [photos, setPhotos] = useState<{ file: File; url: string }[]>([]);
  const photosRef = useRef(photos);
  useEffect(() => {
    photosRef.current = photos;
  }, [photos]);
  // Aperçus libérés à la fermeture du formulaire.
  useEffect(() => () => photosRef.current.forEach((p) => URL.revokeObjectURL(p.url)), []);

  function addPhotos(list: FileList | null) {
    if (!list) return;
    const room = MAX_ORDER_FORM_PHOTOS - photos.length;
    const added = [...list].filter((f) => f.type.startsWith("image/") || f.type === "").slice(0, Math.max(0, room));
    setPhotos((ps) => [...ps, ...added.map((file) => ({ file, url: URL.createObjectURL(file) }))]);
  }

  function removePhoto(url: string) {
    URL.revokeObjectURL(url);
    setPhotos((ps) => ps.filter((p) => p.url !== url));
  }
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
    unitPrice: parseFcfa(r.unitPriceInput),
  }));
  const totals = parsed
    .map(({ row, unitPrice }) =>
      unitPrice === null ? null : lineTotal({ quantity: row.quantity, unitPrice }),
    )
    .filter((t): t is number => t !== null);
  const grandTotal = sumAmounts(totals);

  function submit() {
    const errs: Record<string, string> = {};
    if (customerMode === "existing" && !customerId) errs.customerId = "Sélectionnez un client, ou choisissez « Nouveau client ».";
    if (customerMode === "new" && newName.trim().length < 2) errs.newName = "Indiquez le nom du client.";

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
      customerId: customerMode === "existing" ? customerId : "",
      newCustomer: customerMode === "new" ? { fullName: newName.trim(), phone: newPhone.trim() } : null,
      priority,
      expectedAt: expectedAt || "",
      notes,
      fabricPhotos: photos.map((p) => p.file),
      appointment: { enabled: allowAppointment && addAppointment && expectedAt !== "", time: appointmentTime || DEFAULT_ORDER_APPOINTMENT_TIME, type: appointmentType },
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
        <span className="flex size-9 items-center justify-center rounded-full bg-sunset-gradient text-white shadow-soft transition-transform duration-300 group-hover:scale-110">
          <ClipboardList className="size-4" aria-hidden="true" />
        </span>
        <h2 className="font-display text-2xl text-ink">Nouvelle commande</h2>
      </div>

      {(localErrors.generic ?? errors?.generic ?? errors?.total) ? (
        <p className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger" role="alert">
          {localErrors.generic ?? errors?.generic ?? errors?.total}
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
        <fieldset className="flex flex-col gap-3">
          <legend className="mb-2 text-sm font-medium text-ink">
            Client <span className="text-danger">*</span>
          </legend>
          <div role="radiogroup" aria-label="Type de client" className="grid grid-cols-2 gap-1 rounded-full bg-surface-2 p-1">
            {(
              [
                ["new", "Nouveau client"],
                ["existing", "Client enregistré"],
              ] as const
            ).map(([mode, label]) => (
              <button
                key={mode}
                type="button"
                role="radio"
                aria-checked={customerMode === mode}
                onClick={() => setChosenMode(mode)}
                className={cx(
                  "h-10 rounded-full px-3 text-sm font-semibold transition-all duration-200 pointer-coarse:h-11",
                  customerMode === mode ? "bg-surface text-ink shadow-soft" : "text-ink-soft hover:text-ink",
                )}
              >
                {label}
              </button>
            ))}
          </div>
          {customerMode === "existing" ? (
            <Field label="Client enregistré" htmlFor="order-customer" error={localErrors.customerId ?? errors?.customerId}>
              <Select
                id="order-customer"
                value={customerId}
                onChange={(e) => setCustomerId(e.target.value)}
                invalid={Boolean(localErrors.customerId ?? errors?.customerId)}
              >
                <option value="">{customers.length ? "Choisir un client…" : "Aucun client enregistré"}</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.full_name}
                    {c.phone ? ` · ${c.phone}` : ""}
                  </option>
                ))}
              </Select>
            </Field>
          ) : (
            <div className="grid gap-3 min-[480px]:grid-cols-2">
              <Field label="Nom du client" htmlFor="order-new-name" error={localErrors.newName ?? errors?.newName}>
                <Input id="order-new-name" autoComplete="off" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Ex. Awa Diop" />
              </Field>
              <Field label="Téléphone" htmlFor="order-new-phone" hint="Recommandé (rappels WhatsApp)" error={errors?.newPhone}>
                <Input id="order-new-phone" type="tel" inputMode="tel" autoComplete="off" value={newPhone} onChange={(e) => setNewPhone(e.target.value)} placeholder="+221 77 000 00 00" />
              </Field>
            </div>
          )}
        </fieldset>

        <div className="grid gap-4 min-[480px]:grid-cols-2">
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
          <Field label="Livraison prévue" htmlFor="order-expected">
            <Input
              id="order-expected"
              type="date"
              value={expectedAt}
              onChange={(e) => setExpectedAt(e.target.value)}
            />
          </Field>
        </div>

        {expectedAt && allowAppointment ? (
          <div className="flex flex-col gap-3 rounded-lg border border-azur-200 bg-azur-50/70 p-3 animate-fade-up">
            <label className="flex min-h-10 cursor-pointer items-center gap-3 text-sm font-medium text-ink pointer-coarse:min-h-11">
              <input
                type="checkbox"
                checked={addAppointment}
                onChange={(e) => setAddAppointment(e.target.checked)}
                className="size-5 shrink-0 accent-azur-600"
              />
              <span className="flex items-center gap-1.5">
                <CalendarPlus className="size-4 text-azur-600" aria-hidden="true" />
                Noter ce rendez-vous dans le calendrier
              </span>
            </label>
            {addAppointment ? (
              <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2">
                <Field label="Rendez-vous" htmlFor="order-appointment-type">
                  <Select
                    id="order-appointment-type"
                    value={appointmentType}
                    onChange={(e) => setAppointmentType(e.target.value as OrderAppointmentType)}
                  >
                    {ORDER_APPOINTMENT_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {APPOINTMENT_TYPE_LABELS[t]}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Heure" htmlFor="order-appointment-time">
                  <Input
                    id="order-appointment-time"
                    type="time"
                    value={appointmentTime}
                    onChange={(e) => setAppointmentTime(e.target.value)}
                  />
                </Field>
              </div>
            ) : null}
          </div>
        ) : null}

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
                <Field label={`Prix unitaire (${currencySymbol()})`} htmlFor={`item-${row.key}-price`}>
                  <Input
                    id={`item-${row.key}-price`}
                    inputMode="numeric"
                    value={row.unitPriceInput}
                    onChange={(e) => updateRow(row.key, { unitPriceInput: e.target.value })}
                    placeholder="Ex : 15 000"
                    invalid={parsed[index].unitPrice === null && row.unitPriceInput !== ""}
                  />
                </Field>
                <p className="py-2 text-right text-sm font-medium text-ink">
                  {parsed[index].unitPrice === null
                    ? "—"
                    : formatFcfa(
                        lineTotal({ quantity: row.quantity, unitPrice: parsed[index].unitPrice }) ?? 0,
                      )}
                </p>
                <button
                  type="button"
                  onClick={() => removeRow(row.key)}
                  aria-label={`Supprimer l'article ${index + 1}`}
                  disabled={rows.length === 1}
                  className="grid size-10 shrink-0 place-items-center rounded-md text-ink-soft hover:bg-danger-soft pointer-coarse:size-11 hover:text-danger disabled:opacity-40"
                >
                  <Trash2 className="size-4" aria-hidden="true" />
                </button>
              </div>
            </div>
          ))}

          <div className="flex items-center justify-between border-t border-anthracite-100 pt-3">
            <span className="text-sm text-ink-soft">Total de la commande</span>
            <span className="font-display text-xl text-ink">{formatFcfa(grandTotal ?? 0)}</span>
          </div>
        </div>

        {allowPhotos ? (
          <div className="flex flex-col gap-2 rounded-lg border border-outline bg-surface-2 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-sm font-medium text-ink">Tissu apporté par le client</p>
                <p className="text-xs text-ink-soft">Prenez-le en photo : elle sera rangée dans les photos de la commande.</p>
              </div>
              {photos.length < MAX_ORDER_FORM_PHOTOS ? (
                <label
                  htmlFor={photoInputId}
                  className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-full bg-chocolat-900 px-4 text-sm font-semibold text-ivoire-50 shadow-soft transition-all hover:-translate-y-0.5 pointer-coarse:h-11"
                >
                  <Camera className="size-4" aria-hidden="true" />
                  {photos.length === 0 ? "Photographier le tissu" : "Autre photo"}
                </label>
              ) : null}
              <input
                id={photoInputId}
                type="file"
                accept="image/*"
                capture="environment"
                multiple
                className="sr-only"
                onChange={(e) => {
                  addPhotos(e.target.files);
                  e.target.value = "";
                }}
              />
            </div>
            {photos.length > 0 ? (
              <ul className="flex flex-wrap gap-2">
                {photos.map((p, i) => (
                  <li key={p.url} className="relative">
                    {/* eslint-disable-next-line @next/next/no-img-element -- aperçu local (objet du navigateur) */}
                    <img src={p.url} alt={`Tissu ${i + 1}`} className="size-20 rounded-lg object-cover shadow-soft" />
                    <button
                      type="button"
                      onClick={() => removePhoto(p.url)}
                      aria-label={`Retirer la photo ${i + 1}`}
                      className="absolute -right-2 -top-2 grid size-7 place-items-center rounded-full bg-chocolat-900 text-white shadow-soft pointer-coarse:size-9"
                    >
                      <X className="size-4" aria-hidden="true" />
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}

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