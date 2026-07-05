export const DATE_PLACEHOLDER = "04.07.2026";
export const DATE_TIME_PLACEHOLDER = "04.07.2026 23:59";

const EUROPEAN_DATE_TIME_RE = /^(\d{1,2})\.(\d{1,2})\.(\d{4})(?:[,\s]+(\d{1,2}):(\d{2}))?$/;

export function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

export function formatEuropeanDate(date: Date): string {
  return `${pad2(date.getDate())}.${pad2(date.getMonth() + 1)}.${date.getFullYear()}`;
}

export function formatEuropeanDateTime(date: Date): string {
  return `${formatEuropeanDate(date)} ${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

export function formatDate(date: Date): string {
  return formatEuropeanDate(date);
}

export function formatDateTime(date: Date): string {
  return formatEuropeanDateTime(date);
}

export function formatDayLabel(date: Date): string {
  const weekdays = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];
  return `${weekdays[date.getDay()]}, ${formatEuropeanDate(date)}`;
}

export function formatIsoDateTime(iso: string): string {
  return europeanDateTimeFromIso(iso);
}

export function europeanDateFromIso(iso: string | null): string {
  if (!iso) {
    return "";
  }
  return formatEuropeanDate(new Date(iso));
}

export function europeanDateTimeFromIso(iso: string | null): string {
  if (!iso) {
    return "";
  }
  return formatEuropeanDateTime(new Date(iso));
}

export function parseEuropeanDateTime(text: string): Date | null {
  const trimmed = text.trim();
  if (!trimmed) {
    return null;
  }

  const match = trimmed.match(EUROPEAN_DATE_TIME_RE);
  if (!match) {
    return null;
  }

  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  const hour = match[4] !== undefined ? Number(match[4]) : 0;
  const minute = match[5] !== undefined ? Number(match[5]) : 0;

  if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59) {
    return null;
  }

  const date = new Date(year, month - 1, day, hour, minute);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return null;
  }

  return date;
}

export function parseEuropeanDate(text: string): Date | null {
  return parseEuropeanDateTime(text);
}

export function isoFromEuropeanDateTime(text: string): string {
  const date = parseEuropeanDateTime(text);
  return date ? date.toISOString() : "";
}

export function isoFromEuropeanDate(text: string, endOfDay = false): string {
  const date = parseEuropeanDate(text);
  if (!date) {
    return "";
  }
  if (endOfDay) {
    date.setHours(23, 59, 0, 0);
  }
  return date.toISOString();
}

export function validateEuropeanDateTime(text: string): string | null {
  if (!text.trim()) {
    return "Enter a date and time.";
  }
  if (!parseEuropeanDateTime(text)) {
    return `Use ${DATE_TIME_PLACEHOLDER}`;
  }
  return null;
}

export function validateEuropeanDate(text: string): string | null {
  if (!text.trim()) {
    return "Enter a date.";
  }
  if (!parseEuropeanDate(text)) {
    return `Use ${DATE_PLACEHOLDER}`;
  }
  return null;
}
