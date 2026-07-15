import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAtlasData } from "../context/AtlasDataContext";
import { trackCreateUndo, useUndo } from "../context/UndoContext";

export function SubtaskQuickAdd({ parentId }: { parentId: string }) {
  const navigate = useNavigate();
  const { createItem } = useAtlasData();
  const { push } = useUndo();
  const [title, setTitle] = useState("");

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    const nextTitle = title.trim();
    if (!nextTitle) {
      return;
    }
    try {
      const result = await createItem(nextTitle, { isTask: true, parentTaskId: parentId });
      trackCreateUndo(push, result.id);
      setTitle("");
      navigate(`/item/${result.id}`);
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "Could not create subtask");
    }
  }

  return (
    <form className="mt-4 flex gap-3" onSubmit={(event) => void onSubmit(event)}>
      <input
        className="min-w-0 flex-1 border border-neutral-700 bg-black px-3 py-1.5 text-sm outline-none focus:border-white"
        placeholder="Add first subtask…"
        value={title}
        onChange={(event) => setTitle(event.target.value)}
      />
      <button className="shrink-0 border border-neutral-700 px-3 py-1.5 text-xs hover:border-white" type="submit">
        Add subtask
      </button>
    </form>
  );
}
