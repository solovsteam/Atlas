import { useNavigate } from "react-router-dom";
import { useMemo, useState } from "react";
import type { Item, TaskStatus } from "@shared/item";
import { isLibraryItem, searchItems } from "@shared/relevance";
import { useAtlasData } from "../context/AtlasDataContext";
import { useRelevance } from "../context/RelevanceContext";
import { trackCreateUndo, trackDeleteUndo, trackTaskStatusUndo, useUndo } from "../context/UndoContext";
import { useStableInboxOrder } from "../hooks/useStableInboxOrder";
import { ItemList } from "../components/ItemList";
import { StatusBoostBar } from "../components/StatusBoostBar";
import { TagToggleBar } from "../components/TagToggleBar";

export function ItemsPage() {
  const navigate = useNavigate();
  const { inbox, items, activeTags, activeStatusBoosts } = useRelevance();
  const { createItem, updateItem, deleteItem } = useAtlasData();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const resortKey = `${activeTags.join("\0")}\0${activeStatusBoosts.join("\0")}`;
  const desired = useMemo(() => inbox.filter(isLibraryItem), [inbox]);
  const { visible, pendingResort, refreshOrder } = useStableInboxOrder("items", desired, items, resortKey);
  const { push } = useUndo();

  const searchResults = useMemo(() => searchItems(items, query), [items, query]);
  const showingSearch = query.trim().length > 0;
  const list = showingSearch ? searchResults : visible;

  async function setTaskStatus(item: Item, status: TaskStatus) {
    try {
      const result = await updateItem(item.id, JSON.stringify({ taskStatus: status }), item.revision);
      if ("ok" in result && result.ok) {
        trackTaskStatusUndo(push, item);
        setError(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update status");
    }
  }

  async function onDelete(item: Item, event: React.MouseEvent) {
    event.preventDefault();
    event.stopPropagation();
    try {
      await deleteItem(item.id);
      trackDeleteUndo(push, item);
      setError(null);
      if (selectedId === item.id) {
        setSelectedId(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete item");
    }
  }

  async function onAdd(event: React.FormEvent) {
    event.preventDefault();
    const title = query.trim();
    if (!title) {
      return;
    }
    try {
      const result = await createItem(title);
      trackCreateUndo(push, result.id);
      setQuery("");
      setError(null);
      navigate(`/item/${result.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create item");
    }
  }

  return (
    <section>
      <div className="mb-6 flex items-end justify-between gap-4">
        <div>
          <h1 className="text-4xl font-bold tracking-tight">Items</h1>
          <p className="mt-2 text-sm text-neutral-400">
            Notes, planning, and later (someday) tasks. Done leaves after you refresh this list.
          </p>
        </div>
        <button
          className={
            pendingResort && !showingSearch
              ? "text-xs text-white"
              : "text-xs text-neutral-500 hover:text-white"
          }
          type="button"
          onClick={refreshOrder}
        >
          Refresh list
        </button>
      </div>

      <form className="mb-4 flex gap-3" onSubmit={(event) => void onAdd(event)}>
        <input
          className="min-w-0 flex-1 border border-neutral-700 bg-black px-3 py-2 text-base outline-none focus:border-white"
          placeholder="Search or add an item…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <button className="shrink-0 border border-white px-4 py-2 text-sm font-medium" type="submit">
          Add
        </button>
      </form>
      {error ? <p className="mb-4 text-sm text-red-400">{error}</p> : null}

      {showingSearch ? (
        <p className="mb-4 text-xs text-neutral-500">Search results sorted by last updated.</p>
      ) : (
        <>
          <StatusBoostBar />
          <TagToggleBar />
        </>
      )}

      <ItemList
        emptyMessage={showingSearch ? "No items match your search." : "No items yet."}
        items={list}
        onDelete={onDelete}
        onStatusChange={setTaskStatus}
      />
    </section>
  );
}
