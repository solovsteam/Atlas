import { Link, useNavigate, useParams } from "react-router-dom";
import { useMemo } from "react";
import { useAtlasData } from "../context/AtlasDataContext";
import { ItemEditor } from "../components/ItemEditor";

export function ItemPage() {
  const { id = "" } = useParams();
  const { items, updateItem, deleteItem } = useAtlasData();
  const navigate = useNavigate();

  const item = useMemo(() => items.find((entry) => entry.id === id) ?? null, [items, id]);

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

  const currentItem = item;

  async function handleDelete() {
    if (!window.confirm(`Delete "${currentItem.title}"? This cannot be undone.`)) {
      return;
    }
    await deleteItem(currentItem.id);
    navigate("/");
  }

  return (
    <section>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <Link className="text-sm text-neutral-400 hover:text-white" to="/">
          ← Now
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
    </section>
  );
}
