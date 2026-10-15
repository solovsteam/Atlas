import { useMemo, useState } from "react";
import { intervalItemsToCalendar } from "@shared/schedule";
import { workBlockForNow, workBlockOverlapsExisting, type WorkBlockKind } from "@shared/workBlocks";
import { useAtlasData } from "../context/AtlasDataContext";
import { trackCreateUndo, useUndo } from "../context/UndoContext";
import { PlusIcon } from "./icons";

export function WorkBlockButtons() {
  const { items, createItem } = useAtlasData();
  const { push } = useUndo();
  const [error, setError] = useState<string | null>(null);
  const now = new Date();
  const slots = useMemo(() => intervalItemsToCalendar(items), [items]);

  const morning = workBlockForNow(now, "morning");
  const afternoon = workBlockForNow(now, "afternoon");

  async function createBlock(kind: WorkBlockKind) {
    const spec = workBlockForNow(new Date(), kind);
    if (!spec) {
      return;
    }
    if (workBlockOverlapsExisting(spec, intervalItemsToCalendar(items))) {
      setError("That window already has an interval.");
      return;
    }
    try {
      const result = await createItem(spec.label, {
        isInterval: true,
        intervalKind: "fixed",
        intervalStartsAt: spec.startsAt.toISOString(),
        intervalEndsAt: spec.endsAt.toISOString(),
        intervalStatus: "scheduled"
      });
      trackCreateUndo(push, result.id);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create interval");
    }
  }

  if (!morning && !afternoon) {
    return null;
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {morning && !workBlockOverlapsExisting(morning, slots) ? (
        <button
          className="inline-flex items-center gap-1 rounded-full border border-indigo-400/50 bg-indigo-500/10 px-3 py-1.5 text-xs text-indigo-100 hover:bg-indigo-500/20"
          type="button"
          onClick={() => void createBlock("morning")}
        >
          <PlusIcon className="h-3.5 w-3.5" />
          Morning interval
        </button>
      ) : null}
      {afternoon && !workBlockOverlapsExisting(afternoon, slots) ? (
        <button
          className="inline-flex items-center gap-1 rounded-full border border-indigo-400/50 bg-indigo-500/10 px-3 py-1.5 text-xs text-indigo-100 hover:bg-indigo-500/20"
          type="button"
          onClick={() => void createBlock("afternoon")}
        >
          <PlusIcon className="h-3.5 w-3.5" />
          Afternoon interval
        </button>
      ) : null}
      {error ? <p className="text-xs text-red-400">{error}</p> : null}
    </div>
  );
}
