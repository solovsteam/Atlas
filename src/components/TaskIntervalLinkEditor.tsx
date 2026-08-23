import { useMemo } from "react";
import type { Item } from "@shared/item";
import { scheduledIntervalForTask } from "@shared/links";
import type { ItemLink } from "@shared/links";
import { useAtlasData } from "../context/AtlasDataContext";
import { replaceScheduledInLink } from "../services/links";
import { supabase } from "../lib/supabase";

export function TaskIntervalLinkEditor({
  item,
  links,
  onLinksChange
}: {
  item: Item;
  links: ItemLink[];
  onLinksChange: (links: ItemLink[]) => void;
}) {
  const { items, userId } = useAtlasData();
  const intervals = useMemo(
    () =>
      items
        .filter((entry) => entry.isInterval && entry.intervalStatus !== "archived")
        .sort((left, right) => left.title.localeCompare(right.title)),
    [items]
  );
  const selectedIntervalId = scheduledIntervalForTask(links, item.id);

  async function onChange(intervalId: string) {
    if (!userId) {
      return;
    }
    try {
      const next = await replaceScheduledInLink(
        supabase,
        userId,
        item.id,
        intervalId || null,
        links
      );
      onLinksChange(next);
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "Could not update interval assignment");
    }
  }

  if (intervals.length === 0) {
    return (
      <p className="text-xs text-neutral-600">
        Create an interval item to assign this task to a calendar block.
      </p>
    );
  }

  return (
    <div className="mb-4">
      <label className="mb-1 block text-xs text-neutral-500" htmlFor={`task-interval-${item.id}`}>
        Scheduled in interval
      </label>
      <select
        className="w-full border border-neutral-700 bg-black px-3 py-1.5 text-sm outline-none focus:border-white"
        id={`task-interval-${item.id}`}
        value={selectedIntervalId ?? ""}
        onChange={(event) => void onChange(event.target.value)}
      >
        <option value="">Not assigned</option>
        {intervals.map((interval) => (
          <option key={interval.id} value={interval.id}>
            {interval.title || "Untitled interval"}
          </option>
        ))}
      </select>
      <p className="mt-1 text-xs text-neutral-600">Assigned tasks appear inside their interval on the calendar.</p>
    </div>
  );
}
