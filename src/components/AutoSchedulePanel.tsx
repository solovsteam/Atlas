import { useMemo, useState } from "react";
import { useAtlasData } from "../context/AtlasDataContext";
import { trackBatchLinksUndo, useUndo } from "../context/UndoContext";
import { planScheduleApply, proposeSchedule } from "../services/scheduling";
import type { PlacementStrategy, SchedulerResult, UnassignedReason } from "@shared/scheduling";
import type { ItemLink } from "@shared/links";

const STRATEGIES: { id: PlacementStrategy; label: string }[] = [
  { id: "delta_cost_switch", label: "Delta + switch (default)" },
  { id: "delta_cost", label: "Delta cost" },
  { id: "earliest_fit", label: "Earliest fit (baseline)" }
];

export function AutoSchedulePanel() {
  const { items, links, createLink, deleteLink } = useAtlasData();
  const { push } = useUndo();
  const byId = useMemo(() => new Map(items.map((item) => [item.id, item])), [items]);
  const [strategy, setStrategy] = useState<PlacementStrategy>("delta_cost_switch");
  const [preview, setPreview] = useState<SchedulerResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function runPreview() {
    setPreview(proposeSchedule(items, new Date(), strategy, { links }));
    setError(null);
  }

  async function apply() {
    if (!preview) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const plan = planScheduleApply(preview, links, "unassigned_only");
      const created: ItemLink[] = [];
      for (const entry of plan.create) {
        created.push(await createLink(entry.fromId, entry.toId, "scheduled_in"));
      }
      for (const link of plan.delete) {
        await deleteLink(link.id);
      }
      if (created.length > 0 || plan.delete.length > 0) {
        trackBatchLinksUndo(push, created, plan.delete);
      }
      setPreview(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not apply schedule");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mb-8 rounded border border-neutral-800 p-4">
      <p className="mb-3 text-xs uppercase tracking-wide text-neutral-500">Auto-schedule</p>
      <p className="mb-4 text-sm text-neutral-400">
        Places ready tasks into open intervals. Two-minute tasks stay off the calendar. Default minimizes postponement and switching, not earliest-fit.
      </p>
      <div className="mb-4 flex flex-wrap gap-2">
        {STRATEGIES.map((entry) => (
          <button
            className={
              strategy === entry.id
                ? "rounded border border-white px-3 py-1 text-xs"
                : "rounded border border-neutral-700 px-3 py-1 text-xs text-neutral-400 hover:border-neutral-500"
            }
            key={entry.id}
            type="button"
            onClick={() => {
              setStrategy(entry.id);
              setPreview(null);
            }}
          >
            {entry.label}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        <button className="border border-neutral-600 px-3 py-1.5 text-xs hover:border-white" type="button" onClick={runPreview}>
          Preview
        </button>
        {preview ? (
          <button
            className="border border-white px-3 py-1.5 text-xs font-medium disabled:opacity-50"
            disabled={busy}
            type="button"
            onClick={() => void apply()}
          >
            Apply
          </button>
        ) : null}
      </div>
      {error ? <p className="mt-3 text-sm text-red-400">{error}</p> : null}
      {preview ? (
        <div className="mt-4 text-sm text-neutral-300">
          <p className="text-xs text-neutral-500">
            {preview.metrics.assignedCount} placed · postponement {preview.metrics.totalPostponement.toFixed(1)} ·
            switches {preview.metrics.contextSwitches}
          </p>
          <ul className="mt-3 space-y-1 text-xs">
            {preview.assignments.map((assignment) => (
              <li key={`${assignment.taskId}-${assignment.intervalId}`}>
                {byId.get(assignment.taskId)?.title ?? assignment.taskId} →{" "}
                {byId.get(assignment.intervalId)?.title ?? assignment.intervalId}
              </li>
            ))}
            {preview.unassigned
              .filter((entry) => entry.reason !== "excluded")
              .map((entry) => (
                <li className="text-neutral-600" key={entry.taskId}>
                  {byId.get(entry.taskId)?.title ?? entry.taskId} · {unassignedLabel(entry.reason)}
                </li>
              ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function unassignedLabel(reason: UnassignedReason): string {
  switch (reason) {
    case "quick":
      return "two minutes — skip calendar";
    case "missing_info":
      return "missing times";
    case "no_feasible_interval":
      return "no room";
    case "excluded":
      return "appointment";
  }
}
