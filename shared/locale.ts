export const DATE_PLACEHOLDER = "04.07.2026";
export const DATE_TIME_PLACEHOLDER = "04.07.2026 23:59";

const EUROPEAN_DATE_TIME_RE = /^(\d{1,2})\.(\d{1,2})\.(\d{4})(?:[,\s]+(\d{1,2}):(\d{2}))?$/;

const MONTH_NAMES: Record<string, number> = {
  jan: 1,
  januar: 1,
  january: 1,
  feb: 2,
  februar: 2,
  february: 2,
  mar: 3,
  marz: 3,
  märz: 3,
  march: 3,
  apr: 4,
  april: 4,
  mai: 5,
  may: 5,
  jun: 6,
  juni: 6,
  june: 6,
  jul: 7,
  juli: 7,
  july: 7,
  aug: 8,
  august: 8,
  sep: 9,
  sept: 9,
  september: 9,
  okt: 10,
  oktober: 10,
  oct: 10,
  october: 10,
  nov: 11,
  november: 11,
  dez: 12,
  dezember: 12,
  dec: 12,
  december: 12
};

const RELATIVE_DAY_OFFSETS: Record<string, number> = {
  heute: 0,
  today: 0,
  morgen: 1,
  tomorrow: 1
};

type DateParts = {
  day: number;
  month: number;
  year: number;
  hour: number;
  minute: number;
};

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

  return buildValidDate({
    day: Number(match[1]),
    month: Number(match[2]),
    year: Number(match[3]),
    hour: match[4] !== undefined ? Number(match[4]) : 0,
    minute: match[5] !== undefined ? Number(match[5]) : 0
  });
}

export function parseEuropeanDate(text: string): Date | null {
  return parseEuropeanDateTime(text);
}

function resolveMonthName(token: string): number | null {
  const normalized = token.replace(/\./g, "").trim();
  return MONTH_NAMES[normalized] ?? null;
}

function resolveYear(value: number | undefined, referenceDate: Date): number {
  if (value === undefined) {
    return referenceDate.getFullYear();
  }
  if (value < 100) {
    return 2000 + value;
  }
  return value;
}

function buildValidDate(parts: DateParts): Date | null {
  const { day, month, year, hour, minute } = parts;
  if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59) {
    return null;
  }

  const date = new Date(year, month - 1, day, hour, minute);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return null;
  }

  return date;
}

function parseRelativeDate(text: string, referenceDate: Date): Date | null {
  const offset = RELATIVE_DAY_OFFSETS[text];
  if (offset === undefined) {
    return null;
  }

  const date = new Date(referenceDate);
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + offset);
  return date;
}

function parseNumericShorthand(text: string, referenceDate: Date, requireTime: boolean): Date | null {
  const match = text.match(/^(\d{1,2})\.(\d{1,2})(?:\.(\d{2,4}))?(?:\s+(\d{1,2})(?::(\d{2}))?)?$/);
  if (!match) {
    return null;
  }

  const trailingTime = match[4] !== undefined;
  if (requireTime && !trailingTime) {
    return null;
  }

  return buildValidDate({
    day: Number(match[1]),
    month: Number(match[2]),
    year: resolveYear(match[3] !== undefined ? Number(match[3]) : undefined, referenceDate),
    hour: trailingTime ? Number(match[4]) : 0,
    minute: trailingTime && match[5] !== undefined ? Number(match[5]) : 0
  });
}

function parseMonthNameDate(text: string, referenceDate: Date, requireTime: boolean): Date | null {
  const dayFirst = text.match(/^(\d{1,2})\.?\s+([a-zä]+)\.?(?:\s+(\d{1,2})(?::(\d{2}))?)?$/);
  if (dayFirst) {
    const month = resolveMonthName(dayFirst[2]);
    if (!month) {
      return null;
    }

    const hasTime = dayFirst[3] !== undefined;
    if (requireTime && !hasTime) {
      return null;
    }

    return buildValidDate({
      day: Number(dayFirst[1]),
      month,
      year: referenceDate.getFullYear(),
      hour: hasTime ? Number(dayFirst[3]) : 0,
      minute: hasTime && dayFirst[4] !== undefined ? Number(dayFirst[4]) : 0
    });
  }

  const monthFirst = text.match(/^([a-zä]+)\.?\s+(\d{1,2})\.?(?:\s+(\d{1,2})(?::(\d{2}))?)?$/);
  if (monthFirst) {
    const month = resolveMonthName(monthFirst[1]);
    if (!month) {
      return null;
    }

    const hasTime = monthFirst[3] !== undefined;
    if (requireTime && !hasTime) {
      return null;
    }

    return buildValidDate({
      day: Number(monthFirst[2]),
      month,
      year: referenceDate.getFullYear(),
      hour: hasTime ? Number(monthFirst[3]) : 0,
      minute: hasTime && monthFirst[4] !== undefined ? Number(monthFirst[4]) : 0
    });
  }

  return null;
}

export function parseFlexibleDateTime(text: string, referenceDate: Date = new Date()): Date | null {
  const strict = parseEuropeanDateTime(text);
  if (strict) {
    return strict;
  }

  const normalized = text.trim().toLowerCase().replace(/\s+/g, " ");
  if (!normalized) {
    return null;
  }

  return (
    parseRelativeDate(normalized, referenceDate) ??
    parseNumericShorthand(normalized, referenceDate, false) ??
    parseMonthNameDate(normalized, referenceDate, false)
  );
}

export function parseFlexibleDate(text: string, referenceDate: Date = new Date()): Date | null {
  const strict = parseEuropeanDate(text);
  if (strict) {
    return strict;
  }

  const normalized = text.trim().toLowerCase().replace(/\s+/g, " ");
  if (!normalized) {
    return null;
  }

  return (
    parseRelativeDate(normalized, referenceDate) ??
    parseNumericShorthand(normalized, referenceDate, false) ??
    parseMonthNameDate(normalized, referenceDate, false)
  );
}

export function normalizeEuropeanDateTime(text: string, referenceDate: Date = new Date()): string | null {
  const parsed = parseFlexibleDateTime(text, referenceDate);
  return parsed ? formatEuropeanDateTime(parsed) : null;
}

export function normalizeEuropeanDate(text: string, referenceDate: Date = new Date()): string | null {
  const parsed = parseFlexibleDate(text, referenceDate);
  return parsed ? formatEuropeanDate(parsed) : null;
}

export function isoFromEuropeanDateTime(text: string, referenceDate: Date = new Date()): string {
  const date = parseFlexibleDateTime(text, referenceDate);
  return date ? date.toISOString() : "";
}

export function isoFromEuropeanDate(text: string, endOfDay = false, referenceDate: Date = new Date()): string {
  const date = parseFlexibleDate(text, referenceDate);
  if (!date) {
    return "";
  }
  if (endOfDay) {
    date.setHours(23, 59, 0, 0);
  }
  return date.toISOString();
}

export function validateEuropeanDateTime(text: string, referenceDate: Date = new Date()): string | null {
  if (!text.trim()) {
    return "Enter a date and time.";
  }
  if (!parseFlexibleDateTime(text, referenceDate)) {
    return `Use ${DATE_TIME_PLACEHOLDER}`;
  }
  return null;
}

export function validateEuropeanDate(text: string, referenceDate: Date = new Date()): string | null {
  if (!text.trim()) {
    return "Enter a date.";
  }
  if (!parseFlexibleDate(text, referenceDate)) {
    return `Use ${DATE_PLACEHOLDER}`;
  }
  return null;
}
