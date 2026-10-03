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
        <h3 key={monthLabel} className="font-display text-xl text-ink capitalize animate-fade-up">{monthLabel}</h3>
        <div className="flex items-center gap-1">
          <button
            type="button"
            aria-label="Mois précédent"
            onClick={() =>
              setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))
            }
            className="grid size-9 place-items-center rounded-full bg-chocolat-900 text-ivoire-50 transition-all duration-300 hover:scale-110 hover:bg-flamme-500 hover:shadow-glow pointer-coarse:size-11"
          >
            <ChevronLeft className="size-5" />
          </button>
          <button
            type="button"
            aria-label="Mois suivant"
            onClick={() =>
              setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))
            }
            className="grid size-9 place-items-center rounded-full bg-chocolat-900 text-ivoire-50 transition-all duration-300 hover:scale-110 hover:bg-flamme-500 hover:shadow-glow pointer-coarse:size-11"
          >
            <ChevronRight className="size-5" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-0.5 text-center xs:gap-1">
        {daysFr.map((d) => (
          <span key={d} className="font-mono text-[0.65rem] uppercase tracking-wider text-flamme-600">
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
              className="group relative flex aspect-square min-h-10 items-center justify-center rounded-xl text-sm font-medium transition-all duration-200 hover:-translate-y-0.5 hover:bg-flamme-50"
            >
              <span
                className={cx(
                  "flex size-9 items-center justify-center rounded-full transition-transform duration-300 group-hover:scale-110",
                  isToday && "bg-flamme-gradient font-bold text-white shadow-glow animate-gradient",
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
                        "size-1.5 rounded-full animate-pop",
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