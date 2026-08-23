import { useCallback, useEffect, useRef, useState } from "react";
import type { InboxEntry } from "@shared/relevance";

const snapshots = new Map<string, string[]>();

/**
 * Keep the current rows on screen until the user refreshes this list.
 * `desired` is membership after refresh; `catalog` is used to still render
 * rows that left `desired` (e.g. a task just marked done).
 */
export function useStableInboxOrder(
  pageKey: string,
  desired: InboxEntry[],
  catalog: InboxEntry[],
  resortKey: string | null = null
) {
  const [displayIds, setDisplayIds] = useState<string[]>(() => snapshots.get(pageKey) ?? []);
  const [pendingResort, setPendingResort] = useState(false);
  const previousResortKeyRef = useRef<string | null>(null);

  const desiredKey = desired.map((entry) => entry.id).join("\0");

  const commitOrder = useCallback(() => {
    const next = desired.map((entry) => entry.id);
    setDisplayIds(next);
    snapshots.set(pageKey, next);
    setPendingResort(false);
  }, [desired, pageKey]);

  useEffect(() => {
    snapshots.set(pageKey, displayIds);
  }, [displayIds, pageKey]);

  useEffect(() => {
    const resortKeyChanged = resortKey !== null && previousResortKeyRef.current !== resortKey;
    if (resortKeyChanged) {
      previousResortKeyRef.current = resortKey;
      commitOrder();
      return;
    }

    if (displayIds.length === 0 && desired.length > 0) {
      commitOrder();
      return;
    }

    if (desiredKey !== displayIds.join("\0")) {
      setPendingResort(true);
    } else {
      setPendingResort(false);
    }
  }, [commitOrder, desired.length, desiredKey, displayIds, resortKey]);

  const byId = new Map(catalog.map((entry) => [entry.id, entry]));
  const ordered = displayIds.map((id) => byId.get(id)).filter((entry): entry is InboxEntry => Boolean(entry));
  const shown = new Set(displayIds);
  const missing = desired.filter((entry) => !shown.has(entry.id));

  return {
    visible: [...ordered, ...missing],
    pendingResort,
    refreshOrder: commitOrder
  };
}
