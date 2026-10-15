/** The bounded effect vocabulary. Unknown fields are rejected rather than silently ignored. */
export type BrainEditOperation =
  | { kind: "create_interval"; id: string; title: string; startsAt: string; endsAt: string }
  | { kind: "update_interval"; id: string; expectedRevision: number; title?: string; startsAt?: string; endsAt?: string }
  | { kind: "create_task"; id: string; title: string; durationMinutes: number }
  | { kind: "update_task"; id: string; expectedRevision: number; durationMinutes?: number; fixedStartsAt?: string | null; fixedEndsAt?: string | null }
  | { kind: "place_task"; taskId: string; expectedRevision: number; intervalId: string | null };

export type BrainEditPlan = {
  format: "brain-atlas.edits";
  version: 1;
  requestId: string;
  reason: string;
  operations: BrainEditOperation[];
};

export type BrainEditPreview = {
  previewId: string;
  requestId: string;
  planDigest: string;
  contextDigest: string;
  createdAt: string;
  expiresAt: string;
  changes: unknown;
};

export type BrainEditReceipt = {
  requestId: string;
  planDigest: string;
  appliedAt: string;
  beforeItems: (Record<string, unknown> | null)[];
  afterItems: Record<string, unknown>[];
  beforeLinks: Record<string, unknown>[];
  afterLinks: Record<string, unknown>[];
  plan: BrainEditPlan;
};

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Expected an edit object");
  return value as Record<string, unknown>;
}
function exactKeys(value: Record<string, unknown>, keys: string[]) {
  if (Object.keys(value).some((key) => !keys.includes(key))) throw new Error("Unknown edit field");
}
function text(value: unknown, max: number): string {
  if (typeof value !== "string" || !value.trim() || value.length > max) throw new Error("Missing or oversized edit text");
  return value;
}
function uuid(value: unknown): string {
  const result = text(value, 36);
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(result)) throw new Error("Invalid edit item ID");
  return result;
}
function time(value: unknown): string {
  const result = text(value, 50);
  if (!/^\d{4}-\d\d-\d\dT\d\d:\d\d(?::\d\d(?:\.\d+)?)?(?:Z|[+-]\d\d:\d\d)$/.test(result) || !Number.isFinite(Date.parse(result))) throw new Error("Edit times need an explicit timezone");
  return result;
}
function integer(value: unknown, min: number, max: number): number {
  if (!Number.isInteger(value) || Number(value) < min || Number(value) > max) throw new Error("Edit number outside allowed range");
  return Number(value);
}

export function parseBrainEditPlan(value: unknown): BrainEditPlan {
  const plan = object(value);
  exactKeys(plan, ["format", "version", "requestId", "reason", "operations"]);
  if (plan.format !== "brain-atlas.edits" || plan.version !== 1 || !Array.isArray(plan.operations) || plan.operations.length < 1 || plan.operations.length > 64) throw new Error("Unsupported or oversized edit plan");
  const operations = plan.operations.map((raw): BrainEditOperation => {
    const op = object(raw);
    if (op.kind === "create_interval") {
      exactKeys(op, ["kind", "id", "title", "startsAt", "endsAt"]);
      return { kind: op.kind, id: uuid(op.id), title: text(op.title, 500), startsAt: time(op.startsAt), endsAt: time(op.endsAt) };
    }
    if (op.kind === "create_task") {
      exactKeys(op, ["kind", "id", "title", "durationMinutes"]);
      return { kind: op.kind, id: uuid(op.id), title: text(op.title, 500), durationMinutes: integer(op.durationMinutes, 1, 1440) };
    }
    if (op.kind === "place_task") {
      exactKeys(op, ["kind", "taskId", "expectedRevision", "intervalId"]);
      return { kind: op.kind, taskId: uuid(op.taskId), expectedRevision: integer(op.expectedRevision, 0, 2147483646), intervalId: op.intervalId === null ? null : uuid(op.intervalId) };
    }
    if (op.kind === "update_interval") {
      exactKeys(op, ["kind", "id", "expectedRevision", "title", "startsAt", "endsAt"]);
      if (!["title", "startsAt", "endsAt"].some((key) => key in op)) throw new Error("Empty interval edit");
      return { kind: op.kind, id: uuid(op.id), expectedRevision: integer(op.expectedRevision, 0, 2147483646), ...(op.title !== undefined ? { title: text(op.title, 500) } : {}), ...(op.startsAt !== undefined ? { startsAt: time(op.startsAt) } : {}), ...(op.endsAt !== undefined ? { endsAt: time(op.endsAt) } : {}) };
    }
    if (op.kind === "update_task") {
      exactKeys(op, ["kind", "id", "expectedRevision", "durationMinutes", "fixedStartsAt", "fixedEndsAt"]);
      if (!["durationMinutes", "fixedStartsAt", "fixedEndsAt"].some((key) => key in op)) throw new Error("Empty task edit");
      return { kind: op.kind, id: uuid(op.id), expectedRevision: integer(op.expectedRevision, 0, 2147483646), ...(op.durationMinutes !== undefined ? { durationMinutes: integer(op.durationMinutes, 1, 1440) } : {}), ...(op.fixedStartsAt !== undefined ? { fixedStartsAt: op.fixedStartsAt === null ? null : time(op.fixedStartsAt) } : {}), ...(op.fixedEndsAt !== undefined ? { fixedEndsAt: op.fixedEndsAt === null ? null : time(op.fixedEndsAt) } : {}) };
    }
    throw new Error("Unknown edit operation");
  });
  return { format: "brain-atlas.edits", version: 1, requestId: text(plan.requestId, 160), reason: text(plan.reason, 4000), operations };
}
