import { useMemo } from "react";
import type { Item } from "@shared/item";
import { compareItems } from "@shared/relevance";
import { parentTaskOf } from "@shared/subtasks";
import { useAtlasData } from "../context/AtlasDataContext";
import { TaskQuickAdd } from "../components/tasks/TaskQuickAdd";
import { TaskRow } from "../components/tasks/TaskRow";

function isActiveTask(item: Item): boolean {
  return item.isTask && item.taskStatus === "active";
}

function sortActiveTasks(items: Item[]): Item[] {
  const now = new Date();
  const ctx = { now, activeTags: [], activePropertyFilter: null };
  return items.filter(isActiveTask).sort((left, right) => compareItems(left, right, ctx));
}

export function TasksPage() {
  const { items } = useAtlasData();

  const { topLevel, subtasksByParent } = useMemo(() => {
    const active = sortActiveTasks(items);
    const topLevel: Item[] = [];
    const subtasksByParent = new Map<string, Item[]>();

    for (const task of active) {
      if (task.parentTaskId && parentTaskOf(task, items)) {
        const list = subtasksByParent.get(task.parentTaskId) ?? [];
        list.push(task);
        subtasksByParent.set(task.parentTaskId, list);
      } else {
        topLevel.push(task);
      }
    }

    return { topLevel, subtasksByParent };
  }, [items]);

  const isEmpty = topLevel.length === 0 && subtasksByParent.size === 0;

  return (
    <section>
      <div className="mb-6">
        <h1 className="text-4xl font-bold tracking-tight">Tasks</h1>
        <p className="mt-2 max-w-xl text-sm text-neutral-400">
          Quick throwaway tasks — add, check off, adjust importance. Tap a title for full detail. Plan notes and
          complex scheduling in Items.
        </p>
      </div>

      <TaskQuickAdd />

      {isEmpty ? (
        <p className="text-sm text-neutral-500">No active tasks. Add one above.</p>
      ) : (
        <ul className="divide-y divide-neutral-800 border-y border-neutral-800">
          {topLevel.map((task) => {
            const subtasks = subtasksByParent.get(task.id) ?? [];
            return (
              <li key={task.id}>
                <TaskRow items={items} task={task} />
                {subtasks.map((subtask) => (
                  <TaskRow isSubtask items={items} key={subtask.id} task={subtask} />
                ))}
              </li>
            );
          })}
          {[...subtasksByParent.entries()]
            .filter(([parentId]) => !topLevel.some((task) => task.id === parentId))
            .flatMap(([, subtasks]) =>
              subtasks.map((subtask) => (
                <li key={subtask.id}>
                  <TaskRow isSubtask items={items} task={subtask} />
                </li>
              ))
            )}
        </ul>
      )}
    </section>
  );
}
