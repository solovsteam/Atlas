import { useCallback, useEffect, useState } from "react";
import type { Item } from "@shared/item";
import { itemFromDbRow } from "@shared/item";
import { supabase } from "../lib/supabase";
import { fetchOwnedItems } from "../services/items";
import { probeExtendedItemSchema } from "../services/schema";
import type { DbItemRow } from "../types/database";

export function useItems(userId: string | undefined) {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [extendedSchema, setExtendedSchema] = useState(true);

  const refresh = useCallback(async () => {
    if (!userId) {
      setItems([]);
      setLoading(false);
      return;
    }

    try {
      setError(null);
      const schema = await probeExtendedItemSchema(supabase);
      setExtendedSchema(schema);
      const next = await fetchOwnedItems(supabase, userId);
      setItems(next);
      setLoading(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load items");
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const removeItemById = useCallback((id: string) => {
    setItems((current) => current.filter((entry) => entry.id !== id));
  }, []);

  const upsertItem = useCallback((item: Item) => {
    setItems((current) => {
      const index = current.findIndex((entry) => entry.id === item.id);
      if (index === -1) {
        return [item, ...current];
      }
      const next = [...current];
      next[index] = item;
      return next;
    });
  }, []);

  useEffect(() => {
    if (!userId) {
      return;
    }

    const channel = supabase
      .channel(`items:${userId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "items", filter: `owner_id=eq.${userId}` },
        (payload) => {
          const row = payload.new as DbItemRow;
          const item = itemFromDbRow(row);
          setItems((current) => {
            if (current.some((entry) => entry.id === item.id)) {
              return current;
            }
            return [item, ...current];
          });
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "items", filter: `owner_id=eq.${userId}` },
        (payload) => {
          const row = payload.new as DbItemRow;
          const item = itemFromDbRow(row);
          setItems((current) => {
            const index = current.findIndex((entry) => entry.id === item.id);
            if (index === -1) {
              return [item, ...current];
            }
            const next = [...current];
            next[index] = item;
            return next;
          });
        }
      )
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "items" }, (payload) => {
        const deletedId = (payload.old as { id?: string }).id;
        if (!deletedId) {
          return;
        }
        setItems((current) => current.filter((entry) => entry.id !== deletedId));
      })
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [userId]);

  return { items, loading, error, extendedSchema, refresh, removeItemById, upsertItem };
}
