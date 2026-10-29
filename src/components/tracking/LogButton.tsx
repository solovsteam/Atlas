import { useEffect, useState } from "react";
import type { Item } from "@shared/item";
import { entryTimeLabel } from "@shared/documentationEntries";
import { useAtlasData } from "../../context/AtlasDataContext";
import { trackCreateEntryUndo, useUndo } from "../../context/UndoContext";
import { useEntryMutations } from "../../hooks/useDocumentationEntries";
import { LogEntrySheet } from "./LogEntrySheet";

/** "Scrolled" button: opens the time wheel and records one entry for the tracker. */
export function LogButton({ tracker, size = "normal" }: { tracker: Item; size?: "normal" | "large" }) {
  const { userId } = useAtlasData();
  const { createEntry } = useEntryMutations(userId);
  const { push } = useUndo();
  const [open, setOpen] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);
  const title = tracker.title || "Untitled tracker";

  useEffect(() => {
    if (!saved) {
      return;
    }
    const timer = window.setTimeout(() => setSaved(null), 4000);
    return () => window.clearTimeout(timer);
  }, [saved]);

  async function save(occurredAt: Date) {
    const entry = await createEntry(tracker.id, occurredAt);
    trackCreateEntryUndo(push, entry);
    setSaved(`Saved: ${entryTimeLabel(occurredAt, new Date())}`);
  }

  return (
    <div className="flex items-center gap-3">
      <button
        className={`inline-flex items-center gap-2 rounded-full border border-indigo-400/50 bg-indigo-500/15 font-medium text-indigo-100 hover:border-indigo-300 hover:bg-indigo-500/25 ${
          size === "large" ? "px-6 py-3 text-base" : "px-4 py-2 text-sm"
        }`}
        type="button"
        onClick={() => setOpen(true)}
      >
        <span aria-hidden="true" className="text-lg leading-none">+</span>
        {title}
      </button>
      {saved ? (
        <span className="text-sm text-neutral-400" role="status">
          {saved}
        </span>
      ) : null}
      {open ? <LogEntrySheet title={title} onClose={() => setOpen(false)} onSave={save} /> : null}
    </div>
  );
}
