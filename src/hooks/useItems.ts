import { useCallback, useEffect, useRef, useState } from "react";
import type { Item } from "@shared/item";
import { supabase } from "../lib/supabase";
import { fetchOwnedItems } from "../services/items";
import { probeExtendedItemSchema } from "../services/schema";

export function useItems(userId: string | undefined) {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [extendedSchema, setExtendedSchema] = useState(true);
  const requestVersion = useRef(0);

  const refresh = useCallback(async () => {
    const version = ++requestVersion.current;
    if (!userId) {
      setItems([]);
      setLoading(false);
      return;
    }

    try {
      setError(null);
      const schema = await probeExtendedItemSchema(supabase);
      const next = await fetchOwnedItems(supabase, userId);
      if (version !== requestVersion.current) return;
      setExtendedSchema(schema);
      setItems(next);
      setLoading(false);
    } catch (err) {
      if (version !== requestVersion.current) return;
      setError(err instanceof Error ? err.message : "Failed to load items");
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    const versionRef = requestVersion;
    void refresh();
    return () => { versionRef.current++; };
  }, [refresh]);

  useEffect(() => {
    if (!userId) return;
    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("pageshow", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("pageshow", onVisible);
    };
  }, [userId, refresh]);

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
        () => { void refresh(); }
      )
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'items', filter: `owner_id=eq.${userId}` }, () => { void refresh(); })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'items' }, () => { void refresh(); })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") void refresh();
      });

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [userId, refresh]);

  return { items, loading, error, extendedSchema, refresh, removeItemById, upsertItem };
}
