import { Link, useMutation, useParams, useQuery } from "lakebed/client";
import { useMemo, useState } from "preact/hooks";
import type { ItemLink } from "../../shared/links";
import type { Item, UpdateItemResult, CreateItemResult } from "../../shared/item";
import { AssociationsPanel } from "../components/AssociationsPanel";
import { ItemEditor } from "../components/ItemEditor";
import { ScheduleEditor } from "../components/ScheduleEditor";
import { trackLinkUndo, useUndo } from "../context/UndoContext";
import type { ScheduleSlot } from "../../shared/schedule";

type PanelId = "content" | "schedule" | "associations";

const PANELS: { id: PanelId; label: string }[] = [
  { id: "content", label: "Content" },
  { id: "schedule", label: "Schedule" },
  { id: "associations", label: "Associations" }
];

function panelFlexClass(focused: PanelId | null, panel: PanelId): string {
  if (focused === null) {
    return "flex-1";
  }
  return focused === panel ? "flex-[3]" : "flex-[0.65]";
}

function panelBarClass(focused: PanelId | null, panel: PanelId): string {
  const base = "w-full border-b px-3 py-2 text-left text-sm font-medium uppercase tracking-wide transition-colors";
  if (focused === panel) {
    return `${base} border-white bg-neutral-900 text-white`;
  }
  if (focused === null) {
    return `${base} border-neutral-800 bg-neutral-950 text-neutral-400 hover:border-neutral-600 hover:text-white`;
  }
  return `${base} border-neutral-800 bg-black text-neutral-500 hover:border-neutral-600 hover:text-neutral-300`;
}

export function ItemPage() {
  const { id = "" } = useParams<{ id: string }>();
  const items = useQuery<Item[]>("items");
  const links = useQuery<ItemLink[]>("itemLinks");
  const scheduleSlots = useQuery<ScheduleSlot[]>("scheduleSlots");
  const [focusedPanel, setFocusedPanel] = useState<PanelId | null>(null);
  const { push } = useUndo();

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
  const occurrences = useMemo(
    () => (item ? items.filter((entry) => entry.generatedFromId === item.id).sort((a, b) => a.occurrenceKey.localeCompare(b.occurrenceKey)) : []),
    [item, items]
  );

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

  async function handleLinkItems(fromId: string, toId: string, kind = "context") {
    await linkItemsMutation(fromId, toId, kind);
    trackLinkUndo(push, fromId, toId, kind);
  }

  async function handleCreateLinked(title: string, asParent: boolean) {
    const created = await createItem(title);
    if (asParent) {
      await handleLinkItems(created.id, item.id, "context");
    } else {
      await handleLinkItems(item.id, created.id, "context");
    }
  }

  function togglePanel(panel: PanelId) {
    setFocusedPanel((current) => (current === panel ? null : panel));
  }

  return (
    <section>
      <div className="mb-6 flex items-center gap-3">
        <Link className="text-sm text-neutral-400 hover:text-white" to="/">
          ← Now
        </Link>
        <Link className="text-sm text-neutral-500 hover:text-white" to="/calendar">
          Calendar
        </Link>
      </div>

      <div className="flex min-h-[70vh] gap-3">
        {PANELS.map((panel) => (
          <div
            className={`flex min-w-0 flex-col rounded border border-neutral-800 bg-black ${panelFlexClass(focusedPanel, panel.id)}`}
            key={panel.id}
          >
            <button className={panelBarClass(focusedPanel, panel.id)} type="button" onClick={() => togglePanel(panel.id)}>
              {panel.label}
            </button>
            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              {panel.id === "content" ? (
                <ItemEditor
                  generator={generator}
                  item={item}
                  occurrences={occurrences}
                  updateItem={(itemId, patchJson, expectedRevision) => updateItem(itemId, patchJson, expectedRevision)}
                />
              ) : null}
              {panel.id === "schedule" ? <ScheduleEditor item={item} slots={scheduleSlots} /> : null}
              {panel.id === "associations" ? (
                <AssociationsPanel
                  createLinkedItem={handleCreateLinked}
                  item={item}
                  items={items}
                  linkItems={handleLinkItems}
                  links={links}
                />
              ) : null}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
