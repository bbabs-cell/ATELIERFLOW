"use client";

import { useCallback, useEffect, useState } from "react";
import { Banknote, FileText, ReceiptText, Undo2, Wallet } from "lucide-react";
import { Badge, Button, Dialog, Field, Input, Select, Textarea, StateView } from "@/ui";
import { formatEuros, parseEurosToCentimes } from "@/domain/money";
import {
  PAYMENT_MODES,
  formatPaymentMethodLabel,
  type PaymentMethod,
  type PaymentRecord,
} from "@/domain/orders/payments";
import type { ReceiptRecord } from "@/domain/orders/receipts";
import type { OrderPayments } from "@/application/orders/paymentService";
import { getOrdersFacade } from "./facade";

export interface PaymentsPanelProps {
  orderId: string;
  orderTotal: number;
  orderReference: string;
  orderStatus: string;
}

export function PaymentsPanel({
  orderId,
  orderTotal,
  orderReference,
  orderStatus,
}: PaymentsPanelProps): React.ReactElement {
  const [sheet, setSheet] = useState<OrderPayments | null>(null);
  const [receipts, setReceipts] = useState<ReceiptRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [recordOpen, setRecordOpen] = useState(false);
  const [amountEuros, setAmountEuros] = useState("");
  const [method, setMethod] = useState<PaymentMethod>("CASH");
  const [note, setNote] = useState("");
  const [formErrors, setFormErrors] = useState<Record<string, string> | null>(null);
  const [saving, setSaving] = useState(false);
  const [issuingId, setIssuingId] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState<PaymentRecord | null>(null);
  const [cancelReason, setCancelReason] = useState("");

  const reload = useCallback(async () => {
    const facade = getOrdersFacade();
    const [paymentsSheet, orderReceipts] = await Promise.all([
      facade.payments.orderPayments(orderId),
      facade.receipts.orderReceipts(orderId),
    ]);
    setSheet(paymentsSheet);
    setReceipts(orderReceipts);
    setLoading(false);
  }, [orderId]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        await reload();
      } catch {
        if (!cancelled) setError("Impossible de charger les paiements.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [reload]);

  function openRecord() {
    setAmountEuros("");
    setMethod("CASH");
    setNote("");
    setFormErrors(null);
    setRecordOpen(true);
  }

  async function record() {
    setSaving(true);
    setFormErrors(null);
    try {
      const amount = parseEurosToCentimes(amountEuros);
      const result = await getOrdersFacade().payments.recordPayment({
        orderId,
        amount: amount ?? 0,
        method,
        note: note.trim() !== "" ? note.trim() : null,
      });
      if (!result.ok) {
        setFormErrors(result.errors);
        return;
      }
      setRecordOpen(false);
      await reload();
    } finally {
      setSaving(false);
    }
  }

  async function issueReceipt(payment: PaymentRecord, correction: boolean) {
    setIssuingId(payment.id);
    setError(null);
    try {
      const facade = getOrdersFacade();
      const result = correction
        ? await facade.receipts.issueCorrectionReceipt(payment.id)
        : await facade.receipts.issuePaymentReceipt(payment.id);
      if (!result.ok) {
        setError(result.reason);
        return;
      }
      await reload();
    } finally {
      setIssuingId(null);
    }
  }

  async function confirmCancel() {
    if (!cancelling) return;
    if (!cancelReason.trim()) {
      setError("La raison d'annulation est obligatoire.");
      return;
    }
    setSaving(true);
    try {
      const result = await getOrdersFacade().payments.cancelPayment(
        cancelling.id,
        cancelReason,
      );
      if (!result.ok) {
        setError(result.reason);
        setCancelling(null);
        return;
      }
      setCancelling(null);
      setCancelReason("");
      await reload();
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <StateView variant="loading" title="Chargement des paiements…" />;
  }

  const balance = sheet?.balance;
  const payments = sheet?.payments ?? [];
  const cancelledOrder = orderStatus === "CANCELLED";
  const receiptsFor = (paymentId: string) =>
    receipts.filter((r) => r.payment_id === paymentId);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="flex size-9 items-center justify-center rounded-full bg-champagne-400 text-chocolat-950">
            <Wallet className="size-4" aria-hidden="true" />
          </span>
          <h3 className="font-display text-xl text-ink">Paiements</h3>
        </div>
        {!cancelledOrder ? (
          <Button type="button" variant="outline" size="sm" onClick={openRecord}>
            <Banknote className="size-4" aria-hidden="true" />
            Encaisser
          </Button>
        ) : null}
      </div>

      {error ? (
        <p className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger" role="alert">
          {error}
        </p>
      ) : null}

      <dl className="grid grid-cols-2 gap-3 min-[420px]:grid-cols-4">
        <div className="rounded-lg bg-ivoire-100 px-3 py-2">
          <dt className="text-xs uppercase tracking-wide text-ink-faint">Total</dt>
          <dd className="font-display text-lg text-ink">{formatEuros(orderTotal)}</dd>
        </div>
        <div className="rounded-lg bg-success-soft px-3 py-2">
          <dt className="text-xs uppercase tracking-wide text-success">Payé</dt>
          <dd className="font-display text-lg text-success">
            {formatEuros(balance?.totalPaid ?? 0)}
          </dd>
        </div>
        <div className="rounded-lg bg-anthracite-50 px-3 py-2">
          <dt className="text-xs uppercase tracking-wide text-ink-faint">
            {balance && balance.surplus > 0 ? "Restant" : "Reste à payer"}
          </dt>
          <dd className="font-display text-lg text-ink">
            {formatEuros(balance?.remaining ?? orderTotal)}
          </dd>
        </div>
        <div className="rounded-lg bg-warning-soft px-3 py-2">
          <dt className="text-xs uppercase tracking-wide text-warning">Surplus</dt>
          <dd className="font-display text-lg text-warning">
            {formatEuros(balance?.surplus ?? 0)}
          </dd>
        </div>
      </dl>

      {balance && balance.surplus > 0 ? (
        <p className="rounded-md bg-warning-soft px-3 py-2 text-sm text-warning">
          Crédit de {formatEuros(balance.surplus)} reporté sur la fiche — à utiliser ou
          rembourser, jamais détruit.
        </p>
      ) : null}

      {payments.length === 0 ? (
        <p className="rounded-md border border-dashed border-outline px-3 py-3 text-center text-sm text-ink-soft">
          Aucun paiement enregistré pour {orderReference}.
        </p>
      ) : (
        <ul className="divide-y divide-anthracite-100 rounded-lg border border-outline bg-surface">
          {payments.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2">
              <span className="font-display text-lg text-ink">{formatEuros(p.amount)}</span>
              <Badge tone={p.status === "VALID" ? "success" : "neutral"}>
                {p.status === "VALID" ? "Validé" : "Annulé"}
              </Badge>
              <span className="text-sm text-ink-soft">{formatPaymentMethodLabel(p.method)}</span>
              <span className="min-w-0 flex-1">
                {p.note ? <span className="truncate text-sm text-ink-soft">{p.note}</span> : null}
                {p.cancellation_reason ? (
                  <span className="block truncate text-sm text-danger">
                    {p.cancellation_reason}
                  </span>
                ) : null}
              </span>
              <span className="text-xs text-ink-faint">
                {new Date(p.created_at).toLocaleDateString("fr-FR")}
              </span>
              {p.status === "VALID" ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setCancelling(p);
                    setCancelReason("");
                    setError(null);
                  }}
                >
                  <Undo2 className="size-4" aria-hidden="true" />
                  Annuler
                </Button>
              ) : null}
              {p.status === "VALID" &&
              !receiptsFor(p.id).some((r) => !r.is_correction) ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => void issueReceipt(p, false)}
                  disabled={issuingId !== null}
                >
                  <ReceiptText className="size-4" aria-hidden="true" />
                  Reçu
                </Button>
              ) : null}
              {p.status === "CANCELLED" &&
              !receiptsFor(p.id).some((r) => r.is_correction) ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => void issueReceipt(p, true)}
                  disabled={issuingId !== null}
                >
                  <FileText className="size-4" aria-hidden="true" />
                  Contre-avoir
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {receipts.length > 0 ? (
        <div className="rounded-lg border border-outline bg-surface-2 p-4">
          <p className="text-sm font-medium text-ink">Reçus émis</p>
          <ul className="mt-2 divide-y divide-anthracite-100">
            {receipts.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
                <span className="font-mono text-sm font-semibold text-ink">{r.reference}</span>
                <Badge tone={r.is_correction ? "warning" : "success"}>
                  {r.is_correction ? "Contre-avoir" : "Reçu"}
                </Badge>
                {r.method ? (
                  <span className="text-sm text-ink-soft">{formatPaymentMethodLabel(r.method)}</span>
                ) : null}
                <span className="ml-auto text-sm font-medium text-ink">{formatEuros(r.amount)}</span>
                <span className="text-xs text-ink-faint">
                  {new Date(r.issued_at).toLocaleDateString("fr-FR")}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <Dialog
        open={recordOpen}
        onClose={() => setRecordOpen(false)}
        title="Encaisser un paiement"
        size="sm"
      >
        <div className="flex flex-col gap-4">
          {formErrors?.generic ? (
            <p className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger" role="alert">
              {formErrors.generic}
            </p>
          ) : null}
          <Field label="Montant (€)" required htmlFor="pay-amount" error={formErrors?.amount}>
            <Input
              id="pay-amount"
              inputMode="decimal"
              value={amountEuros}
              onChange={(e) => setAmountEuros(e.target.value)}
              placeholder="0,00"
              invalid={Boolean(formErrors?.amount)}
            />
          </Field>
          <Field label="Mode de paiement" htmlFor="pay-method">
            <Select
              id="pay-method"
              value={method}
              onChange={(e) => setMethod(e.target.value as PaymentMethod)}
            >
              {PAYMENT_MODES.map((m) => (
                <option key={m} value={m}>
                  {formatPaymentMethodLabel(m)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Note" htmlFor="pay-note">
            <Input
              id="pay-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Acompte, solde, avance…"
            />
          </Field>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setRecordOpen(false)} disabled={saving}>
              Retour
            </Button>
            <Button type="button" onClick={() => void record()} loading={saving}>
              Encaisser
            </Button>
          </div>
        </div>
      </Dialog>

      <Dialog
        open={cancelling !== null}
        onClose={() => setCancelling(null)}
        title="Annuler le paiement"
        size="sm"
      >
        <div className="flex flex-col gap-4">
          <p className="text-sm text-ink-soft">
            L&apos;annulation est définitive et conservée pour l&apos;audit. La raison est
            obligatoire et le solde est re-calculé.
          </p>
          <Field label="Raison" required htmlFor="pay-cancel-reason">
            <Textarea
              id="pay-cancel-reason"
              rows={3}
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              placeholder="Ex : erreur de saisie, remboursement…"
            />
          </Field>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setCancelling(null)} disabled={saving}>
              Retour
            </Button>
            <Button type="button" variant="danger" onClick={() => void confirmCancel()} loading={saving}>
              Confirmer
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}