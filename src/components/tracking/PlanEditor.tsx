import { useEffect, useState } from "react";
import type { Item } from "@shared/item";
import { useAtlasData } from "../../context/AtlasDataContext";
import { trackItemPatchUndo, useUndo } from "../../context/UndoContext";

/**
 * The tracker's one "when I notice, I will" plan, stored as the item's body.
 * It is shown right after each recorded episode. Saved when the field loses
 * focus, with undo.
 */
export function PlanEditor({ tracker }: { tracker: Item }) {
  const { updateItem } = useAtlasData();
  const { push } = useUndo();
  const [text, setText] = useState(tracker.body);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!editing) {
      setText(tracker.body);
    }
  }, [tracker.body, editing]);

  async function save() {
    setEditing(false);
    if (text === tracker.body) {
      return;
    }
    try {
      const result = await updateItem(tracker.id, JSON.stringify({ body: text }), tracker.revision);
      if ("ok" in result && result.ok) {
        trackItemPatchUndo(push, tracker.id, { body: tracker.body });
        setError(null);
      } else {
        setError("The plan changed elsewhere; your text was not saved.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the plan");
    }
  }

  return (
    <section className="mb-6 max-w-xl">
      <label className="mb-1 block text-sm font-semibold text-neutral-200" htmlFor={`plan-${tracker.id}`}>
        Your plan
      </label>
      <p className="mb-2 text-xs text-neutral-500">
        One action for the moment you notice. Name something to do, not something to avoid. It appears after each entry.
      </p>
      <textarea
        className="w-full border border-neutral-700 bg-transparent px-3 py-2 text-white placeholder:text-neutral-600"
        id={`plan-${tracker.id}`}
        placeholder="When I notice the urge, I will put the phone on the charger in the hall."
        rows={2}
        value={text}
        onBlur={() => void save()}
        onChange={(event) => setText(event.target.value)}
        onFocus={() => setEditing(true)}
      />
      {error ? <p className="mt-1 text-sm text-red-400">{error}</p> : null}
    </section>
  );
}
