import { useCallback, useEffect, useRef, useState } from "preact/hooks";
import type { InboxEntry } from "../../shared/relevance";

export function useStableInboxOrder(
  inbox: InboxEntry[],
  selectedId: string | null,
  resortKey: string | null = null
) {
  const [displayIds, setDisplayIds] = useState<string[]>([]);
  const [pendingResort, setPendingResort] = useState(false);
  const previousSelectedRef = useRef<string | null>(null);
  const previousResortKeyRef = useRef<string | null>(null);

  const liveIds = inbox.map((entry) => entry.id).join("\0");

  const commitOrder = useCallback(() => {
    setDisplayIds(inbox.map((entry) => entry.id));
    setPendingResort(false);
  }, [inbox]);

  useEffect(() => {
    const resortKeyChanged = resortKey !== null && previousResortKeyRef.current !== resortKey;
    if (resortKeyChanged) {
      previousResortKeyRef.current = resortKey;
    }

    if (displayIds.length === 0 && inbox.length > 0) {
      commitOrder();
      previousSelectedRef.current = selectedId;
      return;
    }

    const selectionChanged = previousSelectedRef.current !== selectedId;
    if (selectionChanged || resortKeyChanged) {
      previousSelectedRef.current = selectedId;
      commitOrder();
      return;
    }

    const currentDisplay = displayIds.join("\0");
    if (liveIds !== currentDisplay) {
      setPendingResort(true);
    }
  }, [inbox, selectedId, displayIds, liveIds, commitOrder, resortKey]);

  const byId = new Map(inbox.map((entry) => [entry.id, entry]));
  const ordered = displayIds.map((id) => byId.get(id)).filter((entry): entry is InboxEntry => Boolean(entry));
  const missing = inbox.filter((entry) => !displayIds.includes(entry.id));

  return {
    visible: [...ordered, ...missing],
    pendingResort,
    refreshOrder: commitOrder
  };
}
