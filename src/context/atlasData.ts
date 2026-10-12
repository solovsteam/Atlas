import { createContext } from "react";
import type { CreateItemResult, Item, UpdateItemResult } from "@shared/item";
import type { ItemLink, LinkKind } from "@shared/links";
import type { CreateItemOptions } from "../services/items";

export type AtlasDataContextValue = {
  userId: string | undefined;
  items: Item[];
  itemsLoading: boolean;
  itemsError: string | null;
  extendedSchema: boolean;
  links: ItemLink[];
  linksError: string | null;
  createItem: (
    title: string,
    options?: CreateItemOptions,
  ) => Promise<CreateItemResult>;
  updateItem: (
    id: string,
    patchJson: string,
    expectedRevision: number,
  ) => Promise<UpdateItemResult>;
  deleteItem: (id: string) => Promise<void>;
  restoreItem: (item: Item) => Promise<void>;
  createLink: (
    fromId: string,
    toId: string,
    kind: LinkKind,
  ) => Promise<ItemLink>;
  deleteLink: (id: string) => Promise<void>;
  restoreLink: (link: ItemLink) => Promise<void>;
  reviewOccurrence: (
    id: string,
    choice: "new" | "old" | "detach",
  ) => Promise<void>;
};

export const AtlasDataContext = createContext<AtlasDataContextValue | null>(
  null,
);
