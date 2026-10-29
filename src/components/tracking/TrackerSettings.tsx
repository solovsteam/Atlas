import { useEffect, useState } from "react";
import type { Item } from "@shared/item";
import { MAX_DAILY_GOAL, schemaWithTrackerConfig, trackerConfig, type TrackerConfig } from "@shared/documentationEntries";
import { useAtlasData } from "../../context/AtlasDataContext";
import { trackItemPatchUndo, useUndo } from "../../context/UndoContext";

const KINDS: { kind: TrackerConfig["kind"]; label: string; hint: string }[] = [
  { kind: "break", label: "Habit to break", hint: "Urge now button; records when you noticed" },
  { kind: "build", label: "Habit to build", hint: "Records what triggered it; optional daily aim" }
];

/** The tracker's kind and daily aim, saved on the item with undo. */
export function TrackerSettings({ tracker }: { tracker: Item }) {
  const { updateItem } = useAtlasData();
  const { push } = useUndo();
  const config = trackerConfig(tracker);
  const [goalText, setGoalText] = useState(config.dailyGoal === null ? "" : String(config.dailyGoal));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setGoalText(config.dailyGoal === null ? "" : String(config.dailyGoal));
  }, [config.dailyGoal]);

  async function save(next: TrackerConfig) {
    if (next.kind === config.kind && next.dailyGoal === config.dailyGoal) {
      return;
    }
    try {
      const result = await updateItem(
        tracker.id,
        JSON.stringify({ documentationSchema: schemaWithTrackerConfig(tracker, next) }),
        tracker.revision
      );
      if ("ok" in result && result.ok) {
        trackItemPatchUndo(push, tracker.id, { documentationSchema: tracker.documentationSchema });
        setError(null);
      } else {
        setError("The tracker changed elsewhere; the setting was not saved.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the setting");
    }
  }

  function saveGoal() {
    const value = Number.parseInt(goalText, 10);
    const dailyGoal = goalText.trim() && Number.isInteger(value) && value > 0 ? Math.min(value, MAX_DAILY_GOAL) : null;
    setGoalText(dailyGoal === null ? "" : String(dailyGoal));
    void save({ ...config, dailyGoal });
  }

  return (
    <section className="mb-6 max-w-xl">
      <p className="mb-2 text-sm font-semibold text-neutral-200">Kind</p>
      <div className="grid grid-cols-2 gap-2" role="group" aria-label="Kind">
        {KINDS.map(({ kind, label, hint }) => (
          <button
            aria-pressed={config.kind === kind}
            className={`rounded-xl border px-3 py-2 text-left ${
              config.kind === kind ? "border-indigo-400 bg-indigo-500/15 text-white" : "border-neutral-700 text-neutral-300 hover:border-neutral-500"
            }`}
            key={kind}
            type="button"
            onClick={() => void save({ kind, dailyGoal: kind === "build" ? config.dailyGoal : null })}
          >
            <span className="block text-sm font-semibold">{label}</span>
            <span className="block text-xs text-neutral-400">{hint}</span>
          </button>
        ))}
      </div>
      {config.kind === "build" ? (
        <label className="mt-3 flex items-center gap-2 text-sm text-neutral-300">
          Daily aim
          <input
            className="w-20 border border-neutral-700 bg-transparent px-2 py-1 text-white"
            inputMode="numeric"
            max={MAX_DAILY_GOAL}
            min={1}
            placeholder="none"
            type="number"
            value={goalText}
            onBlur={saveGoal}
            onChange={(event) => setGoalText(event.target.value)}
          />
          times a day
        </label>
      ) : null}
      {error ? <p className="mt-1 text-sm text-red-400">{error}</p> : null}
    </section>
  );
}
