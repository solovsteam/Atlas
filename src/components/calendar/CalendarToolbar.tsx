import type { CalendarZoom } from "@shared/calendar";
import { formatPeriodLabel } from "@shared/calendar";

const ZOOMS: CalendarZoom[] = ["day", "week", "month"];

export function CalendarToolbar({
  zoom,
  anchor,
  onZoomChange,
  onPrevious,
  onNext,
  onToday
}: {
  zoom: CalendarZoom;
  anchor: Date;
  onZoomChange: (zoom: CalendarZoom) => void;
  onPrevious: () => void;
  onNext: () => void;
  onToday: () => void;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <button
          className="border border-neutral-700 px-3 py-1.5 text-sm hover:border-white"
          type="button"
          onClick={onPrevious}
        >
          ←
        </button>
        <button
          className="border border-neutral-700 px-3 py-1.5 text-sm hover:border-white"
          type="button"
          onClick={onToday}
        >
          Today
        </button>
        <button
          className="border border-neutral-700 px-3 py-1.5 text-sm hover:border-white"
          type="button"
          onClick={onNext}
        >
          →
        </button>
        <h2 className="ml-2 text-lg font-medium capitalize">{formatPeriodLabel(zoom, anchor)}</h2>
      </div>

      <div className="flex gap-1 rounded border border-neutral-800 p-1">
        {ZOOMS.map((entry) => (
          <button
            className={
              zoom === entry
                ? "rounded bg-white px-3 py-1 text-xs font-medium text-black"
                : "rounded px-3 py-1 text-xs text-neutral-400 hover:text-white"
            }
            key={entry}
            type="button"
            onClick={() => onZoomChange(entry)}
          >
            {entry}
          </button>
        ))}
      </div>
    </div>
  );
}

export function CalendarEmptyState() {
  return (
    <p className="text-sm text-neutral-500">
      No intervals on this view yet. Enable <strong className="font-medium text-neutral-400">Interval</strong> on an
      item to add calendar blocks.
    </p>
  );
}
