"use client";

import { useCallback, useEffect, useId, useMemo, useState, type FormEvent } from "react";
import { Check, Eye, Pencil, Plus, Wallet, X } from "lucide-react";
import { Badge, Button, Dialog, Field, Input, Switch, Textarea, type BadgeTone } from "@/ui";
import { cx } from "@/lib/cx";
import { formatPrice } from "@/domain/subscriptions/entitlements";
import {
  monthsLabel,
  PAYMENT_STATUS_LABELS,
  planPaymentErrorMessage,
  type PaymentMethod,
  type PlanPaymentRequest,
  type PlanPaymentStatus,
} from "@/domain/subscriptions/planPayments";
import { getSupabaseBrowserClient } from "@/infrastructure/supabase/browserClient";
import { createPlanPaymentsClient, PlanPaymentError, type PlanPaymentsClient } from "@/infrastructure/subscriptions/planPaymentsClient";
import { openProof } from "@/features/subscriptions/openProof";

/**
 * Plateforme : vérification des preuves de paiement envoyées par les
 * ateliers, et moyens de paiement publiés par pays. Chaque action est
 * revérifiée par la base (0024).
 */
const TONES: Record<PlanPaymentStatus, BadgeTone> = {
  PENDING: "warning",
  APPROVED: "success",
  REJECTED: "danger",
  CANCELLED: "neutral",
};

function message(e: unknown): string {
  return planPaymentErrorMessage(e instanceof PlanPaymentError ? e.code : null);
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

type Review = { payment: PlanPaymentRequest; approve: boolean };

export function PlatformPayments({ onApproved }: { onApproved: () => void }): React.ReactElement | null {
  const api = useMemo<PlanPaymentsClient | null>(() => {
    const client = getSupabaseBrowserClient();
    return client ? createPlanPaymentsClient(client) : null;
  }, []);
  const [payments, setPayments] = useState<PlanPaymentRequest[] | null>(null);
  const [methods, setMethods] = useState<PaymentMethod[]>([]);
  const [showAll, setShowAll] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [review, setReview] = useState<Review | null>(null);
  const [editing, setEditing] = useState<PaymentMethod | "new" | null>(null);

  const load = useCallback(async () => {
    if (!api) return;
    try {
      const [list, m] = await Promise.all([api.adminList(showAll ? null : "PENDING"), api.listMethods()]);
      setPayments(list);
      setMethods(m);
      setError(null);
    } catch (e) {
      setError(message(e));
    }
  }, [api, showAll]);

  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);

  if (!api) return null;
  const pendingCount = (payments ?? []).filter((p) => p.status === "PENDING").length;

  return (
    <>
      <section className="animate-fade-up">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 className="flex items-center gap-2 font-display text-xl text-ink">
            <Wallet className="size-5 text-menthe-600" aria-hidden="true" />
            Paiements à vérifier
            {pendingCount > 0 ? <Badge tone="warning" dot>{pendingCount}</Badge> : null}
          </h2>
          <div className="flex items-center gap-2 text-sm text-ink-soft">
            <Switch checked={showAll} onChange={(e) => setShowAll(e.target.checked)} aria-label="Afficher aussi les paiements traités" />
            <span aria-hidden="true">Afficher aussi les paiements traités</span>
          </div>
        </div>
        {error ? <p role="alert" className="mt-3 rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p> : null}
        {payments === null ? (
          <p className="mt-3 text-sm text-ink-soft">Chargement…</p>
        ) : payments.length === 0 ? (
          <p className="mt-3 rounded-md border border-outline bg-surface-2 px-3 py-2.5 text-sm text-ink-soft">Aucun paiement en attente.</p>
        ) : (
          <ul className="mt-3 grid grid-cols-1 gap-3 @3xl:grid-cols-2">
            {payments.map((p) => (
              <li key={p.id} className={cx("rounded-lg border bg-surface p-4 shadow-soft", p.status === "PENDING" ? "border-warning" : "border-outline")}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-display text-lg text-ink">{p.tenantName ?? "Atelier"}</p>
                    <p className="text-xs text-ink-faint">envoyé le {formatDateTime(p.createdAt)}</p>
                  </div>
                  <Badge tone={TONES[p.status]} dot>{PAYMENT_STATUS_LABELS[p.status]}</Badge>
                </div>
                <p className="mt-2 text-ink">
                  Plan <strong>{p.planName ?? p.planCode}</strong> · {monthsLabel(p.months)} ·{" "}
                  <strong className="font-display">{formatPrice(p.amount, p.currency)}</strong>
                </p>
                <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-sm">
                  <dt className="text-ink-soft">Moyen</dt>
                  <dd className="text-ink">{p.methodLabel} ({p.countryName}) → {p.methodAccount}</dd>
                  <dt className="text-ink-soft">Expéditeur</dt>
                  <dd className="text-ink">{p.senderName}{p.senderPhone ? ` · ${p.senderPhone}` : ""}</dd>
                  <dt className="text-ink-soft">Référence</dt>
                  <dd className="font-mono text-ink">{p.transferReference ?? "—"}</dd>
                </dl>
                {p.reviewNote ? <p className="mt-2 text-sm text-ink-soft">Note : {p.reviewNote}</p> : null}
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => void openProof(() => api.proofUrl(p.id)).catch((e) => setError(message(e)))}
                  >
                    <Eye className="size-4" aria-hidden="true" />
                    Voir la preuve
                  </Button>
                  {p.status === "PENDING" ? (
                    <>
                      <Button size="sm" onClick={() => setReview({ payment: p, approve: true })}>
                        <Check className="size-4" aria-hidden="true" />
                        Valider
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setReview({ payment: p, approve: false })}>
                        <X className="size-4" aria-hidden="true" />
                        Refuser
                      </Button>
                    </>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-10 animate-fade-up">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="font-display text-xl text-ink">Moyens de paiement</h2>
            <p className="mt-1 text-sm text-ink-soft">Les numéros affichés aux ateliers quand ils passent à un plan payant, par pays.</p>
          </div>
          <Button size="sm" onClick={() => setEditing("new")}>
            <Plus className="size-4" aria-hidden="true" />
            Ajouter
          </Button>
        </div>
        {methods.length === 0 ? (
          <p className="mt-3 rounded-md border border-warning bg-warning-soft px-3 py-2.5 text-sm text-ink">
            Aucun moyen de paiement : les ateliers ne peuvent pas encore payer. Ajoutez au moins un numéro.
          </p>
        ) : (
          <ul className="mt-3 grid grid-cols-1 gap-2 @2xl:grid-cols-2">
            {methods.map((m) => (
              <li key={m.id} className={cx("flex items-start justify-between gap-3 rounded-lg border bg-surface p-3 text-sm", m.isActive ? "border-outline" : "border-dashed border-outline opacity-60")}>
                <div className="min-w-0">
                  <p className="text-ink">
                    <strong>{m.label}</strong> · {m.countryName} <span className="text-ink-faint">({m.countryCode})</span>
                  </p>
                  <p className="font-mono text-ink">{m.accountNumber}</p>
                  {m.accountName ? <p className="text-ink-soft">{m.accountName}</p> : null}
                  {!m.isActive ? <p className="text-ink-faint">Désactivé</p> : null}
                </div>
                <Button variant="ghost" size="sm" onClick={() => setEditing(m)} aria-label={`Modifier ${m.label} ${m.countryName}`}>
                  <Pencil className="size-4" aria-hidden="true" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <ReviewDialog
        review={review}
        api={api}
        onClose={() => setReview(null)}
        onDone={(approved) => {
          setReview(null);
          void load();
          if (approved) onApproved();
        }}
      />
      <MethodDialog method={editing} api={api} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); void load(); }} />
    </>
  );
}

function ReviewDialog({ review, api, onClose, onDone }: { review: Review | null; api: PlanPaymentsClient; onClose: () => void; onDone: (approved: boolean) => void }) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const id = useId();

  function close() {
    if (busy) return;
    setNote("");
    setError(null);
    onClose();
  }

  async function confirm() {
    if (!review) return;
    setBusy(true);
    setError(null);
    try {
      await api.review(review.payment.id, review.approve, note);
      setNote("");
      onDone(review.approve);
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }

  const p = review?.payment;
  return (
    <Dialog
      open={review !== null}
      onClose={close}
      title={review?.approve ? "Valider le paiement" : "Refuser le paiement"}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={close} disabled={busy}>Retour</Button>
          <Button variant={review?.approve ? "primary" : "danger"} onClick={() => void confirm()} loading={busy}>
            {review?.approve ? "Valider et activer le plan" : "Refuser"}
          </Button>
        </>
      }
    >
      {p ? (
        <div className="flex flex-col gap-3 text-sm text-ink-soft">
          <p>
            {review?.approve
              ? `Vérifiez d'abord que ${formatPrice(p.amount, p.currency)} a bien été reçu par ${p.methodLabel}. Le plan ${p.planName ?? p.planCode} sera activé pour ${monthsLabel(p.months)} (ajoutés à l'échéance si ce plan est déjà en cours).`
              : "L'atelier verra le motif et pourra envoyer une nouvelle preuve."}
          </p>
          <Field label={review?.approve ? "Note (facultative)" : "Motif du refus"} required={!review?.approve} htmlFor={`${id}-note`}>
            <Textarea id={`${id}-note`} value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} rows={3} />
          </Field>
          {error ? <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-danger">{error}</p> : null}
        </div>
      ) : null}
    </Dialog>
  );
}

const EMPTY = { countryCode: "", countryName: "", label: "", accountNumber: "", accountName: "", instructions: "", isActive: true, sortOrder: 0 };

function MethodDialog({ method, api, onClose, onSaved }: { method: PaymentMethod | "new" | null; api: PlanPaymentsClient; onClose: () => void; onSaved: () => void }) {
  const id = useId();
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const open = method !== null;

  useEffect(() => {
    if (!open) return;
    const next =
      method === "new" || method === null
        ? EMPTY
        : {
            countryCode: method.countryCode,
            countryName: method.countryName,
            label: method.label,
            accountNumber: method.accountNumber,
            accountName: method.accountName ?? "",
            instructions: method.instructions ?? "",
            isActive: method.isActive,
            sortOrder: method.sortOrder,
          };
    void Promise.resolve().then(() => {
      setForm(next);
      setError(null);
    });
  }, [open, method]);

  const set = (key: keyof typeof EMPTY) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [key]: e.target.value }));

  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.saveMethod({ id: method && method !== "new" ? method.id : null, ...form, countryCode: form.countryCode.toUpperCase() });
      onSaved();
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      onClose={() => (busy ? undefined : onClose())}
      title={method === "new" ? "Nouveau moyen de paiement" : "Modifier le moyen de paiement"}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>Annuler</Button>
          <Button type="submit" form={`${id}-form`} loading={busy}>Enregistrer</Button>
        </>
      }
    >
      <form id={`${id}-form`} onSubmit={(e) => void save(e)} className="flex flex-col gap-3 text-sm">
        <div className="grid grid-cols-[6rem_1fr] gap-3">
          <Field label="Code pays" required htmlFor={`${id}-cc`} hint="SN, CI, ML…">
            <Input id={`${id}-cc`} value={form.countryCode} onChange={set("countryCode")} maxLength={2} autoCapitalize="characters" required />
          </Field>
          <Field label="Pays" required htmlFor={`${id}-cn`}>
            <Input id={`${id}-cn`} value={form.countryName} onChange={set("countryName")} maxLength={60} required />
          </Field>
        </div>
        <Field label="Moyen de paiement" required htmlFor={`${id}-label`} hint="Wave, Orange Money, MTN, Virement bancaire…">
          <Input id={`${id}-label`} value={form.label} onChange={set("label")} maxLength={60} required />
        </Field>
        <Field label="Numéro ou compte" required htmlFor={`${id}-num`}>
          <Input id={`${id}-num`} value={form.accountNumber} onChange={set("accountNumber")} maxLength={80} required />
        </Field>
        <Field label="Au nom de" htmlFor={`${id}-name`}>
          <Input id={`${id}-name`} value={form.accountName} onChange={set("accountName")} maxLength={80} />
        </Field>
        <Field label="Instructions" htmlFor={`${id}-ins`} hint="Affichées sous le numéro (facultatif).">
          <Textarea id={`${id}-ins`} value={form.instructions} onChange={set("instructions")} maxLength={500} rows={3} />
        </Field>
        <div className="flex items-center gap-2 text-ink">
          <Switch checked={form.isActive} onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))} aria-label="Proposé aux ateliers" />
          <span aria-hidden="true">Proposé aux ateliers</span>
        </div>
        {error ? <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-danger">{error}</p> : null}
      </form>
    </Dialog>
  );
}
