import { useEffect, useRef, useState } from "react";
import type { Item, ItemPatch, UpdateItemResult } from "@shared/item";

type UpdateMutation = (id: string, patchJson: string, expectedRevision: number) => Promise<UpdateItemResult>;

type ConflictState = {
  serverItem: Item;
  localPatch: ItemPatch;
};

type UndoTrackFn = (before: ItemPatch, nextRevision: number) => void;

export function useAutosaveItem(item: Item | null, updateItem: UpdateMutation, onUndoTrack?: UndoTrackFn) {
  const [draft, setDraft] = useState<{ title: string; body: string }>({ title: "", body: "" });
  const [revision, setRevision] = useState(0);
  const [saving, setSaving] = useState(false);
  const [conflict, setConflict] = useState<ConflictState | null>(null);
  const timerRef = useRef<number | null>(null);
  const pendingPatchRef = useRef<ItemPatch>({});
  const draftRef = useRef(draft);
  const revisionRef = useRef(revision);
  const itemIdRef = useRef("");
  const savingRef = useRef(false);
  const itemRef = useRef(item);

  draftRef.current = draft;
  revisionRef.current = revision;
  itemRef.current = item;

  useEffect(() => {
    if (!item) {
      return;
    }

    itemIdRef.current = item.id;
    const nextDraft = { title: item.title, body: item.body };
    setDraft(nextDraft);
    draftRef.current = nextDraft;
    setRevision(item.revision);
    revisionRef.current = item.revision;
    setConflict(null);
    pendingPatchRef.current = {};
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, [item?.id]);

  useEffect(() => {
    if (!item || item.id !== itemIdRef.current) {
      return;
    }
    if (savingRef.current || conflict) {
      return;
    }
    if (item.revision > revisionRef.current) {
      revisionRef.current = item.revision;
      setRevision(item.revision);
    }
  }, [item?.revision, item?.id, conflict]);

  async function flushSave(forcePatch?: ItemPatch) {
    if (!item) {
      return;
    }

    if (savingRef.current) {
      return;
    }

    const patch = forcePatch ?? pendingPatchRef.current;
    if (Object.keys(patch).length === 0) {
      return;
    }

    const beforeUndo: ItemPatch = {};
    const snapshot = itemRef.current;
    if (snapshot) {
      if (patch.title !== undefined) {
        beforeUndo.title = snapshot.title;
      }
      if (patch.body !== undefined) {
        beforeUndo.body = snapshot.body;
      }
    }

    pendingPatchRef.current = {};
    savingRef.current = true;
    setSaving(true);

    try {
      const result = await updateItem(itemIdRef.current, JSON.stringify(patch), revisionRef.current);
      if ("conflict" in result && result.conflict) {
        setConflict({
          serverItem: result.serverItem,
          localPatch: {
            title: draftRef.current.title,
            body: draftRef.current.body
          }
        });
        return;
      }
      if ("ok" in result && result.ok) {
        revisionRef.current = result.revision;
        setRevision(result.revision);
        if (onUndoTrack && Object.keys(beforeUndo).length > 0) {
          onUndoTrack(beforeUndo, result.revision);
        }
      }
    } finally {
      savingRef.current = false;
      setSaving(false);
      if (Object.keys(pendingPatchRef.current).length > 0) {
        void flushSave();
      }
    }
  }

  function scheduleSave(patch: ItemPatch) {
    pendingPatchRef.current = { ...pendingPatchRef.current, ...patch };
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
    }
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      void flushSave();
    }, 600);
  }

  function updateTitle(title: string) {
    setDraft((current) => {
      const next = { ...current, title };
      draftRef.current = next;
      return next;
    });
    scheduleSave({ title });
  }

  function updateBody(body: string) {
    setDraft((current) => {
      const next = { ...current, body };
      draftRef.current = next;
      return next;
    });
    scheduleSave({ body });
  }

  function resolveConflict(choice: "mine" | "theirs") {
    if (!item || !conflict) {
      return;
    }
    if (choice === "theirs") {
      const nextDraft = { title: conflict.serverItem.title, body: conflict.serverItem.body };
      setDraft(nextDraft);
      draftRef.current = nextDraft;
      revisionRef.current = conflict.serverItem.revision;
      setRevision(conflict.serverItem.revision);
      setConflict(null);
      pendingPatchRef.current = {};
      return;
    }
    setConflict(null);
    pendingPatchRef.current = {
      title: draftRef.current.title,
      body: draftRef.current.body
    };
    void flushSave();
  }

  return {
    draft,
    revision,
    saving,
    conflict,
    updateTitle,
    updateBody,
    resolveConflict
  };
}
