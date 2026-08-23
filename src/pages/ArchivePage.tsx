import { useMemo, useState } from "react";
import type { Item, TaskStatus } from "@shared/item";
import {
  collectTags,
  filterArchiveItems,
  isArchivedTask,
  searchItems,
  type ArchivePropertyFilter
} from "@shared/relevance";
import { useAtlasData } from "../context/AtlasDataContext";
import { trackDeleteUndo, trackTaskStatusUndo, useUndo } from "../context/UndoContext";
import { ItemList } from "../components/ItemList";

const ARCHIVE_PROPERTY_FILTERS: { value: ArchivePropertyFilter; label: string }[] = [
  { value: "done", label: "done" },
  { value: "cancelled", label: "cancelled" }
];

export function ArchivePage() {
  const { items, updateItem, deleteItem } = useAtlasData();
  const [activeTags, setActiveTags] = useState<string[]>([]);
  const [activePropertyFilter, setActivePropertyFilter] = useState<ArchivePropertyFilter | null>(null);
  const [query, setQuery] = useState("");
  const { push } = useUndo();

  const archivedItems = useMemo(() => items.filter(isArchivedTask), [items]);
  const allTags = useMemo(() => collectTags(archivedItems), [archivedItems]);
  const filtered = useMemo(
    () => filterArchiveItems(items, { activeTags, activePropertyFilter }),
    [items, activeTags, activePropertyFilter]
  );
  const searchResults = useMemo(() => searchItems(archivedItems, query), [archivedItems, query]);
  const showingSearch = query.trim().length > 0;
  const list = showingSearch ? searchResults : filtered;
  const hasActiveFilters = activeTags.length > 0 || activePropertyFilter !== null;

  function toggleTag(tag: string) {
    setActiveTags((current) => (current.includes(tag) ? current.filter((entry) => entry !== tag) : [...current, tag]));
  }

  function togglePropertyFilter(filter: ArchivePropertyFilter) {
    setActivePropertyFilter((current) => (current === filter ? null : filter));
  }

  async function setTaskStatus(item: Item, status: TaskStatus) {
    try {
      const result = await updateItem(item.id, JSON.stringify({ taskStatus: status }), item.revision);
      if ("ok" in result && result.ok) {
        trackTaskStatusUndo(push, item);
      }
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "Could not update status");
    }
  }

  async function onDelete(item: Item, event: React.MouseEvent) {
    event.preventDefault();
    event.stopPropagation();
    try {
      await deleteItem(item.id);
      trackDeleteUndo(push, item);
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "Could not delete item");
    }
  }

  return (
    <section>
      <div className="mb-6">
        <h1 className="text-4xl font-bold tracking-tight">Archive</h1>
        <p className="mt-2 text-sm text-neutral-400">Done and cancelled tasks. Mark a task active to return it to Items.</p>
      </div>

      <input
        className="mb-4 w-full border border-neutral-700 bg-black px-3 py-2 text-base outline-none focus:border-white"
        placeholder="Search archive…"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />

      {showingSearch ? (
        <p className="mb-4 text-xs text-neutral-500">Search results sorted by last updated.</p>
      ) : (
        <>
          <div className="mb-4">
            <p className="mb-2 text-xs uppercase tracking-wide text-neutral-500">Status</p>
            <div className="flex flex-wrap gap-2">
              {ARCHIVE_PROPERTY_FILTERS.map(({ value, label }) => {
                const active = activePropertyFilter === value;
                return (
                  <button
                    className={
                      active
                        ? "rounded-full border border-white bg-white px-3 py-1 text-xs font-medium text-black"
                        : "rounded-full border border-neutral-700 px-3 py-1 text-xs text-neutral-300 hover:border-neutral-400"
                    }
                    key={value}
                    type="button"
                    onClick={() => togglePropertyFilter(value)}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>

          {allTags.length > 0 ? (
            <div className="mb-4 flex flex-wrap gap-2">
              {allTags.map((tag) => {
                const active = activeTags.includes(tag);
                return (
                  <button
                    className={
                      active
                        ? "rounded-full border border-white bg-white px-3 py-1 text-xs font-medium text-black"
                        : "rounded-full border border-neutral-700 px-3 py-1 text-xs text-neutral-300 hover:border-neutral-400"
                    }
                    key={tag}
                    type="button"
                    onClick={() => toggleTag(tag)}
                  >
                    {tag}
                  </button>
                );
              })}
            </div>
          ) : null}
        </>
      )}

      <ItemList
        emptyMessage={
          showingSearch
            ? "No archived tasks match your search."
            : hasActiveFilters
              ? "No archived tasks match your filters."
              : "No archived tasks yet."
        }
        items={list}
        onDelete={onDelete}
        onStatusChange={setTaskStatus}
      />
    </section>
  );
}
