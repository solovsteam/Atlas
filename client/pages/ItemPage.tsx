import { Link, useMutation, useParams, useQuery } from "lakebed/client";
import { useMemo, useState } from "preact/hooks";
import type { ItemLink } from "../../shared/links";
import type { Item, UpdateItemResult, CreateItemResult } from "../../shared/item";
import { AssociationsPanel } from "../components/AssociationsPanel";
import { ItemEditor } from "../components/ItemEditor";

type Tab = "content" | "associations";

export function ItemPage() {
  const { id = "" } = useParams<{ id: string }>();
  const items = useQuery<Item[]>("items");
  const links = useQuery<ItemLink[]>("itemLinks");
  const [tab, setTab] = useState<Tab>("content");

  const updateItem = useMutation<[id: string, patchJson: string, expectedRevision: number], UpdateItemResult>("updateItem");
  const linkItemsMutation = useMutation<[fromId: string, toId: string, kind?: string], { ok: true } | { error: string }>(
    "linkItems"
  );
  const createItem = useMutation<[title: string], CreateItemResult>("createItem");

  const item = useMemo(() => items.find((entry) => entry.id === id) ?? null, [items, id]);
  const generator = useMemo(() => {
    if (!item?.generatedFromId) {
      return null;
    }
    return items.find((entry) => entry.id === item.generatedFromId) ?? null;
  }, [item, items]);

  if (!item) {
    return (
      <section>
        <p className="text-neutral-400">Item not found.</p>
        <Link className="mt-4 inline-block text-sm text-neutral-300 hover:text-white" to="/">
          Back to Now
        </Link>
      </section>
    );
  }

  async function handleLinkItems(fromId: string, toId: string) {
    await linkItemsMutation(fromId, toId, "context");
  }

  async function handleCreateLinked(title: string, asParent: boolean) {
    const created = await createItem(title);
    if (asParent) {
      await linkItemsMutation(created.id, item.id, "context");
    } else {
      await linkItemsMutation(item.id, created.id, "context");
    }
  }

  return (
    <section>
      <div className="mb-6 flex items-center justify-between gap-3">
        <div className="flex gap-3">
          <Link className="text-sm text-neutral-400 hover:text-white" to="/">
            ← Now
          </Link>
          <Link className="text-sm text-neutral-500 hover:text-white" to="/browse">
            Browse
          </Link>
        </div>
        <div className="flex gap-2">
          <button
            className={tab === "content" ? "border-b border-white px-2 py-1 text-sm" : "px-2 py-1 text-sm text-neutral-500 hover:text-white"}
            type="button"
            onClick={() => setTab("content")}
          >
            Content
          </button>
          <button
            className={
              tab === "associations" ? "border-b border-white px-2 py-1 text-sm" : "px-2 py-1 text-sm text-neutral-500 hover:text-white"
            }
            type="button"
            onClick={() => setTab("associations")}
          >
            Associations
          </button>
        </div>
      </div>

      {tab === "content" ? (
        <ItemEditor
          generator={generator}
          item={item}
          updateItem={(itemId, patchJson, expectedRevision) => updateItem(itemId, patchJson, expectedRevision)}
        />
      ) : (
        <AssociationsPanel
          createLinkedItem={handleCreateLinked}
          item={item}
          items={items}
          linkItems={handleLinkItems}
          links={links}
        />
      )}
    </section>
  );
}
