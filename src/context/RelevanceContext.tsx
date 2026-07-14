import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import type { Item, TaskStatus } from "@shared/item";
import { buildInboxEntries, collectTags, type InboxEntry } from "@shared/relevance";

type RelevanceState = {
  items: Item[];
  activeTags: string[];
  toggleTag: (tag: string) => void;
  allTags: string[];
  activeStatusBoosts: TaskStatus[];
  toggleStatusBoost: (status: TaskStatus) => void;
  inbox: InboxEntry[];
};

const RelevanceContext = createContext<RelevanceState>({
  items: [],
  activeTags: [],
  toggleTag: () => undefined,
  allTags: [],
  activeStatusBoosts: [],
  toggleStatusBoost: () => undefined,
  inbox: []
});

export function RelevanceProvider({ items, children }: { items: Item[]; children: ReactNode }) {
  const [activeTags, setActiveTags] = useState<string[]>([]);
  const [activeStatusBoosts, setActiveStatusBoosts] = useState<TaskStatus[]>([]);

  const allTags = useMemo(() => collectTags(items), [items]);
  const inbox = useMemo(
    () =>
      buildInboxEntries(items, {
        now: new Date(),
        activeTags,
        activeStatusBoosts
      }),
    [items, activeTags, activeStatusBoosts]
  );

  function toggleTag(tag: string) {
    setActiveTags((current) => (current.includes(tag) ? current.filter((entry) => entry !== tag) : [...current, tag]));
  }

  function toggleStatusBoost(status: TaskStatus) {
    setActiveStatusBoosts((current) =>
      current.includes(status) ? current.filter((entry) => entry !== status) : [...current, status]
    );
  }

  return (
    <RelevanceContext.Provider
      value={{
        items,
        activeTags,
        toggleTag,
        allTags,
        activeStatusBoosts,
        toggleStatusBoost,
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
