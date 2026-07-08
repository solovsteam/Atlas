import { Link, useMutation, useNavigate } from "lakebed/client";
import { useMemo, useState } from "preact/hooks";
import type { CreateItemResult, Item, TaskStatus, UpdateItemResult } from "../../shared/item";
import { searchItems } from "../../shared/relevance";
import { useRelevance } from "../context/RelevanceContext";
import { useStableInboxOrder } from "../hooks/useStableInboxOrder";
import { ItemKindBadge } from "../components/ItemKindBadge";
import { StatusBoostBar } from "../components/StatusBoostBar";
import { TagToggleBar } from "../components/TagToggleBar";
import { trackTaskStatusUndo, useUndo } from "../context/UndoContext";
import { TaskStatusButtonsForItem } from "../components/TaskStatusButtons";

export function NowPage() {
  const navigate = useNavigate();
  const { inbox, items, activeTags, activeStatusBoosts } = useRelevance();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const resortKey = `${activeTags.join("\0")}\0${activeStatusBoosts.join("\0")}`;
  const { visible, pendingResort, refreshOrder } = useStableInboxOrder(inbox, selectedId, resortKey);
  const createItem = useMutation<[title: string], CreateItemResult>("createItem");
  const updateItem = useMutation<[id: string, patchJson: string, expectedRevision: number], UpdateItemResult>("updateItem");
  const { push } = useUndo();

  const searchResults = useMemo(() => searchItems(items, query), [items, query]);
  const showingSearch = query.trim().length > 0;
  const list = showingSearch ? searchResults : visible;

  async function setTaskStatus(item: Item, status: TaskStatus) {
    const result = await updateItem(item.id, JSON.stringify({ taskStatus: status }), item.revision);
    if ("ok" in result && result.ok) {
      trackTaskStatusUndo(push, item, result.revision);
    }
  }

  async function onAdd(event: SubmitEvent) {
    event.preventDefault();
    const title = query.trim();
    if (!title) {
      return;
    }
    const result = await createItem(title);
    setQuery("");
    navigate(`/item/${result.id}`);
  }

  return (
    <section>
      <div className="mb-6 flex items-end justify-between gap-4">
        <div>
          <h1 className="text-4xl font-bold tracking-tight">Now</h1>
          <p className="mt-2 text-sm text-neutral-400">All items, ranked by relevance. Active tasks float up by default.</p>
        </div>
        {!showingSearch && pendingResort ? (
          <button className="text-xs text-neutral-400 hover:text-white" type="button" onClick={refreshOrder}>
            Apply new order
          </button>
        ) : null}
      </div>

      <form className="mb-4 flex gap-3" onSubmit={(event) => void onAdd(event)}>
        <input
          className="min-w-0 flex-1 border border-neutral-700 bg-black px-3 py-2 text-sm outline-none focus:border-white"
          placeholder="Search or add an item…"
          value={query}
          onInput={(event) => setQuery((event.currentTarget as HTMLInputElement).value)}
        />
        <button className="shrink-0 border border-white px-4 py-2 text-sm font-medium" type="submit">
          Add
        </button>
      </form>

      {showingSearch ? (
        <p className="mb-4 text-xs text-neutral-500">Search results sorted by last updated.</p>
      ) : (
        <>
          <StatusBoostBar />
          <TagToggleBar />
        </>
      )}

      {list.length === 0 ? (
        <p className="text-sm text-neutral-500">{showingSearch ? "No items match your search." : "No items yet."}</p>
      ) : (
        <ul className="divide-y divide-neutral-800 border-y border-neutral-800">
          {list.map((entry) => (
            <li key={entry.id}>
              <div className="flex items-start gap-3 py-3 hover:bg-neutral-950">
                <TaskStatusButtonsForItem item={entry} onStatusChange={setTaskStatus} />
                <Link
                  className="min-w-0 flex-1"
                  to={`/item/${entry.id}`}
                  onClick={() => setSelectedId(entry.id)}
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="truncate font-medium">{entry.title}</span>
                    <ItemKindBadge item={entry} />
                  </div>
                  {entry.body ? <p className="mt-1 line-clamp-2 text-sm text-neutral-400">{entry.body}</p> : null}
                </Link>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
