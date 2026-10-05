"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { Check, Copy, FileText, ImageUp, Send } from "lucide-react";
import { Button, Dialog, Field, Input, Select, HIDDEN_FILE_INPUT } from "@/ui";
import { cx } from "@/lib/cx";
import { formatPrice, type PlanInfo } from "@/domain/subscriptions/entitlements";
import {
  MAX_PROOF_BYTES,
  methodsForCountry,
  monthsLabel,
  PAYMENT_MONTHS,
  paymentAmount,
  paymentCountries,
  planPaymentErrorMessage,
  type PaymentMethod,
  type PaymentMonths,
} from "@/domain/subscriptions/planPayments";
import { compressPhoto } from "@/infrastructure/files/filesClient";
import { getSupabaseBrowserClient } from "@/infrastructure/supabase/browserClient";
import { createPlanPaymentsClient, PlanPaymentError } from "@/infrastructure/subscriptions/planPaymentsClient";
import { countryByCode } from "@/domain/geo/countries";
import { approxFromXof } from "@/domain/geo/exchange";
import { useRates } from "@/features/locale/useRates";

export interface PlanPaymentDialogProps {
  plan: PlanInfo | null;
  onClose: () => void;
  onSubmitted: () => void;
}

/**
 * Passage à un plan payant : durée, pays, moyen de paiement (numéros
 * publiés par la plateforme), puis preuve du transfert. Le plan est activé
 * par la plateforme après vérification.
 */
export function PlanPaymentDialog({ plan, onClose, onSubmitted }: PlanPaymentDialogProps): React.ReactElement {
  const ids = useId();
  const [methods, setMethods] = useState<PaymentMethod[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [months, setMonths] = useState<PaymentMonths>(1);
  const [country, setCountry] = useState("");
  const [methodId, setMethodId] = useState("");
  const [senderName, setSenderName] = useState("");
  const [senderPhone, setSenderPhone] = useState("");
  const [reference, setReference] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const open = plan !== null;

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const client = getSupabaseBrowserClient();
    if (!client) return;
    void createPlanPaymentsClient(client)
      .listMethods()
      .then((list) => {
        if (cancelled) return;
        setMethods(list);
        setLoadError(null);
      })
      .catch((e) => {
        if (!cancelled) setLoadError(planPaymentErrorMessage(e instanceof PlanPaymentError ? e.code : null));
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  const countries = useMemo(() => paymentCountries(methods ?? []), [methods]);
  const countryMethods = useMemo(() => methodsForCountry(methods ?? [], country), [methods, country]);
  const method = countryMethods.find((m) => m.id === methodId) ?? null;
  const amount = plan ? paymentAmount(plan.priceMonthly, months) : 0;
  const rates = useRates();
  const localApprox = plan?.currency === "XOF" ? approxFromXof(amount, countryByCode(country)?.currency, rates) : null;

  function reset() {
    setMonths(1);
    setCountry("");
    setMethodId("");
    setSenderName("");
    setSenderPhone("");
    setReference("");
    setFile(null);
    setError(null);
  }

  function close() {
    if (busy) return;
    reset();
    onClose();
  }

  function chooseCountry(code: string) {
    setCountry(code);
    const list = methodsForCountry(methods ?? [], code);
    setMethodId(list.length === 1 ? list[0].id : "");
  }

  async function copy(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(value);
      window.setTimeout(() => setCopied(null), 2000);
    } catch {
      // presse-papiers indisponible : le numéro reste lisible
    }
  }

  async function submit() {
    if (!plan) return;
    if (!method) return setError("Choisissez le pays puis le moyen de paiement utilisé.");
    if (senderName.trim().length < 2) return setError("Indiquez le nom de la personne qui a envoyé l'argent.");
    if (!file) return setError("Ajoutez la preuve du transfert (capture d'écran, photo ou PDF).");
    const client = getSupabaseBrowserClient();
    if (!client) return;
    setBusy(true);
    setError(null);
    try {
      const body = file.type === "application/pdf" ? file : await compressPhoto(file, 2200, 0.85);
      if (body.size > MAX_PROOF_BYTES) throw new PlanPaymentError("VALIDATION:size");
      await createPlanPaymentsClient(client).submit({
        planCode: plan.code,
        months,
        methodId: method.id,
        senderName,
        senderPhone,
        reference,
        file: body,
        fileName: file.name || "preuve",
      });
      reset();
      onSubmitted();
    } catch (e) {
      setError(planPaymentErrorMessage(e instanceof PlanPaymentError ? e.code : null));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      onClose={close}
      title={plan ? `Passer au plan ${plan.name}` : ""}
      size="md"
      footer={
        <>
          <Button variant="ghost" onClick={close} disabled={busy}>
            Annuler
          </Button>
          <Button onClick={() => void submit()} loading={busy} disabled={!methods || countries.length === 0}>
            <Send className="size-4" aria-hidden="true" />
            Envoyer la preuve
          </Button>
        </>
      }
    >
      {plan ? (
        <div className="flex flex-col gap-5 text-sm">
          <ol className="flex flex-col gap-1 rounded-md bg-menthe-50 px-3 py-2.5 text-menthe-600">
            <li>1. Choisissez la durée, votre pays et le moyen de paiement.</li>
            <li>2. Envoyez le montant au numéro indiqué.</li>
            <li>3. Joignez la preuve du transfert : le plan est activé après vérification.</li>
          </ol>

          <fieldset>
            <legend className="text-sm font-medium text-ink">Durée</legend>
            <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {PAYMENT_MONTHS.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMonths(m)}
                  aria-pressed={months === m}
                  className={cx(
                    "min-h-11 rounded-md border px-2 py-2 text-center transition-colors",
                    months === m ? "border-menthe-500 bg-menthe-50 font-semibold text-menthe-600 ring-1 ring-menthe-500" : "border-outline bg-surface text-ink hover:bg-surface-2",
                  )}
                >
                  <span className="block">{monthsLabel(m)}</span>
                  <span className="block text-xs font-normal text-ink-soft">{formatPrice(paymentAmount(plan.priceMonthly, m), plan.currency)}</span>
                </button>
              ))}
            </div>
          </fieldset>

          {loadError ? (
            <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-danger">{loadError}</p>
          ) : methods === null ? (
            <p className="text-ink-soft">Chargement des moyens de paiement…</p>
          ) : countries.length === 0 ? (
            <p className="rounded-md bg-warning-soft px-3 py-2 text-warning">
              Les moyens de paiement ne sont pas encore disponibles. Réessayez un peu plus tard.
            </p>
          ) : (
            <>
              <Field label="Pays d'où vous envoyez l'argent" required htmlFor={`${ids}-country`}>
                <Select id={`${ids}-country`} value={country} onChange={(e) => chooseCountry(e.target.value)}>
                  <option value="">Choisir le pays…</option>
                  {countries.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.name}
                    </option>
                  ))}
                </Select>
              </Field>

              {country ? (
                <fieldset>
                  <legend className="text-sm font-medium text-ink">Moyen de paiement</legend>
                  <div className="mt-2 flex flex-col gap-2">
                    {countryMethods.map((m) => (
                      <label
                        key={m.id}
                        className={cx(
                          "flex cursor-pointer gap-3 rounded-md border p-3 transition-colors",
                          methodId === m.id ? "border-menthe-500 bg-menthe-50 ring-1 ring-menthe-500" : "border-outline bg-surface hover:bg-surface-2",
                        )}
                      >
                        <input
                          type="radio"
                          name={`${ids}-method`}
                          className="mt-1 size-4 accent-menthe-600"
                          checked={methodId === m.id}
                          onChange={() => setMethodId(m.id)}
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block font-semibold text-ink">{m.label}</span>
                          <span className="mt-0.5 flex flex-wrap items-center gap-2">
                            <span className="font-mono text-base text-ink">{m.accountNumber}</span>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.preventDefault();
                                void copy(m.accountNumber);
                              }}
                              className="inline-flex min-h-8 items-center gap-1 rounded-full px-2 text-xs font-medium text-menthe-600 hover:bg-menthe-100"
                            >
                              {copied === m.accountNumber ? <Check className="size-3.5" aria-hidden="true" /> : <Copy className="size-3.5" aria-hidden="true" />}
                              {copied === m.accountNumber ? "Copié" : "Copier"}
                            </button>
                          </span>
                          {m.accountName ? <span className="block text-ink-soft">Au nom de : {m.accountName}</span> : null}
                          {m.instructions ? <span className="mt-1 block whitespace-pre-line text-ink-soft">{m.instructions}</span> : null}
                        </span>
                      </label>
                    ))}
                  </div>
                </fieldset>
              ) : null}

              {method ? (
                <p className="rounded-md border border-menthe-200 bg-surface-2 px-3 py-2.5 text-ink">
                  Montant à envoyer : <strong className="font-display text-lg">{formatPrice(amount, plan.currency)}</strong>
                  <span className="text-ink-soft"> ({monthsLabel(months)}) par {method.label} au {method.accountNumber}.</span>
                  {localApprox ? (
                    <span className="mt-1 block text-ink-soft">
                      Soit environ <strong className="text-ink">{localApprox.replace(/^≈\u00a0/, "")}</strong> au taux du jour
                      (indicatif : c&apos;est le montant en {plan.currency === "XOF" ? "F CFA" : plan.currency} qui fait foi).
                    </span>
                  ) : null}
                </p>
              ) : null}

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field label="Nom de l'expéditeur" required htmlFor={`${ids}-name`}>
                  <Input id={`${ids}-name`} value={senderName} onChange={(e) => setSenderName(e.target.value)} maxLength={80} autoComplete="name" />
                </Field>
                <Field label="Numéro qui a envoyé" htmlFor={`${ids}-phone`} hint="Facultatif">
                  <Input id={`${ids}-phone`} value={senderPhone} onChange={(e) => setSenderPhone(e.target.value)} maxLength={30} inputMode="tel" autoComplete="tel" />
                </Field>
              </div>
              <Field label="Référence de la transaction" htmlFor={`${ids}-ref`} hint="Le code reçu par SMS après le transfert (facultatif mais utile).">
                <Input id={`${ids}-ref`} value={reference} onChange={(e) => setReference(e.target.value)} maxLength={80} />
              </Field>

              <Field label="Preuve du transfert" required htmlFor={`${ids}-file`} hint="Capture d'écran, photo du reçu ou PDF (4 Mo maximum).">
                <label
                  htmlFor={`${ids}-file`}
                  className={cx(
                    "flex min-h-14 cursor-pointer items-center gap-3 rounded-md border border-dashed px-3 py-2 transition-colors",
                    file ? "border-menthe-500 bg-menthe-50" : "border-outline bg-surface hover:bg-surface-2",
                  )}
                >
                  {file?.type === "application/pdf" ? (
                    <FileText className="size-5 shrink-0 text-menthe-600" aria-hidden="true" />
                  ) : (
                    <ImageUp className="size-5 shrink-0 text-menthe-600" aria-hidden="true" />
                  )}
                  <span className="min-w-0 truncate text-ink">{file ? file.name : "Choisir la capture ou le reçu…"}</span>
                </label>
                <input
                  id={`${ids}-file`}
                  type="file"
                  accept="image/*,application/pdf"
                  className={HIDDEN_FILE_INPUT}
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                />
              </Field>
            </>
          )}

          {error ? (
            <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-danger">
              {error}
            </p>
          ) : null}
        </div>
      ) : null}
    </Dialog>
  );
}
