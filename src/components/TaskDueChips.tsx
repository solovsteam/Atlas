import type { Item } from "@shared/item";
import { dueAtForPreset, isDueSameLocalDay, isDueThisWeek, type DuePreset } from "@shared/due";
import { europeanDateFromIso } from "@shared/locale";

export function TaskDueChips({
  item,
  onChange
}: {
  item: Item;
  onChange: (dueAt: string | null) => void;
}) {
  const now = new Date();
  const todayOn = isDueSameLocalDay(item.taskDueAt, now);
  const weekOn = Boolean(item.taskDueAt) && !todayOn && isDueThisWeek(item.taskDueAt, now);

  function setPreset(preset: DuePreset) {
    onChange(dueAtForPreset(now, preset));
  }

  return (
    <div className="mt-2 flex flex-wrap items-center gap-1">
      <button
        className={chipClass(todayOn)}
        type="button"
        onClick={() => setPreset("today")}
      >
        Today
      </button>
      <button className={chipClass(weekOn)} type="button" onClick={() => setPreset("week")}>
        This week
      </button>
      {item.taskDueAt ? (
        <button
          className="rounded border border-neutral-800 px-2 py-0.5 text-[11px] text-neutral-500 hover:border-neutral-500"
          type="button"
          onClick={() => onChange(null)}
        >
          Clear due
        </button>
      ) : null}
      {item.taskDueAt ? (
        <span className="text-[11px] text-neutral-600">Due {europeanDateFromIso(item.taskDueAt)}</span>
      ) : null}
    </div>
  );
}

function chipClass(on: boolean): string {
  return on
    ? "rounded border border-white px-2 py-0.5 text-[11px]"
    : "rounded border border-neutral-800 px-2 py-0.5 text-[11px] text-neutral-500 hover:border-neutral-500";
}
