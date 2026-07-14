import { createContext, useContext, type ReactNode } from "react";
import type { Item } from "@shared/item";
import type { CreateItemResult, UpdateItemResult } from "@shared/item";
import { useAuthSession } from "../hooks/useAuthSession";
import { useItemMutations } from "../hooks/useItemMutations";
import { useItems } from "../hooks/useItems";

type AtlasDataContextValue = {
  userId: string | undefined;
  items: Item[];
  itemsLoading: boolean;
  itemsError: string | null;
  createItem: (title: string) => Promise<CreateItemResult>;
  updateItem: (id: string, patchJson: string, expectedRevision: number) => Promise<UpdateItemResult>;
  deleteItem: (id: string) => Promise<void>;
};

const AtlasDataContext = createContext<AtlasDataContextValue | null>(null);

export function AtlasDataProvider({ children }: { children: ReactNode }) {
  const { session } = useAuthSession();
  const userId = session?.user.id;
  const { items, loading, error } = useItems(userId);
  const mutations = useItemMutations(userId);

  return (
    <AtlasDataContext.Provider
      value={{
        userId,
        items,
        itemsLoading: loading,
        itemsError: error,
        createItem: mutations.createItem,
        updateItem: mutations.updateItem,
        deleteItem: mutations.deleteItem
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
