import { Link } from "react-router-dom";
import type { Item, TaskStatus } from "@shared/item";
import { ItemKindBadge } from "./ItemKindBadge";
import { TaskStatusButtonsForItem } from "./TaskStatusButtons";

export function ItemList({
  items,
  emptyMessage = "No items.",
  onStatusChange,
  onDelete
}: {
  items: Item[];
  emptyMessage?: string;
  onStatusChange?: (item: Item, status: TaskStatus) => void | Promise<void>;
  onDelete?: (item: Item, event: React.MouseEvent) => void | Promise<void>;
}) {
  if (items.length === 0) {
    return <p className="text-sm text-neutral-500">{emptyMessage}</p>;
  }

  return (
    <ul className="divide-y divide-neutral-800 border-y border-neutral-800">
      {items.map((entry) => (
        <li key={entry.id}>
          <div className="flex items-start gap-3 py-3 hover:bg-neutral-950">
            {onStatusChange ? <TaskStatusButtonsForItem item={entry} onStatusChange={onStatusChange} /> : null}
            <Link className="min-w-0 flex-1" to={`/item/${entry.id}`}>
              <div className="flex min-w-0 items-center gap-2">
                <span className="truncate font-medium">{entry.title}</span>
                <ItemKindBadge item={entry} />
              </div>
              {entry.body ? <p className="mt-1 line-clamp-2 text-sm text-neutral-400">{entry.body}</p> : null}
            </Link>
            {onDelete ? (
              <button
                aria-label={`Delete ${entry.title}`}
                className="shrink-0 self-center px-2 py-1 text-xs text-neutral-600 hover:text-red-400"
                type="button"
                onClick={(event) => void onDelete(entry, event)}
              >
                Delete
              </button>
            ) : null}
          </div>
        </li>
      ))}
    </ul>
  );
}
