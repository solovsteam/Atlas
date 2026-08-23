import { useCallback, useEffect, useState } from "react";
import type { ItemLink } from "@shared/links";
import { itemLinkFromDbRow } from "@shared/links";
import { supabase } from "../lib/supabase";
import { fetchOwnedItemLinks } from "../services/links";
import type { DbItemLinkRow } from "../types/database";

export function useItemLinks(userId: string | undefined) {
  const [links, setLinks] = useState<ItemLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [available, setAvailable] = useState(true);

  const refresh = useCallback(async () => {
    if (!userId) {
      setLinks([]);
      setLoading(false);
      return;
    }

    try {
      const next = await fetchOwnedItemLinks(supabase, userId);
      setLinks(next);
      setAvailable(true);
      setLoading(false);
    } catch {
      setLinks([]);
      setAvailable(false);
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!userId || !available) {
      return;
    }

    const channel = supabase
      .channel(`item_links:${userId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "item_links", filter: `owner_id=eq.${userId}` },
        (payload) => {
          const link = itemLinkFromDbRow(payload.new as DbItemLinkRow);
          if (!link) {
            return;
          }
          setLinks((current) => {
            if (current.some((entry) => entry.id === link.id)) {
              return current;
            }
            return [...current, link];
          });
        }
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "item_links" },
        (payload) => {
          const deletedId = (payload.old as { id?: string }).id;
          if (!deletedId) {
            return;
          }
          setLinks((current) => current.filter((entry) => entry.id !== deletedId));
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [userId, available]);

  const upsertLinks = useCallback((next: ItemLink[]) => {
    setLinks(next);
  }, []);

  return { links, loading, available, refresh, upsertLinks };
}
