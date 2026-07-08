import { Link } from "lakebed/client";
import { useMemo, useState } from "preact/hooks";
import { buildDocumentationLinks, buildItemGraph } from "../../shared/links";
import type { Item } from "../../shared/item";
import type { ItemLink } from "../../shared/links";
import { AssociationBreadcrumb } from "./AssociationBreadcrumb";

export function AssociationsPanel({
  item,
  items,
  links,
  linkItems,
  createLinkedItem
}: {
  item: Item;
  items: Item[];
  links: ItemLink[];
  linkItems: (fromId: string, toId: string, kind?: string) => Promise<unknown>;
  createLinkedItem: (title: string, asParent: boolean) => Promise<void>;
}) {
  const [query, setQuery] = useState("");
  const [docQuery, setDocQuery] = useState("");
  const [newTitle, setNewTitle] = useState("");
  const graph = useMemo(() => buildItemGraph(item, items, links), [item, items, links]);
  const documentationLinks = useMemo(() => buildDocumentationLinks(item, items, links), [item, items, links]);

  const candidates = items.filter(
    (entry) =>
      entry.id !== item.id &&
      !graph.parents.some((parent) => parent.id === entry.id) &&
      !graph.children.some((child) => child.id === entry.id) &&
      entry.title.toLowerCase().includes(query.toLowerCase())
  );

  const docCandidates = items.filter(
    (entry) =>
      entry.id !== item.id &&
      !documentationLinks.some((linked) => linked.id === entry.id) &&
      entry.title.toLowerCase().includes(docQuery.toLowerCase())
  );

  async function addParent(parentId: string) {
    await linkItems(parentId, item.id, "context");
    setQuery("");
  }

  async function addChild(childId: string) {
    await linkItems(item.id, childId, "context");
    setQuery("");
  }

  async function addDocumentationLink(otherId: string) {
    await linkItems(item.id, otherId, "documentation");
    setDocQuery("");
  }

  async function onCreateLinked(asParent: boolean) {
    const title = newTitle.trim();
    if (!title) {
      return;
    }
    await createLinkedItem(title, asParent);
    setNewTitle("");
  }

  return (
    <section className="space-y-6">
      <div>
        <h2 className="mb-2 text-sm font-medium uppercase tracking-wide text-neutral-400">Parents</h2>
        {graph.parents.length === 0 ? (
          <p className="text-sm text-neutral-500">No parent items linked.</p>
        ) : (
          <ul className="space-y-2">
            {graph.parents.map((parent) => (
              <li key={parent.id}>
                <Link className="text-neutral-200 hover:text-white" to={`/item/${parent.id}`}>
                  {parent.title}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <h2 className="mb-2 text-sm font-medium uppercase tracking-wide text-neutral-400">Children</h2>
        {graph.children.length === 0 ? (
          <p className="text-sm text-neutral-500">No child items linked.</p>
        ) : (
          <ul className="space-y-2">
            {graph.children.map((child) => (
              <li key={child.id}>
                <Link className="text-neutral-200 hover:text-white" to={`/item/${child.id}`}>
                  {child.title}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <h2 className="mb-2 text-sm font-medium uppercase tracking-wide text-neutral-400">Documentation links</h2>
        {documentationLinks.length === 0 ? (
          <p className="text-sm text-neutral-500">No documentation links yet.</p>
        ) : (
          <ul className="mb-3 space-y-2">
            {documentationLinks.map((linked) => (
              <li key={linked.id}>
                <Link className="text-violet-300 hover:text-violet-100" to={`/item/${linked.id}`}>
                  {linked.title}
                </Link>
              </li>
            ))}
          </ul>
        )}
        <input
          className="mb-2 w-full border border-neutral-700 bg-black px-3 py-2 text-sm outline-none focus:border-white"
          placeholder="Search items to link"
          value={docQuery}
          onInput={(event) => setDocQuery((event.currentTarget as HTMLInputElement).value)}
        />
        <ul className="max-h-32 space-y-2 overflow-y-auto">
          {docCandidates.slice(0, 6).map((candidate) => (
            <li className="flex items-center justify-between gap-2 text-sm" key={candidate.id}>
              <span className="truncate text-neutral-300">{candidate.title}</span>
              <button className="text-xs text-neutral-400 hover:text-white" type="button" onClick={() => void addDocumentationLink(candidate.id)}>
                Link
              </button>
            </li>
          ))}
        </ul>
      </div>

      <div>
        <h2 className="mb-2 text-sm font-medium uppercase tracking-wide text-neutral-400">Paths</h2>
        <AssociationBreadcrumb paths={graph.ancestorPaths} />
      </div>

      <div className="rounded border border-neutral-800 p-4">
        <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-neutral-400">Link existing item</h2>
        <input
          className="mb-3 w-full border border-neutral-700 bg-black px-3 py-2 text-sm outline-none focus:border-white"
          placeholder="Search items"
          value={query}
          onInput={(event) => setQuery((event.currentTarget as HTMLInputElement).value)}
        />
        <ul className="mb-2 max-h-40 space-y-2 overflow-y-auto">
          {candidates.slice(0, 8).map((candidate) => (
            <li className="flex items-center justify-between gap-2 text-sm" key={candidate.id}>
              <span className="truncate text-neutral-300">{candidate.title}</span>
              <div className="flex shrink-0 gap-2">
                <button className="text-xs text-neutral-400 hover:text-white" type="button" onClick={() => void addParent(candidate.id)}>
                  Add parent
                </button>
                <button className="text-xs text-neutral-400 hover:text-white" type="button" onClick={() => void addChild(candidate.id)}>
                  Add child
                </button>
              </div>
            </li>
          ))}
        </ul>
      </div>

      <div className="rounded border border-neutral-800 p-4">
        <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-neutral-400">Create linked item</h2>
        <div className="flex gap-2">
          <input
            className="min-w-0 flex-1 border border-neutral-700 bg-black px-3 py-2 text-sm outline-none focus:border-white"
            placeholder="New item title"
            value={newTitle}
            onInput={(event) => setNewTitle((event.currentTarget as HTMLInputElement).value)}
          />
          <button className="border border-neutral-600 px-3 py-2 text-xs hover:border-white" type="button" onClick={() => void onCreateLinked(true)}>
            As parent
          </button>
          <button className="border border-neutral-600 px-3 py-2 text-xs hover:border-white" type="button" onClick={() => void onCreateLinked(false)}>
            As child
          </button>
        </div>
      </div>
    </section>
  );
}
