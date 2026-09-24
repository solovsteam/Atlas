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
    exportedAt: timestamp(handoff.exportedAt, "Export time")
  };
}
