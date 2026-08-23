import { Link } from "react-router-dom";
import type { Item, ItemPatch, TaskStatus } from "@shared/item";
import { parentTaskOf } from "@shared/subtasks";
import { readinessLabel, taskScheduleReadiness } from "@shared/scheduling";
import { useMemo } from "react";
import { useAtlasData } from "../../context/AtlasDataContext";
import { trackItemPatchUndo, trackTaskStatusUndo, useUndo } from "../../context/UndoContext";
import { ImportanceSlider } from "./ImportanceSlider";
import { ScheduleReadinessBadge } from "./ScheduleReadinessBadge";

const DURATION_PRESETS = [15, 30, 60] as const;

export function TaskRow({
  task,
  items,
  isSubtask = false
}: {
  task: Item;
  items: Item[];
  isSubtask?: boolean;
}) {
  const { itemLinks, updateItem } = useAtlasData();
  const { push } = useUndo();
  const parent = parentTaskOf(task, items);

  const readiness = useMemo(
    () => taskScheduleReadiness(task, items, itemLinks, { origin: "tasks" }),
    [task, items, itemLinks]
  );

  const detailLabel = useMemo(() => readinessLabel(readiness, items), [readiness, items]);

  async function setDone(done: boolean) {
    const status: TaskStatus = done ? "done" : "active";
    if (status === (task.taskStatus ?? "active")) {
      return;
    }
    try {
      const result = await updateItem(task.id, JSON.stringify({ taskStatus: status }), task.revision);
      if ("ok" in result && result.ok) {
        trackTaskStatusUndo(push, task);
      }
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "Could not update task");
    }
  }

  async function setDuration(minutes: number) {
    if (minutes === task.expectedDurationMinutes) {
      return;
    }
    try {
      const result = await updateItem(
        task.id,
        JSON.stringify({ expectedDurationMinutes: minutes } satisfies ItemPatch),
        task.revision
      );
      if ("ok" in result && result.ok) {
        trackItemPatchUndo(push, task.id, { expectedDurationMinutes: task.expectedDurationMinutes });
      }
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "Could not save duration");
    }
  }

  const effectiveDuration = task.expectedDurationMinutes ?? parent?.expectedDurationMinutes ?? 30;

  return (
    <div className={`py-3 ${isSubtask ? "pl-6" : ""}`}>
      <div className="flex items-start gap-3">
        <label className="mt-1 flex shrink-0 cursor-pointer items-center">
          <input
            checked={false}
            className="h-4 w-4 accent-white"
            type="checkbox"
            onChange={(event) => void setDone(event.target.checked)}
          />
          <span className="sr-only">Mark {task.title} done</span>
        </label>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Link className="truncate font-medium hover:underline" to={`/item/${task.id}`}>
              {task.title}
            </Link>
            <ScheduleReadinessBadge readiness={readiness} />
          </div>
          {isSubtask && parent ? (
            <p className="mt-0.5 text-xs text-neutral-600">Subtask of {parent.title}</p>
          ) : null}
          <p className="mt-0.5 text-xs text-neutral-500">{detailLabel}</p>

          <div className="mt-2 flex flex-wrap items-center gap-3">
            <ImportanceSlider item={task} updateItem={updateItem} />
            <div className="flex items-center gap-1">
              <span className="text-[10px] uppercase tracking-wide text-neutral-500">Dur</span>
              {DURATION_PRESETS.map((minutes) => {
                const active = effectiveDuration === minutes;
                return (
                  <button
                    className={
                      active
                        ? "rounded border border-white px-2 py-0.5 text-[10px] text-white"
                        : "rounded border border-neutral-700 px-2 py-0.5 text-[10px] text-neutral-400 hover:border-neutral-500"
                    }
                    key={minutes}
                    type="button"
                    onClick={() => void setDuration(minutes)}
                  >
                    {minutes}m
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
