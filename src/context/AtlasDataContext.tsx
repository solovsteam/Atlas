import { createContext, useCallback, useContext, type ReactNode } from "react";
import type { Item } from "@shared/item";
import { mergeItemPatch, parseJson, type CreateItemResult, type ItemPatch, type UpdateItemResult } from "@shared/item";
import { useAuthSession } from "../hooks/useAuthSession";
import { useItemMutations } from "../hooks/useItemMutations";
import { useItems } from "../hooks/useItems";

type AtlasDataContextValue = {
  userId: string | undefined;
  items: Item[];
  itemsLoading: boolean;
  itemsError: string | null;
  extendedSchema: boolean;
  createItem: (title: string) => Promise<CreateItemResult>;
  updateItem: (id: string, patchJson: string, expectedRevision: number) => Promise<UpdateItemResult>;
  deleteItem: (id: string) => Promise<void>;
  restoreItem: (item: Item) => Promise<void>;
};

const AtlasDataContext = createContext<AtlasDataContextValue | null>(null);

export function AtlasDataProvider({ children }: { children: ReactNode }) {
  const { session } = useAuthSession();
  const userId = session?.user.id;
  const { items, loading, error, extendedSchema, removeItemById, upsertItem } = useItems(userId);
  const mutations = useItemMutations(userId, extendedSchema);

  const updateItem = useCallback(
    async (id: string, patchJson: string, expectedRevision: number): Promise<UpdateItemResult> => {
      const current = items.find((entry) => entry.id === id) ?? null;
      const patch = parseJson<ItemPatch>(patchJson, {});
      const snapshot = current ? { ...current } : null;

      if (current && current.revision === expectedRevision) {
        upsertItem(mergeItemPatch(current, patch));
      }

      try {
        const result = await mutations.updateItem(id, patchJson, expectedRevision, current ?? undefined);
        if ("conflict" in result && result.conflict) {
          upsertItem(result.serverItem);
          return result;
        }
        if ("ok" in result && result.ok && snapshot) {
          upsertItem({ ...mergeItemPatch(snapshot, patch), revision: result.revision });
        }
        return result;
      } catch (err) {
        if (snapshot) {
          upsertItem(snapshot);
        }
        throw err;
      }
    },
    [items, mutations.updateItem, upsertItem]
  );

  const deleteItem = useCallback(
    async (id: string) => {
      const snapshot = items.find((entry) => entry.id === id);
      if (snapshot) {
        removeItemById(id);
      }
      try {
        await mutations.deleteItem(id);
      } catch (err) {
        if (snapshot) {
          upsertItem(snapshot);
        }
        throw err;
      }
    },
    [items, mutations.deleteItem, removeItemById, upsertItem]
  );

  const restoreItem = useCallback(
    async (item: Item) => {
      await mutations.restoreItem(item);
      upsertItem(item);
    },
    [mutations.restoreItem, upsertItem]
  );

  return (
    <AtlasDataContext.Provider
      value={{
        userId,
        items,
        itemsLoading: loading,
        itemsError: error,
        extendedSchema,
        createItem: mutations.createItem,
        updateItem,
        deleteItem,
        restoreItem
      }}
    >
      {children}
    </AtlasDataContext.Provider>
  );
}

export function useAtlasData() {
  const value = useContext(AtlasDataContext);
  if (!value) {
    throw new Error("useAtlasData must be used within AtlasDataProvider");
  }
  return value;
}
