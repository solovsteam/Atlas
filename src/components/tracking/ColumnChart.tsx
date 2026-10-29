import { useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import { niceScale } from "@shared/chartScale";
import { CHART_AIM, CHART_LINE } from "./chartColors";

const GRID = "#252c3a";
const SURFACE = "#111620";

const PLOT_HEIGHT = 150;
const AXIS_BAND = 22;
const MIN_GUTTER = 26;
const TOP_PAD = 8;
const SEGMENT_GAP = 2;

export type ColumnTooltip = { value: string; label: string; detail?: string };
export type ColumnStack = { color: string; values: number[] };
export type ChartScale = { top: number; ticks: number[]; format: (value: number) => string };

function roundedTopPath(x: number, width: number, bottom: number, height: number): string {
  // Rounded data end, square at the bottom.
  const r = Math.min(4, width / 2, height);
  const top = bottom - height;
  return `M${x},${bottom}V${top + r}Q${x},${top} ${x + r},${top}H${x + width - r}Q${x + width},${top} ${x + width},${top + r}V${bottom}Z`;
}

function defaultScale(max: number): ChartScale {
  const { top, step } = niceScale(max);
  const ticks: number[] = [];
  for (let value = 0; value <= top + 1e-9; value += step) {
    ticks.push(value);
  }
  return { top, ticks, format: (value) => (Number.isInteger(value) ? String(value) : value.toFixed(1)) };
}

/**
 * Stacked columns from one baseline (bottom stack first), optionally with a
 * line on the same axis (never a second scale). A line value of `null` is a
 * gap. Columns or a line may be left out, so this also draws a line chart.
 */
export function ColumnChart({
  count,
  stacks = [],
  line,
  lineColor = CHART_LINE,
  reference,
  scale,
  tick,
  tooltip,
  label
}: {
  count: number;
  stacks?: ColumnStack[];
  line?: (number | null)[];
  lineColor?: string;
  /** A target per column, drawn as a level mark across each column's slot. */
  reference?: (number | null)[];
  scale?: ChartScale;
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

  const totals = Array.from({ length: count }, (_, index) => stacks.reduce((sum, stack) => sum + (stack.values[index] ?? 0), 0));
  const lineValues = [...(line ?? []), ...(reference ?? [])].filter((value): value is number => value !== null);
  const { top, ticks, format } = scale ?? defaultScale(Math.max(1, ...totals, ...lineValues));
  // Wide enough for the longest axis label (about 6px per character at 10px).
  const leftGutter = Math.max(MIN_GUTTER, 10 + 6 * Math.max(...ticks.map((value) => format(value).length)));
  const plotWidth = width - leftGutter;
  const slot = count ? plotWidth / count : plotWidth;
  const gap = slot >= 4 ? 2 : 0;
  const barWidth = Math.max(1, Math.min(24, slot - gap));
  const baseline = TOP_PAD + PLOT_HEIGHT;
  const y = (value: number) => baseline - (value / top) * PLOT_HEIGHT;
  const centre = (index: number) => leftGutter + index * slot + slot / 2;

  const linePath = line
    ? line
        .map((value, index) => (value === null ? null : `${centre(index).toFixed(1)},${y(value).toFixed(1)}`))
        .reduce<string[]>((parts, point, index) => {
          if (point !== null) {
            parts.push(`${index > 0 && line[index - 1] !== null ? "L" : "M"}${point}`);
          }
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

  function columnSegments(index: number) {
    const x = centre(index) - barWidth / 2;
    const parts = stacks.map((stack) => ({ color: stack.color, value: stack.values[index] ?? 0 })).filter((part) => part.value > 0);
    let bottom = baseline;
    return parts.map((part, order) => {
      const fullHeight = Math.max(1, baseline - y(part.value));
      const isTop = order === parts.length - 1;
      // A surface-coloured gap separates touching segments.
      const height = Math.max(1, fullHeight - (isTop ? 0 : SEGMENT_GAP));
      const shape = isTop ? (
        <path d={roundedTopPath(x, barWidth, bottom, height)} fill={part.color} key={order} />
      ) : (
        <rect fill={part.color} height={height} key={order} width={barWidth} x={x} y={bottom - height} />
      );
      bottom -= fullHeight;
      return shape;
    });
  }

  const tip = active !== null ? tooltip(active) : null;
  const tipLeft = active !== null ? Math.min(Math.max(centre(active), 80), width - 80) : 0;

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
            <line stroke={GRID} strokeWidth={1} x1={leftGutter} x2={width} y1={y(value) + 0.5} y2={y(value) + 0.5} />
            <text className="fill-neutral-500 text-[10px] tabular-nums" dominantBaseline="middle" textAnchor="end" x={leftGutter - 6} y={y(value)}>
              {format(value)}
            </text>
          </g>
        ))}
        {totals.map((total, index) =>
          total > 0 ? (
            <g key={index} opacity={active === null || active === index ? 1 : 0.55}>
              {columnSegments(index)}
            </g>
          ) : null
        )}
        {reference?.map((value, index) =>
          value === null ? null : (
            <line
              key={`aim-${index}`}
              stroke={CHART_AIM}
              strokeWidth={2}
              x1={leftGutter + index * slot}
              x2={leftGutter + (index + 1) * slot}
              y1={y(value)}
              y2={y(value)}
            />
          )
        )}
        {linePath ? <path d={linePath} fill="none" stroke={lineColor} strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} /> : null}
        {line && lastLineIndex >= 0 && line[lastLineIndex] !== null ? (
          <circle cx={centre(lastLineIndex)} cy={y(line[lastLineIndex]!)} fill={lineColor} r={4} stroke={SURFACE} strokeWidth={2} />
        ) : null}
        {active !== null ? (
          <line stroke="#6c768a" strokeWidth={1} x1={centre(active)} x2={centre(active)} y1={TOP_PAD} y2={baseline} />
        ) : null}
        {Array.from({ length: count }, (_, index) => {
          const text = tick(index);
          return text ? (
            <text
              className="fill-neutral-500 text-[10px] tabular-nums"
              key={`tick-${index}`}
              textAnchor={index === 0 ? "start" : index === count - 1 ? "end" : "middle"}
              x={index === 0 ? leftGutter : index === count - 1 ? width : centre(index)}
              y={baseline + 15}
            >
              {text}
            </text>
          ) : null;
        })}
        {Array.from({ length: count }, (_, index) => (
          <rect
            fill="transparent"
            height={PLOT_HEIGHT + TOP_PAD}
            key={`hit-${index}`}
            width={slot}
            x={leftGutter + index * slot}
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
          {tip.detail ? <p className="mt-0.5 whitespace-pre-line text-neutral-400">{tip.detail}</p> : null}
        </div>
      ) : null}
    </div>
  );
}
