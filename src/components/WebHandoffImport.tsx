import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { parseWebHandoff, type WebHandoff } from "@shared/webHandoff";
import { useAtlasData } from "../context/AtlasDataContext";
import { useUndo, trackCreateUndo, trackCreateLinkUndo } from "../context/UndoContext";
import { atlasTaskBody, atlasTaskId } from "../services/webHandoff";
import { firstFeasibleWorkBlock } from "@shared/decisionSchedule";

export function WebHandoffImport() {
  const { items, itemsLoading, itemsError, links, createItem, createLink } = useAtlasData();
  const { push } = useUndo();
  const [handoff, setHandoff] = useState<WebHandoff | null>(null);
  const [targetId, setTargetId] = useState("");
  const [title, setTitle] = useState("");
  const [durationMinutes, setDurationMinutes] = useState("");
  const [intervalChoice, setIntervalChoice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState("");
  const existing = items.find((item) => item.id === targetId);
  const proposedDuration = Number(durationMinutes);
  const suggestedIntervalId = useMemo(
    () => handoff?.proposal && !existing && Number.isInteger(proposedDuration)
      ? firstFeasibleWorkBlock(items, links, proposedDuration)
      : null,
    [handoff, existing, proposedDuration, items, links]
  );
  const intervalId = intervalChoice ?? suggestedIntervalId ?? "";
  const alreadyLinked = !!existing && !!intervalId && links.some((link) => link.kind === "scheduled_in" && link.fromId === targetId && link.toId === intervalId);
  const intervals = useMemo(
    () => items.filter((item) => item.isInterval && item.intervalStatus !== "cancelled")
      .sort((a, b) => a.intervalStartsAt.localeCompare(b.intervalStartsAt)),
    [items]
  );

  async function load(file: File | undefined) {
    setHandoff(null);
    setTargetId("");
    setTitle("");
    setDurationMinutes("");
    setIntervalChoice(null);
    setResult("");
    setError("");
    if (!file) return;
    try {
      if (file.size > 16000) throw new Error("Handoff file is too large.");
      const parsed = parseWebHandoff(JSON.parse(await file.text()) as unknown);
      const id = await atlasTaskId(parsed);
      setHandoff(parsed);
      setTargetId(id);
      setTitle(parsed.proposal?.title ?? "");
      setDurationMinutes(parsed.proposal ? String(parsed.proposal.durationMinutes) : "");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not read handoff file.");
    }
  }

  async function apply() {
    if (!handoff || !targetId || itemsLoading || itemsError || busy) return;
    const clean = title.trim();
    if (!existing && !clean) {
      setError("Write a concrete task before applying the handoff.");
      return;
    }
    if (!existing && durationMinutes && (!Number.isInteger(proposedDuration) || proposedDuration < 3 || proposedDuration > 240)) {
      setError("Estimated duration must be 3–240 minutes.");
      return;
    }
    setBusy(true);
    setError("");
    setResult("");
    let createdTask = false;
    try {
      let taskId = existing?.id;
      if (existing && (!existing.isTask || !existing.body.startsWith(`Web intention ${handoff.source.id}\n`))) {
        throw new Error("The matching Atlas item is not this handoff's task. No changes were made.");
      }
      if (!taskId) {
        const created = await createItem(clean, {
          id: targetId,
          body: atlasTaskBody(handoff),
          isTask: true,
          ...(durationMinutes ? { expectedDurationMinutes: proposedDuration } : {})
        });
        taskId = created.id;
        createdTask = true;
        // Deleting the task also removes its scheduled_in link, so one Undo reverses the import.
        trackCreateUndo(push, taskId);
      }
      if (intervalId && !links.some((link) => link.kind === "scheduled_in" && link.fromId === taskId && link.toId === intervalId)) {
        const link = await createLink(taskId, intervalId, "scheduled_in");
        if (existing) trackCreateLinkUndo(push, link.id);
      }
      setResult(existing ? "Existing task linked to the chosen interval." : "Task created in Atlas.");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not apply handoff.";
      if (createdTask) setResult("Task created in Atlas; its calendar placement did not save.");
      setError(message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <details className="mt-6 rounded border border-neutral-800 p-4">
      <summary className="cursor-pointer text-sm text-neutral-300">Import an intention from the web</summary>
      <p className="mt-3 text-sm text-neutral-500">Choose a handoff exported from an active human intention. You decide the task and any calendar placement here.</p>
      <label className="mt-4 block text-xs text-neutral-400">
        Handoff file
        <input className="mt-2 block w-full text-sm" type="file" accept=".json,application/json" onChange={(event) => void load(event.target.files?.[0])} />
      </label>
      {handoff ? (
        <div className="mt-4 space-y-3 text-sm">
          <p className="text-neutral-400"><code>{handoff.source.id}</code> · exported {new Date(handoff.exportedAt).toLocaleString()}</p>
          <p className="whitespace-pre-wrap text-neutral-200">{handoff.source.text}</p>
          <p className="text-xs text-neutral-500">Decision source: {handoff.source.provenance}</p>
          {handoff.proposal ? (
            <p className="text-xs text-amber-200">Agent proposal · {handoff.proposal.reason} The task, estimate, and slot are editable before applying.</p>
          ) : null}
          {existing ? (
            <p className="text-amber-200">This intention already has an Atlas item: <Link className="underline" to={`/item/${targetId}`}>{existing.title}</Link>. Importing again will not make a second task or rewrite it.</p>
          ) : (
            <label className="block text-xs text-neutral-400">
              Concrete task
              <input className="mt-1 block w-full border border-neutral-700 bg-black px-3 py-2 text-sm text-white outline-none focus:border-white" value={title} placeholder="What will you do?" maxLength={240} onChange={(event) => setTitle(event.target.value)} />
            </label>
          )}
          {!existing ? (
            <label className="block text-xs text-neutral-400">
              Estimated minutes (optional)
              <input className="mt-1 block w-28 border border-neutral-700 bg-black px-3 py-2 text-sm text-white" type="number" min={3} max={240} step={1} value={durationMinutes} onChange={(event) => setDurationMinutes(event.target.value)} />
            </label>
          ) : null}
          <label className="block text-xs text-neutral-400">
            Place in an interval (optional)
            <select className="mt-1 block w-full border border-neutral-700 bg-black px-3 py-2 text-sm text-white" value={intervalId} onChange={(event) => setIntervalChoice(event.target.value)}>
              <option value="">Leave unscheduled</option>
              {intervals.map((interval) => <option key={interval.id} value={interval.id}>{interval.title} · {new Date(interval.intervalStartsAt).toLocaleString()}</option>)}
            </select>
          </label>
          {handoff.proposal && !existing ? (
            <p className="text-xs text-neutral-500">{suggestedIntervalId ? "Suggested: first future work block with estimated room, including Atlas’s 25% duration buffer. This handoff proposes only one task." : "No existing future work block has enough room. Create a block in Calendar or leave this task unscheduled."}</p>
          ) : null}
          <button className="border border-white px-4 py-2 text-sm disabled:opacity-40" disabled={busy || itemsLoading || !!itemsError || (!existing && !title.trim()) || (!!existing && (!intervalId || alreadyLinked))} type="button" onClick={() => void apply()}>
            {busy ? "Applying…" : existing ? "Link existing task" : "Create task in Atlas"}
          </button>
        </div>
      ) : null}
      {itemsError ? <p className="mt-3 text-sm text-red-400">Atlas cannot load tasks: {itemsError}</p> : null}
      {error ? <p className="mt-3 text-sm text-red-400" role="alert">{error}</p> : null}
      {result ? <p className="mt-3 text-sm text-green-300" role="status">{result} <Link className="underline" to={`/item/${targetId}`}>Open task</Link></p> : null}
    </details>
  );
}
