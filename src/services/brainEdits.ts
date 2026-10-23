import type { SupabaseClient } from "@supabase/supabase-js";
import { parseBrainEditPlan, type BrainEditPreview, type BrainEditReceipt } from "../../shared/brainEdits";
import type { Database, DbItemRow, DbItemLinkRow } from "../types/database";
import { itemFromDbRow } from "../../shared/item";
import { linkFromDbRow } from "../../shared/links";
import { projectItems } from "./recurrence";
import { proposeSchedule } from "./scheduling";

type Client = SupabaseClient<Database>;
export class BrainEditError extends Error {
  constructor(message: string, public readonly uncertain: boolean) { super(message); }
}

async function account(client: Client) {
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) throw new BrainEditError("Atlas sign-in is unavailable", false);
  return data.user.id;
}

// The database rejects every stale or foreign preview in the same transaction
// that writes its receipt. Transport failures must never become a new request.
async function rpc(client: Client, name: keyof Database["public"]["Functions"], args: Record<string, unknown>, writes: boolean): Promise<unknown> {
  await account(client);
  try {
    const result = await client.rpc(name, args as never);
    if (result.error) {
      const knownRefusal = result.error.code === "P0001" || result.error.code?.startsWith("22") || result.error.code?.startsWith("23") || result.error.code?.startsWith("42") || result.error.code?.startsWith("PGRST");
      throw new BrainEditError(result.error.message, writes && !knownRefusal);
    }
    return result.data;
  } catch (error) {
    if (error instanceof BrainEditError) throw error;
    throw new BrainEditError(error instanceof Error ? error.message : "Atlas transport failed", writes);
  }
}

export async function getBrainEditContext(client: Client) {
  const ownerId = await account(client);
  async function rows(table: "items" | "item_links", max: number) {
    const result: (DbItemRow | DbItemLinkRow)[] = [];
    for (let offset = 0; ; offset += 500) {
      const { data, error } = await client.from(table).select("*").eq("owner_id", ownerId).order("id").range(offset, offset + 499);
      if (error) throw new BrainEditError(error.message, false);
      result.push(...((data ?? []) as unknown as (DbItemRow | DbItemLinkRow)[]));
      // Supabase's default row limit must never silently truncate the planner's
      // view of appointments. Page completely or surface an explicit blocker.
      if (result.length > max) throw new BrainEditError("Atlas context exceeds the bounded planner limit", false);
      if (!data || data.length < 500) return result;
    }
  }
  const [rawItems, rawLinks] = await Promise.all([rows("items", 2000), rows("item_links", 4000)]);
  const items = await projectItems(rawItems.map((row) => itemFromDbRow(row as DbItemRow)));
  const links = rawLinks.map((row) => linkFromDbRow(row as DbItemLinkRow));
  if (items.length > 4000) throw new BrainEditError("Recurring context exceeds the bounded planner limit", false);
  const schedulingLinks = links.filter(link => link.kind === "scheduled_in");
  const now = new Date();
  const context = {
    ownerId, generatedAt: now.toISOString(), timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    editContract: {
      format: "brain-atlas.edits", version: 1, requestId: "Stable unique string (1–160 chars); never reuse for a different plan", reason: "Why this follows the human's instruction (1–4000 chars)",
      operations: {
        create_interval: { id: "New stable UUID", title: "1–500 chars", startsAt: "ISO timestamp with explicit offset", endsAt: "ISO timestamp with explicit offset" },
        update_interval: { id: "Existing interval UUID", expectedRevision: "Current revision", title: "Optional", startsAt: "Optional offset timestamp", endsAt: "Optional offset timestamp" },
        create_task: { id: "New stable UUID", title: "1–500 chars", durationMinutes: "Integer 1–1440" },
        update_task: { id: "Existing active task UUID", expectedRevision: "Current revision", durationMinutes: "Optional integer 1–1440", fixedStartsAt: "Optional offset timestamp or null", fixedEndsAt: "Optional offset timestamp or null" },
        place_task: { taskId: "Existing active task UUID, or task created earlier in this plan", expectedRevision: "Current revision; 0 if created in this plan", intervalId: "Existing interval UUID, interval created earlier in this plan, or null to unschedule" },
        archive_interval: { id: "Existing active interval UUID", expectedRevision: "Current revision; tasks placed in it are unscheduled, nothing is deleted" },
        set_task_status: { id: "Existing task UUID", expectedRevision: "Current revision", status: "active | done | cancelled" }
      },
      constraints: ["1–64 operations; unknown fields rejected", "One item edit and one placement per item; all existing-item expectedRevision values refer to the original context", "Create interval/task before any placement referencing it", "Ranges need both ends, positive duration at most 24 hours, start in next 90 days", "No new interval/appointment overlaps; placements respect deadlines, appointments and capacity", "Recurring generators/occurrences require review and cannot be edited here", "No arbitrary content/status/account edits or task deletion", "Account inferred from signed-in Atlas session only; never put owner/account in a plan", "A changed context or expired ten-minute preview refuses apply", "On uncertain apply, look up the same request's durable receipt; never create a replacement request or replay individual writes"],
      scheduler: { strategy: "delta_cost_switch", durationBuffer: 1.25, defaultDurationMinutes: 30, horizonDays: 21, note: "schedulerPreview below is computed by Atlas's real deterministic engine. Preserve existing placements unless the human's instruction requires changes. Existing nominal routine buffer deficits may remain but cannot worsen." }
    },
    items: items.filter(item => item.isTask || item.isInterval).map(item => ({
      id: item.id, title: item.title, body: item.body.slice(0, 2000), revision: item.revision,
      isTask: item.isTask, taskStatus: item.taskStatus, expectedDurationMinutes: item.expectedDurationMinutes,
      taskDueAt: item.taskDueAt, taskFixedStartsAt: item.taskFixedStartsAt, taskFixedEndsAt: item.taskFixedEndsAt,
      manualRelevance: item.manualRelevance, parentTaskId: item.parentTaskId, tags: item.tags,
      isInterval: item.isInterval, intervalKind: item.intervalKind, intervalStatus: item.intervalStatus,
      intervalStartsAt: item.intervalStartsAt, intervalEndsAt: item.intervalEndsAt,
      createdAt: item.createdAt, updatedAt: item.updatedAt,
      recurring: Boolean(item.recurrenceState || item.generatedFromId), recurrenceNeedsReview: Boolean(item.recurrenceView?.needsReview)
    })),
    links: schedulingLinks,
    schedulerPreview: proposeSchedule(items, now, "delta_cost_switch", { links: schedulingLinks })
  };
  if (new TextEncoder().encode(JSON.stringify(context)).byteLength > 2 * 1024 * 1024) throw new BrainEditError("Atlas scheduling context exceeds 2 MiB", false);
  return context;
}

export async function previewBrainEdits(client: Client, rawPlan: unknown) {
  return await rpc(client, "atlas_preview_brain_edits", { p_plan: parseBrainEditPlan(rawPlan) }, false) as BrainEditPreview | { alreadyApplied: true; receipt: BrainEditReceipt };
}
export async function applyBrainEditPreview(client: Client, previewId: string) {
  return await rpc(client, "atlas_apply_brain_edit_preview", { p_preview_id: previewId }, true) as BrainEditReceipt;
}
export async function getBrainEditReceipt(client: Client, requestId: string) {
  return await rpc(client, "atlas_get_brain_edit_receipt", { p_request_id: requestId }, false) as BrainEditReceipt | null;
}
export async function getBrainEditFeedback(client: Client, requestId: string) {
  return rpc(client, "atlas_get_brain_edit_feedback", { p_request_id: requestId }, false);
}
export async function undoBrainEdits(client: Client, requestId: string, undoRequestId: string) {
  return await rpc(client, "atlas_undo_brain_edits", { p_request_id: requestId, p_undo_request_id: undoRequestId }, true) as BrainEditReceipt;
}
