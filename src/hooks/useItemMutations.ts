import { useCallback } from "react";
import type { Item, CreateItemResult, UpdateItemResult } from "@shared/item";
import { supabase } from "../lib/supabase";
import { createItem, deleteItem, restoreItem, updateItem } from "../services/items";

export function useItemMutations(userId: string | undefined, extendedSchema = true) {
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
    async (
      id: string,
      patchJson: string,
      expectedRevision: number,
      knownItem?: Item
    ): Promise<UpdateItemResult> => {
      if (!userId) {
        throw new Error("Not signed in");
      }
      return updateItem(supabase, userId, id, patchJson, expectedRevision, { knownItem, extendedSchema });
    },
    [userId, extendedSchema]
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

  const restore = useCallback(
    async (item: Item): Promise<void> => {
      if (!userId) {
        throw new Error("Not signed in");
      }
      await restoreItem(supabase, userId, item);
    },
    [userId]
  );

  return { createItem: create, updateItem: update, deleteItem: remove, restoreItem: restore };
}
