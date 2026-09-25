"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cx } from "@/lib/cx";

export interface CalendarEvent {
  id: string;
  date: string; // YYYY-MM-DD
  label: string;
  tone?: "primary" | "accent" | "success" | "danger";
}

const tones: Record<NonNullable<CalendarEvent["tone"]>, string> = {
  primary: "bg-chocolat-900 text-ivoire-100",
  accent: "bg-champagne-400 text-chocolat-950",
  success: "bg-success text-white",
  danger: "bg-danger text-white",
};

const daysFr = ["lun.", "mar.", "mer.", "jeu.", "ven.", "sam.", "dim."];

export function Calendar({
  events,
  onSelectDate,
}: {
  events: CalendarEvent[];
  onSelectDate?: (date: string) => void;
}) {
  const today = new Date();
  const [cursor, setCursor] = useState(
    new Date(today.getFullYear(), today.getMonth(), 1),
  );

  const grid = useMemo(() => {
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    // lundi comme premier jour
    const offset = (first.getDay() + 6) % 7;
    const start = new Date(first);
    start.setDate(first.getDate() - offset);
    return Array.from({ length: 42 }, (_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      return d;
    });
  }, [cursor]);

  const byDate = useMemo(() => {
    const m = new Map<string, CalendarEvent[]>();
    for (const e of events) {
      const list = m.get(e.date) ?? [];
      list.push(e);
      m.set(e.date, list);
    }
    return m;
  }, [events]);

  const iso = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
      d.getDate(),
    ).padStart(2, "0")}`;

  const monthLabel = cursor.toLocaleDateString("fr-FR", {
    month: "long",
    year: "numeric",
  });
  const inMonth = (d: Date) => d.getMonth() === cursor.getMonth();

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-display text-lg text-ink capitalize">{monthLabel}</h3>
        <div className="flex items-center gap-1">
          <button
            type="button"
            aria-label="Mois précédent"
            onClick={() =>
              setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))
            }
            className="rounded-md p-1.5 text-ink-soft hover:bg-anthracite-50 hover:text-ink"
          >
            <ChevronLeft className="size-5" />
          </button>
          <button
            type="button"
            aria-label="Mois suivant"
            onClick={() =>
              setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))
            }
            className="rounded-md p-1.5 text-ink-soft hover:bg-anthracite-50 hover:text-ink"
          >
            <ChevronRight className="size-5" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center">
        {daysFr.map((d) => (
          <span key={d} className="text-[0.7rem] font-medium text-ink-faint">
            {d}
          </span>
        ))}
        {grid.map((d) => {
          const key = iso(d);
          const dayEvents = byDate.get(key) ?? [];
          const isToday = key === iso(today);
          return (
            <button
              key={key}
              type="button"
              onClick={() => onSelectDate?.(key)}
              aria-label={`${d.getDate()} ${monthLabel}${dayEvents.length ? `, ${dayEvents.length} évènement(s)` : ""}`}
              className="relative flex aspect-square items-center justify-center rounded-md text-sm transition-colors hover:bg-beige-100"
            >
              <span
                className={cx(
                  "flex size-8 items-center justify-center rounded-full",
                  isToday && "border border-champagne-500 font-semibold text-chocolat-900",
                  !inMonth(d) && "text-ink-faint",
                )}
              >
                {d.getDate()}
              </span>
              {dayEvents.length > 0 ? (
                <span className="absolute bottom-1 flex gap-0.5">
                  {dayEvents.slice(0, 3).map((e) => (
                    <span
                      key={e.id}
                      className={cx(
                        "size-1.5 rounded-full",
                        tones[e.tone ?? "primary"],
                      )}
                    />
                  ))}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}