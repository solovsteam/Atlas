import { useState } from "react";
import { useAtlasData } from "../../context/AtlasDataContext";
import { trackCreateUndo, useUndo } from "../../context/UndoContext";

export function TaskQuickAdd() {
  const { createItem } = useAtlasData();
  const { push } = useUndo();
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    const nextTitle = title.trim();
    if (!nextTitle || busy) {
      return;
    }
    setBusy(true);
    try {
      const result = await createItem(nextTitle, { isTask: true });
      trackCreateUndo(push, result.id);
      setTitle("");
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "Could not create task");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="mb-6 flex gap-3" onSubmit={(event) => void onSubmit(event)}>
      <input
        autoFocus
        className="min-w-0 flex-1 border border-neutral-700 bg-black px-3 py-2 text-base outline-none focus:border-white"
        disabled={busy}
        placeholder="Add a task…"
        value={title}
        onChange={(event) => setTitle(event.target.value)}
      />
      <button
        className="shrink-0 border border-white px-4 py-2 text-sm font-medium disabled:opacity-40"
        disabled={busy || !title.trim()}
        type="submit"
      >
        Add
      </button>
    </form>
  );
}
