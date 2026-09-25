import { cx } from "@/lib/cx";
import type { ReactNode } from "react";
import { Badge, type BadgeTone } from "../primitives/Badge";

export interface KanbanColumn {
  id: string;
  title: ReactNode;
  count?: number;
  cards: KanbanCard[];
  accent?: BadgeTone;
}

export interface KanbanCard {
  id: string;
  title: ReactNode;
  meta?: ReactNode;
  footer?: ReactNode;
}

export interface KanbanProps {
  columns: KanbanColumn[];
  className?: string;
  onCardClick?: (cardId: string, columnId: string) => void;
}

/**
 * Kanban responsive : les colonnes restent lisibles sur mobile
 * (lignes empilées), puis passent en colonnes côte à côte sur lg.
 */
export function Kanban({ columns, className, onCardClick }: KanbanProps) {
  return (
    <div
      className={cx(
        "grid grid-cols-1 gap-4 lg:grid-cols-[repeat(auto-fill,minmax(15rem,1fr))] lg:gap-5",
        className,
      )}
    >
      {columns.map((col) => (
        <section
          key={col.id}
          aria-label={typeof col.title === "string" ? col.title : "Colonne"}
          className="rounded-lg border border-outline bg-surface-2/70 p-3"
        >
          <header className="mb-3 flex items-center justify-between gap-2 px-1">
            <span className="flex min-w-0 items-center gap-2 text-sm font-medium text-ink">
              {col.title}
              {typeof col.count === "number" ? (
                <span className="rounded-full bg-beige-200 px-2 text-xs text-chocolat-900">
                  {col.count}
                </span>
              ) : null}
            </span>
            {col.accent ? <Badge tone={col.accent} dot /> : null}
          </header>
          <div className="flex flex-col gap-2">
            {col.cards.map((card) => (
              <article
                key={card.id}
                role={onCardClick ? "button" : undefined}
                tabIndex={onCardClick ? 0 : undefined}
                onClick={() => onCardClick?.(card.id, col.id)}
                onKeyDown={(e) => {
                  if (onCardClick && (e.key === "Enter" || e.key === " ")) {
                    e.preventDefault();
                    onCardClick(card.id, col.id);
                  }
                }}
                className="cursor-pointer rounded-md border border-outline bg-surface p-3 shadow-soft transition-shadow hover:shadow-lift"
              >
                <h4 className="text-sm font-medium text-ink">{card.title}</h4>
                {card.meta ? (
                  <p className="mt-1 text-xs text-ink-soft">{card.meta}</p>
                ) : null}
                {card.footer ? (
                  <div className="mt-2.5 flex items-center justify-between gap-2 border-t border-anthracite-100 pt-2">
                    {card.footer}
                  </div>
                ) : null}
              </article>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}