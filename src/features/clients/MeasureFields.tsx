"use client";

import { Ruler } from "lucide-react";
import type { MeasurementField } from "@/domain/clients/measurements";

/**
 * Grille de mesures : une case par mesure, clavier numérique, unité écrite
 * dans la case. Partagée par la prise de commande et la fiche du client.
 */
export interface MeasureFieldsProps {
  idPrefix: string;
  fields: readonly MeasurementField[];
  values: Record<string, string>;
  onChange: (key: string, value: string) => void;
}

export function MeasureFields({ idPrefix, fields, values, onChange }: MeasureFieldsProps) {
  return (
    <div className="grid grid-cols-2 gap-x-3 gap-y-2.5 min-[560px]:grid-cols-3">
      {fields.map((field) => {
        const id = `${idPrefix}-${field.key}`;
        return (
          <label key={field.key} htmlFor={id} className="flex min-w-0 flex-col gap-1">
            <span className="truncate text-xs font-semibold text-ink-soft" title={field.label}>
              {field.label}
            </span>
            <span className="relative">
              <input
                id={id}
                name={field.key}
                type="text"
                inputMode={field.kind === "text" ? "text" : "decimal"}
                autoComplete="off"
                value={values[field.key] ?? ""}
                onChange={(e) => onChange(field.key, e.target.value)}
                className="h-12 w-full rounded-xl border-2 border-outline bg-surface pl-3 pr-10 text-base font-semibold text-ink tabular outline-none transition focus-visible:border-flamme-500"
              />
              {field.kind === "number" ? (
                <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-ink-faint">{field.unit}</span>
              ) : null}
            </span>
          </label>
        );
      })}
    </div>
  );
}

export function MeasureTitle({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="grid size-9 shrink-0 place-items-center rounded-full bg-azur-100 text-azur-700">
        <Ruler className="size-4" aria-hidden="true" />
      </span>
      <div className="min-w-0">
        <p className="text-sm font-bold text-ink">{title}</p>
        {hint ? <p className="text-xs text-ink-soft">{hint}</p> : null}
      </div>
    </div>
  );
}
