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

function buttonClass(entry: TaskStatus, selected: boolean, compact: boolean): string {
  if (selected) {
    if (entry === "done") {
      return compact
        ? "rounded border border-green-500 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-green-400"
        : "rounded border border-green-500 px-3 py-1 text-xs font-medium text-green-400";
    }
    return compact
      ? "rounded border border-white px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide"
      : "rounded border border-white px-3 py-1 text-xs font-medium";
  }

  return compact
    ? "rounded border border-neutral-800 px-2 py-0.5 text-[10px] uppercase tracking-wide text-neutral-500 hover:border-neutral-500 hover:text-neutral-300"
    : "rounded border border-neutral-700 px-3 py-1 text-xs text-neutral-400 hover:border-neutral-500";
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
