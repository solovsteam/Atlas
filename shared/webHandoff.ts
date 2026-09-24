export type WebHandoff = {
  format: "schema-web.atlas-handoff";
  version: 1;
  requestedAction: "review-task";
  source: {
    kind: "human-intention";
    status: "active";
    id: string;
    createdAt: string;
    text: string;
    provenance: string;
  };
  exportedAt: string;
  proposal?: {
    origin: "agent";
    policy: "one-action-existing-block-v1";
    actionId?: string;
    schemaRunId?: string;
    title: string;
    durationMinutes: number;
    reason: string;
    schemaIds: string[];
  };
};

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("This is not a web handoff file.");
  }
  return value as Record<string, unknown>;
}

function text(value: unknown, name: string, max: number): string {
  if (typeof value !== "string" || !value.trim() || value.length > max) {
    throw new Error(`${name} is missing or too long.`);
  }
  return value;
}

function timestamp(value: unknown, name: string): string {
  const parsed = text(value, name, 40);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(parsed) || !Number.isFinite(Date.parse(parsed))) {
    throw new Error(`${name} is not a timestamp.`);
  }
  return parsed;
}

export function parseWebHandoff(value: unknown): WebHandoff {
  const handoff = record(value);
  if (handoff.format !== "schema-web.atlas-handoff" || handoff.version !== 1 || handoff.requestedAction !== "review-task") {
    throw new Error("Unsupported web handoff format.");
  }
  const source = record(handoff.source);
  if (source.kind !== "human-intention" || source.status !== "active") {
    throw new Error("Only a human intention can request an Atlas task.");
  }
  const id = text(source.id, "Intention ID", 20);
  if (!/^I-[a-f0-9]{8}$/.test(id)) {
    throw new Error("Invalid intention ID.");
  }
  let proposal: WebHandoff["proposal"];
  if (handoff.proposal !== undefined) {
    const raw = record(handoff.proposal);
    if (raw.origin !== "agent" || raw.policy !== "one-action-existing-block-v1") {
      throw new Error("Unsupported action proposal.");
    }
    if (typeof raw.durationMinutes !== "number" || !Number.isInteger(raw.durationMinutes) || raw.durationMinutes < 3 || raw.durationMinutes > 240) {
      throw new Error("Proposed duration must be 3–240 minutes.");
    }
    if (!Array.isArray(raw.schemaIds) || raw.schemaIds.length < 1 || raw.schemaIds.length > 4 || !raw.schemaIds.every((id) => typeof id === "string" && /^J-[a-f0-9]{8}$/.test(id))) {
      throw new Error("Proposal must cite 1–4 agent schema IDs.");
    }
    if (raw.actionId !== undefined && (typeof raw.actionId !== "string" || !/^A-[A-Za-z0-9-]{1,70}$/.test(raw.actionId))) {
      throw new Error("Invalid action ID.");
    }
    if (raw.schemaRunId !== undefined && (typeof raw.schemaRunId !== "string" || !/^R-[a-f0-9]{32}$/.test(raw.schemaRunId))) {
      throw new Error("Invalid schema run ID.");
    }
    proposal = {
      origin: "agent",
      policy: "one-action-existing-block-v1",
      ...(typeof raw.actionId === "string" ? { actionId: raw.actionId } : {}),
      ...(typeof raw.schemaRunId === "string" ? { schemaRunId: raw.schemaRunId } : {}),
      title: text(raw.title, "Proposed task", 240),
      durationMinutes: raw.durationMinutes,
      reason: text(raw.reason, "Proposal reason", 1000),
      schemaIds: raw.schemaIds as string[]
    };
  }
  return {
    format: "schema-web.atlas-handoff",
    version: 1,
    requestedAction: "review-task",
    source: {
      kind: "human-intention",
      status: "active",
      id,
      createdAt: timestamp(source.createdAt, "Intention creation time"),
      text: text(source.text, "Intention", 2000),
      provenance: text(source.provenance, "Intention source", 1000)
    },
    exportedAt: timestamp(handoff.exportedAt, "Export time"),
    ...(proposal ? { proposal } : {})
  };
}
