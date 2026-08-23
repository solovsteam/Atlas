import { Link, useNavigate, useParams } from "react-router-dom";
import { useMemo } from "react";
import { isArchivedTask } from "@shared/relevance";
import { subtasksOf } from "@shared/subtasks";
import { useAtlasData } from "../context/AtlasDataContext";
import { trackDeleteUndo, useUndo } from "../context/UndoContext";
import { ItemEditor } from "../components/ItemEditor";
import { SubtasksPanel } from "../components/SubtasksPanel";

export function ItemPage() {
  const { id = "" } = useParams();
  const { items, updateItem, deleteItem } = useAtlasData();
  const navigate = useNavigate();
  const { push } = useUndo();

  const item = useMemo(() => items.find((entry) => entry.id === id) ?? null, [items, id]);
  const subtasks = useMemo(() => (item ? subtasksOf(item.id, items) : []), [item, items]);
  const backTo = item && isArchivedTask(item) ? "/archive" : "/items";
  const backLabel = item && isArchivedTask(item) ? "Archive" : "Items";

  if (!item) {
    return (
      <section>
        <p className="text-neutral-400">Item not found.</p>
        <Link className="mt-4 inline-block text-sm text-neutral-300 hover:text-white" to="/items">
          Back to Items
        </Link>
      </section>
    );
  }

  const currentItem = item;

  async function handleDelete() {
    try {
      await deleteItem(currentItem.id);
      trackDeleteUndo(push, currentItem);
      navigate(backTo);
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "Could not delete item");
    }
  }

  return (
    <section>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <Link className="text-sm text-neutral-400 hover:text-white" to={backTo}>
          ← {backLabel}
        </Link>
        <button
          className="border border-red-800 px-3 py-1.5 text-sm text-red-300 hover:border-red-500 hover:text-red-200"
          type="button"
          onClick={() => void handleDelete()}
        >
          Delete item
        </button>
      </div>

      <ItemEditor item={currentItem} updateItem={updateItem} />
      {currentItem.isTask && subtasks.length > 0 ? <SubtasksPanel item={currentItem} /> : null}
    </section>
  );
}
