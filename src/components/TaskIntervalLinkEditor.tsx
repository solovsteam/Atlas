import { useMemo, useState } from "react";
import type { Item } from "@shared/item";
import { intervalItemsForTask, scheduledIntervalIds } from "@shared/links";
import { formatTimeRange, calendarIntervalFromItem } from "@shared/schedule";
import { useAtlasData } from "../context/AtlasDataContext";
import { trackCreateLinkUndo, trackDeleteLinkUndo, useUndo } from "../context/UndoContext";

export function TaskIntervalLinkEditor({ item }: { item: Item }) {
  const { items, links, createLink, deleteLink } = useAtlasData();
  const { push } = useUndo();
  const [selected, setSelected] = useState("");
  const [error, setError] = useState<string | null>(null);

  const linked = useMemo(() => intervalItemsForTask(items, links, item.id), [items, links, item.id]);
  const linkedIds = useMemo(() => new Set(scheduledIntervalIds(item.id, links)), [item.id, links]);
  const candidates = useMemo(
    () => items.filter((entry) => entry.isInterval && !linkedIds.has(entry.id)),
    [items, linkedIds]
  );

  async function addLink() {
    if (!selected) {
      return;
    }
    try {
      const link = await createLink(item.id, selected, "scheduled_in");
      trackCreateLinkUndo(push, link.id);
      setSelected("");
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not link");
    }
  }

  async function remove(intervalId: string) {
    const link = links.find((entry) => entry.kind === "scheduled_in" && entry.fromId === item.id && entry.toId === intervalId);
    if (!link) {
      return;
    }
    await deleteLink(link.id);
    trackDeleteLinkUndo(push, link);
  }

  if (!item.isTask) {
    return null;
  }

  return (
    <div className="mb-6 rounded border border-neutral-800 p-4">
      <p className="mb-3 text-xs uppercase tracking-wide text-neutral-500">Scheduled in</p>
      {linked.length === 0 ? <p className="mb-3 text-sm text-neutral-500">Not placed on the calendar.</p> : null}
      <ul className="mb-3 space-y-2">
        {linked.map((interval) => {
          const slot = calendarIntervalFromItem(interval);
          return (
            <li className="flex items-center justify-between gap-2 text-sm" key={interval.id}>
              <span>
                {interval.title || "Interval"}
                {slot ? <span className="ml-2 text-xs text-neutral-500">{formatTimeRange(slot)}</span> : null}
              </span>
              <button className="text-xs text-neutral-600 hover:text-red-400" type="button" onClick={() => void remove(interval.id)}>
                Remove
              </button>
            </li>
          );
        })}
      </ul>
      {candidates.length > 0 ? (
        <div className="flex gap-2">
          <select
            className="min-w-0 flex-1 border border-neutral-700 bg-black px-2 py-1 text-sm"
            value={selected}
            onChange={(event) => setSelected(event.target.value)}
          >
            <option value="">Choose interval…</option>
            {candidates.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.title || "Interval"}
              </option>
            ))}
          </select>
          <button className="border border-neutral-600 px-3 py-1 text-xs hover:border-white" type="button" onClick={() => void addLink()}>
            Link
          </button>
        </div>
      ) : null}
      {error ? <p className="mt-2 text-xs text-red-400">{error}</p> : null}
    </div>
  );
}
