import { useCallback, useEffect, useState } from "react";
import type { Item } from "@shared/item";
import { itemFromDbRow } from "@shared/item";
import { supabase } from "../lib/supabase";
import { listOwnedItems } from "../services/items";
import type { DbItemRow } from "../types/database";

export function useItems(userId: string | undefined) {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!userId) {
      setItems([]);
      setLoading(false);
      return;
    }

    try {
      setError(null);
      const next = await listOwnedItems(supabase, userId);
      setItems(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load items");
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const removeItemById = useCallback((id: string) => {
    setItems((current) => current.filter((entry) => entry.id !== id));
  }, []);

  useEffect(() => {
    if (!userId) {
      return;
    }

    const channel = supabase
      .channel(`items:${userId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "items", filter: `owner_id=eq.${userId}` },
        (payload) => {
          if (payload.eventType === "DELETE") {
            const deletedId = (payload.old as { id?: string }).id;
            if (deletedId) {
              setItems((current) => current.filter((entry) => entry.id !== deletedId));
            }
            return;
          }

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
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [userId]);

  return { items, loading, error, refresh, removeItemById };
}
