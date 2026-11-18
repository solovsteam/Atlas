import type { DocumentationEntry } from './documentationEntries';
import { civilDate } from './recurringReferences';

/** A meal records its finish time. There is no inferred dose, size or fullness. */
export type EveningMeal = { finishedAt: string; timeZone: string };
export type MealRecord = { id: string; entry: DocumentationEntry; meal: EveningMeal };

export function mealData(meal: EveningMeal): Record<string, unknown> {
  if (typeof meal.finishedAt !== 'string' || !/T.*(?:Z|[+-]\d{2}:\d{2})$/.test(meal.finishedAt) || !Number.isFinite(Date.parse(meal.finishedAt))) {
    throw new Error('Choose a valid date and time for finishing the evening meal.');
  }
  if (typeof meal.timeZone !== 'string' || !meal.timeZone) throw new Error('A time zone is required for the evening meal.');
  new Intl.DateTimeFormat('en', { timeZone: meal.timeZone });
  return { kind: 'eveningMeal', meal: { ...meal } };
}

export function eveningMeal(entry: Pick<DocumentationEntry, 'data' | 'occurredAt'>): EveningMeal | null {
  if (entry.data.kind !== 'eveningMeal') return null;
  const raw = entry.data.meal;
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return null;
  try {
    const meal = { ...(raw as EveningMeal), finishedAt: entry.occurredAt };
    mealData(meal);
    return meal;
  } catch { return null; }
}

export function readMeals(entries: readonly DocumentationEntry[]): MealRecord[] {
  return entries.flatMap(entry => {
    const meal = eveningMeal(entry);
    return meal ? [{ id: entry.id, entry, meal }] : [];
  }).sort((a, b) => Date.parse(b.meal.finishedAt) - Date.parse(a.meal.finishedAt) || a.id.localeCompare(b.id));
}

export function mealsOnDate(meals: readonly MealRecord[], date: string, timeZone: string): MealRecord[] {
  return meals.filter(row => civilDate(new Date(row.meal.finishedAt), timeZone) === date);
}
