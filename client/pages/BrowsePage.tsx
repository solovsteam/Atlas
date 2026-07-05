import { Link } from "lakebed/client";
import { useMemo, useState } from "preact/hooks";
import { searchItems, sortItemsByUpdated } from "../../shared/relevance";
import { formatDate } from "../../shared/locale";
import { ItemKindBadge } from "../components/ItemKindBadge";
import { useRelevance } from "../context/RelevanceContext";

export function BrowsePage() {
  const { items } = useRelevance();
  const [query, setQuery] = useState("");

  const results = useMemo(() => {
    const trimmed = query.trim();
    if (trimmed) {
      return searchItems(items, trimmed);
    }
    return sortItemsByUpdated(items);
  }, [items, query]);

  return (
    <section>
      <div className="mb-6">
        <h1 className="text-4xl font-bold tracking-tight">Browse</h1>
        <p className="mt-2 text-sm text-neutral-400">All items, newest first.</p>
      </div>

      <input
        className="mb-4 w-full border border-neutral-700 bg-black px-3 py-2 text-sm outline-none focus:border-white"
        placeholder="Search all items…"
        value={query}
        onInput={(event) => setQuery((event.currentTarget as HTMLInputElement).value)}
      />

      {results.length === 0 ? (
        <p className="text-sm text-neutral-500">{query.trim() ? "No items match your search." : "No items yet."}</p>
      ) : (
        <ul className="divide-y divide-neutral-800 border-y border-neutral-800">
          {results.map((item) => (
            <li key={item.id}>
              <Link className="block py-3 hover:bg-neutral-950" to={`/item/${item.id}`}>
                <div className="flex items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="truncate font-medium">{item.title || "Untitled"}</span>
                    <ItemKindBadge item={item} />
                  </div>
                  <span className="shrink-0 font-mono text-xs text-neutral-600">
                    {formatDate(new Date(item.updatedAt))}
                  </span>
                </div>
                {item.body ? <p className="mt-1 line-clamp-2 text-sm text-neutral-400">{item.body}</p> : null}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
