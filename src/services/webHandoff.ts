import type { WebHandoff } from "@shared/webHandoff";
import type { SchemaScheduleAction } from "@shared/schemaSchedule";

// Stable for one web intention, even when the handoff is downloaded again.
// UUIDv8 marks the SHA-256-derived identifier as an application-defined UUID.
export async function atlasTaskId(handoff: WebHandoff): Promise<string> {
  const identity = `schema-web.atlas-handoff/v1\n${handoff.source.id}\n${handoff.source.createdAt}${handoff.proposal?.actionId ? `\n${handoff.proposal.actionId}` : ""}`;
  return deterministicTaskId(identity);
}

export async function atlasTaskIdForAction(action: SchemaScheduleAction): Promise<string> {
  const identity = `schema-atlas.schedule-plan/v1\n${action.intention.id}\n${action.intention.createdAt}\n${action.actionId}`;
  return deterministicTaskId(identity);
}

async function deterministicTaskId(identity: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(identity)));
  const bytes = digest.slice(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x80;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function atlasTaskBody(handoff: WebHandoff): string {
  return [
    `Web intention ${handoff.source.id}`,
    `Intention: ${handoff.source.text}`,
    `Decision source: ${handoff.source.provenance}`,
    `Exported: ${handoff.exportedAt}`,
    ...(handoff.proposal ? [
      `Agent suggestion (${handoff.proposal.policy}): ${handoff.proposal.title} (${handoff.proposal.durationMinutes} min)`,
      `Suggestion reason: ${handoff.proposal.reason}`,
      `Proposal schemas: ${handoff.proposal.schemaIds.join(", ")}`,
      ...(handoff.proposal.actionId ? [`Action ID: ${handoff.proposal.actionId}`] : []),
      ...(handoff.proposal.schemaRunId ? [`Schema run: ${handoff.proposal.schemaRunId}`] : [])
    ] : [])
  ].join("\n\n");
}
