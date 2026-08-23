import { Link } from "react-router-dom";
import { useMemo, useState } from "react";
import type { Item, TaskStatus } from "@shared/item";
import { formatDurationMinutes } from "@shared/duration";
import { buildNowFocus } from "@shared/scheduling";
import { calendarIntervalFromItem, isArchivedSlot, slotRangeEnd, slotRangeStart } from "@shared/schedule";
import { useAtlasData } from "../context/AtlasDataContext";
import { trackCreateLinkUndo, trackTaskStatusUndo, useUndo } from "../context/UndoContext";
import { TaskStatusButtonsForItem } from "../components/TaskStatusButtons";
import { WorkBlockButtons } from "../components/WorkBlockButtons";
import { NudgeToggle } from "../components/NudgeToggle";

function currentInterval(items: Item[], now: Date): Item | null {
  return (
    items.find((item) => {
      if (!item.isInterval) {
        return false;
      }
      const slot = calendarIntervalFromItem(item);
      if (!slot || isArchivedSlot(slot)) {
        return false;
      }
      const start = slotRangeStart(slot);
      const end = slotRangeEnd(slot);
      if (!start || !end) {
        return false;
      }
      return now.getTime() >= start.getTime() && now.getTime() < end.getTime();
    }) ?? null
  );
}

function FocusCard({
  item,
  reason,
  onStatusChange,
  action
}: {
  item: Item;
  reason: string;
  onStatusChange: (item: Item, status: TaskStatus) => void;
  action?: React.ReactNode;
}) {
  return (
    <div className="rounded border border-neutral-700 p-4">
      <p className="mb-2 text-xs uppercase tracking-wide text-neutral-500">{reason}</p>
      <div className="flex items-start gap-3">
        <TaskStatusButtonsForItem item={item} onStatusChange={onStatusChange} />
        <div className="min-w-0 flex-1">
          <Link className="text-xl font-semibold hover:underline" to={`/item/${item.id}`}>
            {item.title || "Untitled"}
          </Link>
          {item.body ? <p className="mt-1 line-clamp-2 text-sm text-neutral-400">{item.body}</p> : null}
        </div>
        {action}
      </div>
    </div>
  );
}

export function NowPage() {
  const { items, links, updateItem, createLink } = useAtlasData();
  const { push } = useUndo();
  const [error, setError] = useState<string | null>(null);
  const focus = useMemo(() => buildNowFocus(items, links, new Date()), [items, links]);
  const interval = useMemo(() => currentInterval(items, new Date()), [items]);
  const laterCount = useMemo(
    () => items.filter((item) => item.isTask && item.taskStatus === "later").length,
    [items]
  );
  const remainingLabel = useMemo(() => {
    if (!interval) {
      return null;
    }
    const slot = calendarIntervalFromItem(interval);
    const end = slot ? slotRangeEnd(slot) : null;
    if (!end) {
      return null;
    }
    const minutes = Math.round((end.getTime() - Date.now()) / 60_000);
    if (minutes <= 0) {
      return null;
    }
    return formatDurationMinutes(minutes);
  }, [interval]);

  async function setTaskStatus(item: Item, status: TaskStatus) {
    try {
      const result = await updateItem(item.id, JSON.stringify({ taskStatus: status }), item.revision);
      if ("ok" in result && result.ok) {
        trackTaskStatusUndo(push, item);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update status");
    }
  }

  async function commitToInterval(item: Item) {
    if (!interval) {
      return;
    }
    try {
      const link = await createLink(item.id, interval.id, "scheduled_in");
      trackCreateLinkUndo(push, link.id);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not commit task");
    }
  }

  return (
    <section>
      <h1 className="text-4xl font-bold tracking-tight">Now</h1>
      <p className="mt-2 max-w-xl text-sm text-neutral-400">
        One thing. Capture lives on Tasks; this page is for starting.
        {remainingLabel ? ` ${remainingLabel} left in ${interval?.title || "this block"}.` : ""}
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <WorkBlockButtons />
        <NudgeToggle />
      </div>
      {error ? <p className="mt-4 text-sm text-red-400">{error}</p> : null}

      {focus.primary ? (
        <div className="mt-8">
          <FocusCard
            item={focus.primary.item}
            reason={focus.primary.reason}
            onStatusChange={setTaskStatus}
            action={
              interval &&
              focus.suggestion === null &&
              focus.primary.reason.startsWith("Highest") ? (
                <button
                  className="shrink-0 border border-white px-3 py-1.5 text-xs font-medium"
                  type="button"
                  onClick={() => void commitToInterval(focus.primary!.item)}
                >
                  Commit here
                </button>
              ) : null
            }
          />
        </div>
      ) : (
        <p className="mt-8 text-sm text-neutral-500">
          Nothing is committed to this moment. Add a task on{" "}
          <Link className="underline hover:text-white" to="/tasks">
            Tasks
          </Link>
          , or block morning/afternoon so work has a place to land.
          {laterCount > 0 ? (
            <>
              {" "}
              {laterCount} parked on{" "}
              <Link className="underline hover:text-white" to="/items">
                Items
              </Link>
              .
            </>
          ) : null}
        </p>
      )}

      {focus.committed.length > 0 ? (
        <div className="mt-8">
          <h2 className="mb-3 text-xs uppercase tracking-wide text-neutral-500">Also committed</h2>
          <ul className="space-y-3">
            {focus.committed.map((entry) => (
              <li key={entry.item.id}>
                <FocusCard item={entry.item} reason={entry.reason} onStatusChange={setTaskStatus} />
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {focus.suggestion && focus.primary?.item.id !== focus.suggestion.item.id ? (
        <div className="mt-8">
          <h2 className="mb-3 text-xs uppercase tracking-wide text-neutral-500">If you have slack</h2>
          <FocusCard
            item={focus.suggestion.item}
            reason={focus.suggestion.reason}
            onStatusChange={setTaskStatus}
            action={
              interval ? (
                <button
                  className="shrink-0 border border-neutral-600 px-3 py-1.5 text-xs text-neutral-300 hover:border-white hover:text-white"
                  type="button"
                  onClick={() => void commitToInterval(focus.suggestion!.item)}
                >
                  Commit here
                </button>
              ) : null
            }
          />
        </div>
      ) : null}
    </section>
  );
}
