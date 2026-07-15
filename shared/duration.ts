export const MAX_TASK_DURATION_MINUTES = 10_080; // 7 days

export function clampTaskDurationMinutes(value: number): number {
  return Math.min(MAX_TASK_DURATION_MINUTES, Math.max(1, Math.floor(value)));
}

export function parseDurationMinutes(input: string): number | null {
  const trimmed = input.trim().toLowerCase();
  if (!trimmed) {
    return null;
  }

  const compact = trimmed.replace(/\s+/g, "");

  // Plain numbers are minutes: "30", "90", "1.5"
  if (/^\d+(?:\.\d+)?$/.test(compact)) {
    return clampTaskDurationMinutes(Number(compact));
  }

  const hourMinute = compact.match(/^(\d+(?:\.\d+)?)h(?:(\d+)m?)?$/);
  if (hourMinute) {
    const hours = Number(hourMinute[1]);
    const minutes = hourMinute[2] ? Number(hourMinute[2]) : 0;
    if (!Number.isFinite(hours) || !Number.isFinite(minutes) || minutes >= 60) {
      return null;
    }
    return clampTaskDurationMinutes(hours * 60 + minutes);
  }

  const minuteOnly = compact.match(/^(\d+(?:\.\d+)?)m?$/);
  if (minuteOnly) {
    const minutes = Number(minuteOnly[1]);
    if (!Number.isFinite(minutes)) {
      return null;
    }
    return clampTaskDurationMinutes(minutes);
  }

  return null;
}

export function formatDurationMinutes(minutes: number | null): string {
  if (minutes === null || minutes <= 0) {
    return "";
  }

  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  if (hours === 0) {
    return `${remainder}m`;
  }
  if (remainder === 0) {
    return `${hours}h`;
  }
  return `${hours}h ${remainder}m`;
}

export function parseStoredTaskDuration(value: unknown): number | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const minutes = Number(value);
  if (!Number.isFinite(minutes) || minutes <= 0) {
    return null;
  }
  return clampTaskDurationMinutes(minutes);
}
