import { Link, useNavigate } from "react-router-dom";
import { useMemo, useState } from "react";
import type { Item, TaskStatus } from "@shared/item";
import { scheduledTaskIds } from "@shared/links";
import { itemToScheduleInput, readinessLabel, taskReadiness } from "@shared/scheduling";
import { useAtlasData } from "../context/AtlasDataContext";
import { trackCreateUndo, trackItemPatchUndo, trackTaskStatusUndo, useUndo } from "../context/UndoContext";
import { TaskStatusButtonsForItem } from "../components/TaskStatusButtons";

const DURATION_PRESETS = [15, 30, 60, 90];

export function TasksPage() {
  const navigate = useNavigate();
  const { items, links, createItem, updateItem } = useAtlasData();
  const { push } = useUndo();
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const scheduled = useMemo(() => scheduledTaskIds(links), [links]);

  const tasks = useMemo(
    () => items.filter((item) => item.isTask && item.taskStatus === "active"),
    [items]
  );

  async function onAdd(event: React.FormEvent) {
    event.preventDefault();
    const clean = title.trim();
    if (!clean) {
      return;
    }
    try {
      const result = await createItem(clean, { isTask: true });
      trackCreateUndo(push, result.id);
      setTitle("");
      setError(null);
      navigate(`/item/${result.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create task");
    }
  }

  async function setTaskStatus(item: Item, status: TaskStatus) {
    try {
      const result = await updateItem(item.id, JSON.stringify({ taskStatus: status }), item.revision);
      if ("ok" in result && result.ok) {
        trackTaskStatusUndo(push, item);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update status");
    }
  }

  async function patch(item: Item, next: { manualRelevance?: number; expectedDurationMinutes?: number | null }) {
    const before =
      next.manualRelevance !== undefined
        ? { manualRelevance: item.manualRelevance }
        : { expectedDurationMinutes: item.expectedDurationMinutes };
    try {
      const result = await updateItem(item.id, JSON.stringify(next), item.revision);
      if ("ok" in result && result.ok) {
        trackItemPatchUndo(push, item.id, before);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save");
    }
  }

  return (
    <section>
      <h1 className="text-4xl font-bold tracking-tight">Tasks</h1>
      <p className="mt-2 text-sm text-neutral-400">Fast capture. Importance and duration are enough to schedule.</p>

      <form className="mt-6 flex gap-3" onSubmit={(event) => void onAdd(event)}>
        <input
          className="min-w-0 flex-1 border border-neutral-700 bg-black px-3 py-2 text-base outline-none focus:border-white"
          placeholder="Add a task…"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
        />
        <button className="shrink-0 border border-white px-4 py-2 text-sm font-medium" type="submit">
          Add
        </button>
      </form>
      {error ? <p className="mt-3 text-sm text-red-400">{error}</p> : null}

      {tasks.length === 0 ? (
        <p className="mt-8 text-sm text-neutral-500">No active tasks.</p>
      ) : (
        <ul className="mt-8 divide-y divide-neutral-800 border-y border-neutral-800">
          {tasks.map((item) => {
            const input = itemToScheduleInput(item, items);
            const ready = taskReadiness(input, scheduled.has(item.id));
            return (
              <li className="py-4" key={item.id}>
                <div className="flex items-start gap-3">
                  <TaskStatusButtonsForItem item={item} onStatusChange={setTaskStatus} />
                  <div className="min-w-0 flex-1">
                    <Link className="font-medium hover:underline" to={`/item/${item.id}`}>
                      {item.title || "Untitled"}
                    </Link>
                    <p className="mt-1 text-[11px] uppercase tracking-wide text-neutral-600">{readinessLabel(ready)}</p>
                    <label className="mt-3 flex items-center gap-3 text-xs text-neutral-500">
                      Imp {Math.round(item.manualRelevance)}
                      <input
                        className="flex-1 accent-white"
                        max={10}
                        min={0}
                        step={1}
                        type="range"
                        value={Math.max(0, Math.min(10, item.manualRelevance))}
                        onChange={(event) => void patch(item, { manualRelevance: Number(event.target.value) })}
                      />
                    </label>
                    <div className="mt-2 flex flex-wrap gap-1">
                      {DURATION_PRESETS.map((minutes) => (
                        <button
                          className={
                            item.expectedDurationMinutes === minutes
                              ? "rounded border border-white px-2 py-0.5 text-[11px]"
                              : "rounded border border-neutral-800 px-2 py-0.5 text-[11px] text-neutral-500 hover:border-neutral-500"
                          }
                          key={minutes}
                          type="button"
                          onClick={() => void patch(item, { expectedDurationMinutes: minutes })}
                        >
                          {minutes}m
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
