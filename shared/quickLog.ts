/**
 * Quick log: one typed sentence becomes Atlas records.
 *
 * Understanding the sentence and calculating the record are separate steps.
 * A local parser or the model only proposes options from the lists below.
 * This module checks every proposal and calculates amounts and times itself.
 */
import { drinkConversion, type Drink } from './drinks';
import { drinkIntake, intakeAmountText, intakeData, type Intake, type IntakeButton } from './intake';
import { HINDSIGHT_MINUTES, STAGE_TEXT, type EntryStage, type TrackerKind } from './documentationEntries';
import { addDays, atLocalClock, civilDate } from './recurringReferences';

export type QuickLogTracker = { id: string; title: string; kind: TrackerKind };
export type QuickLogContext = {
  now: Date;
  timeZone: string;
  buttons: readonly IntakeButton[];
  drinks: readonly Drink[];
  trackers: readonly QuickLogTracker[];
};
export type QuickLogKind = 'drink' | 'intake' | 'tracker' | 'task';
/** The exact shape the model must return. The local parser returns the same shape. */
export type QuickLogProposal = {
  kind: QuickLogKind;
  optionId: string;
  amount: number | null;
  unit: string | null;
  /** Local wall-clock time "YYYY-MM-DDTHH:MM" in the person's time zone, or null for now. */
  localTime: string | null;
  /** "urge" only when a habit to break was noticed as an urge. */
  stage: 'urge' | 'none';
  /** Only for kind "task": the task in the person's words. optionId is "task" then. The local parser never proposes tasks. */
  taskTitle?: string | null;
};
export type QuickLogOutput = {
  records: QuickLogProposal[];
  /** A part of the sentence that matches no option, for example "headache". */
  unmatched: string | null;
  /** A question when an answer would change what is recorded. Nothing is saved then. */
  question: string | null;
};
export type QuickLogMethod = { method: 'local' } | { method: 'model'; model: string; ms: number };
export type QuickLogRecord =
  | { type: 'intake'; intake: Intake; summary: string }
  | { type: 'tracker'; trackerId: string; title: string; occurredAt: string; stage: EntryStage | null; summary: string }
  | { type: 'task'; title: string; summary: string };
export type QuickLogResult =
  | { ok: true; records: QuickLogRecord[]; unmatched: string | null }
  | { ok: false; reason: string };

export const MAX_QUICK_LOG_LENGTH = 500;
export const MAX_QUICK_LOG_RECORDS = 8;
/** A record further in the past is more likely a misunderstanding than a late entry. */
export const MAX_PAST_DAYS = 14;
const FUTURE_TOLERANCE_MS = 10 * 60000;

function object(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
const nullableText = (value: unknown) => value === null || (typeof value === 'string' && value.length <= 300);

/** Checks the shape only. resolveQuickLog checks the meaning. */
export function validQuickLogOutput(value: unknown): value is QuickLogOutput {
  const v = object(value);
  return Array.isArray(v.records) && v.records.length <= MAX_QUICK_LOG_RECORDS && nullableText(v.unmatched) && nullableText(v.question)
    && v.records.every(raw => {
      const r = object(raw);
      return ['drink', 'intake', 'tracker', 'task'].includes(r.kind as string) && typeof r.optionId === 'string'
        && (r.amount === null || (typeof r.amount === 'number' && Number.isFinite(r.amount)))
        && (r.unit === null || typeof r.unit === 'string')
        && (r.localTime === null || (typeof r.localTime === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(r.localTime)))
        && (r.stage === 'urge' || r.stage === 'none')
        && (r.taskTitle === undefined || nullableText(r.taskTitle));
    });
}

/** The option lists sent to the model. Hidden buttons and drinks stay out. */
export function quickLogOptions(ctx: QuickLogContext) {
  return {
    drinks: ctx.drinks.filter(d => !d.hidden).map(d => ({ id: d.id, name: d.name, otherNames: d.aliases, servings: d.servings.map(s => `${s.name} (${s.ml} ml)`) })),
    intakes: ctx.buttons.filter(b => !b.hidden).map(b => ({ id: b.id, name: b.label, usualDose: b.dose, unit: b.unit })),
    trackers: ctx.trackers.map(t => ({ id: t.id, name: t.title, kind: t.kind === 'break' ? 'habit to break' : 'habit to build' })),
  };
}
export function localNow(ctx: Pick<QuickLogContext, 'now' | 'timeZone'>): string {
  const date = civilDate(ctx.now, ctx.timeZone);
  const clock = new Intl.DateTimeFormat('en-GB', { timeZone: ctx.timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(ctx.now);
  return `${date}T${clock}`;
}

function resolveTime(localTime: string | null, ctx: QuickLogContext): { at: string } | { reason: string } {
  if (localTime === null) return { at: ctx.now.toISOString() };
  let at: string;
  try { at = atLocalClock(localTime.slice(0, 10), `${localTime.slice(11)}:00`, ctx.timeZone); }
  catch { return { reason: `The time ${localTime.replace('T', ' ')} does not exist in ${ctx.timeZone}.` }; }
  const ms = Date.parse(at);
  if (ms > ctx.now.getTime() + FUTURE_TOLERANCE_MS) return { reason: `The time ${localTime.replace('T', ' ')} is in the future.` };
  if (ms < ctx.now.getTime() - MAX_PAST_DAYS * 86400000) return { reason: `The time ${localTime.replace('T', ' ')} is more than ${MAX_PAST_DAYS} days ago. Use the Intake or Track page for old entries.` };
  return { at };
}
function clockText(at: string, ctx: QuickLogContext): string {
  const clock = new Intl.DateTimeFormat('en-GB', { timeZone: ctx.timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(at));
  const date = civilDate(new Date(at), ctx.timeZone);
  const today = civilDate(ctx.now, ctx.timeZone);
  return date === today ? clock : date === addDays(today, -1) ? `yesterday ${clock}` : `${date} ${clock}`;
}
const UNIT_WORDS: Record<string, string> = { teaspoons: 'teaspoon', tsp: 'teaspoon', tl: 'teaspoon', grams: 'g', gram: 'g', milligrams: 'mg', milligram: 'mg', doses: 'dose' };
export function normalUnit(unit: string): string {
  const clean = unit.trim().toLowerCase().replace(/\.$/, '');
  return UNIT_WORDS[clean] ?? clean;
}

/** Turns proposals into validated records. Any invalid proposal refuses the whole sentence. */
export function resolveQuickLog(output: QuickLogOutput, ctx: QuickLogContext): QuickLogResult {
  if (output.question) return { ok: false, reason: output.question };
  if (!output.records.length) return { ok: false, reason: output.unmatched ? `Atlas has no record type for “${output.unmatched}”.` : 'Nothing in the sentence matches a drink, an intake, a tracker or a task.' };
  const records: QuickLogRecord[] = [];
  for (const p of output.records) {
    if (p.kind === 'task') {
      // A task is created now. Atlas does not read due dates from the sentence yet.
      const title = (p.taskTitle ?? '').trim();
      if (!title) return { ok: false, reason: 'The interpretation proposed a task without a title.' };
      records.push({ type: 'task', title, summary: `Task: ${title}` });
      continue;
    }
    const time = resolveTime(p.localTime, ctx);
    if ('reason' in time) return { ok: false, reason: time.reason };
    if (p.kind === 'drink') {
      const drink = ctx.drinks.find(d => d.id === p.optionId && !d.hidden);
      if (!drink) return { ok: false, reason: 'The interpretation chose a drink that is not in the drink list.' };
      if (p.amount === null || !p.unit) return { ok: false, reason: howMuch(drink) };
      const conversion = drinkConversion(drink, p.amount, p.unit);
      if (!conversion) return { ok: false, reason: `Atlas cannot convert “${p.amount} ${p.unit}” of ${drink.name}. Use ml, l${drink.servings.length ? ` or ${drink.servings.map(s => s.name).join(', ')}` : ''}.` };
      if (conversion.caffeineMgPer100Ml <= 0) return { ok: false, reason: `${drink.name} has no caffeine in the drink list.` };
      const intake = drinkIntake(conversion, time.at, ctx.timeZone);
      records.push({ type: 'intake', intake, summary: `${drink.name} · ${intakeAmountText(intake)} · ${clockText(time.at, ctx)}` });
    } else if (p.kind === 'intake') {
      const chosen = ctx.buttons.find(b => b.id === p.optionId && !b.hidden);
      if (!chosen) return { ok: false, reason: 'The interpretation chose an intake that is not one of the intake buttons.' };
      let dose = chosen.dose;
      let button = chosen;
      if (p.amount !== null) {
        if (!(p.amount > 0)) return { ok: false, reason: `The dose of ${chosen.label} must be positive.` };
        if (!p.unit || normalUnit(p.unit) !== normalUnit(chosen.unit)) return { ok: false, reason: `${chosen.label} is recorded in ${chosen.unit}, not in ${p.unit ?? 'an unknown unit'}.` };
        dose = p.amount;
        // Prefer the button with exactly this dose, so the label and trial matching stay the same.
        button = ctx.buttons.find(b => !b.hidden && b.substance === chosen.substance && b.dose === dose && normalUnit(b.unit) === normalUnit(chosen.unit)) ?? chosen;
      }
      const intake: Intake = { substance: button.substance, label: button.label, dose, unit: button.unit, takenAt: time.at, timeZone: ctx.timeZone };
      intakeData(intake);
      records.push({ type: 'intake', intake, summary: `${button.label} · ${dose} ${button.unit} · ${clockText(time.at, ctx)}` });
    } else {
      const tracker = ctx.trackers.find(t => t.id === p.optionId);
      if (!tracker) return { ok: false, reason: 'The interpretation chose a tracker that does not exist.' };
      // The stage follows the tracker rule: recorded later means in hindsight.
      const stage: EntryStage | null = tracker.kind === 'build' ? null : p.stage === 'urge' ? 'urge'
        : ctx.now.getTime() - Date.parse(time.at) > HINDSIGHT_MINUTES * 60000 ? 'after' : 'during';
      records.push({ type: 'tracker', trackerId: tracker.id, title: tracker.title, occurredAt: time.at, stage,
        summary: `${tracker.title}${stage ? ` · ${STAGE_TEXT[stage].label.toLowerCase()}` : ''} · ${clockText(time.at, ctx)}` });
    }
  }
  return { ok: true, records, unmatched: output.unmatched };
}

function howMuch(drink: Drink): string {
  return `How much ${drink.name}? For example “${drink.name} 250 ml”${drink.servings[0] ? ` or “1 ${drink.servings[0].name} ${drink.name}”` : ''}.`;
}

// ---------- Local parser ----------
// It handles one simple record, such as "cola 250ml at 15:00" or "melatonin 1 mg".
// Anything else returns null and goes to the model.

export function normalName(value: string): string {
  return value.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[-_'’]|(?<!\d)\.|\.(?!\d)/g, ' ').replace(/\s+/g, ' ').trim();
}
const singular = (word: string) => word.length > 3 && word.endsWith('s') ? word.slice(0, -1) : word;
const sameName = (a: string, b: string) => {
  const x = normalName(a), y = normalName(b);
  return x === y || x.split(' ').map(singular).join(' ') === y.split(' ').map(singular).join(' ');
};
const FILLER = new Set(['i', 'had', 'have', 'drank', 'drink', 'took', 'take', 'of', 'a', 'an', 'one', 'some', 'just', 'ich', 'habe', 'hatte', 'getrunken', 'genommen', 'ein', 'eine', 'einen', 'eins']);
const ARTICLES = new Set(['a', 'an', 'one', 'ein', 'eine', 'einen', 'eins']);
const SERVING = '(?:cans?|bottles?|shots?|cups?|mugs?|glass(?:es)?|dose|doses)';
const UNIT = `(?:ml|cl|dl|l|liters?|litres?|mg|g|grams?|mcg|µg|tsp|teaspoons?|tl|${SERVING})`;

type Found = { localTime: string | null; rest: string };
function pad(n: number) { return String(n).padStart(2, '0'); }
function extractTime(input: string, ctx: QuickLogContext): Found | null {
  let rest = ` ${input} `;
  let dayOffset = 0;
  let explicitDay = false;
  let clock: { h: number; m: number } | null = null;
  let agoMinutes: number | null = null;
  const take = (re: RegExp, fn: (m: RegExpMatchArray) => boolean) => {
    const match = rest.match(re);
    if (!match) return true;
    if (!fn(match)) return false;
    rest = rest.replace(match[0], ' ');
    return true;
  };
  const ok = [
    take(/\s(yesterday|gestern)\s/, () => { dayOffset = -1; explicitDay = true; return true; }),
    take(/\s(today|heute|now|jetzt|just now|gerade)\s/, () => { explicitDay = true; return true; }),
    take(/\s(?:(\d+)\s*(min|mins|minutes?|minuten|h|hrs?|hours?|std|stunden?)\s+ago|vor\s+(\d+)\s*(min|minuten|h|std|stunden?))\s/, m => {
      const n = Number(m[1] ?? m[3]);
      const unit = m[2] ?? m[4];
      agoMinutes = /^(h|hr|hrs|hour|hours|std|stunde|stunden)$/.test(unit) ? n * 60 : n;
      return agoMinutes <= MAX_PAST_DAYS * 1440;
    }),
    take(/\s(?:at|um|@)\s*(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm|uhr|h)?\s/, m => {
      let h = Number(m[1]);
      const min = Number(m[2] ?? 0);
      if (m[3] === 'pm' && h < 12) h += 12;
      if (m[3] === 'am' && h === 12) h = 0;
      clock = { h, m: min };
      return h < 24 && min < 60;
    }),
    // A bare dot is read as a time only with "Uhr" or "h", so "1.25 l" stays an amount.
    take(/\s(\d{1,2})(?::(\d{2})\s*(am|pm|uhr|h)?|\.(\d{2})\s*(uhr|h))\s/, m => {
      m = [m[0], m[1], m[2] ?? m[4], m[3] ?? m[5]] as unknown as RegExpMatchArray;
      let h = Number(m[1]);
      if (m[3] === 'pm' && h < 12) h += 12;
      if (m[3] === 'am' && h === 12) h = 0;
      clock = { h, m: Number(m[2]) };
      return h < 24 && Number(m[2]) < 60;
    }),
    take(/\s(\d{1,2})\s*(am|pm)\s/, m => {
      let h = Number(m[1]);
      if (m[2] === 'pm' && h < 12) h += 12;
      if (m[2] === 'am' && h === 12) h = 0;
      clock = { h, m: 0 };
      return h < 24;
    }),
  ].every(Boolean);
  if (!ok) return null;
  if (agoMinutes !== null && clock) return null;
  if (agoMinutes !== null) {
    const at = new Date(ctx.now.getTime() - (agoMinutes as number) * 60000);
    return { localTime: localNow({ now: at, timeZone: ctx.timeZone }), rest };
  }
  // "yesterday" without a clock time is too vague for a local guess.
  if (!clock) return dayOffset ? null : { localTime: null, rest };
  const { h, m } = clock as { h: number; m: number };
  let date = addDays(civilDate(ctx.now, ctx.timeZone), dayOffset);
  let localTime = `${date}T${pad(h)}:${pad(m)}`;
  // "at 23:00" typed after midnight means yesterday evening.
  if (!explicitDay && localTime > localNow(ctx)) {
    date = addDays(date, -1);
    localTime = `${date}T${pad(h)}:${pad(m)}`;
  }
  return { localTime, rest };
}
const NUMBER_WORDS: Record<string, number> = { a: 1, an: 1, one: 1, ein: 1, eine: 1, einen: 1, two: 2, zwei: 2, three: 3, drei: 3, half: 0.5, halbe: 0.5 };
function extractAmount(rest: string): { amount: number | null; unit: string | null; rest: string } | null {
  const numeric = [...rest.matchAll(new RegExp(`(?:^|\\s)(\\d+(?:[.,]\\d+)?)\\s*(${UNIT})(?=\\s|$)`, 'g'))];
  const worded = [...rest.matchAll(new RegExp(`(?:^|\\s)(a|an|one|ein|eine|einen|two|zwei|three|drei|half|halbe)\\s+(${SERVING})(?:\\s+of)?(?=\\s|$)`, 'g'))];
  const all = [...numeric.map(m => ({ m, amount: Number(m[1].replace(',', '.')) })), ...worded.map(m => ({ m, amount: NUMBER_WORDS[m[1]] }))];
  if (all.length > 1) return null;
  if (!all.length) return /\d/.test(rest) ? null : { amount: null, unit: null, rest };
  const [{ m, amount }] = all;
  return { amount, unit: m[2], rest: rest.replace(m[0], ' ') };
}

type Candidate = { kind: QuickLogKind; id: string };
function candidates(name: string, ctx: QuickLogContext): Candidate[] {
  const found: Candidate[] = [];
  for (const d of ctx.drinks) if (!d.hidden && [d.name, ...d.aliases].some(n => sameName(n, name))) found.push({ kind: 'drink', id: d.id });
  for (const b of ctx.buttons) if (!b.hidden && (sameName(b.label, name) || sameName(b.substance, name))) found.push({ kind: 'intake', id: b.id });
  for (const t of ctx.trackers) if (sameName(t.title, name)) found.push({ kind: 'tracker', id: t.id });
  return found;
}

/**
 * Returns an output for one simple record, a question when the sentence lacks an amount,
 * or null when the sentence needs the model.
 */
export function parseQuickLogLocally(text: string, ctx: QuickLogContext): QuickLogOutput | null {
  // A decimal comma becomes a point. A point between digits survives normalName.
  const input = normalName(text.replace(/(\d),(\d)/g, '$1.$2').replace(/[!?;]/g, ' '));
  if (!input || input.length > 120 || /\s(and|und|plus|then|dann)\s|,|\+/.test(` ${input} `)) return null;
  const time = extractTime(input, ctx);
  if (!time) return null;
  const amount = extractAmount(time.rest);
  if (!amount) return null;
  const name = amount.rest.split(' ').filter(w => w && !FILLER.has(w)).join(' ');
  if (!name) return null;
  const found = candidates(name, ctx);
  if (!found.length) return null;
  const kinds = new Set(found.map(c => c.kind));
  if (kinds.size > 1) return null;
  const kind = found[0].kind;
  if (kind === 'intake') {
    const buttons = found.map(c => ctx.buttons.find(b => b.id === c.id)!);
    const substance = new Set(buttons.map(b => b.substance));
    if (substance.size > 1) return null;
    let chosen = buttons[0];
    if (amount.amount === null && new Set(buttons.map(b => `${b.dose} ${b.unit}`)).size > 1) {
      return { records: [], unmatched: null, question: `Which dose of ${chosen.label}? ${buttons.map(b => `${b.dose} ${b.unit}`).join(' or ')}.` };
    }
    if (amount.amount !== null) chosen = buttons.find(b => b.dose === amount.amount && normalUnit(b.unit) === normalUnit(amount.unit!)) ?? chosen;
    return { records: [{ kind, optionId: chosen.id, amount: amount.amount, unit: amount.unit, localTime: time.localTime, stage: 'none' }], unmatched: null, question: null };
  }
  if (found.length > 1) return null;
  if (kind === 'tracker' && amount.amount !== null) return null;
  if (kind === 'drink' && amount.amount === null) {
    const drink = ctx.drinks.find(d => d.id === found[0].id)!;
    // "ein Espresso" is one serving when every serving of that drink has the same size.
    const article = amount.rest.split(' ').some(w => ARTICLES.has(w));
    const sizes = new Set(drink.servings.map(s => s.ml));
    if (!article || sizes.size !== 1) return { records: [], unmatched: null, question: howMuch(drink) };
    return { records: [{ kind, optionId: drink.id, amount: 1, unit: drink.servings[0].name, localTime: time.localTime, stage: 'none' }], unmatched: null, question: null };
  }
  return { records: [{ kind, optionId: found[0].id, amount: amount.amount, unit: amount.unit, localTime: time.localTime, stage: 'none' }], unmatched: null, question: null };
}
