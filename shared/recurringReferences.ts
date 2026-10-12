import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils.js";
import {
  itemFromDbRow,
  mergeItemPatch,
  type Item,
  type ItemPatch,
} from "./item";

// Identity and bookkeeping belong to the reference, never to field ownership.
export const GENERATED_FIELDS = [
  "title",
  "body",
  "isTask",
  "isDocumentation",
  "isInterval",
  "taskStatus",
  "expectedDurationMinutes",
  "taskDueAt",
  "taskFixedStartsAt",
  "taskFixedEndsAt",
  "parentTaskId",
  "manualRelevance",
  "tags",
  "completionRule",
  "documentationSchema",
  "documentationData",
  "intervalKind",
  "intervalStartsAt",
  "intervalEndsAt",
  "intervalStatus",
] as const;
export type GeneratedField = (typeof GENERATED_FIELDS)[number];
export type FieldPolicy = "strict" | "default" | "owned";
export type GeneratorRule = {
  kind: "generator";
  version: 1;
  text: string;
  source: string;
  compiledText: string;
  timeZone: string;
  from: string;
  until: string;
  status: "active" | "paused" | "deleted";
  policies: Partial<Record<GeneratedField, FieldPolicy>>;
  compilerRef?: string;
};
export type GeneratorSnapshot = {
  values: ItemPatch;
  policies: GeneratorRule["policies"];
  signature: string;
  generatorRevision: number;
  timeZone: string;
};
export type OccurrenceRule = {
  kind: "occurrence";
  version: 1;
  baseline: GeneratorSnapshot;
  overrides: ItemPatch;
  started: boolean;
  deleted: boolean;
  frozen?: ItemPatch;
  held?: GeneratorSnapshot;
};
export type RecurrenceView = {
  virtual: boolean;
  needsReview: boolean;
  reasons: string[];
  pinned: boolean;
  availableFrom?: string;
};

export function generatorRule(item: Item): GeneratorRule | null {
  const r = item.recurrenceState as GeneratorRule | null;
  return r?.kind === "generator" && r.version === 1 ? r : null;
}
export function occurrenceRule(item: Item): OccurrenceRule | null {
  const r = item.recurrenceState as OccurrenceRule | null;
  return r?.kind === "occurrence" && r.version === 1 ? r : null;
}
export function defaultGeneratorRule(
  timeZone: string,
  from: string,
): GeneratorRule {
  return {
    kind: "generator",
    version: 1,
    text: "",
    source: "",
    compiledText: "",
    timeZone,
    from,
    until: "",
    status: "paused",
    policies: {
      taskStatus: "owned",
      documentationData: "owned",
      intervalStatus: "owned",
    },
  };
}
export function validateGenerator(rule: GeneratorRule): void {
  if (
    !["active", "paused", "deleted"].includes(rule.status) ||
    typeof rule.text !== "string" ||
    rule.text.length > 4000 ||
    typeof rule.source !== "string" ||
    rule.source.length > 12000 ||
    typeof rule.compiledText !== "string"
  )
    throw new Error("Invalid generator rule");
  new Intl.DateTimeFormat("en", { timeZone: rule.timeZone });
  dateInput(rule.from);
  if (rule.until) {
    dateInput(rule.until);
    if (rule.until < rule.from)
      throw new Error("The end date is before the start date");
  }
  if (
    !rule.policies ||
    Object.entries(rule.policies).some(
      ([k, v]) =>
        !GENERATED_FIELDS.includes(k as GeneratedField) ||
        !["strict", "default", "owned"].includes(v),
    )
  )
    throw new Error("Invalid field ownership");
  if (
    rule.status === "active" &&
    (!rule.source || rule.compiledText !== rule.text)
  )
    throw new Error("Compile this repetition text before activating it");
}
export function policyFor(
  snapshot: Pick<GeneratorSnapshot, "policies">,
  field: GeneratedField,
): FieldPolicy {
  return snapshot.policies[field] ?? "default";
}
export function civilDate(instant: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(instant);
  const get = (name: string) => parts.find((p) => p.type === name)!.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}
export function dateInput(iso: string) {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(iso) ||
    new Date(iso + "T12:00:00Z").toISOString().slice(0, 10) !== iso
  )
    throw new Error("Invalid civil date");
  const d = new Date(iso + "T12:00:00Z");
  return {
    iso,
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
    weekday: d.getUTCDay(),
  };
}
export function addDays(iso: string, days: number): string {
  dateInput(iso);
  const d = new Date(iso + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
export function datesBetween(
  from: string,
  until: string,
  limit = 3660,
): string[] {
  dateInput(from);
  dateInput(until);
  const n = Math.round(
    (Date.parse(until + "T12:00:00Z") - Date.parse(from + "T12:00:00Z")) /
      86400000,
  );
  if (n < 0) return [];
  if (n >= limit)
    throw new Error(`Date range exceeds ${limit} days; shorten it`);
  return Array.from({ length: n + 1 }, (_, i) => addDays(from, i));
}
export function occurrenceId(generatorId: string, date: string): string {
  const h = bytesToHex(
    sha256(utf8ToBytes(`atlas-occurrence-v1:${generatorId}:${date}`)),
  ).slice(0, 32);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-8${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20)}`;
}

const TIME_FIELDS: GeneratedField[] = [
  "taskDueAt",
  "taskFixedStartsAt",
  "taskFixedEndsAt",
  "intervalStartsAt",
  "intervalEndsAt",
];
function localParts(instant: Date, timeZone: string) {
  const p = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(instant);
  const get = (k: string) => p.find((x) => x.type === k)!.value;
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}:${get("second")}`;
}
// Civil clocks keep their hour across DST. Missing spring clocks fail visibly;
// repeated autumn clocks choose the first instant, never a second occurrence.
export function atLocalClock(
  date: string,
  clock: string,
  timeZone: string,
): string {
  const wanted = `${date}T${clock}`;
  const utc = Date.parse(wanted + "Z");
  const offsets = new Set<number>();
  for (const delta of [-86400000, 0, 86400000]) {
    const probe = utc + delta;
    offsets.add(
      Date.parse(localParts(new Date(probe), timeZone) + "Z") - probe,
    );
  }
  const candidates = [...offsets]
    .map((o) => utc - o)
    .filter((t) => localParts(new Date(t), timeZone) === wanted)
    .sort((a, b) => a - b);
  if (!candidates.length)
    throw new Error(`The clock ${wanted} does not exist in ${timeZone}`);
  return new Date(candidates[0]).toISOString();
}
export function generatorSnapshot(
  generator: Item,
  date: string,
): GeneratorSnapshot {
  const rule = generatorRule(generator);
  if (!rule) throw new Error("Not a generator");
  const values: ItemPatch = {};
  for (const key of GENERATED_FIELDS)
    (values as Record<string, unknown>)[key] = generator[key];
  const anchor = [
    generator.intervalStartsAt,
    generator.taskFixedStartsAt,
    generator.taskDueAt,
  ].find(Boolean);
  const anchorDate = anchor
    ? civilDate(new Date(anchor), rule.timeZone)
    : rule.from;
  for (const key of TIME_FIELDS) {
    const value = generator[key] as string;
    if (!value) continue;
    const local = localParts(new Date(value), rule.timeZone);
    const dayOffset = Math.round(
      (Date.parse(local.slice(0, 10) + "T12:00:00Z") -
        Date.parse(anchorDate + "T12:00:00Z")) /
        86400000,
    );
    (values as Record<string, unknown>)[key] = atLocalClock(
      addDays(date, dayOffset),
      local.slice(11),
      rule.timeZone,
    );
  }
  return {
    values,
    policies: { ...rule.policies },
    generatorRevision: generator.revision,
    timeZone: rule.timeZone,
    signature: JSON.stringify([
      values,
      rule.policies,
      rule.text,
      rule.source,
      rule.from,
      rule.until,
      rule.timeZone,
    ]),
  };
}
export function emptyItem(id: string, ownerId: string): Item {
  return itemFromDbRow({
    id,
    owner_id: ownerId,
    title: "",
    body: "",
    is_task: false,
    task_status: "",
    manual_relevance: 0,
    tags: [],
    revision: 0,
    created_at: "",
    updated_at: "",
  });
}
export function newOccurrence(generator: Item, date: string): Item {
  const baseline = generatorSnapshot(generator, date);
  const rule: OccurrenceRule = {
    kind: "occurrence",
    version: 1,
    baseline,
    overrides: {},
    started: false,
    deleted: false,
  };
  return {
    ...emptyItem(occurrenceId(generator.id, date), generator.ownerId),
    createdAt: date + "T00:00:00Z",
    updatedAt: generator.updatedAt,
    generatedFromId: generator.id,
    occurrenceKey: date,
    recurrenceState: rule,
  };
}
function valuesFrom(
  snapshot: GeneratorSnapshot,
  overrides: ItemPatch,
): ItemPatch {
  const values: ItemPatch = {};
  for (const field of GENERATED_FIELDS) {
    const policy = policyFor(snapshot, field);
    if (policy !== "owned")
      (values as Record<string, unknown>)[field] = snapshot.values[field];
    if (policy !== "strict" && overrides[field] !== undefined)
      (values as Record<string, unknown>)[field] = overrides[field];
  }
  // Item-owned state starts with everyday defaults, never a generator's progress.
  if (values.isTask && values.taskStatus == null) values.taskStatus = "active";
  if (values.isInterval && !values.intervalStatus)
    values.intervalStatus = "scheduled";
  return values;
}
function anyTicked(value: unknown): boolean {
  if (value === true) return true;
  return (
    value !== null &&
    typeof value === "object" &&
    Object.values(value).some(anyTicked)
  );
}
export function resolveOccurrence(
  raw: Item,
  generator: Item | undefined,
  included = true,
): { item: Item; view: RecurrenceView } {
  const state = occurrenceRule(raw);
  if (!state)
    return {
      item: raw,
      view: { virtual: false, needsReview: false, reasons: [], pinned: false },
    };
  if (state.frozen || state.held)
    return {
      item: mergeItemPatch(
        raw,
        state.frozen ?? valuesFrom(state.held!, state.overrides),
      ),
      view: {
        virtual: raw.revision === 0,
        needsReview: false,
        reasons: [],
        pinned: Boolean(state.held),
        availableFrom: atLocalClock(
          raw.occurrenceKey,
          "00:00:00",
          (state.held ?? state.baseline).timeZone,
        ),
      },
    };
  let next = state.baseline;
  const reasons: string[] = [];
  if (generator) {
    next = generatorSnapshot(generator, raw.occurrenceKey);
    const changed = GENERATED_FIELDS.filter(
      (f) =>
        JSON.stringify(state.baseline.values[f]) !==
          JSON.stringify(next.values[f]) ||
        policyFor(state.baseline, f) !== policyFor(next, f),
    );
    const partial =
      state.started || anyTicked(state.overrides.documentationData);
    if (
      partial &&
      (changed.length ||
        !included ||
        next.signature !== state.baseline.signature)
    )
      reasons.push("This occurrence has work in progress.");
    for (const f of changed) {
      if (
        state.overrides[f] !== undefined &&
        (policyFor(next, f) === "strict" ||
          next.values[f] === "" ||
          next.values[f] === null)
      )
        reasons.push(`An individual ${f} would be taken over or removed.`);
    }
    if (!included && (Object.keys(state.overrides).length || raw.revision > 0))
      reasons.push("The new repetition rule excludes this changed occurrence.");
  }
  const needsReview = !state.frozen && !state.held && reasons.length > 0;
  const source = state.held ?? (needsReview ? state.baseline : next);
  const values = state.frozen ?? valuesFrom(source, state.overrides);
  return {
    item: mergeItemPatch(raw, values),
    view: {
      virtual: raw.revision === 0,
      needsReview,
      reasons,
      pinned: Boolean(state.held),
      availableFrom: atLocalClock(
        raw.occurrenceKey,
        "00:00:00",
        source.timeZone,
      ),
    },
  };
}
export function changeOccurrence(
  raw: Item,
  generator: Item | undefined,
  patch: ItemPatch,
  included = true,
): Item {
  const state = occurrenceRule(raw);
  if (!state) throw new Error("Not an occurrence");
  const { item, view } = resolveOccurrence(raw, generator, included);
  // Undo restores the exact reference state, including completion and policy.
  if (patch.recurrenceState !== undefined)
    return { ...raw, recurrenceState: patch.recurrenceState };
  if (view.needsReview)
    throw new Error(
      "Review the generator change before editing this occurrence",
    );
  const baseline =
    state.held ??
    (generator
      ? generatorSnapshot(generator, raw.occurrenceKey)
      : state.baseline);
  const overrides = { ...state.overrides };
  for (const field of GENERATED_FIELDS) {
    if (patch[field] === undefined) continue;
    if (!state.frozen && policyFor(baseline, field) === "strict")
      throw new Error(`${field} is defined by the generator`);
    (overrides as Record<string, unknown>)[field] = patch[field];
  }
  const next = mergeItemPatch(item, patch);
  const completed =
    next.taskStatus === "done" || next.intervalStatus === "completed";
  const frozen: ItemPatch = {};
  for (const f of GENERATED_FIELDS)
    (frozen as Record<string, unknown>)[f] = next[f];
  return {
    ...raw,
    recurrenceState: {
      ...state,
      baseline,
      overrides,
      started: patch.occurrenceStarted ?? state.started,
      frozen: completed ? frozen : undefined,
    },
    overriddenFields: Object.keys(overrides),
  };
}
export function reviewOccurrence(
  raw: Item,
  generator: Item,
  choice: "new" | "old" | "detach",
): Item {
  const state = occurrenceRule(raw);
  if (!state) throw new Error("Not an occurrence");
  const resolved = resolveOccurrence(raw, generator).item;
  if (choice === "detach")
    return {
      ...resolved,
      generatedFromId: "",
      occurrenceKey: "",
      recurrenceState: null,
      overriddenFields: [],
    };
  if (choice === "old")
    return { ...raw, recurrenceState: { ...state, held: state.baseline } };
  const baseline = generatorSnapshot(generator, raw.occurrenceKey);
  const overrides = { ...state.overrides };
  for (const f of GENERATED_FIELDS)
    if (
      policyFor(baseline, f) === "strict" ||
      baseline.values[f] === "" ||
      baseline.values[f] === null
    )
      delete overrides[f];
  return {
    ...raw,
    recurrenceState: { ...state, baseline, overrides, held: undefined },
    overriddenFields: Object.keys(overrides),
  };
}
