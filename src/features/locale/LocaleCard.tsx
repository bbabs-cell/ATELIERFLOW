"use client";

import { useEffect, useId, useState } from "react";
import { Globe2 } from "lucide-react";
import { Button, Field, Select } from "@/ui";
import { COUNTRY_OPTIONS, countryByCode, currencyInfo } from "@/domain/geo/countries";
import { readCachedLocale, saveTenantLocale, useTenantLocale } from "./tenantLocale";

const MESSAGES: Record<string, string> = {
  CURRENCY_LOCKED:
    "La monnaie ne peut plus changer : des commandes ou paiements sont déjà enregistrés dans la monnaie actuelle. Choisissez un pays qui utilise la même monnaie.",
  "FORBIDDEN:tenant.settings": "Seul le propriétaire de l'atelier peut changer le pays.",
  OFFLINE: "Connexion Internet requise.",
};

/** Pays et monnaie de l'atelier (propriétaire). */
export function LocaleCard({ tenantId, editable }: { tenantId: string; editable: boolean }) {
  const id = useId();
  const locale = useTenantLocale(tenantId, true);
  const [country, setCountry] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    void Promise.resolve().then(() => setCountry(locale.countryCode ?? ""));
  }, [locale.countryCode]);

  const chosen = countryByCode(country);
  const currencyChanges = chosen !== null && chosen.currency !== locale.currency;

  async function save() {
    if (!chosen) return;
    setBusy(true);
    setMessage(null);
    const error = await saveTenantLocale(tenantId, chosen.code, chosen.currency);
    setBusy(false);
    setMessage(
      error
        ? { ok: false, text: MESSAGES[error] ?? "L'enregistrement a échoué. Réessayez." }
        : { ok: true, text: `Enregistré : ${chosen.name}, montants en ${currencyInfo(chosen.currency).plural}.` },
    );
  }

  const locked = readCachedLocale(tenantId)?.locked ?? locale.locked;
  return (
    <section className="flex flex-col gap-3 rounded-xl border border-outline bg-surface p-4 shadow-soft @2xl:col-span-2">
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-azur-gradient text-white">
          <Globe2 className="size-5" aria-hidden="true" />
        </span>
        <div>
          <h2 className="font-display text-lg text-ink">Pays et monnaie</h2>
          <p className="text-sm text-ink-soft">
            Monnaie actuelle : <strong className="text-ink">{currencyInfo(locale.currency).plural}</strong>.
            {locked ? " Elle est figée car des commandes ou paiements existent déjà." : " Modifiable tant qu'aucune commande n'est enregistrée."}
          </p>
        </div>
      </div>
      {editable ? (
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Pays de l'atelier" htmlFor={`${id}-country`} className="min-w-56 flex-1">
            <Select id={`${id}-country`} value={country} onChange={(e) => setCountry(e.target.value)}>
              <option value="">Choisir…</option>
              {COUNTRY_OPTIONS.map((c) => (
                <option key={c.code} value={c.code} disabled={locked && c.currency !== locale.currency}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
          <Button onClick={() => void save()} loading={busy} disabled={!chosen || (chosen.code === locale.countryCode && !currencyChanges)}>
            Enregistrer
          </Button>
        </div>
      ) : (
        <p className="text-sm text-ink-faint">Seul le propriétaire de l&apos;atelier peut changer le pays.</p>
      )}
      {currencyChanges && !locked ? (
        <p className="text-sm text-warning">Les montants s&apos;afficheront en {currencyInfo(chosen?.currency).plural}.</p>
      ) : null}
      {message ? (
        <p role={message.ok ? "status" : "alert"} className={message.ok ? "text-sm text-success" : "rounded-md bg-danger-soft px-3 py-2 text-sm text-danger"}>
          {message.text}
        </p>
      ) : null}
    </section>
  );
}
