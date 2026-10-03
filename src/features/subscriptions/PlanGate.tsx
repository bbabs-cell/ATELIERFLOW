"use client";

import { useCallback, useState, type ReactElement } from "react";
import Link from "next/link";
import { Sparkles } from "lucide-react";
import { Button, Dialog } from "@/ui";
import {
  canAdd,
  featureEnabled,
  planErrorMessage,
  type FeatureFlag,
  type LimitKind,
} from "@/domain/subscriptions/entitlements";
import { useEntitlements } from "./useEntitlements";

/**
 * Prévention AVANT création : si le plan ne permet pas d'ajouter un élément
 * (ou n'inclut pas une fonction), on l'explique au lieu d'ouvrir le
 * formulaire. Le serveur refuse de toute façon (migration 0022) : ceci
 * évite seulement une saisie perdue.
 */
export function usePlanGate(): {
  guard: (kind: Exclude<LimitKind, "storage">, localUsed: number, action: () => void) => void;
  guardFeature: (feature: FeatureFlag, action: () => void) => void;
  allows: (feature: FeatureFlag) => boolean;
  dialog: ReactElement;
} {
  const { entitlements } = useEntitlements();
  const [message, setMessage] = useState<string | null>(null);

  const guard = useCallback(
    (kind: Exclude<LimitKind, "storage">, localUsed: number, action: () => void) => {
      const check = canAdd(entitlements, kind, localUsed);
      if (check.ok) action();
      else setMessage(planErrorMessage(check.code, check.limit));
    },
    [entitlements],
  );

  const guardFeature = useCallback(
    (feature: FeatureFlag, action: () => void) => {
      if (featureEnabled(entitlements, feature)) action();
      else setMessage(planErrorMessage(`PLAN_FEATURE:${feature}`));
    },
    [entitlements],
  );

  const allows = useCallback((feature: FeatureFlag) => featureEnabled(entitlements, feature), [entitlements]);

  const dialog = <PlanLimitDialog message={message} onClose={() => setMessage(null)} />;
  return { guard, guardFeature, allows, dialog };
}

export function PlanLimitDialog({ message, onClose }: { message: string | null; onClose: () => void }) {
  return (
    <Dialog
      open={message !== null}
      onClose={onClose}
      title="Limite de votre plan"
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Fermer
          </Button>
          <Link
            href="/abonnement"
            onClick={onClose}
            className="shine inline-flex h-11 items-center justify-center gap-2 rounded-full bg-flamme-gradient px-5 text-sm font-semibold text-white shadow-glow transition-all duration-200 hover:-translate-y-0.5"
          >
            <Sparkles className="size-4" aria-hidden="true" />
            Voir les plans
          </Link>
        </>
      }
    >
      <p className="text-sm text-ink-soft">{message}</p>
    </Dialog>
  );
}

/** Encart affiché à la place d'une fonction absente du plan. */
export function FeatureLocked({ feature, children }: { feature: FeatureFlag; children?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-outline bg-surface-2 px-4 py-3 text-sm">
      <p className="min-w-0 text-ink-soft">{planErrorMessage(`PLAN_FEATURE:${feature}`)} {children}</p>
      <Link href="/abonnement" className="font-semibold text-flamme-700 underline-offset-4 hover:underline">
        Voir les plans
      </Link>
    </div>
  );
}
