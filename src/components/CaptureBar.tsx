import { useState } from "react";
import { useAtlasData } from "../context/AtlasDataContext";
import { trackCreateUndo, useUndo } from "../context/UndoContext";

export function CaptureBar() {
  const { createItem } = useAtlasData();
  const { push } = useUndo();
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: React.FormEvent) {
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
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not capture");
    }
  }

  return (
    <form className="mb-6 flex gap-2" onSubmit={(event) => void onSubmit(event)}>
      <input
        className="min-w-0 flex-1 border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm outline-none placeholder:text-neutral-500 focus:border-indigo-400"
        placeholder="Capture a task…"
        value={title}
        onChange={(event) => setTitle(event.target.value)}
      />
      <button className="shrink-0 bg-indigo-500 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-400" type="submit">
        Capture
      </button>
      {error ? <p className="self-center text-xs text-red-400">{error}</p> : null}
    </form>
  );
}
