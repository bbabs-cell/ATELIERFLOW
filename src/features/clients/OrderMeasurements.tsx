"use client";

import { useEffect, useState } from "react";
import type { HydratedMeasurement } from "@/domain/clients/measurements";
import { getClientsFacade } from "./facade";
import { MeasureTitle } from "./MeasureFields";

/** Mesures prises avec la commande (lecture seule, dans le détail de la commande). */
export function OrderMeasurements({ customerId, orderId }: { customerId: string; orderId: string }) {
  const [measure, setMeasure] = useState<HydratedMeasurement | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const found = await getClientsFacade().measures.orderMeasurements(customerId, orderId);
        if (!cancelled) setMeasure(found);
      } catch {
        // mesures illisibles sur cet appareil : la section reste cachée
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [customerId, orderId]);

  const entries = measure?.entries.filter((e) => e.value !== null) ?? [];
  if (entries.length === 0) return null;
  return (
    <section className="flex flex-col gap-3 rounded-xl border border-azur-200 bg-azur-50 p-3">
      <MeasureTitle
        title="Mesures de cette commande"
        hint={measure?.taken_at ? `Prises le ${new Date(measure.taken_at).toLocaleDateString("fr-FR")}` : undefined}
      />
      <dl className="grid grid-cols-2 gap-2">
        {entries.map((e) => (
          <div key={e.key} className="flex min-w-0 items-baseline justify-between gap-2 rounded-lg bg-surface px-2.5 py-1.5">
            <dt className="min-w-0 break-words text-xs text-ink-soft">{e.label}</dt>
            <dd className="shrink-0 text-sm font-bold text-ink tabular">
              {typeof e.value === "number" ? e.value.toLocaleString("fr-FR") : e.value}
              <span className="ml-0.5 text-[11px] font-normal text-ink-faint">{e.unit}</span>
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
