import { useMemo, useState } from "react";
import { intervalItemsToCalendar } from "@shared/schedule";
import { workBlockForNow, workBlockOverlapsExisting, type WorkBlockKind } from "@shared/workBlocks";
import { useAtlasData } from "../context/AtlasDataContext";
import { trackCreateUndo, useUndo } from "../context/UndoContext";

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
          className="border border-neutral-600 px-3 py-1.5 text-xs hover:border-white"
          type="button"
          onClick={() => void createBlock("morning")}
        >
          Block morning
        </button>
      ) : null}
      {afternoon && !workBlockOverlapsExisting(afternoon, slots) ? (
        <button
          className="border border-neutral-600 px-3 py-1.5 text-xs hover:border-white"
          type="button"
          onClick={() => void createBlock("afternoon")}
        >
          Block afternoon
        </button>
      ) : null}
      {error ? <p className="text-xs text-red-400">{error}</p> : null}
    </div>
  );
}
