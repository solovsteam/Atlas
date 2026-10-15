import type { Item, TaskStatus } from "@shared/item";
import { TASK_STATUSES } from "@shared/item";

export function TaskStatusButtons({
  status,
  onChange,
  compact = false
}: {
  status: TaskStatus;
  onChange: (status: TaskStatus) => void;
  compact?: boolean;
}) {
  return (
    <div
      className={compact ? "flex shrink-0 flex-col gap-1" : "flex flex-wrap gap-2"}
      onClick={(event) => event.stopPropagation()}
    >
      {TASK_STATUSES.map((entry) => (
        <button
          className={buttonClass(entry, status === entry, compact)}
          key={entry}
          type="button"
          onClick={() => onChange(entry)}
        >
          {entry}
        </button>
      ))}
    </div>
  );
}

const SELECTED: Record<TaskStatus, string> = {
  active: "border-indigo-400 bg-indigo-500/20 text-indigo-100",
  later: "border-amber-500 bg-amber-500/15 text-amber-300",
  done: "border-green-500 bg-green-500/15 text-green-300",
  cancelled: "border-rose-500/70 bg-rose-500/10 text-rose-300"
};

function buttonClass(entry: TaskStatus, selected: boolean, compact: boolean): string {
  const size = compact ? "px-2 py-0.5 text-[10px] uppercase tracking-wide" : "px-3 py-1 text-xs";
  if (selected) {
    return `rounded-md border font-medium ${size} ${SELECTED[entry]}`;
  }
  return `rounded-md border ${size} ${
    compact
      ? "border-neutral-800 text-neutral-500 hover:border-neutral-500 hover:text-neutral-300"
      : "border-neutral-700 text-neutral-400 hover:border-neutral-500"
  }`;
}

export function TaskStatusButtonsForItem({
  item,
  onStatusChange
}: {
  item: Item;
  onStatusChange: (item: Item, status: TaskStatus) => void;
}) {
  if (!item.isTask) {
    return null;
  }

  return (
    <TaskStatusButtons
      compact
      status={item.taskStatus ?? "active"}
      onChange={(status) => onStatusChange(item, status)}
    />
  );
}
