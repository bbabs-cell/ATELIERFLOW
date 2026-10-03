"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, Clock, RotateCcw, X } from "lucide-react";
import { Button } from "@/ui";
import { noticeFor, planErrorMessage } from "@/domain/subscriptions/entitlements";
import type { SyncOperation } from "@/domain/sync/types";
import { getClientsFacade } from "@/features/clients/facade";
import { refreshEntitlements, useEntitlements } from "./useEntitlements";

const ENTITY_LABELS: Record<string, [string, string]> = {
  customers: ["client", "clients"],
  orders: ["commande", "commandes"],
  fabrics: ["tissu", "tissus"],
  stock_movements: ["mouvement de stock", "mouvements de stock"],
};

function formatDate(iso: string | null): string {
  return iso ? new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "long" }) : "";
}

function refusalSummary(ops: SyncOperation[]): string {
  const counts = new Map<string, number>();
  for (const op of ops) counts.set(op.entity, (counts.get(op.entity) ?? 0) + 1);
  return [...counts]
    .map(([entity, n]) => {
      const [one, many] = ENTITY_LABELS[entity] ?? ["élément", "éléments"];
      return `${n} ${n > 1 ? many : one}`;
    })
    .join(", ");
}

/**
 * Bandeau d'abonnement (session connectée uniquement) :
 *   - enregistrements refusés par le serveur (limite du plan) : restés sur
 *     l'appareil, renvoyables après un changement de plan ;
 *   - fin d'essai proche, paiement attendu, abonnement expiré.
 */
export function PlanBanner() {
  const { entitlements } = useEntitlements();
  const [refusals, setRefusals] = useState<SyncOperation[]>([]);
  const [hidden, setHidden] = useState(false);
  const [retrying, setRetrying] = useState(false);

  const readRefusals = useCallback(async () => {
    try {
      setRefusals(await getClientsFacade().engine.planRefusals());
    } catch {
      // file locale indisponible : rien à signaler
    }
  }, []);

  useEffect(() => {
    const engine = getClientsFacade().engine;
    let wasBusy = false;
    void Promise.resolve().then(readRefusals);
    return engine.subscribe((status) => {
      if (wasBusy && !status.busy) void readRefusals();
      wasBusy = status.busy;
    });
  }, [readRefusals]);

  async function retry() {
    setRetrying(true);
    try {
      await refreshEntitlements(true);
      await getClientsFacade().engine.retryRefused();
      await readRefusals();
    } finally {
      setRetrying(false);
    }
  }

  if (refusals.length > 0) {
    const message = planErrorMessage(refusals[0].lastError);
    return (
      <div role="alert" className="mx-auto mt-4 flex max-w-5xl flex-wrap items-center gap-3 rounded-lg border border-danger/30 bg-danger-soft px-4 py-3 text-sm text-danger animate-fade-up max-lg:mx-4">
        <AlertTriangle className="size-4 shrink-0" aria-hidden="true" />
        <p className="min-w-0 flex-1">
          <strong>Non enregistré sur le serveur : {refusalSummary(refusals)}.</strong> {message} Ces saisies restent
          sur cet appareil.
        </p>
        <div className="flex flex-wrap gap-2">
          <Link href="/abonnement" className="inline-flex h-9 items-center rounded-full px-3 font-semibold underline-offset-4 hover:underline pointer-coarse:h-11">
            Voir les plans
          </Link>
          <Button variant="outline" size="sm" loading={retrying} onClick={() => void retry()}>
            <RotateCcw className="size-4" aria-hidden="true" />
            Réessayer
          </Button>
        </div>
      </div>
    );
  }

  const notice = noticeFor(entitlements);
  if (!notice || hidden) return null;
  const text =
    notice.kind === "trial-ending"
      ? notice.days === 0
        ? "Votre essai gratuit se termine aujourd'hui."
        : `Votre essai gratuit se termine dans ${notice.days} jour${notice.days > 1 ? "s" : ""}.`
      : notice.kind === "grace"
        ? `Échéance dépassée : réglez votre abonnement avant le ${formatDate(notice.until)} pour garder votre plan.`
        : "Votre abonnement a expiré : l'atelier est revenu au plan gratuit. Vos données sont conservées.";
  return (
    <div role="status" className="mx-auto mt-4 flex max-w-5xl items-center gap-3 rounded-lg border border-warning/30 bg-warning-soft px-4 py-2.5 text-sm text-warning animate-fade-up max-lg:mx-4">
      <Clock className="size-4 shrink-0" aria-hidden="true" />
      <p className="min-w-0 flex-1">
        {text}{" "}
        <Link href="/abonnement" className="font-semibold underline underline-offset-4">
          Voir l&apos;abonnement
        </Link>
      </p>
      <button
        type="button"
        onClick={() => setHidden(true)}
        aria-label="Masquer"
        className="grid size-9 shrink-0 place-items-center rounded-full transition-colors hover:bg-white/40 pointer-coarse:size-11"
      >
        <X className="size-4" aria-hidden="true" />
      </button>
    </div>
  );
}
