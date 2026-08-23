import { useMemo, useState } from "react";
import type { Item, TaskStatus } from "@shared/item";
import { isArchivedTask } from "@shared/relevance";
import { useAtlasData } from "../context/AtlasDataContext";
import { trackDeleteUndo, trackTaskStatusUndo, useUndo } from "../context/UndoContext";
import { ItemList } from "../components/ItemList";

export function ArchivePage() {
  const { items, updateItem, deleteItem } = useAtlasData();
  const { push } = useUndo();
  const [filter, setFilter] = useState<"all" | "done" | "cancelled">("all");

  const archived = useMemo(() => {
    return items
      .filter(isArchivedTask)
      .filter((item) => (filter === "all" ? true : item.taskStatus === filter))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }, [filter, items]);

  async function setTaskStatus(item: Item, status: TaskStatus) {
    const result = await updateItem(item.id, JSON.stringify({ taskStatus: status }), item.revision);
    if ("ok" in result && result.ok) {
      trackTaskStatusUndo(push, item);
    }
  }

  async function onDelete(item: Item, event: React.MouseEvent) {
    event.preventDefault();
    event.stopPropagation();
    await deleteItem(item.id);
    trackDeleteUndo(push, item);
  }

  return (
    <section>
      <h1 className="text-4xl font-bold tracking-tight">Archive</h1>
      <p className="mt-2 text-sm text-neutral-400">Done and cancelled tasks.</p>
      <div className="my-6 flex gap-2">
        {(["all", "done", "cancelled"] as const).map((entry) => (
          <button
            className={
              filter === entry
                ? "rounded-full border border-white bg-white px-3 py-1 text-xs font-medium text-black"
                : "rounded-full border border-neutral-700 px-3 py-1 text-xs text-neutral-300 hover:border-neutral-400"
            }
            key={entry}
            type="button"
            onClick={() => setFilter(entry)}
          >
            {entry}
          </button>
        ))}
      </div>
      <ItemList emptyMessage="Archive is empty." items={archived} onDelete={onDelete} onStatusChange={setTaskStatus} />
    </section>
  );
}
