import { startOfDay, type ScheduleSlot, slotOverlapsRange } from "./schedule";

export type WorkBlockKind = "morning" | "afternoon";

export type WorkBlockSpec = {
  kind: WorkBlockKind;
  label: string;
  startsAt: Date;
  endsAt: Date;
};

/** Unclamped 09–12 / 13–17 local, for overlap checks and empty-morning nudges. */
export function nominalWorkWindow(now: Date, kind: WorkBlockKind): { startsAt: Date; endsAt: Date } {
  const day = startOfDay(now);
  if (kind === "morning") {
    const startsAt = new Date(day);
    startsAt.setHours(9, 0, 0, 0);
    const endsAt = new Date(day);
    endsAt.setHours(12, 0, 0, 0);
    return { startsAt, endsAt };
  }
  const startsAt = new Date(day);
  startsAt.setHours(13, 0, 0, 0);
  const endsAt = new Date(day);
  endsAt.setHours(17, 0, 0, 0);
  return { startsAt, endsAt };
}

function clampStart(nominal: Date, now: Date): Date {
  return new Date(Math.max(nominal.getTime(), now.getTime()));
}

/** Remaining morning (09–12) or afternoon (13–17) local time, or null if that window is already over. */
export function workBlockForNow(now: Date, kind: WorkBlockKind): WorkBlockSpec | null {
  const window = nominalWorkWindow(now, kind);
  const startsAt = clampStart(window.startsAt, now);
  if (window.endsAt.getTime() - startsAt.getTime() < 20 * 60_000) {
    return null;
  }
  return { kind, label: kind === "morning" ? "Morning" : "Afternoon", startsAt, endsAt: window.endsAt };
}

export function workBlockOverlapsExisting(spec: WorkBlockSpec, slots: ScheduleSlot[]): boolean {
  return slots.some((slot) => slot.slotStatus !== "archived" && slotOverlapsRange(slot, spec.startsAt, spec.endsAt));
}
