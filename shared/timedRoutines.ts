import type { Item } from './item';
import type { DocumentationEntry } from './documentationEntries';

export type RoutineStep = { name: string; status: 'pending' | 'active' | 'done' | 'skipped'; start: string | null; end: string | null };
export type RoutineRun = { version: 1; startedAt: string; endedAt: string | null; steps: RoutineStep[] };
export const MORNING_STEPS = ['Dream recall', 'Shower', 'Get dressed', 'Brush teeth and wash face', 'Coffee', 'Breakfast', 'Medication if needed', 'Shoes, coat and backpack'];

export function routineConfig(item: Item): { steps: string[] } | null {
  const schema = item.documentationSchema;
  if (!schema || typeof schema !== 'object' || Array.isArray(schema)) return null;
  const routine = (schema as Record<string, unknown>).routine;
  if (!routine || typeof routine !== 'object' || Array.isArray(routine)) return null;
  const steps = (routine as Record<string, unknown>).steps;
  return Array.isArray(steps) ? { steps: steps.filter((x): x is string => typeof x === 'string' && x.trim().length > 0) } : null;
}
export function routineRun(entry: DocumentationEntry): RoutineRun | null {
  const run = entry.data.routine;
  if (!run || typeof run !== 'object' || Array.isArray(run)) return null;
  const value = run as RoutineRun;
  if (value.version !== 1 || typeof value.startedAt !== 'string' || !Array.isArray(value.steps)) return null;
  return value;
}
export function startRun(startedAt: Date, names: string[]): RoutineRun {
  if (!Number.isFinite(startedAt.getTime()) || names.length === 0) throw new Error('Choose a start time and at least one step.');
  return { version: 1, startedAt: startedAt.toISOString(), endedAt: null, steps: names.map(name => ({ name, status: 'pending', start: null, end: null })) };
}
export function advanceRun(run: RoutineRun, now: Date): RoutineRun {
  if (run.endedAt) throw new Error('This routine is already finished.');
  const time = now.toISOString();
  const steps = run.steps.map(step => ({ ...step }));
  const active = steps.find(step => step.status === 'active');
  if (active) { active.status = 'done'; active.end = time; }
  const next = steps.find(step => step.status === 'pending');
  if (next) { next.status = 'active'; next.start = time; }
  return { ...run, steps, endedAt: next ? null : time };
}
export function skipStep(run: RoutineRun, index: number): RoutineRun {
  const steps = run.steps.map(step => ({ ...step }));
  if (!steps[index] || steps[index].status !== 'pending') throw new Error('Only an upcoming step can be skipped.');
  steps[index].status = 'skipped';
  return { ...run, steps };
}
export function durationText(start: string, end: string): string {
  const minutes = Math.max(0, Math.round((Date.parse(end) - Date.parse(start)) / 60000));
  return minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
}
