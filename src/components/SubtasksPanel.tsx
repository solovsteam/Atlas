import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { Item, TaskStatus } from "@shared/item";
import { subtasksOf } from "@shared/subtasks";
import { useAtlasData } from "../context/AtlasDataContext";
import { trackCreateUndo, trackDeleteUndo, trackTaskStatusUndo, useUndo } from "../context/UndoContext";
import { ItemList } from "./ItemList";

export function SubtasksPanel({ item }: { item: Item }) {
  const navigate = useNavigate();
  const { items, createItem, updateItem, deleteItem } = useAtlasData();
  const { push } = useUndo();
  const [title, setTitle] = useState("");

  const subtasks = useMemo(() => subtasksOf(item.id, items), [item.id, items]);

  if (!item.isTask) {
    return null;
  }

  async function setTaskStatus(subtask: Item, status: TaskStatus) {
    try {
      const result = await updateItem(subtask.id, JSON.stringify({ taskStatus: status }), subtask.revision);
      if ("ok" in result && result.ok) {
        trackTaskStatusUndo(push, subtask);
      }
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "Could not update status");
    }
  }

  async function onDelete(subtask: Item, event: React.MouseEvent) {
    event.preventDefault();
    event.stopPropagation();
    try {
      await deleteItem(subtask.id);
      trackDeleteUndo(push, subtask);
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "Could not delete item");
    }
  }

  async function onAddSubtask(event: React.FormEvent) {
    event.preventDefault();
    const nextTitle = title.trim();
    if (!nextTitle) {
      return;
    }
    try {
      const result = await createItem(nextTitle, { isTask: true, parentTaskId: item.id });
      trackCreateUndo(push, result.id);
      setTitle("");
      navigate(`/item/${result.id}`);
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "Could not create subtask");
    }
  }

  return (
    <section className="mb-6 rounded border border-neutral-800 p-4">
      <div className="mb-4">
        <h2 className="text-xs uppercase tracking-wide text-neutral-500">Subtasks</h2>
        {subtasks.length > 0 ? (
          <p className="mt-1 text-sm text-neutral-400">{subtasks.length} subtask{subtasks.length === 1 ? "" : "s"}</p>
        ) : null}
      </div>

      {subtasks.length > 0 ? (
        <ItemList items={subtasks} onDelete={onDelete} onStatusChange={setTaskStatus} />
      ) : null}

      <form className={`flex gap-3 ${subtasks.length > 0 ? "mt-4" : ""}`} onSubmit={(event) => void onAddSubtask(event)}>
        <input
          className="min-w-0 flex-1 border border-neutral-700 bg-black px-3 py-2 text-sm outline-none focus:border-white"
          placeholder="Add a subtask…"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
        />
        <button className="shrink-0 border border-white px-4 py-2 text-sm font-medium" type="submit">
          Add
        </button>
      </form>
    </section>
  );
}
