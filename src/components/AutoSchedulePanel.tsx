import { useMemo, useState } from "react";
import type { ScheduleProposal, SchedulerScope } from "@shared/scheduling";
import { useAtlasData } from "../context/AtlasDataContext";
import { trackScheduleLinksUndo, useUndo } from "../context/UndoContext";
import { proposeSchedule, scheduleLinkChangesForProposal, applyScheduleProposal } from "../services/scheduling";
import { supabase } from "../lib/supabase";

function proposalSummary(proposal: ScheduleProposal): string {
  const assignCount = proposal.assignments.length;
  const unassignedCount = proposal.unassigned.length;
  const missingInfoCount = proposal.unassigned.filter((entry) => entry.reason === "missing_info").length;
  const noSlotCount = proposal.unassigned.filter((entry) => entry.reason === "no_feasible_interval").length;

  if (assignCount === 0 && unassignedCount === 0) {
    return "Nothing to schedule — all eligible tasks already have intervals or no intervals exist in the horizon.";
  }
  const parts = [];
  if (assignCount > 0) {
    parts.push(`${assignCount} task${assignCount === 1 ? "" : "s"} to assign`);
  }
  if (missingInfoCount > 0) {
    parts.push(`${missingInfoCount} missing scheduling info`);
  }
  if (noSlotCount > 0) {
    parts.push(`${noSlotCount} with no feasible slot`);
  }
  const other = unassignedCount - missingInfoCount - noSlotCount;
  if (other > 0) {
    parts.push(`${other} could not be placed`);
  }
  return parts.join("; ") + ".";
}

export function AutoSchedulePanel() {
  const { items, itemLinks, itemLinksAvailable, userId, setItemLinks } = useAtlasData();
  const { push } = useUndo();
  const [scope, setScope] = useState<SchedulerScope>("unassigned_only");
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  const proposal = useMemo(
    () =>
      proposeSchedule(items, itemLinks, {
        scope,
        includePlanningTasks: true
      }),
    [items, itemLinks, scope]
  );

  async function onApply() {
    if (!userId || proposal.assignments.length === 0) {
      return;
    }
    setApplying(true);
    setError(null);
    try {
      const changes = scheduleLinkChangesForProposal(proposal, itemLinks);
      const { links } = await applyScheduleProposal(supabase, userId, proposal, itemLinks);
      setItemLinks(links);
      trackScheduleLinksUndo(push, changes);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not apply schedule");
    } finally {
      setApplying(false);
    }
  }

  if (!itemLinksAvailable) {
    return (
      <p className="mb-6 text-xs text-neutral-600">
        Auto-schedule needs item links (run migration 008_item_links.sql).
      </p>
    );
  }

  return (
    <section className="mb-6 border border-neutral-800 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-medium text-neutral-200">Auto-schedule</h2>
          <p className="mt-1 max-w-xl text-xs text-neutral-500">
            Assign unscheduled tasks to intervals by relevance (urgency + importance). Fixed appointments are
            skipped.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 text-xs text-neutral-400">
            <span>Scope</span>
            <select
              className="border border-neutral-700 bg-black px-2 py-1 text-xs text-neutral-200 outline-none focus:border-white"
              value={scope}
              onChange={(event) => setScope(event.target.value as SchedulerScope)}
            >
              <option value="unassigned_only">Unassigned only</option>
              <option value="all_eligible">Replan all eligible</option>
            </select>
          </label>
          <button
            className="border border-neutral-600 px-3 py-1 text-xs text-neutral-200 hover:border-white disabled:opacity-40"
            disabled={applying || proposal.assignments.length === 0}
            type="button"
            onClick={() => void onApply()}
          >
            {applying ? "Applying…" : "Apply schedule"}
          </button>
        </div>
      </div>

      <p className="mt-3 text-sm text-neutral-400">{proposalSummary(proposal)}</p>
      {error ? <p className="mt-2 text-xs text-red-400">{error}</p> : null}

      {proposal.assignments.length > 0 ? (
        <button
          className="mt-2 text-xs text-neutral-500 underline hover:text-neutral-300"
          type="button"
          onClick={() => setExpanded((current) => !current)}
        >
          {expanded ? "Hide preview" : "Show preview"}
        </button>
      ) : null}

      {expanded && proposal.assignments.length > 0 ? (
        <ul className="mt-3 space-y-1 text-xs text-neutral-400">
          {proposal.assignments.map((assignment) => {
            const task = items.find((entry) => entry.id === assignment.taskId);
            const interval = items.find((entry) => entry.id === assignment.intervalId);
            const score = proposal.scores.find((entry) => entry.taskId === assignment.taskId);
            return (
              <li key={assignment.taskId}>
                {task?.title ?? assignment.taskId} → {interval?.title ?? assignment.intervalId}
                {score ? ` (relevance ${Math.round(score.relevance)})` : ""}
              </li>
            );
          })}
        </ul>
      ) : null}
    </section>
  );
}
