import { useId } from "react";

export interface MiniChartProps {
  data: number[];
  variant?: "bars" | "spark";
  height?: number;
  accent?: string;
  formatTooltip?: (value: number, index: number) => string;
}

/** Mini-graphiques SVG légers (auras du journal, mini stats) — sans lib externe. */
export function MiniChart({
  data,
  variant = "bars",
  height = 72,
  accent = "var(--color-accent)",
  formatTooltip,
}: MiniChartProps) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, "");
  if (data.length === 0) return null;

  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);

  return (
    <svg
      viewBox={`0 0 ${data.length * 20} ${height}`}
      className="w-full"
      role="img"
      aria-label="Graphique"
      preserveAspectRatio="none"
    >
      <defs>
        <linearGradient id={`fade-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={accent} stopOpacity="0.35" />
          <stop offset="100%" stopColor={accent} stopOpacity="0" />
        </linearGradient>
      </defs>

      {variant === "bars" ? (
        <g>
          {data.map((value, i) => {
            const h = (value / max) * (height - 8);
            const x = i * 20 + 3;
            return (
              <rect
                key={i}
                x={x}
                y={height - h}
                width={14}
                height={h}
                rx={3}
                fill={accent}
                opacity={0.85}
              >
                <title>
                  {formatTooltip
                    ? formatTooltip(value, i)
                    : `Valeur ${value}`}
                </title>
              </rect>
            );
          })}
        </g>
      ) : (
        <>
          <polyline
            fill={`url(#fade-${id})`}
            stroke="none"
            points={[
              `0,${height}`,
              ...data.map(
                (v, i) =>
                  `${(i / (data.length - 1)) * (data.length * 20 - 2) + 1},${
                    height - ((v - min) / (max - min || 1)) * (height - 6) - 3
                  }`,
              ),
              `${data.length * 20},${height}`,
            ].join(" ")}
          />
          <polyline
            fill="none"
            stroke={accent}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            points={data
              .map(
                (v, i) =>
                  `${(i / (data.length - 1)) * (data.length * 20 - 2) + 1},${
                    height - ((v - min) / (max - min || 1)) * (height - 6) - 3
                  }`,
              )
              .join(" ")}
          />
        </>
      )}
    </svg>
  );
}