import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import type { UndoOp } from "@shared/commands";
import type { Item, ItemPatch, UpdateItemResult } from "@shared/item";

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

export function UndoProvider({
  children,
  items,
  updateItem,
  deleteItem,
  restoreItem
}: {
  children: ReactNode;
  items: Item[];
  updateItem: (id: string, patchJson: string, expectedRevision: number) => Promise<UpdateItemResult>;
  deleteItem: (id: string) => Promise<void>;
  restoreItem: (item: Item) => Promise<void>;
}) {
  const stackRef = useRef<UndoOp[]>([]);
  const [canUndo, setCanUndo] = useState(false);
  const itemsRef = useRef(items);
  itemsRef.current = items;

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

  const getRevision = useCallback((id: string): number | undefined => {
    return itemsRef.current.find((entry) => entry.id === id)?.revision;
  }, []);

  const undo = useCallback(async () => {
    const op = stackRef.current.pop();
    refresh();
    if (!op) {
      return;
    }

    if (op.kind === "createItem") {
      await deleteItem(op.id);
      return;
    }

    if (op.kind === "deleteItem") {
      await restoreItem(op.snapshot);
      return;
    }

    const revision = getRevision(op.id);
    if (revision === undefined) {
      return;
    }

    if (op.kind === "updateItem") {
      await updateItem(op.id, JSON.stringify(op.before), revision);
      return;
    }

    if (op.kind === "setTaskStatus") {
      await updateItem(op.id, JSON.stringify({ taskStatus: op.before }), revision);
    }
  }, [deleteItem, getRevision, refresh, restoreItem, updateItem]);

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

export function trackTaskStatusUndo(push: UndoContextValue["push"], item: Item) {
  push({
    kind: "setTaskStatus",
    id: item.id,
    before: item.taskStatus
  });
}

export function trackItemPatchUndo(push: UndoContextValue["push"], id: string, before: ItemPatch) {
  push({
    kind: "updateItem",
    id,
    before
  });
}

export function trackCreateUndo(push: UndoContextValue["push"], id: string) {
  push({ kind: "createItem", id });
}

export function trackDeleteUndo(push: UndoContextValue["push"], item: Item) {
  push({ kind: "deleteItem", snapshot: item });
}
