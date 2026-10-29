import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import type { Item } from "@shared/item";
import {
  countInLastDays,
  dataWithTags,
  entryData,
  entryStage,
  entryTags,
  entryTimeLabel,
  STAGE_TEXT,
  tagPrompt,
  tagVocabulary,
  toggleTag,
  trackerConfig,
  type DocumentationEntry,
  type EntryStage,
  type TrackerConfig
} from "@shared/documentationEntries";
import { useAtlasData } from "../../context/AtlasDataContext";
import { trackCreateEntryUndo, trackUpdateEntryUndo, useUndo } from "../../context/UndoContext";
import { useDocumentationEntries, useEntryMutations } from "../../hooks/useDocumentationEntries";
import { LogEntrySheet } from "./LogEntrySheet";
import { SituationChips } from "./SituationChips";

// Enough recent entries to offer the tags used before and count today.
const RECENT_ENTRIES = 200;
const CARD_SECONDS = 20;

/**
 * The buttons that record one entry. The tracker button opens the time wheel.
 * A habit to break also has "Urge now", which records an urge in one tap; a
 * habit to build shows today's progress toward its daily aim. After saving, a
 * card shows the tracker's plan and lets a tag be added.
 */
export function TrackerButtons({ tracker, size = "normal" }: { tracker: Item; size?: "normal" | "large" }) {
  const { userId } = useAtlasData();
  const { entries } = useDocumentationEntries(userId, tracker.id, RECENT_ENTRIES);
  const { createEntry, updateEntry } = useEntryMutations(userId);
  const { push } = useUndo();
  const config = trackerConfig(tracker);
  const chips = useMemo(() => tagVocabulary(entries), [entries]);
  const [open, setOpen] = useState(false);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [cardKey, setCardKey] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const saved = savedId ? (entries.find((entry) => entry.id === savedId) ?? null) : null;
  const today = countInLastDays(entries, 1, new Date());
  const title = tracker.title || "Untitled tracker";
  const buttonSize = size === "large" ? "px-5 py-3 text-base" : "px-4 py-2 text-sm";

  // The card closes by itself; touching a tag restarts the time.
  useEffect(() => {
    if (!savedId) {
      return;
    }
    const timer = window.setTimeout(() => setSavedId(null), CARD_SECONDS * 1000);
    return () => window.clearTimeout(timer);
  }, [savedId, cardKey]);

  async function log(occurredAt: Date, stage: EntryStage, tags: string[]) {
    const entry = await createEntry(tracker.id, occurredAt, entryData(config.kind === "break" ? stage : null, tags));
    trackCreateEntryUndo(push, entry);
    setSavedId(entry.id);
    setCardKey((key) => key + 1);
  }

  async function urgeNow() {
    if (busy) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await log(new Date(), "urge", []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save");
    } finally {
      setBusy(false);
    }
  }

  async function toggleTagOf(entry: DocumentationEntry, tag: string) {
    setCardKey((key) => key + 1);
    try {
      await updateEntry(entry, dataWithTags(entry, toggleTag(entryTags(entry), tag)));
      trackUpdateEntryUndo(push, entry);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the tag");
    }
  }

  return (
    <div className="min-w-0">
      <div className="flex flex-wrap items-center gap-2">
        <button
          className={`inline-flex items-center gap-2 rounded-full border border-indigo-400/50 bg-indigo-500/15 font-medium text-indigo-100 hover:border-indigo-300 hover:bg-indigo-500/25 ${buttonSize}`}
          type="button"
          onClick={() => setOpen(true)}
        >
          <span aria-hidden="true" className="text-lg leading-none">+</span>
          {title}
        </button>
        {config.kind === "break" ? (
          <button
            aria-label={`${title}: urge now`}
            className={`rounded-full bg-indigo-400 font-semibold text-neutral-950 hover:bg-indigo-300 disabled:opacity-50 ${buttonSize}`}
            disabled={busy}
            type="button"
            onClick={() => void urgeNow()}
          >
            {busy ? "Saving…" : "Urge now"}
          </button>
        ) : (
          <span className="text-sm text-neutral-400">
            {config.dailyGoal !== null ? `${today} of ${config.dailyGoal} today` : `${today} today`}
          </span>
        )}
      </div>
      {error ? <p className="mt-2 text-sm text-red-400">{error}</p> : null}
      {saved ? (
        <SavedCard
          chips={chips}
          config={config}
          entry={saved}
          plan={tracker.body}
          today={today}
          trackerId={tracker.id}
          onClose={() => setSavedId(null)}
          onToggle={toggleTagOf}
        />
      ) : null}
      {open ? (
        <LogEntrySheet chips={chips} chipsLabel={tagPrompt(config)} title={title} onClose={() => setOpen(false)} onSave={log} />
      ) : null}
    </div>
  );
}

function SavedCard({
  entry,
  config,
  plan,
  today,
  chips,
  trackerId,
  onToggle,
  onClose
}: {
  entry: DocumentationEntry;
  config: TrackerConfig;
  plan: string;
  today: number;
  chips: string[];
  trackerId: string;
  onToggle: (entry: DocumentationEntry, tag: string) => void;
  onClose: () => void;
}) {
  const detail =
    config.kind === "break"
      ? STAGE_TEXT[entryStage(entry)].label
      : config.dailyGoal !== null
        ? `${today} of ${config.dailyGoal} today`
        : `${today} today`;
  return (
    <div className="mt-3 max-w-md rounded-xl border border-neutral-800 bg-neutral-950 p-4" role="status">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-semibold text-white">Saved: {entryTimeLabel(new Date(entry.occurredAt), new Date())}</p>
          <p className="text-sm text-neutral-400">{detail}</p>
        </div>
        <button aria-label="Close" className="px-1 text-lg leading-none text-neutral-500 hover:text-white" type="button" onClick={onClose}>
          ×
        </button>
      </div>
      {plan.trim() ? (
        <div className="mt-3 rounded-r-lg border-l-2 border-indigo-400 bg-indigo-500/10 px-3 py-2">
          <p className="text-xs text-neutral-400">{config.kind === "build" ? "Your rule" : "Your plan"}</p>
          <p className="whitespace-pre-line text-neutral-100">{plan.trim()}</p>
        </div>
      ) : (
        <p className="mt-3 text-sm text-neutral-400">
          {config.kind === "build" ? "No rule yet." : "No plan yet."}{" "}
          <Link className="underline hover:text-white" to={`/track/${trackerId}`}>
            Add one on the tracker page.
          </Link>
        </p>
      )}
      <p className="mb-2 mt-3 text-xs text-neutral-400">{tagPrompt(config)}</p>
      <SituationChips options={chips} selected={entryTags(entry)} onToggle={(tag) => onToggle(entry, tag)} />
    </div>
  );
}
