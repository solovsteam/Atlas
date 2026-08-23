import type { SupabaseClient } from "@supabase/supabase-js";
import type { Item } from "@shared/item";
import type { ItemLink } from "@shared/links";
import { scheduledIntervalForTask } from "@shared/links";
import {
  algorithmRelevanceEnricher,
  buildSchedulingContext,
  runScheduler,
  type ScheduleLinkChange,
  type ScheduleProposal,
  type SchedulerConfig,
  DEFAULT_SCHEDULER_CONFIG
} from "@shared/scheduling";
import type { Database } from "../types/database";
import { replaceScheduledInLink } from "./links";

type Client = SupabaseClient<Database>;

export function proposeSchedule(
  items: Item[],
  links: ItemLink[],
  config: Partial<SchedulerConfig> = {},
  now: Date = new Date()
): ScheduleProposal {
  const mergedConfig = { ...DEFAULT_SCHEDULER_CONFIG, ...config };
  const ctx = buildSchedulingContext(items, links, now, mergedConfig);
  return runScheduler(ctx, [algorithmRelevanceEnricher], mergedConfig);
}

export function scheduleLinkChangesForProposal(
  proposal: ScheduleProposal,
  links: ItemLink[]
): ScheduleLinkChange[] {
  return proposal.assignments.map((assignment) => ({
    taskId: assignment.taskId,
    beforeIntervalId: scheduledIntervalForTask(links, assignment.taskId),
    afterIntervalId: assignment.intervalId
  }));
}

export async function applyScheduleLinkChanges(
  client: Client,
  userId: string,
  changes: ScheduleLinkChange[],
  links: ItemLink[]
): Promise<ItemLink[]> {
  let nextLinks = links;

  for (const change of changes) {
    nextLinks = await replaceScheduledInLink(
      client,
      userId,
      change.taskId,
      change.afterIntervalId,
      nextLinks
    );
  }

  return nextLinks;
}

export async function applyScheduleProposal(
  client: Client,
  userId: string,
  proposal: ScheduleProposal,
  links: ItemLink[]
): Promise<{ links: ItemLink[]; changes: ScheduleLinkChange[] }> {
  const changes = scheduleLinkChangesForProposal(proposal, links);
  const nextLinks = await applyScheduleLinkChanges(client, userId, changes, links);
  return { links: nextLinks, changes };
}

export async function revertScheduleLinkChanges(
  client: Client,
  userId: string,
  changes: ScheduleLinkChange[],
  links: ItemLink[]
): Promise<ItemLink[]> {
  let nextLinks = links;

  for (const change of changes) {
    nextLinks = await replaceScheduledInLink(
      client,
      userId,
      change.taskId,
      change.beforeIntervalId,
      nextLinks
    );
  }

  return nextLinks;
}
