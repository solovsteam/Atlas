import { Link, useParams } from "react-router-dom";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { trackersOf } from "@shared/documentationEntries";
import { useAtlasData } from "../context/AtlasDataContext";
import { trackCreateUndo, trackDeleteEntryUndo, useUndo } from "../context/UndoContext";
import { useDocumentationEntries, useEntryMutations } from "../hooks/useDocumentationEntries";
import { PlanEditor } from "../components/tracking/PlanEditor";
import { TrackerButtons } from "../components/tracking/TrackerButtons";
import { TrackerHistory } from "../components/tracking/TrackerHistory";

/** List of trackers, each with its log button, and a form to add one. */
export function TrackPage() {
  const { items, createItem } = useAtlasData();
  const { push } = useUndo();
  const trackers = useMemo(() => trackersOf(items), [items]);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function addTracker(event: FormEvent) {
    event.preventDefault();
    const title = name.trim();
    if (!title) {
      return;
    }
    try {
      const created = await createItem(title, { isDocumentation: true });
      trackCreateUndo(push, created.id);
      setName("");
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add the tracker");
    }
  }

  return (
    <section>
      <h1 className="text-4xl font-bold tracking-tight">Track</h1>
      <p className="mt-2 max-w-xl text-sm text-neutral-400">
        Record each time you notice a habit you want to break: at the urge, while doing it, or afterwards. "Urge now"
        records an urge in one tap. The buttons also appear on Now.
      </p>
      {trackers.length > 0 ? (
        <ul className="mt-6 space-y-3">
          {trackers.map((tracker) => (
            <li className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-neutral-800 p-4" key={tracker.id}>
              <TrackerButtons tracker={tracker} />
              <Link className="text-sm text-neutral-400 underline hover:text-white" to={`/track/${tracker.id}`}>
                History
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-6 text-sm text-neutral-500">No trackers yet.</p>
      )}
      <form className="mt-6 flex max-w-md gap-2" onSubmit={(event) => void addTracker(event)}>
        <input
          aria-label="New tracker name"
          className="min-w-0 flex-1 border border-neutral-700 bg-transparent px-3 py-2 text-white placeholder:text-neutral-600"
          placeholder="New habit to notice, for example Scrolled"
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
        <button className="border border-neutral-600 px-4 py-2 text-sm text-neutral-200 hover:border-white" type="submit">
          Add
        </button>
      </form>
      {error ? <p className="mt-3 text-sm text-red-400">{error}</p> : null}
    </section>
  );
}

/** One tracker: log button, charts and every entry. */
export function TrackerPage() {
  const { id = "" } = useParams();
  const { items, userId } = useAtlasData();
  const { push } = useUndo();
  const tracker = useMemo(() => items.find((item) => item.id === id && item.isDocumentation) ?? null, [items, id]);
  const { entries, loading, error } = useDocumentationEntries(userId, tracker?.id);
  const { deleteEntry } = useEntryMutations(userId);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  // Re-render every minute so "today" stays current on a page left open.
  const [, setMinute] = useState(0);
  useEffect(() => {
    const timer = window.setInterval(() => setMinute((minute) => minute + 1), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  const now = new Date();

  if (!tracker) {
    return (
      <section>
        <p className="text-neutral-400">Tracker not found.</p>
        <Link className="mt-4 inline-block text-sm text-neutral-300 hover:text-white" to="/track">
          Back to Track
        </Link>
      </section>
    );
  }

  async function remove(entry: (typeof entries)[number]) {
    try {
      await deleteEntry(entry);
      trackDeleteEntryUndo(push, entry);
      setDeleteError(null);
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Could not delete the entry");
    }
  }

  return (
    <section>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Link className="text-sm text-neutral-400 hover:text-white" to="/track">
          ← Track
        </Link>
        <Link className="text-sm text-neutral-400 hover:text-white" to={`/item/${tracker.id}`}>
          Rename or delete
        </Link>
      </div>
      <h1 className="mb-4 text-3xl font-bold tracking-tight">{tracker.title || "Untitled tracker"}</h1>
      <div className="mb-6">
        <TrackerButtons size="large" tracker={tracker} />
      </div>
      <PlanEditor tracker={tracker} />
      {error ? <p className="mb-4 text-sm text-red-400">{error}</p> : null}
      {deleteError ? <p className="mb-4 text-sm text-red-400">{deleteError}</p> : null}
      {loading ? (
        <p className="text-sm text-neutral-500">Loading entries…</p>
      ) : (
        <TrackerHistory entries={entries} now={now} trackerCreatedAt={tracker.createdAt} onDelete={(entry) => void remove(entry)} />
      )}
    </section>
  );
}
