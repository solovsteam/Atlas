import { useCallback, useEffect, useMemo, useState } from "react";
import { sortEntriesNewestFirst, type DocumentationEntry } from "@shared/documentationEntries";
import { supabase } from "../lib/supabase";
import { createEntry, deleteEntry, fetchEntries, restoreEntry } from "../services/documentationEntries";

// Mutations in this tab announce themselves so every open view updates at once;
// Realtime covers changes from other devices.
type EntryChange = { kind: "upsert"; entry: DocumentationEntry } | { kind: "remove"; id: string };
const listeners = new Set<(change: EntryChange) => void>();

function announce(change: EntryChange) {
  for (const listener of listeners) {
    listener(change);
  }
}

export function useEntryMutations(userId: string | undefined) {
  const requireUser = useCallback(() => {
    if (!userId) {
      throw new Error("Not signed in");
    }
    return userId;
  }, [userId]);

  const create = useCallback(
    async (itemId: string, occurredAt: Date, data?: Record<string, unknown>) => {
      const entry = await createEntry(supabase, requireUser(), itemId, occurredAt, data);
      announce({ kind: "upsert", entry });
      return entry;
    },
    [requireUser]
  );

  const remove = useCallback(
    async (entry: DocumentationEntry) => {
      await deleteEntry(supabase, requireUser(), entry.id);
      announce({ kind: "remove", id: entry.id });
    },
    [requireUser]
  );

  const restore = useCallback(
    async (entry: DocumentationEntry) => {
      await restoreEntry(supabase, requireUser(), entry);
      announce({ kind: "upsert", entry });
    },
    [requireUser]
  );

  return useMemo(() => ({ createEntry: create, deleteEntry: remove, restoreEntry: restore }), [create, remove, restore]);
}

export function useDocumentationEntries(userId: string | undefined, itemId: string | undefined) {
  const [entries, setEntries] = useState<DocumentationEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!userId || !itemId) {
      setEntries([]);
      setLoading(false);
      return;
    }
    try {
      setError(null);
      setEntries(await fetchEntries(supabase, userId, itemId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load entries");
    } finally {
      setLoading(false);
    }
  }, [userId, itemId]);

  useEffect(() => {
    setLoading(true);
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const listener = (change: EntryChange) => {
      setEntries((current) => {
        if (change.kind === "remove") {
          return current.filter((entry) => entry.id !== change.id);
        }
        if (change.entry.itemId !== itemId) {
          return current;
        }
        return sortEntriesNewestFirst([...current.filter((entry) => entry.id !== change.entry.id), change.entry]);
      });
    };
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, [itemId]);

  useEffect(() => {
    if (!userId || !itemId) {
      return;
    }
    const channel = supabase
      .channel(`documentation_entries:${itemId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "documentation_entries", filter: `item_id=eq.${itemId}` },
        () => void refresh()
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "documentation_entries", filter: `item_id=eq.${itemId}` },
        () => void refresh()
      )
      // DELETE payloads only carry the id, so a filtered DELETE listener would miss them.
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "documentation_entries" }, () => void refresh())
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [userId, itemId, refresh]);

  return { entries, loading, error, refresh };
}
