import { startOfDay, type ScheduleSlot, slotOverlapsRange } from "./schedule";

export type WorkBlockKind = "morning" | "afternoon";

export type WorkBlockSpec = {
  kind: WorkBlockKind;
  label: string;
  startsAt: Date;
  endsAt: Date;
};

function clampStart(nominal: Date, now: Date): Date {
  return new Date(Math.max(nominal.getTime(), now.getTime()));
}

/** Remaining morning (09–12) or afternoon (13–17) local time, or null if that window is already over. */
export function workBlockForNow(now: Date, kind: WorkBlockKind): WorkBlockSpec | null {
  const day = startOfDay(now);
  if (kind === "morning") {
    const nominal = new Date(day);
    nominal.setHours(9, 0, 0, 0);
    const endsAt = new Date(day);
    endsAt.setHours(12, 0, 0, 0);
    const startsAt = clampStart(nominal, now);
    if (endsAt.getTime() - startsAt.getTime() < 20 * 60_000) {
      return null;
    }
    return { kind, label: "Morning", startsAt, endsAt };
  }

  const nominal = new Date(day);
  nominal.setHours(13, 0, 0, 0);
  const endsAt = new Date(day);
  endsAt.setHours(17, 0, 0, 0);
  const startsAt = clampStart(nominal, now);
  if (endsAt.getTime() - startsAt.getTime() < 20 * 60_000) {
    return null;
  }
  return { kind, label: "Afternoon", startsAt, endsAt };
}

export function workBlockOverlapsExisting(spec: WorkBlockSpec, slots: ScheduleSlot[]): boolean {
  return slots.some((slot) => slot.slotStatus !== "archived" && slotOverlapsRange(slot, spec.startsAt, spec.endsAt));
}
