import { createContext, useCallback, useContext, useRef, type ReactNode } from "react";
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
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const updateChainsRef = useRef(new Map<string, Promise<UpdateItemResult>>());

  const updateItem = useCallback(
    async (id: string, patchJson: string, expectedRevision: number): Promise<UpdateItemResult> => {
      const previous = updateChainsRef.current.get(id) ?? Promise.resolve({ ok: true, revision: expectedRevision } as UpdateItemResult);

      const run = previous
        .catch(() => ({ ok: true, revision: expectedRevision }) as UpdateItemResult)
        .then(async (): Promise<UpdateItemResult> => {
          const patch = parseJson<ItemPatch>(patchJson, {});
          const current = itemsRef.current.find((entry) => entry.id === id) ?? null;
          const revision = current?.revision ?? expectedRevision;
          const snapshot = current ? { ...current } : null;

          if (current) {
            upsertItem(mergeItemPatch(current, patch));
          }

          try {
            let result = await mutations.updateItem(id, patchJson, revision, current ?? undefined);

            if ("conflict" in result && result.conflict) {
              result = await mutations.updateItem(
                id,
                patchJson,
                result.serverItem.revision,
                result.serverItem
              );
            }

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
        });

      updateChainsRef.current.set(id, run);
      void run.finally(() => {
        if (updateChainsRef.current.get(id) === run) {
          updateChainsRef.current.delete(id);
        }
      });

      return run;
    },
    [mutations.updateItem, upsertItem]
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
