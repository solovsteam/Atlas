import { createContext } from "preact";
import { useCallback, useContext, useEffect, useRef, useState } from "preact/hooks";
import { useMutation } from "lakebed/client";
import type { UndoOp } from "../../shared/commands";
import type { Item, ItemPatch, TaskStatus, UpdateItemResult } from "../../shared/item";

type UndoContextValue = {
  canUndo: boolean;
  push: (op: UndoOp) => void;
  undo: () => Promise<void>;
};

const UndoContext = createContext<UndoContextValue>({
  canUndo: false,
  push: () => undefined,
  undo: async () => undefined
});

export function UndoProvider({ children }: { children: preact.ComponentChildren }) {
  const stackRef = useRef<UndoOp[]>([]);
  const [canUndo, setCanUndo] = useState(false);

  const updateItem = useMutation<[id: string, patchJson: string, expectedRevision: number], UpdateItemResult>("updateItem");
  const linkItems = useMutation<[fromId: string, toId: string, kind?: string], { ok: true } | { error: string }>("linkItems");
  const unlinkItems = useMutation<[fromId: string, toId: string, kind?: string], void>("unlinkItems");

  const refresh = useCallback(() => {
    setCanUndo(stackRef.current.length > 0);
  }, []);

  const push = useCallback(
    (op: UndoOp) => {
      stackRef.current.push(op);
      if (stackRef.current.length > 50) {
        stackRef.current.shift();
      }
      refresh();
    },
    [refresh]
  );

  const undo = useCallback(async () => {
    const op = stackRef.current.pop();
    refresh();
    if (!op) {
      return;
    }

    if (op.kind === "updateItem") {
      await updateItem(op.id, JSON.stringify(op.before), op.revision);
      return;
    }

    if (op.kind === "linkItems") {
      await unlinkItems(op.fromId, op.toId, op.linkKind ?? "context");
      return;
    }

    if (op.kind === "unlinkItems") {
      await linkItems(op.fromId, op.toId, op.linkKind ?? "context");
      return;
    }

    if (op.kind === "setTaskStatus") {
      await updateItem(op.id, JSON.stringify({ taskStatus: op.before }), op.revision);
    }
  }, [linkItems, refresh, unlinkItems, updateItem]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z" && !event.shiftKey) {
        event.preventDefault();
        void undo();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [undo]);

  return <UndoContext.Provider value={{ canUndo, push, undo }}>{children}</UndoContext.Provider>;
}

export function useUndo() {
  return useContext(UndoContext);
}

export function trackTaskStatusUndo(push: UndoContextValue["push"], item: Item, nextRevision: number) {
  push({
    kind: "setTaskStatus",
    id: item.id,
    before: item.taskStatus,
    revision: nextRevision
  });
}

export function trackItemPatchUndo(push: UndoContextValue["push"], item: Item, before: ItemPatch, nextRevision: number) {
  push({
    kind: "updateItem",
    id: item.id,
    before,
    revision: nextRevision
  });
}

export function trackLinkUndo(push: UndoContextValue["push"], fromId: string, toId: string, linkKind = "context") {
  push({ kind: "linkItems", fromId, toId, linkKind });
}

export function trackUnlinkUndo(push: UndoContextValue["push"], fromId: string, toId: string, linkKind = "context") {
  push({ kind: "unlinkItems", fromId, toId, linkKind });
}
