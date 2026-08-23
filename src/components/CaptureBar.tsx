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
        className="min-w-0 flex-1 border border-neutral-800 bg-black px-3 py-1.5 text-sm outline-none focus:border-white"
        placeholder="Capture a task…"
        value={title}
        onChange={(event) => setTitle(event.target.value)}
      />
      <button className="shrink-0 border border-neutral-600 px-3 py-1.5 text-xs hover:border-white" type="submit">
        Capture
      </button>
      {error ? <p className="self-center text-xs text-red-400">{error}</p> : null}
    </form>
  );
}
