import type { DocumentationEntry } from './documentationEntries';
import { medicineAnswer, confirmedDay, recallsOnDate } from './dayEvidence';
import { addDays, civilDate } from './recurringReferences';
import { sleepNight, type SleepNight } from './sleepLog';
import { trialAdherence, type AdherenceStatus, type SleepTrialAssignment, type TrialIntake } from './sleepTrial';
import { caffeineMg, validConversion, type DrinkConversion } from './drinks';

export type IntakeButton = { id: string; substance: string; label: string; dose: number; unit: string; hidden: boolean };
/** A drink intake has substance caffeine, its dose in mg, and the conversion that produced the dose. */
export type Intake = { substance: string; label: string; dose: number; unit: string; takenAt: string; timeZone: string; drink?: DrinkConversion };
export const CAFFEINE = 'caffeine';
export type IntakeRecord = { id: string; entry: DocumentationEntry; intake: Intake; legacyKey?: string; timeKnown: boolean; doseKnown: boolean };
export const DEFAULT_INTAKE_BUTTONS: readonly IntakeButton[] = [
  { id: 'methylphenidate', substance: 'methylphenidate', label: 'Methylphenidate', dose: 36, unit: 'mg', hidden: false },
  { id: 'coffee', substance: 'coffee', label: 'Coffee', dose: 1, unit: 'teaspoon', hidden: false },
  { id: 'melatonin', substance: 'melatonin', label: 'Melatonin', dose: 0.5, unit: 'mg', hidden: false },
  { id: 'glycine-3', substance: 'glycine', label: 'Glycine', dose: 3, unit: 'g', hidden: false },
  { id: 'glycine-5', substance: 'glycine', label: 'Glycine', dose: 5, unit: 'g', hidden: false },
  { id: 'magnesium', substance: 'magnesium', label: 'Magnesium', dose: 200, unit: 'mg', hidden: false },
  { id: 'vitamins', substance: 'vitamins', label: 'Vitamins and minerals', dose: 1, unit: 'usual dose', hidden: false },
];
function object(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
function instant(value: unknown): value is string {
  return typeof value === 'string' && /T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value) && Number.isFinite(Date.parse(value));
}
function validZone(value: unknown): value is string {
  if (typeof value !== 'string' || !value) return false;
  try { new Intl.DateTimeFormat('en', { timeZone: value }); return true; } catch { return false; }
}
function validButton(value: unknown): value is IntakeButton {
  const b = object(value);
  return ['id', 'substance', 'label', 'unit'].every(key => typeof b[key] === 'string' && (b[key] as string).trim().length > 0)
    && typeof b.dose === 'number' && Number.isFinite(b.dose) && b.dose > 0 && typeof b.hidden === 'boolean';
}
export function parseIntakeButtons(value: unknown, legacyDoses: Record<string, number> = {}, coffee = 1): IntakeButton[] {
  const fallback = () => DEFAULT_INTAKE_BUTTONS.map(b => ({ ...b, dose: b.substance === 'coffee' ? coffee : b.id === 'glycine-5' ? 5 : legacyDoses[b.substance] ?? b.dose }));
  if (!Array.isArray(value) || !value.every(validButton) || new Set(value.map(b => b.id)).size !== value.length) return fallback();
  return value.map(b => ({ ...b }));
}
export function intakeData(intake: Intake, legacyKey?: string): Record<string, unknown> {
  if (!validButton({ ...intake, id: 'entry', hidden: false }) || !instant(intake.takenAt) || !validZone(intake.timeZone)) throw new Error('Enter a substance, a positive dose, a unit and a valid time and time zone.');
  if (intake.drink !== undefined && (!validConversion(intake.drink) || intake.substance !== CAFFEINE || intake.unit !== 'mg' || intake.dose !== caffeineMg(intake.drink))) {
    throw new Error('The drink conversion does not match the caffeine dose.');
  }
  const { drink, ...rest } = intake;
  return { kind: 'intake', intake: drink ? { ...rest, drink: { ...drink } } : rest, ...(legacyKey ? { replacesLegacy: legacyKey } : {}) };
}
/** Caffeine of zero mg is not an intake, so a caffeine-free drink is refused. */
export function drinkIntake(drink: DrinkConversion, takenAt: string, timeZone: string): Intake {
  const intake: Intake = { substance: CAFFEINE, label: drink.name, dose: caffeineMg(drink), unit: 'mg', takenAt, timeZone, drink };
  intakeData(intake);
  return intake;
}
/** One line for lists: "250 ml · 25 mg caffeine (estimate)". */
export function intakeAmountText(intake: Intake): string {
  if (!intake.drink) return `${intake.dose} ${intake.unit}`;
  return `${intake.drink.amountText} · ${intake.dose} mg caffeine${intake.drink.estimate ? ' (estimate)' : ''}`;
}
export function intakeNow(button: IntakeButton, now: Date, timeZone: string): Intake {
  const intake = { substance: button.substance, label: button.label, dose: button.dose, unit: button.unit, takenAt: now.toISOString(), timeZone };
  intakeData(intake);
  return intake;
}
export function sleepIntake(entry: Pick<DocumentationEntry, 'data' | 'occurredAt'>): Intake | null {
  if (entry.data.kind !== 'intake') return null;
  const raw = object(entry.data.intake);
  try {
    const intake = { ...raw, takenAt: entry.occurredAt } as Intake;
    intakeData(intake);
    return intake;
  } catch { return null; }
}
/** Compatibility is read-only. Unknown old doses and times remain explicitly unknown. */
export function legacyNightIntakes(entry: DocumentationEntry, night: SleepNight): IntakeRecord[] {
  const result: IntakeRecord[] = [];
  const add = (key: string, substance: string, dose: number | undefined, unit: string, takenAt: string | undefined, zone: string | undefined, fallback: string) => {
    const timeKnown = instant(takenAt);
    const at = timeKnown ? takenAt : fallback;
    if (!instant(at) || !validZone(zone)) return;
    const button = DEFAULT_INTAKE_BUTTONS.find(b => b.substance === substance);
    const legacyKey = `${entry.id}:${key}`;
    result.push({ id: legacyKey, entry, legacyKey, timeKnown, doseKnown: typeof dose === 'number' && dose > 0,
      intake: { substance, label: button?.label ?? substance, dose: dose ?? 0, unit, takenAt: at, timeZone: zone } });
  };
  const morning = night.morning;
  if (morning?.methylphenidate?.taken) add('methylphenidate', 'methylphenidate', undefined, 'mg', morning.methylphenidate.takenAt,
    morning.methylphenidate.timeZone ?? morning.timeZone, morning.wakeAt ?? entry.occurredAt);
  morning?.coffee?.forEach((c, i) => add(`coffee:${i}`, 'coffee', c.teaspoons, 'teaspoon', c.takenAt, c.timeZone ?? morning.timeZone, morning.wakeAt ?? entry.occurredAt));
  night.evening?.supplements?.forEach((s, i) => add(`supplement:${i}`, s.supplement, s.dose, s.supplement === 'glycine' ? 'g' : 'mg', s.takenAt, s.timeZone ?? night.evening?.timeZone, entry.occurredAt));
  return result;
}
/** Corrections to old embedded records are separate rows, so the original night is never rewritten. */
export function readIntakes(entries: readonly DocumentationEntry[]): IntakeRecord[] {
  const corrections = new Map<string, DocumentationEntry>();
  for (const entry of [...entries].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))) {
    if ((entry.data.kind === 'intake' || entry.data.kind === 'intakeCorrection') && typeof entry.data.replacesLegacy === 'string') corrections.set(entry.data.replacesLegacy, entry);
  }
  return entries.flatMap(entry => {
    const intake = sleepIntake(entry);
    const key = typeof entry.data.replacesLegacy === 'string' ? entry.data.replacesLegacy : undefined;
    if (intake) return key && corrections.get(key)?.id !== entry.id ? [] : [{ id: entry.id, entry, intake, legacyKey: key, timeKnown: true, doseKnown: true }];
    const night = sleepNight(entry);
    return night ? legacyNightIntakes(entry, night).filter(row => !corrections.has(row.legacyKey!)) : [];
  }).sort((a, b) => Date.parse(b.intake.takenAt) - Date.parse(a.intake.takenAt) || a.id.localeCompare(b.id));
}
export function intakesOnDate(intakes: readonly IntakeRecord[], date: string, timeZone: string): IntakeRecord[] {
  return intakes.filter(row => civilDate(new Date(row.intake.takenAt), timeZone) === date).toSorted((a, b) => Date.parse(b.intake.takenAt) - Date.parse(a.intake.takenAt));
}
/** With an amount, only intakes of that dose and unit count. Use it when two buttons share a substance. */
export function lastTakenToday(intakes: readonly IntakeRecord[], substance: string, now: Date, timeZone: string, amount?: { dose: number; unit: string }): IntakeRecord | null {
  return intakesOnDate(intakes, civilDate(now, timeZone), timeZone).find(row => row.intake.substance === substance && Date.parse(row.intake.takenAt) <= now.getTime()
    && (!amount || row.doseKnown && row.intake.dose === amount.dose && row.intake.unit === amount.unit)) ?? null;
}
export function methylphenidateOnDate(intakes: readonly IntakeRecord[], date: string, timeZone?: string): boolean {
  return intakes.some(row => row.intake.substance === 'methylphenidate' && civilDate(new Date(row.intake.takenAt), timeZone ?? row.intake.timeZone) === date);
}
export type MethylphenidateStatus = 'taken' | 'not-taken' | 'unknown';
/** An intake wins over an old negative answer. Confirmation alone never answers the medicine question. */
export function methylphenidateStatus(entries: readonly DocumentationEntry[], date: string, timeZone?: string, intakes: readonly IntakeRecord[] = readIntakes(entries)): MethylphenidateStatus {
  if (methylphenidateOnDate(intakes, date, timeZone)) return 'taken';
  const memory = recallsOnDate(entries, date, timeZone).get('intake:methylphenidate')?.recall;
  if (memory) return memory.state === 'happened' ? 'taken' : memory.state === 'absent' ? 'not-taken' : 'unknown';
  const explicit = [...entries].sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id))
    .map(medicineAnswer).find(answer => answer?.date === date && (!timeZone || answer.timeZone === timeZone));
  if (explicit) return explicit.answer;
  return entries.some(entry => {
    const morning = sleepNight(entry)?.morning;
    const zone = morning?.methylphenidate?.timeZone ?? morning?.timeZone;
    const at = morning?.wakeAt;
    return morning?.methylphenidate?.taken === false && instant(at) && validZone(zone) && civilDate(new Date(at), timeZone ?? zone) === date;
  }) ? 'not-taken' : 'unknown';
}
/** Inclusive elapsed-time window. Daytime supplements do not become evening trial doses. */
export function nightTrialIntakes(intakes: readonly IntakeRecord[], targetLightsOutAt: string, lightsOutAt: string): TrialIntake[] {
  if (!instant(targetLightsOutAt) || !instant(lightsOutAt)) return [];
  const start = Date.parse(targetLightsOutAt) - 4 * 3600000;
  const end = Date.parse(lightsOutAt);
  return intakes.flatMap(({ intake, timeKnown, doseKnown }) => {
    const at = Date.parse(intake.takenAt);
    if (!['melatonin', 'glycine', 'magnesium'].includes(intake.substance) || !timeKnown || at < start || at > end) return [];
    return [{ factorId: intake.substance as TrialIntake['factorId'], dose: doseKnown ? intake.dose : undefined,
      unit: intake.unit === 'g' || intake.unit === 'mg' ? intake.unit : undefined, takenAt: intake.takenAt }];
  });
}
export function intakeTrialAdherence(assignment: SleepTrialAssignment, intakes: readonly IntakeRecord[], targetLightsOutAt: string, lightsOutAt: string, complete = false) {
  // Approximate timing remains unknown without an explicit tolerance.
  return trialAdherence(assignment, { entries: nightTrialIntakes(intakes, targetLightsOutAt, lightsOutAt), complete }, targetLightsOutAt);
}

/** Missing intake cannot establish adherence until every date in the night window is confirmed. */
export function nightIntakeAdherence(night: SleepNight, intakes: readonly IntakeRecord[], confirmations: readonly DocumentationEntry[] = []): AdherenceStatus {
  const trial = night.evening?.trial;
  if (!trial || !instant(trial.targetLightsOutAt) || !instant(night.evening?.lightsOut)) return 'unknown';
  const entries = nightTrialIntakes(intakes, trial.targetLightsOutAt, night.evening.lightsOut);
  const zone = night.evening.timeZone;
  const startDate = zone ? civilDate(new Date(Date.parse(trial.targetLightsOutAt) - 4 * 3600000), zone) : '';
  const endDate = zone ? civilDate(new Date(night.evening.lightsOut), zone) : '';
  let complete = !!zone && startDate <= endDate;
  const uncertainFactors = new Set<string>();
  for (let date = startDate; zone && date && date <= endDate; date = addDays(date, 1)) {
    if (!confirmedDay(confirmations, date, zone)) complete = false;
    for (const { recall } of recallsOnDate(confirmations, date, zone).values()) {
      if (recall.subject.startsWith('intake:') && recall.state !== 'absent')
        uncertainFactors.add(recall.subject.slice(7));
    }
    for (const row of intakesOnDate(intakes, date, zone)) {
      if (!row.timeKnown) uncertainFactors.add(row.intake.substance);
    }
  }
  const result = trialAdherence(trial.assignment, { entries, complete, uncertainFactors }, trial.targetLightsOutAt);
  return result.status;
}

export function assignedIntakes(assignment: SleepTrialAssignment, now: Date, timeZone: string): Intake[] {
  return assignment.factors.flatMap(factor => {
    if (!factor.on || !factor.level) return [];
    const button = DEFAULT_INTAKE_BUTTONS.find(b => b.substance === factor.factorId);
    if (!button) throw new Error('The assignment contains an unsupported substance.');
    return [intakeNow({ ...button, dose: factor.level.dose, unit: factor.level.unit }, now, timeZone)];
  });
}

/** A day-level statement establishes presence. A timed record of that substance already counts. */
export function dailyIntakeSummary(entries: readonly DocumentationEntry[], date: string, zone: string, intakes: readonly IntakeRecord[]) {
  const timed = intakesOnDate(intakes, date, zone);
  const known = new Set(timed.map(row => 'intake:' + row.intake.substance));
  const answers = [...recallsOnDate(entries, date, zone).values()].filter(({ recall }) => recall.subject.startsWith('intake:'));
  const observed = timed.length + answers.filter(({ recall }) => recall.state === 'happened' && !known.has(recall.subject)).length;
  const exact = confirmedDay(entries, date, zone) && !answers.some(({ recall }) => recall.state === 'unsure');
  if (exact) return `${observed} recorded intake${observed === 1 ? '' : 's'}.`;
  return observed ? `At least ${observed} intake${observed === 1 ? '' : 's'}. Total unknown.` : 'Intake count unknown.';
}
