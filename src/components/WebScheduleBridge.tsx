import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { SchemaSchedulePlan, SchemaScheduleRun, ScheduleRunBaseline } from "@shared/schemaSchedule";
import { parseSchemaSchedulePlan } from "@shared/schemaSchedule";
import { useAtlasData } from "../context/AtlasDataContext";
import { trackCreateLinkUndo, trackCreateUndo, useUndo } from "../context/UndoContext";
import { supabase } from "../lib/supabase";
import { fetchOwnedItems } from "../services/items";
import { fetchOwnedLinks } from "../services/links";
import { proposeSchedule } from "../services/scheduling";
import { atlasTaskIdForAction } from "../services/webHandoff";
import { createSchemaScheduleRun, fetchSchemaScheduleRuns, findSchemaScheduleRun, updateSchemaScheduleRun } from "../services/schemaScheduleRuns";
import { buildAtlasScheduleFeedback } from "../services/brainTools";

async function digest(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  const hash = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return Array.from(hash, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function WebScheduleBridge() {
  const { userId, items, itemsLoading, itemsError, links, createItem, createLink } = useAtlasData();
  const { push } = useUndo();
  const [plan, setPlan] = useState<SchemaSchedulePlan | null>(null);
  const [runs, setRuns] = useState<SchemaScheduleRun[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!userId) return;
    void fetchSchemaScheduleRuns(supabase, userId).then(setRuns).catch((err: unknown) => setError(err instanceof Error ? err.message : "Could not load schedule runs."));
  }, [userId]);

  async function load(file: File | undefined) {
    setPlan(null);
    setMessage("");
    setError("");
    if (!file) return;
    try {
      if (file.size > 64000) throw new Error("Schedule plan file is too large.");
      setPlan(parseSchemaSchedulePlan(JSON.parse(await file.text()) as unknown));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not read schedule plan.");
    }
  }

  async function generate() {
    if (!plan || !userId || busy || itemsLoading || itemsError) return;
    setBusy(true);
    setError("");
    setMessage("");
    let run: SchemaScheduleRun | null = null;
    const baseline: ScheduleRunBaseline = { actions: [], appliedAt: new Date().toISOString() };
    try {
      const planDigest = await digest(plan);
      run = await findSchemaScheduleRun(supabase, userId, plan.schemaRunId);
      if (run && run.planDigest !== planDigest) throw new Error("This schema run ID already has a different plan. Return to Codex and create a new schedule run.");
      if (run?.status === "applied") {
        setMessage("This schema run is already in Atlas. No duplicate tasks were created.");
        return;
      }
      if (!run) run = await createSchemaScheduleRun(supabase, userId, { schemaRunId: plan.schemaRunId, planDigest, plan });
      setRuns((current) => [run!, ...current.filter((entry) => entry.id !== run!.id)]);

      const workingItems = await fetchOwnedItems(supabase, userId);
      const taskIds: string[] = [];
      for (const action of plan.actions) {
        const id = await atlasTaskIdForAction(action);
        const prior = workingItems.find((item) => item.id === id);
        if (prior) {
          if (!prior.isTask || !prior.body.includes(`Schema action ${action.actionId}`)) throw new Error(`Atlas item ${id} exists but does not belong to this schema action.`);
        } else {
          const body = [
            `Schema schedule run ${run.id}`,
            `Schema run ${plan.schemaRunId}`,
            `Schema action ${action.actionId}`,
            `Intention ${action.intention.id}: ${action.intention.text}`,
            `Decision source: ${action.intention.provenance}`,
            `Agent proposal: ${action.reason}`,
            `Proposal schemas: ${action.schemaIds.join(", ")}`,
            `Estimated duration: ${action.durationMinutes} minutes (provisional)`
          ].join("\n\n");
          await createItem(action.title, { id, body, isTask: true, expectedDurationMinutes: action.durationMinutes });
          trackCreateUndo(push, id);
        }
        taskIds.push(id);
      }

      const currentItems = await fetchOwnedItems(supabase, userId);
      const currentLinks = await fetchOwnedLinks(supabase, userId);
      const schedule = proposeSchedule(currentItems, new Date(), "delta_cost_switch", { links: currentLinks, taskIds });
      const intervalByTask = new Map(schedule.assignments.map((assignment) => [assignment.taskId, assignment.intervalId]));
      const unassignedReason = new Map(schedule.unassigned.map((entry) => [entry.taskId, entry.reason]));
      for (const [taskId, intervalId] of intervalByTask) {
        if (currentLinks.some((link) => link.kind === "scheduled_in" && link.fromId === taskId && link.toId === intervalId)) continue;
        const created = await createLink(taskId, intervalId, "scheduled_in");
        trackCreateLinkUndo(push, created.id);
        currentLinks.push(created);
      }

      for (let index = 0; index < plan.actions.length; index += 1) {
        const action = plan.actions[index]!;
        const taskId = taskIds[index]!;
        const task = currentItems.find((item) => item.id === taskId);
        const linkedIntervalId = currentLinks.find((link) => link.kind === "scheduled_in" && link.fromId === taskId)?.toId ?? null;
        const currentIntervalId = intervalByTask.get(taskId) ?? linkedIntervalId;
        const interval = currentIntervalId ? currentItems.find((item) => item.id === currentIntervalId && item.isInterval) : undefined;
        baseline.actions.push({
          actionId: action.actionId,
          taskId,
          title: task?.title ?? action.title,
          body: task?.body ?? "",
          durationMinutes: task?.expectedDurationMinutes ?? action.durationMinutes,
          manualRelevance: task?.manualRelevance ?? 0,
          dueAt: task?.taskDueAt ?? "",
          fixedStartsAt: task?.taskFixedStartsAt ?? "",
          fixedEndsAt: task?.taskFixedEndsAt ?? "",
          plannedIntervalId: currentIntervalId,
          unassignedReason: unassignedReason.get(taskId) ?? null,
          taskRevision: task?.revision ?? 0,
          taskStatus: task?.taskStatus ?? null,
          plannedInterval: interval ? {
            id: interval.id,
            title: interval.title,
            kind: interval.intervalKind,
            status: interval.intervalStatus,
            startsAt: interval.intervalStartsAt,
            endsAt: interval.intervalEndsAt,
            revision: interval.revision
          } : null
        });
      }
      baseline.appliedAt = new Date().toISOString();
      run = await updateSchemaScheduleRun(supabase, userId, run.id, { baseline, status: "applied" });
      setRuns((current) => [run!, ...current.filter((entry) => entry.id !== run!.id)]);
      const placedCount = baseline.actions.filter((action) => action.plannedIntervalId !== null).length;
      setMessage(`${plan.actions.length} proposed task${plan.actions.length === 1 ? "" : "s"} processed; ${placedCount} placed into Atlas work blocks. Undo can reverse each created task and placement.`);
      setPlan(null);
    } catch (err) {
      const reason = err instanceof Error ? err.message : "Could not generate the schedule.";
      setError(reason);
      if (run) {
        try {
          const failed = await updateSchemaScheduleRun(supabase, userId, run.id, { baseline, status: "failed" });
          setRuns((current) => [failed, ...current.filter((entry) => entry.id !== failed.id)]);
        } catch {
          // Keep the original error visible; a retry remains idempotent by action ID.
        }
      }
    } finally {
      setBusy(false);
    }
  }

  function exportFeedback(run: SchemaScheduleRun) {
    const feedback = buildAtlasScheduleFeedback(run, items, links);
    const url = URL.createObjectURL(new Blob([JSON.stringify(feedback, null, 2)], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `atlas-schedule-feedback-${run.id}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }

  return (
    <div className="mb-8 rounded border border-neutral-800 p-4">
      <p className="mb-2 text-xs uppercase tracking-wide text-neutral-500">Schema generated schedule</p>
      <p className="mb-4 text-sm text-neutral-400">Import a finite candidate set from Codex. Atlas schedules only those tasks against your current blocks, appointments, and existing placements, within the plan horizon or Atlas’s 21-day default. Review or edit the result in this calendar, then export a plan-versus-current receipt to discuss in Codex.</p>
      <p className="-mt-2 mb-4 text-xs text-neutral-500">Run history requires Atlas Supabase migration `009_schema_schedule_runs.sql`.</p>
      <label className="block text-xs text-neutral-400">Schedule plan JSON
        <input className="mt-2 block w-full text-sm" type="file" accept=".json,application/json" onChange={(event) => void load(event.target.files?.[0])} />
      </label>
      {plan ? <div className="mt-3 space-y-2 text-sm">
        <p><code>{plan.schemaRunId}</code> · {plan.actions.length} proposed actions · {plan.horizonDays ?? 21}-day horizon{plan.horizonDays === undefined ? " (Atlas default)" : ""}</p>
        <ul className="list-disc pl-5 text-neutral-300">{plan.actions.map((action) => <li key={action.actionId}>{action.title} · {action.durationMinutes}m · {action.actionId}</li>)}</ul>
        <button className="border border-white px-3 py-1.5 text-xs disabled:opacity-50" type="button" disabled={busy || itemsLoading || !!itemsError || !userId} onClick={() => void generate()}>{busy ? "Generating…" : "Generate and apply schedule"}</button>
      </div> : null}
      {itemsError ? <p className="mt-3 text-sm text-red-400">Atlas cannot load schedule data: {itemsError}</p> : null}
      {error ? <p className="mt-3 text-sm text-red-400" role="alert">{error}</p> : null}
      {message ? <p className="mt-3 text-sm text-green-300" role="status">{message}</p> : null}
      {runs.length ? <div className="mt-5 border-t border-neutral-800 pt-3">
        <p className="mb-2 text-xs uppercase tracking-wide text-neutral-500">Schedule runs</p>
        <ul className="space-y-3 text-xs">{runs.map((run, index) => <li className="border-b border-neutral-900 pb-3" key={run.id}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span><code>{run.id}</code> · {run.status} · {run.baseline.actions.length} actions</span>
            <button className="border border-neutral-700 px-2 py-1 text-neutral-300 hover:border-white" type="button" disabled={run.status !== "applied"} onClick={() => exportFeedback(run)}>Export feedback for Codex</button>
          </div>
          {run.baseline.actions.length ? <details className="mt-2" open={index === 0}>
            <summary className="cursor-pointer text-neutral-500">Tasks and current placements</summary>
            <ul className="mt-2 space-y-2 pl-3 text-neutral-300">{run.baseline.actions.map((baseline) => {
              const task = items.find((item) => item.id === baseline.taskId);
              const intervalId = links.find((entry) => entry.kind === "scheduled_in" && entry.fromId === baseline.taskId)?.toId;
              const interval = intervalId ? items.find((item) => item.id === intervalId) : undefined;
              const action = run.plan.actions.find((entry) => entry.actionId === baseline.actionId);
              return <li key={baseline.actionId}>
                <Link className="underline decoration-neutral-700 hover:text-white" to={`/item/${baseline.taskId}`}>{task?.title ?? baseline.title}</Link>
                <span className="text-neutral-500"> · {task?.expectedDurationMinutes ?? baseline.durationMinutes}m</span>
                <span className="text-neutral-500"> → </span>
                {interval ? <Link className="underline decoration-neutral-700 hover:text-white" to={`/item/${interval.id}`}>{interval.title || "Work block"}</Link> : <span className="text-neutral-500">unscheduled</span>}
                {task?.taskStatus === "done" ? <span className="text-neutral-500"> · done</span> : null}
                {!interval && baseline.unassignedReason ? <span className="text-neutral-500"> · {unassignedLabel(baseline.unassignedReason)}</span> : null}
                {action?.reason ? <p className="mt-0.5 max-w-2xl text-neutral-500">{action.reason}</p> : null}
              </li>;
            })}</ul>
          </details> : null}
        </li>)}</ul>
        <p className="mt-2 text-[11px] text-neutral-500">The export records task moves, removals, status and duration edits, work-block changes, and tasks added after the run. It does not infer why. Attach it in Codex, explain what was wrong, and ask the feedback-review schema to assess it.</p>
      </div> : null}
      {runs.some((run) => run.status === "applying") ? <p className="mt-2 text-xs text-amber-300">A previous run may be incomplete. Reimport the same plan to retry it safely.</p> : null}
    </div>
  );
}

function unassignedLabel(reason: string): string {
  switch (reason) {
    case "quick": return "short task; calendar placement skipped";
    case "missing_info": return "missing scheduling information";
    case "no_feasible_interval": return "no work block has enough capacity";
    case "excluded": return "fixed appointment";
    default: return reason;
  }
}
