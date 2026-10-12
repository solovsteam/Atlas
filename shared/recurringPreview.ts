/** Pure, bounded routine preview. No calendar effects or implicit duration defaults. */
export const RECURRING_PREVIEW_VERSION = "atlas.recurring-preview/v1";

export type RoutineInput = { label: string; value: string | number | null; placeholder?: string | number };
export type RoutineValue<T extends string | number> = T | { input: string };
type Window = { start: RoutineValue<string>; end: RoutineValue<string> };
type Rule = { id: string; title: string; source: string };
type WindowRule = Rule & Window & { weekdays: number[] };
export type RoutineActivity = Rule & {
  kind: "activity" | "buffer";
  category: "exercise" | "meal" | "pre_sleep" | "other";
  recurrence: { weekdays: number[] } | { weekly: { base: number; optional: number } };
  window: Window;
  components: { name: string; minutes: RoutineValue<number> }[];
  placement: "earliest" | "latest" | "end_at_window_end";
};
export type RoutineSpec = {
  version: 1;
  inputs: Record<string, RoutineInput>;
  availability: WindowRule[];
  commitments: WindowRule[];
  activities: RoutineActivity[];
  sleep: Rule & {
    wakeAt: RoutineValue<string>;
    targetOnset: RoutineValue<string>;
    eyeClosing: RoutineValue<string>;
    latencyMinutes: { min: number; max: number };
    exerciseGapMinutes: number;
    mealGapMinutes: number;
  };
};
export type ChosenInput = { label: string; value: string | number | null; status: "explicit" | "placeholder" | "missing" };
type Provenance = {
  sourceRuleId: string;
  source: string;
  specRevision: string;
  generatorVersion: string;
  chosenInputs: Record<string, ChosenInput>;
  hasPlaceholders: boolean;
};
export type PreviewOccurrence = Provenance & {
  id: string;
  title: string;
  kind: "availability" | "commitment" | "activity" | "buffer";
  category?: RoutineActivity["category"];
  date: string | null;
  eligibleDates: string[];
  optional: boolean;
  status: "placed" | "unplaceable";
  startsAt: string | null;
  endsAt: string | null;
  durationMinutes: number | null;
  components: { name: string; minutes: number | null }[];
};
export type PreviewIssue = {
  code: "invalid_spec" | "missing_input" | "invalid_input" | "civil_time" | "conflict" | "no_slot";
  message: string;
  occurrenceIds: string[];
  optional: boolean;
};
export type SleepPreview = Provenance & {
  date: string;
  wakeAt: string | null;
  targetOnset: string | null;
  eyeClosingAt: string | null;
  onsetRange: { earliest: string; latest: string } | null;
  latencyMinutes: { min: number; max: number };
};
export type RecurringPreview = {
  generatorVersion: string;
  specRevision: string;
  horizon: { startDate: string; days: 7 };
  timezone: ChosenInput;
  status: "feasible" | "provisional" | "incomplete" | "infeasible" | "invalid";
  placementPolicy: string;
  occurrences: PreviewOccurrence[];
  sleep: SleepPreview[];
  issues: PreviewIssue[];
};

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value).filter(([, v]) => v !== undefined).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
      .map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

// Content identity, not an authority/security token. Keys are canonical; rule order is policy.
function revision(spec: RoutineSpec): string {
  let hash = 0xcbf29ce484222325n;
  const text = canonical(spec);
  for (let i = 0; i < text.length; i++) hash = BigInt.asUintN(64, (hash ^ BigInt(text.charCodeAt(i))) * 0x100000001b3n);
  return `fnv1a64-utf16:${hash.toString(16).padStart(16, "0")}`;
}

function chosen(input?: RoutineInput): ChosenInput {
  if (input?.value !== null && input?.value !== undefined) return { label: input.label, value: input.value, status: "explicit" };
  if (input?.placeholder !== undefined) return { label: input.label, value: input.placeholder, status: "placeholder" };
  return { label: input?.label ?? "Unspecified input", value: null, status: "missing" };
}

function civilDate(date: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const stamp = Date.parse(`${date}T00:00:00Z`);
  return Number.isFinite(stamp) && new Date(stamp).toISOString().slice(0, 10) === date ? stamp : null;
}

function clock(time: string): number | null {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return null;
  return Number(time.slice(0, 2)) * 60 + Number(time.slice(3));
}

type Span = { start: number; end: number; id: string };
const iso = (stamp: number | null): string | null => stamp === null ? null : new Date(stamp).toISOString();
const overlaps = (a: Span, b: Span): boolean => a.start < b.end && b.start < a.end;

/**
 * Seven local calendar dates, not 168 elapsed hours. Timezone must be supplied or
 * explicitly labelled as a placeholder. Repeated/skipped clock endpoints are errors.
 * Required rules run in spec order, then optional ones. First/last fit is a preview
 * policy, not proof that no alternate arrangement could satisfy an unplaced rule.
 */
export function generateRecurringPreview(
  spec: RoutineSpec,
  horizon: { startDate: string; days: 7 },
  timezone?: RoutineInput
): RecurringPreview {
  const specRevision = revision(spec);
  const zone = chosen(timezone);
  const issues: PreviewIssue[] = [];
  const occurrences: PreviewOccurrence[] = [];
  const sleep: SleepPreview[] = [];
  const result: RecurringPreview = {
    generatorVersion: RECURRING_PREVIEW_VERSION, specRevision, horizon: { ...horizon }, timezone: zone,
    status: "feasible", placementPolicy: "spec-order-first/last-fit; weekly spread; optional last/v1",
    occurrences, sleep, issues
  };
  const issue = (code: PreviewIssue["code"], message: string, occurrenceIds: string[] = [], optional = false) => {
    issues.push({ code, message, occurrenceIds, optional });
  };
  const startDate = civilDate(horizon.startDate);
  const validDays = (days: number[]) => Array.isArray(days) && days.length > 0 && days.every((d) => Number.isInteger(d) && d >= 0 && d <= 6) && new Set(days).size === days.length;
  const rules = [...spec.availability, ...spec.commitments, ...spec.activities, spec.sleep];
  if (spec.version !== 1 || horizon.days !== 7 || startDate === null || new Set(rules.map((r) => r.id)).size !== rules.length ||
      rules.some((r) => !r.id || !r.title || !r.source) || Object.hasOwn(spec.inputs, "timezone") || Object.values(spec.inputs).some((i) => !i.label) ||
      [...spec.availability, ...spec.commitments].some((r) => !validDays(r.weekdays)) ||
      spec.activities.some((r) => !["activity", "buffer"].includes(r.kind) || !["exercise", "meal", "pre_sleep", "other"].includes(r.category) ||
        !["earliest", "latest", "end_at_window_end"].includes(r.placement) || !r.components.length || r.components.some((c) => !c.name) ||
        ("weekdays" in r.recurrence ? !validDays(r.recurrence.weekdays) :
          !Number.isInteger(r.recurrence.weekly.base) || r.recurrence.weekly.base < 1 || !Number.isInteger(r.recurrence.weekly.optional) ||
          r.recurrence.weekly.optional < 0 || r.recurrence.weekly.base + r.recurrence.weekly.optional > 7)) ||
      !Number.isInteger(spec.sleep.latencyMinutes.min) || !Number.isInteger(spec.sleep.latencyMinutes.max) ||
      spec.sleep.latencyMinutes.min < 1 || spec.sleep.latencyMinutes.max > 30 || spec.sleep.latencyMinutes.min > spec.sleep.latencyMinutes.max ||
      !Number.isInteger(spec.sleep.exerciseGapMinutes) || spec.sleep.exerciseGapMinutes < 0 ||
      !Number.isInteger(spec.sleep.mealGapMinutes) || spec.sleep.mealGapMinutes < 0) {
    issue("invalid_spec", "Require version 1, exactly seven valid civil dates, unique labelled rules, valid recurrence, duration components and sleep constraints.");
    result.status = "invalid";
    return result;
  }
  const dates = Array.from({ length: 7 }, (_, i) => new Date(startDate + i * 86_400_000).toISOString().slice(0, 10));
  const weekday = (date: string) => new Date(`${date}T00:00:00Z`).getUTCDay();
  let formatter: Intl.DateTimeFormat | null = null;
  if (zone.value === null) issue("missing_input", "Timezone is unspecified; no dated occurrence can be placed.");
  else if (typeof zone.value !== "string" || !zone.value.trim()) issue("invalid_input", "Timezone must be a nonempty IANA timezone.");
  else {
    try {
      formatter = new Intl.DateTimeFormat("en-GB", { timeZone: zone.value, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" });
    } catch { issue("invalid_input", `Invalid timezone: ${zone.value}.`); }
  }
  const stamps = new Map<string, number | null>();
  const offsets = new Map<string, number[]>();
  const localStamp = (stamp: number): number => {
    const parts = Object.fromEntries(formatter!.formatToParts(new Date(stamp)).map((p) => [p.type, p.value]));
    return Date.parse(`${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}Z`);
  };
  const at = (date: string, minute: number, id: string, optional = false): number | null => {
    if (!formatter) return null;
    const key = `${date}/${minute}`;
    if (!stamps.has(key)) {
      const nominal = Date.parse(`${date}T00:00:00Z`) + minute * 60_000;
      if (!offsets.has(date)) {
        const found = new Set<number>();
        for (let h = -36; h <= 36; h += 6) { const sample = nominal + h * 3_600_000; found.add(localStamp(sample) - sample); }
        offsets.set(date, [...found]);
      }
      const candidates = offsets.get(date)!.map((o) => nominal - o).filter((s) => localStamp(s) === nominal);
      stamps.set(key, candidates.length === 1 ? candidates[0] : null);
    }
    const stamp = stamps.get(key)!;
    if (stamp === null) issue("civil_time", `Clock endpoint ${date} ${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")} is skipped or repeated in ${zone.value}; supply an unambiguous window.`, [id], optional);
    return stamp;
  };
  const provenance = (rule: Rule): Provenance => ({ sourceRuleId: rule.id, source: rule.source, specRevision, generatorVersion: RECURRING_PREVIEW_VERSION, chosenInputs: { timezone: { ...zone } }, hasPlaceholders: zone.status === "placeholder" });
  const resolve = <T extends string | number>(value: RoutineValue<T>, type: "number" | "string", p: Provenance, id: string, optional = false): T | null => {
    let v: string | number | null;
    if (typeof value === "object" && value !== null) {
      const input = chosen(spec.inputs[value.input]);
      p.chosenInputs[value.input] = { ...input };
      p.hasPlaceholders ||= input.status === "placeholder";
      v = input.value;
      if (v === null) { issue("missing_input", `Missing ${input.label} (${value.input}).`, [id], optional); return null; }
    } else v = value;
    if (typeof v !== type || (typeof v === "number" && (!Number.isFinite(v) || !Number.isInteger(v))) || (type === "string" && clock(v as string) === null)) {
      issue("invalid_input", `Expected ${type === "number" ? "integer minutes" : "HH:mm clock time"} for ${id}.`, [id], optional);
      return null;
    }
    return v as T;
  };
  const time = (value: RoutineValue<string>, date: string, p: Provenance, id: string, optional = false) => {
    const v = resolve(value, "string", p, id, optional);
    return v === null ? null : at(date, clock(v)!, id, optional);
  };
  const waking = new Map<string, { start: number; end: number; target: number }>();
  for (const date of dates) {
    const p = provenance(spec.sleep);
    const id = `${spec.sleep.id}@${date}`;
    const wake = time(spec.sleep.wakeAt, date, p, id);
    const target = time(spec.sleep.targetOnset, date, p, id);
    const eyeClosing = time(spec.sleep.eyeClosing, date, p, id);
    const { min, max } = spec.sleep.latencyMinutes;
    const onsetRange = eyeClosing === null ? null : { earliest: iso(eyeClosing + min * 60_000)!, latest: iso(eyeClosing + max * 60_000)! };
    sleep.push({ ...p, date, wakeAt: iso(wake), targetOnset: iso(target), eyeClosingAt: iso(eyeClosing), onsetRange, latencyMinutes: { min, max } });
    if (wake !== null && target !== null && eyeClosing !== null) {
      if (wake >= eyeClosing || target < eyeClosing + min * 60_000 || target > eyeClosing + max * 60_000) {
        issue("conflict", `Wake/eye closing/latency cannot reach target sleep onset on ${date}.`, [id]);
      } else waking.set(date, { start: wake, end: eyeClosing, target });
    }
  }
  const occupied: Span[] = [];
  const capacity = new Map<string, Span[]>();
  const occurrence = (rule: Rule, kind: PreviewOccurrence["kind"], eligibleDates: string[], id: string, optional = false): PreviewOccurrence => ({
    ...provenance(rule), id, title: rule.title, kind, date: eligibleDates.length === 1 ? eligibleDates[0] : null, eligibleDates: [...eligibleDates],
    optional, status: "unplaceable", startsAt: null, endsAt: null, durationMinutes: null, components: []
  });
  const place = (o: PreviewOccurrence, date: string, start: number, end: number) => {
    o.date = date; o.status = "placed"; o.startsAt = iso(start); o.endsAt = iso(end); o.durationMinutes = (end - start) / 60_000;
  };
  for (const [kind, windows] of [["availability", spec.availability], ["commitment", spec.commitments]] as const) {
    for (const rule of windows) for (const date of dates.filter((d) => rule.weekdays.includes(weekday(d)))) {
      const o = occurrence(rule, kind, [date], `${rule.id}@${date}`);
      occurrences.push(o);
      const start = time(rule.start, date, o, o.id);
      const end = time(rule.end, date, o, o.id);
      if (start === null || end === null) continue;
      if (end <= start) { issue("conflict", `Nonpositive or overnight window for ${o.id}; this version supports same-day windows.`, [o.id]); continue; }
      place(o, date, start, end);
      const span = { start, end, id: o.id };
      if (kind === "availability") { capacity.set(date, [...(capacity.get(date) ?? []), span]); continue; }
      for (const other of occupied.filter((s) => overlaps(s, span))) issue("conflict", "Fixed commitments overlap.", [other.id, o.id]);
      const awake = waking.get(date);
      if (awake && (start < awake.start || end > awake.end)) issue("conflict", "Fixed commitment is outside the waking interval.", [o.id]);
      occupied.push(span);
    }
  }
  // Never use unverified capacity or blockers: their missing input can hide a clash.
  const unresolvedWindows = occurrences.filter((o) => o.status === "unplaceable");
  const requests = spec.activities.flatMap((rule) => {
    const recurrence = rule.recurrence;
    const eligible = "weekdays" in recurrence ? dates.filter((d) => recurrence.weekdays.includes(weekday(d))) : dates;
    if ("weekdays" in recurrence) return eligible.map((date) => ({ rule, o: occurrence(rule, rule.kind, [date], `${rule.id}@${date}`) }));
    const { base, optional } = recurrence.weekly;
    return Array.from({ length: base + optional }, (_, i) => {
      const target = i < base ? Math.floor((i + 1) * 7 / (base + 1)) : 6;
      const ordered = [...eligible].sort((a, b) => Math.abs(dates.indexOf(a) - target) - Math.abs(dates.indexOf(b) - target) || a.localeCompare(b));
      return { rule, o: occurrence(rule, rule.kind, ordered, `${rule.id}@${horizon.startDate}#${i + 1}`, i >= base) };
    });
  }).sort((a, b) => Number(a.o.optional) - Number(b.o.optional));
  for (const { rule, o } of requests) {
    o.category = rule.category;
    occurrences.push(o);
    // Capacity and blocker inputs affect the choice of day, including a failed
    // placement. Carry their uncertainty before attempting any candidate day.
    for (const w of occurrences.filter((w) => w.date !== null && o.eligibleDates.includes(w.date) && (w.kind === "availability" || w.kind === "commitment"))) {
      Object.assign(o.chosenInputs, w.chosenInputs); o.hasPlaceholders ||= w.hasPlaceholders;
    }
    // Include all global inputs that can affect placement, including missing ones.
    resolve(spec.sleep.wakeAt, "string", o, o.id, o.optional);
    resolve(spec.sleep.eyeClosing, "string", o, o.id, o.optional);
    resolve(spec.sleep.targetOnset, "string", o, o.id, o.optional);
    for (const c of rule.components) {
      const minutes = resolve(c.minutes, "number", o, o.id, o.optional);
      if (minutes !== null && (minutes <= 0 || minutes > 1440)) issue("invalid_input", `Duration ${c.name} must be 1–1440 minutes; unknown cannot be zero.`, [o.id], o.optional);
      o.components.push({ name: c.name, minutes });
    }
    const startClock = resolve(rule.window.start, "string", o, o.id, o.optional);
    const endClock = resolve(rule.window.end, "string", o, o.id, o.optional);
    const duration = o.components.every((c) => c.minutes !== null && c.minutes > 0 && c.minutes <= 1440) ? o.components.reduce((sum, c) => sum + c.minutes!, 0) : null;
    o.durationMinutes = duration;
    if (!formatter || startClock === null || endClock === null || duration === null || Object.values(o.chosenInputs).some((v) => v.status === "missing")) continue;
    for (const date of o.eligibleDates) {
      const awake = waking.get(date);
      if (!awake || unresolvedWindows.some((w) => w.date === date)) continue;
      if ("weekly" in rule.recurrence && occurrences.some((other) => other !== o && other.sourceRuleId === rule.id && other.date === date && other.status === "placed")) continue;
      const start = at(date, clock(startClock)!, o.id, o.optional);
      const end = at(date, clock(endClock)!, o.id, o.optional);
      if (start === null || end === null) continue;
      if (end <= start) { issue("conflict", `Invalid activity window for ${o.id}.`, [o.id], o.optional); continue; }
      const cutoff = rule.category === "exercise" ? awake.target - spec.sleep.exerciseGapMinutes * 60_000 : rule.category === "meal" ? awake.target - spec.sleep.mealGapMinutes * 60_000 : awake.end;
      const spans = (capacity.get(date) ?? []).map((s) => ({ ...s, start: Math.max(s.start, start, awake.start), end: Math.min(s.end, end, awake.end, cutoff) }))
        .filter((s) => s.end > s.start).sort((a, b) => a.start - b.start);
      // Availability is a union: touching windows are continuous capacity.
      const merged: Span[] = [];
      for (const span of spans) {
        const last = merged.at(-1);
        if (last && span.start <= last.end) last.end = Math.max(last.end, span.end);
        else merged.push({ ...span });
      }
      if (rule.placement !== "earliest") merged.reverse();
      for (const span of merged) {
        let candidate = rule.placement === "earliest" ? span.start : span.end - duration * 60_000;
        if (rule.placement === "end_at_window_end" && span.end !== end) continue;
        while (candidate >= span.start && candidate + duration * 60_000 <= span.end) {
          const proposal = { start: candidate, end: candidate + duration * 60_000, id: o.id };
          const blockers = occupied.filter((s) => overlaps(s, proposal));
          if (!blockers.length) { place(o, date, proposal.start, proposal.end); occupied.push(proposal); break; }
          if (rule.placement === "end_at_window_end") break;
          candidate = rule.placement === "earliest" ? Math.max(...blockers.map((s) => s.end)) : Math.min(...blockers.map((s) => s.start)) - duration * 60_000;
        }
        if (o.status === "placed") break;
      }
      if (o.status === "placed") break;
    }
    if (o.status === "unplaceable") issue("no_slot", `No slot for ${o.title} under the declared first/last-fit policy; no constraint was relaxed.`, [o.id], o.optional);
  }
  const requiredIssues = issues.filter((i) => !i.optional);
  if (requiredIssues.some((i) => i.code === "invalid_input" || i.code === "invalid_spec")) result.status = "invalid";
  else if (requiredIssues.some((i) => i.code === "conflict")) result.status = "infeasible";
  else if (requiredIssues.some((i) => i.code === "missing_input" || i.code === "civil_time")) result.status = "incomplete";
  else if (occurrences.some((o) => !o.optional && o.status === "unplaceable")) result.status = "infeasible";
  else if (occurrences.some((o) => o.hasPlaceholders) || sleep.some((s) => s.hasPlaceholders)) result.status = "provisional";
  return result;
}
