import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";

export const WHEEL_ROW_HEIGHT = 40;
const VISIBLE_ROWS = 5;

export type WheelOption = { value: number; label: string; disabled?: boolean };

/**
 * One column of an iPhone-style picker: rows snap to the centre band while
 * scrolling, and the centred row is the value. Arrow keys and taps on a row
 * also move it.
 */
export function WheelColumn({
  label,
  options,
  value,
  onChange,
  className = ""
}: {
  label: string;
  options: WheelOption[];
  value: number;
  onChange: (value: number) => void;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const settleTimer = useRef<number | null>(null);
  const valueIndex = Math.max(0, options.findIndex((option) => option.value === value));
  const [centred, setCentred] = useState(valueIndex);

  // Follow value changes that did not come from scrolling (first render, arrow
  // keys), before paint so the wheel never flashes at its first row.
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) {
      return;
    }
    if (Math.round(element.scrollTop / WHEEL_ROW_HEIGHT) !== valueIndex) {
      element.scrollTop = valueIndex * WHEEL_ROW_HEIGHT;
    }
    setCentred(valueIndex);
  }, [valueIndex]);

  useEffect(() => () => {
    if (settleTimer.current !== null) {
      window.clearTimeout(settleTimer.current);
    }
  }, []);

  function indexFromScroll(): number {
    const element = ref.current;
    if (!element) {
      return valueIndex;
    }
    return Math.min(options.length - 1, Math.max(0, Math.round(element.scrollTop / WHEEL_ROW_HEIGHT)));
  }

  function onScroll() {
    setCentred(indexFromScroll());
    if (settleTimer.current !== null) {
      window.clearTimeout(settleTimer.current);
    }
    // Commit once the scroll (and its snap) has come to rest.
    settleTimer.current = window.setTimeout(() => {
      settleTimer.current = null;
      const next = options[indexFromScroll()];
      if (next && next.value !== value) {
        onChange(next.value);
      }
    }, 120);
  }

  function moveTo(index: number) {
    const clamped = Math.min(options.length - 1, Math.max(0, index));
    ref.current?.scrollTo({ top: clamped * WHEEL_ROW_HEIGHT, behavior: "smooth" });
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "ArrowUp" || event.key === "ArrowDown") {
      event.preventDefault();
      const index = valueIndex + (event.key === "ArrowUp" ? -1 : 1);
      const next = options[Math.min(options.length - 1, Math.max(0, index))];
      if (next) {
        onChange(next.value);
      }
    }
  }

  const padding = ((VISIBLE_ROWS - 1) / 2) * WHEEL_ROW_HEIGHT;

  return (
    <div
      aria-label={label}
      aria-valuetext={options[valueIndex]?.label}
      className={`relative min-w-0 outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/60 ${className}`}
      role="spinbutton"
      tabIndex={0}
      onKeyDown={onKeyDown}
    >
      <div
        className="overflow-y-scroll overscroll-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        ref={ref}
        style={{
          height: VISIBLE_ROWS * WHEEL_ROW_HEIGHT,
          scrollSnapType: "y mandatory",
          paddingBlock: padding,
          maskImage: "linear-gradient(to bottom, transparent, black 30%, black 70%, transparent)",
          WebkitMaskImage: "linear-gradient(to bottom, transparent, black 30%, black 70%, transparent)"
        }}
        onScroll={onScroll}
      >
        {options.map((option, index) => (
          <div
            aria-hidden="true"
            className={`flex cursor-pointer select-none items-center justify-center whitespace-nowrap px-1 text-lg tabular-nums transition-colors ${
              index === centred ? "font-semibold text-white" : option.disabled ? "text-neutral-700" : "text-neutral-500"
            }`}
            key={option.value}
            style={{ height: WHEEL_ROW_HEIGHT, scrollSnapAlign: "center" }}
            onClick={() => moveTo(index)}
          >
            {option.label}
          </div>
        ))}
      </div>
    </div>
  );
}
