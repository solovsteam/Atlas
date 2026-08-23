import type { SchedulerConfig } from "./types";

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Map slider 0–10 or raw 0–100 onto 0–100 value. */
export function valueScore(importance: number): number {
  const scaled = importance <= 10 ? importance * 10 : importance;
  return clamp(scaled, 0, 100);
}

export function daysBetween(from: Date, to: Date): number {
  return (to.getTime() - from.getTime()) / 86_400_000;
}

export function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setTime(next.getTime() + days * 86_400_000);
  return next;
}

export function parseTime(iso: string | null | undefined): Date | null {
  if (!iso) {
    return null;
  }
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Hyperbolic urgency: 100 at/after the event, falling as 100 / (1 + Γ d).
 * This is the TMT delay term inverted into a 0–100 "cost of waiting until the event".
 */
export function hyperbolicUrgency(daysUntilEvent: number, gamma: number): number {
  if (daysUntilEvent <= 0) {
    return 100;
  }
  return 100 / (1 + gamma * daysUntilEvent);
}

export function bufferedMinutes(durationMinutes: number, config: SchedulerConfig): number {
  return Math.max(1, Math.ceil(durationMinutes * config.durationBuffer));
}
