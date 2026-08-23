import { useCallback, useEffect, useState } from "react";
import { linkFromDbRow, type ItemLink } from "@shared/links";
import { supabase } from "../lib/supabase";
import { fetchOwnedLinks } from "../services/links";
import type { DbItemLinkRow } from "../types/database";

export function useItemLinks(userId: string | undefined) {
  const [links, setLinks] = useState<ItemLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!userId) {
      setLinks([]);
      setLoading(false);
      return;
    }
    try {
      setError(null);
      setLinks(await fetchOwnedLinks(supabase, userId));
      setLoading(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load links");
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const upsertLink = useCallback((link: ItemLink) => {
    setLinks((current) => {
      const index = current.findIndex((entry) => entry.id === link.id);
      if (index === -1) {
        return [...current, link];
      }
      const next = [...current];
      next[index] = link;
      return next;
    });
  }, []);

  const removeLinkById = useCallback((id: string) => {
    setLinks((current) => current.filter((entry) => entry.id !== id));
  }, []);

  useEffect(() => {
    if (!userId) {
      return;
    }
    const channel = supabase
      .channel(`item_links:${userId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "item_links", filter: `owner_id=eq.${userId}` },
        (payload) => {
          const link = linkFromDbRow(payload.new as DbItemLinkRow);
          setLinks((current) => (current.some((entry) => entry.id === link.id) ? current : [...current, link]));
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "item_links", filter: `owner_id=eq.${userId}` },
        (payload) => {
          const link = linkFromDbRow(payload.new as DbItemLinkRow);
          setLinks((current) => {
            const index = current.findIndex((entry) => entry.id === link.id);
            if (index === -1) {
              return [...current, link];
            }
            const next = [...current];
            next[index] = link;
            return next;
          });
        }
      )
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "item_links" }, (payload) => {
        const deletedId = (payload.old as { id?: string }).id;
        if (!deletedId) {
          return;
        }
        setLinks((current) => current.filter((entry) => entry.id !== deletedId));
      })
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [userId]);

  return { links, loading, error, refresh, upsertLink, removeLinkById };
}
