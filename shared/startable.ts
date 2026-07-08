import type { StartableWindow } from "./item";

export function minutesToTimeLabel(minutes: number): string {
  const clamped = Math.max(0, Math.min(1439, Math.floor(minutes)));
  const hours = Math.floor(clamped / 60);
  const mins = clamped % 60;
  return `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
}

export function parseTimeToMinutes(text: string): number | null {
  const match = text.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) {
    return null;
  }
  const hours = Number(match[1]);
  const mins = Number(match[2]);
  if (hours > 23 || mins > 59) {
    return null;
  }
  return hours * 60 + mins;
}

export function parseStartableWindow(startText: string, endText: string): StartableWindow | null {
  const startMinutes = parseTimeToMinutes(startText);
  const endMinutes = parseTimeToMinutes(endText);
  if (startMinutes === null || endMinutes === null) {
    return null;
  }
  return { startMinutes, endMinutes };
}

export function startableWindowLabels(window: StartableWindow | null): { start: string; end: string } {
  if (!window) {
    return { start: "", end: "" };
  }
  return {
    start: minutesToTimeLabel(window.startMinutes),
    end: minutesToTimeLabel(window.endMinutes)
  };
}
