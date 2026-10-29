import { useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import { niceScale } from "@shared/chartScale";

// Validated with the dataviz palette checker on the dark surfaces (#111620,
// #0b0f17): both pass lightness, CVD separation and 3:1 contrast. The gray is
// deliberately low-chroma: it is the context series, the accent is the point.
export const CHART_ACCENT = "#7a80f0";
export const CHART_CONTEXT = "#5b6478";
const GRID = "#252c3a";
const SURFACE = "#111620";

const PLOT_HEIGHT = 150;
const AXIS_BAND = 22;
const LEFT_GUTTER = 26;
const TOP_PAD = 8;

export type ColumnTooltip = { value: string; label: string; detail?: string };

function columnPath(x: number, width: number, baseline: number, height: number): string {
  // Rounded data end, square at the baseline.
  const r = Math.min(4, width / 2, height);
  const top = baseline - height;
  return `M${x},${baseline}V${top + r}Q${x},${top} ${x + r},${top}H${x + width - r}Q${x + width},${top} ${x + width},${top + r}V${baseline}Z`;
}

/**
 * Columns from one baseline, optionally with a line on the same axis (never a
 * second scale). `null` values are not drawn: they mean "no data", not zero.
 */
export function ColumnChart({
  columns,
  line,
  columnColor,
  lineColor = CHART_ACCENT,
  tick,
  tooltip,
  label
}: {
  columns: (number | null)[];
  line?: (number | null)[];
  columnColor: string;
  lineColor?: string;
  tick: (index: number) => string | null;
  tooltip: (index: number) => ColumnTooltip;
  label: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(320);
  const [active, setActive] = useState<number | null>(null);

  useLayoutEffect(() => {
    const element = containerRef.current;
    if (!element) {
      return;
    }
    const observer = new ResizeObserver(([entry]) => setWidth(Math.max(200, Math.floor(entry.contentRect.width))));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const count = columns.length;
  const plotWidth = width - LEFT_GUTTER;
  const slot = count ? plotWidth / count : plotWidth;
  const gap = slot >= 4 ? 2 : 0;
  const barWidth = Math.max(1, Math.min(24, slot - gap));
  const baseline = TOP_PAD + PLOT_HEIGHT;
  const values = [...columns, ...(line ?? [])].filter((value): value is number => value !== null);
  const { top, step } = niceScale(values.length ? Math.max(...values) : 1);
  const y = (value: number) => baseline - (value / top) * PLOT_HEIGHT;
  const centre = (index: number) => LEFT_GUTTER + index * slot + slot / 2;

  const ticks: number[] = [];
  for (let value = 0; value <= top + 1e-9; value += step) {
    ticks.push(value);
  }

  const linePath = line
    ? line
        .map((value, index) => (value === null ? null : `${centre(index).toFixed(1)},${y(value).toFixed(1)}`))
        .reduce<string[]>((parts, point, index) => {
          if (point === null) {
            return parts;
          }
          parts.push(`${index > 0 && line[index - 1] !== null ? "L" : "M"}${point}`);
          return parts;
        }, [])
        .join("")
    : "";
  const lastLineIndex = line ? line.map((value, index) => (value === null ? -1 : index)).reduce((a, b) => Math.max(a, b), -1) : -1;

  function onKeyDown(event: KeyboardEvent<SVGSVGElement>) {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") {
      return;
    }
    event.preventDefault();
    const start = active ?? count - 1;
    setActive(Math.min(count - 1, Math.max(0, start + (event.key === "ArrowLeft" ? -1 : 1))));
  }

  const tip = active !== null ? tooltip(active) : null;
  const tipLeft = active !== null ? Math.min(Math.max(centre(active), 70), width - 70) : 0;

  return (
    <div className="relative" ref={containerRef}>
      <svg
        aria-label={label}
        className="block touch-pan-y outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/60"
        height={baseline + AXIS_BAND}
        role="img"
        tabIndex={0}
        width={width}
        onBlur={() => setActive(null)}
        onKeyDown={onKeyDown}
        onPointerLeave={() => setActive(null)}
      >
        {ticks.map((value) => (
          <g key={value}>
            <line stroke={GRID} strokeWidth={1} x1={LEFT_GUTTER} x2={width} y1={y(value) + 0.5} y2={y(value) + 0.5} />
            <text className="fill-neutral-500 text-[10px] tabular-nums" dominantBaseline="middle" textAnchor="end" x={LEFT_GUTTER - 6} y={y(value)}>
              {Number.isInteger(value) ? value : value.toFixed(1)}
            </text>
          </g>
        ))}
        {columns.map((value, index) =>
          value !== null && value > 0 ? (
            <path
              d={columnPath(centre(index) - barWidth / 2, barWidth, baseline, Math.max(1, baseline - y(value)))}
              fill={columnColor}
              key={index}
              opacity={active === null || active === index ? 1 : 0.55}
            />
          ) : null
        )}
        {linePath ? <path d={linePath} fill="none" stroke={lineColor} strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} /> : null}
        {line && lastLineIndex >= 0 && line[lastLineIndex] !== null ? (
          <circle cx={centre(lastLineIndex)} cy={y(line[lastLineIndex]!)} fill={lineColor} r={4} stroke={SURFACE} strokeWidth={2} />
        ) : null}
        {active !== null ? (
          <line stroke="#6c768a" strokeWidth={1} x1={centre(active)} x2={centre(active)} y1={TOP_PAD} y2={baseline} />
        ) : null}
        {columns.map((_, index) => {
          const text = tick(index);
          return text ? (
            <text
              className="fill-neutral-500 text-[10px] tabular-nums"
              key={`tick-${index}`}
              textAnchor={index === 0 ? "start" : index === count - 1 ? "end" : "middle"}
              x={index === 0 ? LEFT_GUTTER + index * slot : index === count - 1 ? width : centre(index)}
              y={baseline + 15}
            >
              {text}
            </text>
          ) : null;
        })}
        {columns.map((_, index) => (
          <rect
            fill="transparent"
            height={PLOT_HEIGHT + TOP_PAD}
            key={`hit-${index}`}
            width={slot}
            x={LEFT_GUTTER + index * slot}
            y={0}
            onPointerDown={() => setActive(index)}
            onPointerEnter={() => setActive(index)}
          />
        ))}
      </svg>
      {tip ? (
        <div
          className="pointer-events-none absolute top-0 z-10 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-xs shadow-lg"
          style={{ left: tipLeft }}
        >
          <p className="text-sm font-semibold text-white">{tip.value}</p>
          <p className="text-neutral-400">{tip.label}</p>
          {tip.detail ? <p className="mt-0.5 text-neutral-400">{tip.detail}</p> : null}
        </div>
      ) : null}
    </div>
  );
}
