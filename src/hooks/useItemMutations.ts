import { useCallback } from "react";
import type { CreateItemResult, UpdateItemResult } from "@shared/item";
import { supabase } from "../lib/supabase";
import { createItem, deleteItem, updateItem } from "../services/items";

export function useItemMutations(userId: string | undefined) {
  const create = useCallback(
    async (title: string): Promise<CreateItemResult> => {
      if (!userId) {
        throw new Error("Not signed in");
      }
      return createItem(supabase, userId, title);
    },
    [userId]
  );

  const update = useCallback(
    async (id: string, patchJson: string, expectedRevision: number): Promise<UpdateItemResult> => {
      if (!userId) {
        throw new Error("Not signed in");
      }
      return updateItem(supabase, userId, id, patchJson, expectedRevision);
    },
    [userId]
  );

  const remove = useCallback(
    async (id: string): Promise<void> => {
      if (!userId) {
        throw new Error("Not signed in");
      }
      await deleteItem(supabase, userId, id);
    },
    [userId]
  );

  return { createItem: create, updateItem: update, deleteItem: remove };
}
