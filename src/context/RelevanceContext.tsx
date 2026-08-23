import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import type { Item } from "@shared/item";
import { buildInboxEntries, collectTags, isLibraryItem, type InboxEntry, type PropertyFilter } from "@shared/relevance";

type RelevanceState = {
  items: Item[];
  activeTags: string[];
  toggleTag: (tag: string) => void;
  allTags: string[];
  activePropertyFilter: PropertyFilter | null;
  togglePropertyFilter: (filter: PropertyFilter) => void;
  inbox: InboxEntry[];
};

const RelevanceContext = createContext<RelevanceState>({
  items: [],
  activeTags: [],
  toggleTag: () => undefined,
  allTags: [],
  activePropertyFilter: null,
  togglePropertyFilter: () => undefined,
  inbox: []
});

export function RelevanceProvider({ items, children }: { items: Item[]; children: ReactNode }) {
  const [activeTags, setActiveTags] = useState<string[]>([]);
  const [activePropertyFilter, setActivePropertyFilter] = useState<PropertyFilter | null>(null);

  const libraryItems = useMemo(() => items.filter(isLibraryItem), [items]);
  const allTags = useMemo(() => collectTags(libraryItems), [libraryItems]);
  const inbox = useMemo(
    () =>
      buildInboxEntries(items, {
        now: new Date(),
        activeTags,
        activePropertyFilter
      }),
    [items, activeTags, activePropertyFilter]
  );

  function toggleTag(tag: string) {
    setActiveTags((current) => (current.includes(tag) ? current.filter((entry) => entry !== tag) : [...current, tag]));
  }

  function togglePropertyFilter(filter: PropertyFilter) {
    setActivePropertyFilter((current) => (current === filter ? null : filter));
  }

  return (
    <RelevanceContext.Provider
      value={{
        items,
        activeTags,
        toggleTag,
        allTags,
        activePropertyFilter,
        togglePropertyFilter,
        inbox
      }}
    >
      {children}
    </RelevanceContext.Provider>
  );
}

export function useRelevance() {
  return useContext(RelevanceContext);
}
